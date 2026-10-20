-- Information som eget flöde
--
-- * Information kan skickas med formaterad text och bilagor, precis som ett
--   meddelande (samma redigerare och samma gröna skicka-knapp).
-- * En administratör kan skicka information till valfria klasser i skolan;
--   tidigare krävde policyn att avsändaren var klasslärare, vilket gjorde att
--   adminens utskick stoppades av RLS utan att någon elev fick något.
-- * Notisen pekar på den egna sidan `information` i stället för på
--   meddelandesidan, så mottagaren hamnar rätt.
-- * Nya publiceringar (nyheter) aviserar mottagarna, så att adminens nyheter
--   faktiskt kommer fram och inte bara ligger på startsidan.

-- --------------------------------------------------------------- 1. Innehåll
alter table public.school_announcements
  add column if not exists body_html text,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.school_announcements.body_html is
  'Sanerad HTML från den gemensamma rich text-redigeraren. body är alltid ifylld som ren text.';
comment on column public.school_announcements.attachments is
  'Bilagor som [{file_name, storage_path, mime_type, size_bytes}]. Filerna ligger i elda-meddelanden.';

-- Läsbarheten för bilagor följer informationen, inte konversationen.
do $$
begin
  execute $p$
    drop policy if exists "elda_meddelanden_read_information" on storage.objects
  $p$;
  execute $p$
    create policy "elda_meddelanden_read_information" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'elda-meddelanden'
        and exists (
          select 1
          from public.school_announcements a
          where a.attachments @> jsonb_build_array(jsonb_build_object('storage_path', storage.objects.name))
            and (
              public.is_class_member(a.class_id)
              or public.is_class_teacher(a.class_id)
              or public.is_admin()
            )
        )
      )
  $p$;
exception when others then
  raise notice 'Kunde inte skapa storage-policy för informationsbilagor: %', sqlerrm;
end $$;

-- ------------------------------------------------- 2. Skicka information
create or replace function public.elda_skola_send_information(
  p_title text,
  p_body text,
  p_body_html text default null,
  p_class_ids uuid[] default null,
  p_attachments jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_html text := nullif(btrim(coalesce(p_body_html, '')), '');
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_is_admin boolean := public.is_admin();
  v_class uuid;
  v_count integer := 0;
begin
  if v_author is null then
    raise exception 'Du måste vara inloggad för att skicka information.';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'Ge informationen en rubrik.';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'Skriv informationen innan du skickar den.';
  end if;
  if p_class_ids is null or array_length(p_class_ids, 1) is null then
    raise exception 'Välj minst en mottagare.';
  end if;
  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception 'Bilagorna har fel format.';
  end if;

  foreach v_class in array p_class_ids loop
    if not exists (select 1 from public.classes c where c.id = v_class) then
      raise exception 'Klassen hittades inte.';
    end if;
    if not v_is_admin and not public.is_class_teacher(v_class) then
      raise exception 'Du får bara skicka information till dina egna klasser.';
    end if;

    insert into public.school_announcements
      (class_id, author_id, title, body, body_html, attachments)
    values
      (v_class, v_author, v_title, v_body, v_html, v_attachments);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.elda_skola_send_information(text, text, text, uuid[], jsonb) from public, anon;
grant execute on function public.elda_skola_send_information(text, text, text, uuid[], jsonb) to authenticated;

-- Admin får skicka till alla klasser, inte bara sina egna.
drop policy if exists "school_announcements_teacher_insert" on public.school_announcements;
create policy "school_announcements_teacher_insert"
  on public.school_announcements for insert
  to authenticated
  with check (
    (public.is_class_teacher(class_id) or public.is_admin())
    and author_id = auth.uid()
  );

-- ------------------------------------------------- 3. Läsa information
drop function if exists public.elda_skola_list_announcements();

create or replace function public.elda_skola_list_announcements()
returns table (
  id uuid,
  class_id uuid,
  class_name text,
  author_id uuid,
  author_name text,
  title text,
  body text,
  body_html text,
  attachments jsonb,
  created_at timestamptz,
  read_at timestamptz,
  read_count integer,
  recipient_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.class_id,
    c.name as class_name,
    a.author_id,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username) as author_name,
    a.title,
    a.body,
    a.body_html,
    coalesce(a.attachments, '[]'::jsonb) as attachments,
    a.created_at,
    r.read_at,
    (select count(*)::int from public.school_announcement_reads rc where rc.announcement_id = a.id) as read_count,
    (select count(*)::int from public.class_members m where m.class_id = a.class_id and m.member_role = 'elev') as recipient_count
  from public.school_announcements a
  join public.profiles p on p.id = a.author_id
  left join public.classes c on c.id = a.class_id
  left join public.school_announcement_reads r
    on r.announcement_id = a.id and r.user_id = auth.uid()
  where public.is_class_member(a.class_id)
     or public.is_class_teacher(a.class_id)
     or public.is_admin()
  order by a.created_at desc;
$$;

revoke all on function public.elda_skola_list_announcements() from public, anon;
grant execute on function public.elda_skola_list_announcements() to authenticated;

-- ------------------------------------------- 4. Notiser till rätt sida
create or replace function public.notify_class_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications
    (recipient_id, kind, title, body, target_page, source_id, source_key)
  select m.user_id, 'announcement_published', 'Ny information har publicerats för din klass',
         new.title, 'information', new.id, 'announcement_published:' || new.id || ':' || m.user_id
    from public.class_members m
   where m.class_id = new.class_id
     and m.user_id is distinct from new.author_id
  on conflict (source_key) do nothing;
  return new;
end;
$$;

drop trigger if exists school_announcements_notify on public.school_announcements;
create trigger school_announcements_notify
  after insert on public.school_announcements
  for each row execute function public.notify_class_announcement();

-- ------------------------------------- 5. Nyheter aviseras när de publiceras
create or replace function public.notify_publication_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'publicerad' then
    return new;
  end if;
  if new.publish_at is not null and new.publish_at > now() then
    return new;
  end if;

  insert into public.notifications
    (recipient_id, kind, title, body, target_page, source_id, source_key)
  select
    u.id,
    'announcement_published',
    case new.kind
      when 'viktig' then 'Viktig information från skolan'
      when 'uppdatering' then 'Ny uppdatering från skolan'
      else 'Nyhet från skolan'
    end,
    left(coalesce(nullif(btrim(coalesce(new.summary, '')), ''), new.title), 500),
    'information',
    new.id,
    'publication_published:' || new.id || ':' || u.id
  from auth.users u
  where coalesce((u.raw_app_meta_data ->> 'role'), '') <> 'admin'
    and (new.audience_organisation_ids is null or exists (
      select 1 from public.school_memberships m
       where m.user_id = u.id
         and m.left_at is null
         and m.organisation_id = any (new.audience_organisation_ids)
    ))
    and (new.audience_roles is null
      or coalesce((u.raw_app_meta_data ->> 'role'), '') = any (new.audience_roles))
    and (new.audience_user_ids is null or u.id = any (new.audience_user_ids))
  on conflict (source_key) do nothing;

  return new;
end;
$$;

drop trigger if exists school_publications_notify on public.school_publications;
create trigger school_publications_notify
  after insert or update of status, publish_at on public.school_publications
  for each row execute function public.notify_publication_published();
