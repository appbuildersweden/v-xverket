-- Elda Skola – utökad administration.
--
-- Lägger till det som saknas för att en administratör ska kunna sköta skolan
-- från adminpanelen: klassöversikt, interna meddelanden, publicerad planering
-- och centralt elevstöd. Klass- och kontohanteringen återanvänder befintliga
-- funktioner (is_class_teacher och is_larare räknar redan in admin).
--
-- Migrationen är additiv: inga kolumner tas bort och ingen befintlig data
-- ändras. Nya tabeller har RLS och skrivs bara genom SECURITY DEFINER-funktioner.

-- ================================================================
-- 1. Klassöversikt för admin
-- ================================================================

create or replace function public.elda_skola_admin_classes()
returns table (
  id uuid,
  name text,
  subject text,
  description text,
  archived boolean,
  join_code text,
  created_at timestamptz,
  member_count int,
  student_count int,
  teacher_count int,
  teacher_names text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.subject,
    c.description,
    c.archived,
    c.join_code,
    c.created_at,
    count(m.user_id)::int as member_count,
    count(*) filter (where m.member_role = 'elev')::int as student_count,
    count(*) filter (where m.member_role = 'larare')::int as teacher_count,
    coalesce(string_agg(distinct
      coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
      ', ' order by coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username)
    ) filter (where m.member_role = 'larare'), '') as teacher_names
  from public.classes c
  left join public.class_members m on m.class_id = c.id
  left join public.profiles p on p.id = m.user_id
  where public.is_admin()
  group by c.id
  order by c.archived, c.name;
$$;

revoke all on function public.elda_skola_admin_classes() from public, anon;
grant execute on function public.elda_skola_admin_classes() to authenticated;

/** Alla klasskopplingar, så att admin kan visa klass per person. */
create or replace function public.elda_skola_admin_class_members()
returns table (
  class_id uuid,
  class_name text,
  user_id uuid,
  username text,
  display_name text,
  role text,
  member_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    m.user_id,
    p.username,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
    p.role,
    m.member_role
  from public.class_members m
  join public.classes c on c.id = m.class_id
  join public.profiles p on p.id = m.user_id
  where public.is_admin()
  order by c.name, p.username;
$$;

revoke all on function public.elda_skola_admin_class_members() from public, anon;
grant execute on function public.elda_skola_admin_class_members() to authenticated;

-- ================================================================
-- 2. Interna meddelanden
-- ================================================================

create table if not exists public.school_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  audience text not null check (audience in ('klass', 'larare', 'elever', 'anvandare')),
  class_id uuid references public.classes (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists school_messages_sender_idx
  on public.school_messages (sender_id, created_at desc);

create table if not exists public.school_message_recipients (
  message_id uuid not null references public.school_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz,
  primary key (message_id, user_id)
);

create index if not exists school_message_recipients_user_idx
  on public.school_message_recipients (user_id, read_at);

alter table public.school_messages enable row level security;
alter table public.school_message_recipients enable row level security;

-- Avsändaren och admin ser meddelandet; mottagaren ser det via sin rad.
drop policy if exists "school_messages_select" on public.school_messages;
create policy "school_messages_select"
  on public.school_messages for select
  to authenticated
  using (
    sender_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.school_message_recipients r
      where r.message_id = school_messages.id and r.user_id = auth.uid()
    )
  );

drop policy if exists "school_message_recipients_select" on public.school_message_recipients;
create policy "school_message_recipients_select"
  on public.school_message_recipients for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Inga insert/update/delete-policyer: allt skrivs av funktionerna nedan, som
-- kontrollerar rollen. Det hindrar en klient från att lägga till sig själv som
-- mottagare eller läsa andras meddelanden.

/** Skickar ett internt meddelande. Endast admin. Returnerar antal mottagare. */
create or replace function public.elda_skola_send_message(
  p_subject text,
  p_body text,
  p_audience text,
  p_class uuid default null,
  p_user_ids uuid[] default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_audience text := coalesce(nullif(btrim(p_audience), ''), 'klass');
  v_id uuid;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får skicka skolmeddelanden.';
  end if;
  if char_length(v_subject) < 2 then
    raise exception 'Ge meddelandet en rubrik (minst 2 tecken).';
  end if;
  if char_length(v_body) < 2 then
    raise exception 'Skriv ett meddelande.';
  end if;
  if v_audience not in ('klass', 'larare', 'elever', 'anvandare') then
    raise exception 'Ogiltig mottagargrupp.';
  end if;
  if v_audience = 'klass' and p_class is null then
    raise exception 'Välj en klass.';
  end if;
  if v_audience = 'anvandare' and coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception 'Välj minst en mottagare.';
  end if;

  insert into public.school_messages (sender_id, subject, body, audience, class_id)
  values (auth.uid(), v_subject, v_body, v_audience,
          case when v_audience = 'klass' then p_class else null end)
  returning id into v_id;

  insert into public.school_message_recipients (message_id, user_id)
  select v_id, u.id
  from (
    select m.user_id as id
    from public.class_members m
    where v_audience = 'klass' and m.class_id = p_class
    union
    select p.id
    from public.profiles p
    where v_audience = 'larare'
      and p.role in ('lärare', 'speciallärare')
      and p.active
    union
    select p.id
    from public.profiles p
    where v_audience = 'elever' and p.role = 'elev' and p.active
    union
    select unnest(coalesce(p_user_ids, '{}'::uuid[]))
  ) u
  on conflict do nothing;

  get diagnostics v_count = row_count;

  perform public.log_audit(
    'school.message.sent',
    'message',
    v_id::text,
    jsonb_build_object('audience', v_audience, 'recipients', v_count)
  );

  return v_count;
end;
$$;

revoke all on function public.elda_skola_send_message(text, text, text, uuid, uuid[]) from public, anon;
grant execute on function public.elda_skola_send_message(text, text, text, uuid, uuid[]) to authenticated;

/** Skickade meddelanden med mottagarantal. Endast admin. */
create or replace function public.elda_skola_sent_messages()
returns table (
  id uuid,
  subject text,
  audience text,
  class_name text,
  created_at timestamptz,
  recipient_count int,
  read_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.subject,
    m.audience,
    c.name,
    m.created_at,
    count(r.user_id)::int,
    count(r.read_at)::int
  from public.school_messages m
  left join public.classes c on c.id = m.class_id
  left join public.school_message_recipients r on r.message_id = m.id
  where public.is_admin()
  group by m.id, c.name
  order by m.created_at desc;
$$;

revoke all on function public.elda_skola_sent_messages() from public, anon;
grant execute on function public.elda_skola_sent_messages() to authenticated;

/** Mina mottagna meddelanden, med avsändarens namn och lässtatus. */
create or replace function public.elda_skola_my_messages()
returns table (
  id uuid,
  subject text,
  body text,
  sender_name text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.subject,
    m.body,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, 'Skolan'),
    m.created_at,
    r.read_at
  from public.school_message_recipients r
  join public.school_messages m on m.id = r.message_id
  left join public.profiles p on p.id = m.sender_id
  where r.user_id = auth.uid()
  order by m.created_at desc;
$$;

revoke all on function public.elda_skola_my_messages() from public, anon;
grant execute on function public.elda_skola_my_messages() to authenticated;

/** Markerar ett meddelande som läst för den inloggade mottagaren. */
create or replace function public.elda_skola_mark_message_read(p_message uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.school_message_recipients
     set read_at = coalesce(read_at, now())
   where message_id = p_message
     and user_id = auth.uid();
$$;

revoke all on function public.elda_skola_mark_message_read(uuid) from public, anon;
grant execute on function public.elda_skola_mark_message_read(uuid) to authenticated;

-- ================================================================
-- 3. Planering
-- ================================================================

alter table public.school_events
  add column if not exists published boolean not null default true;

/** Alla planeringsposter för admin, med klass och skapare. */
create or replace function public.elda_skola_admin_events()
returns table (
  id uuid,
  class_id uuid,
  class_name text,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  published boolean,
  created_by uuid,
  creator_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.class_id,
    c.name,
    e.title,
    e.description,
    e.starts_at,
    e.ends_at,
    e.all_day,
    e.published,
    e.created_by,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, ''),
    e.created_at
  from public.school_events e
  left join public.classes c on c.id = e.class_id
  left join public.profiles p on p.id = e.created_by
  where public.is_admin()
  order by e.starts_at desc;
$$;

revoke all on function public.elda_skola_admin_events() from public, anon;
grant execute on function public.elda_skola_admin_events() to authenticated;

/** Skapa eller uppdatera en planeringspost. Endast admin. */
create or replace function public.elda_skola_admin_save_event(
  p_id uuid default null,
  p_class uuid default null,
  p_title text default null,
  p_description text default null,
  p_starts timestamptz default null,
  p_ends timestamptz default null,
  p_all_day boolean default false,
  p_published boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får hantera skolans planering.';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'Ge planeringsposten en rubrik.';
  end if;
  if p_starts is null then
    raise exception 'Ange ett startdatum.';
  end if;
  if p_ends is not null and p_ends < p_starts then
    raise exception 'Sluttiden kan inte vara före starttiden.';
  end if;

  if p_id is null then
    insert into public.school_events
      (class_id, created_by, title, description, starts_at, ends_at, all_day, published)
    values
      (p_class, auth.uid(), v_title,
       nullif(btrim(coalesce(p_description, '')), ''),
       p_starts, p_ends, coalesce(p_all_day, false), coalesce(p_published, true))
    returning id into v_id;
  else
    update public.school_events
       set class_id = p_class,
           title = v_title,
           description = nullif(btrim(coalesce(p_description, '')), ''),
           starts_at = p_starts,
           ends_at = p_ends,
           all_day = coalesce(p_all_day, false),
           published = coalesce(p_published, true)
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Planeringsposten hittades inte.';
    end if;
  end if;

  perform public.log_audit('school.event.saved', 'event', v_id::text);
  return v_id;
end;
$$;

revoke all on function public.elda_skola_admin_save_event(uuid, uuid, text, text, timestamptz, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.elda_skola_admin_save_event(uuid, uuid, text, text, timestamptz, timestamptz, boolean, boolean) to authenticated;

create or replace function public.elda_skola_admin_delete_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får ta bort planeringsposter.';
  end if;
  delete from public.school_events where id = p_id;
  perform public.log_audit('school.event.deleted', 'event', p_id::text);
end;
$$;

revoke all on function public.elda_skola_admin_delete_event(uuid) from public, anon;
grant execute on function public.elda_skola_admin_delete_event(uuid) to authenticated;

-- ================================================================
-- 4. Elevstöd och anpassningar – adminstöd
-- ================================================================

alter table public.school_adaptations
  add column if not exists follow_up_at date,
  add column if not exists follow_up_by uuid references auth.users (id) on delete set null;

drop policy if exists "school_adaptations_admin_select" on public.school_adaptations;
create policy "school_adaptations_admin_select"
  on public.school_adaptations for select
  to authenticated
  using (public.is_admin());

/** Hela skolans anpassningar för admin, med elev, klass och uppföljning. */
create or replace function public.elda_skola_admin_adaptations()
returns table (
  id uuid,
  student_id uuid,
  student_name text,
  class_id uuid,
  class_name text,
  subject text,
  title text,
  description text,
  measures text,
  status text,
  follow_up_at date,
  follow_up_by uuid,
  follow_up_name text,
  created_by uuid,
  creator_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.student_id,
    coalesce(nullif(trim(concat_ws(' ', s.first_name, s.last_name)), ''), s.username),
    a.class_id,
    c.name,
    a.subject,
    a.title,
    a.description,
    a.measures,
    a.status,
    a.follow_up_at,
    a.follow_up_by,
    coalesce(nullif(trim(concat_ws(' ', f.first_name, f.last_name)), ''), f.username, ''),
    a.created_by,
    coalesce(nullif(trim(concat_ws(' ', t.first_name, t.last_name)), ''), t.username),
    a.created_at,
    a.updated_at
  from public.school_adaptations a
  join public.profiles s on s.id = a.student_id
  left join public.classes c on c.id = a.class_id
  left join public.profiles t on t.id = a.created_by
  left join public.profiles f on f.id = a.follow_up_by
  where public.is_admin()
  order by a.status, a.updated_at desc;
$$;

revoke all on function public.elda_skola_admin_adaptations() from public, anon;
grant execute on function public.elda_skola_admin_adaptations() to authenticated;

/** Skapa eller uppdatera en anpassning som admin. */
create or replace function public.elda_skola_admin_save_adaptation(
  p_id uuid default null,
  p_student uuid default null,
  p_class uuid default null,
  p_subject text default null,
  p_title text default null,
  p_description text default null,
  p_measures text default null,
  p_status text default 'aktiv',
  p_follow_up_at date default null,
  p_follow_up_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_status text := coalesce(nullif(btrim(p_status), ''), 'aktiv');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får ändra elevstöd här.';
  end if;
  if p_student is null then
    raise exception 'Välj en elev.';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'Ge anpassningen en rubrik (minst 2 tecken).';
  end if;
  if v_status not in ('aktiv', 'avslutad') then
    raise exception 'Ogiltig status.';
  end if;

  if p_id is null then
    insert into public.school_adaptations
      (student_id, class_id, subject, title, description, measures, status,
       follow_up_at, follow_up_by, created_by)
    values
      (p_student, p_class,
       nullif(btrim(coalesce(p_subject, '')), ''),
       v_title,
       nullif(btrim(coalesce(p_description, '')), ''),
       nullif(btrim(coalesce(p_measures, '')), ''),
       v_status, p_follow_up_at, p_follow_up_by, auth.uid())
    returning id into v_id;
  else
    update public.school_adaptations
       set student_id = p_student,
           class_id = p_class,
           subject = nullif(btrim(coalesce(p_subject, '')), ''),
           title = v_title,
           description = nullif(btrim(coalesce(p_description, '')), ''),
           measures = nullif(btrim(coalesce(p_measures, '')), ''),
           status = v_status,
           follow_up_at = p_follow_up_at,
           follow_up_by = p_follow_up_by,
           updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Anpassningen hittades inte.';
    end if;
  end if;

  perform public.log_audit('school.adaptation.admin_saved', 'adaptation', v_id::text);
  return v_id;
end;
$$;

revoke all on function public.elda_skola_admin_save_adaptation(uuid, uuid, uuid, text, text, text, text, text, date, uuid) from public, anon;
grant execute on function public.elda_skola_admin_save_adaptation(uuid, uuid, uuid, text, text, text, text, text, date, uuid) to authenticated;

create or replace function public.elda_skola_admin_delete_adaptation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får ta bort elevstöd här.';
  end if;
  delete from public.school_adaptations where id = p_id;
  perform public.log_audit('school.adaptation.admin_deleted', 'adaptation', p_id::text);
end;
$$;

revoke all on function public.elda_skola_admin_delete_adaptation(uuid) from public, anon;
grant execute on function public.elda_skola_admin_delete_adaptation(uuid) to authenticated;
