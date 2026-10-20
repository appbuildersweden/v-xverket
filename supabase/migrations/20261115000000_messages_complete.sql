-- Elda Skola – kompletterat meddelandesystem.
--
-- Additiv migration ovanpå 20261114000000 (skolorganisationer). Inga befintliga
-- rader ändras eller tas bort. Nya tabeller har RLS och skrivs bara genom
-- funktioner som kontrollerar åtkomst till kanalen, så en klient kan aldrig nå
-- en konversation eller en bilaga i en annan skolorganisation.
--
-- Innehåll:
--   1. Arkiverade konversationer per användare
--   2. Bilagor med privat lagring
--   3. Formaterat meddelandeinnehåll med serverkontroll
--   4. Skickat-vy, olästsumma och arkivfunktioner
--   5. Realtid för meddelanden och lässtatus

-- ================================================================
-- 1. Arkiverade konversationer
-- ================================================================

create table if not exists public.chat_archives (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists chat_archives_user_idx
  on public.chat_archives (user_id, archived_at desc);

alter table public.chat_archives enable row level security;

drop policy if exists "chat_archives_own" on public.chat_archives;
create policy "chat_archives_own"
  on public.chat_archives for all
  to authenticated
  using (user_id = auth.uid() and public.can_access_channel(channel_id))
  with check (user_id = auth.uid() and public.can_access_channel(channel_id));

-- ================================================================
-- 2. Bilagor
-- ================================================================

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);
create index if not exists message_attachments_channel_idx
  on public.message_attachments (channel_id, created_at);

alter table public.message_attachments enable row level security;

-- En bilaga som ännu inte skickats syns bara för den som laddade upp den.
-- När den är kopplad till ett meddelande kräver läsning åtkomst till kanalen,
-- vilket i sin tur kräver samma skolorganisation.
drop policy if exists "message_attachments_select" on public.message_attachments;
create policy "message_attachments_select"
  on public.message_attachments for select
  to authenticated
  using (
    (message_id is null and uploader_id = auth.uid())
    or (message_id is not null and public.can_access_channel(channel_id))
  );

drop policy if exists "message_attachments_insert" on public.message_attachments;
create policy "message_attachments_insert"
  on public.message_attachments for insert
  to authenticated
  with check (
    uploader_id = auth.uid()
    and message_id is null
    and public.can_access_channel(channel_id)
  );

-- Bara en bilaga som ännu inte skickats får tas bort av uppladdaren.
drop policy if exists "message_attachments_delete" on public.message_attachments;
create policy "message_attachments_delete"
  on public.message_attachments for delete
  to authenticated
  using (uploader_id = auth.uid() and message_id is null);

-- Ingen update-policy: en bilaga kan aldrig flyttas till ett annat meddelande
-- av klienten. Kopplingen görs av funktionen nedan.

-- Privat bucket. Filerna är aldrig publika och nås bara via signerade länkar.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('elda-meddelanden', 'elda-meddelanden', false)
  on conflict (id) do nothing;
exception when others then
  raise notice 'Kunde inte skapa bucketen elda-meddelanden: %', sqlerrm;
end $$;

do $$
begin
  execute $p$
    drop policy if exists "elda_meddelanden_read" on storage.objects
  $p$;
  execute $p$
    create policy "elda_meddelanden_read" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'elda-meddelanden'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or exists (
            select 1 from public.message_attachments a
            where a.storage_path = storage.objects.name
              and a.message_id is not null
              and public.can_access_channel(a.channel_id)
          )
        )
      )
  $p$;

  execute $p$
    drop policy if exists "elda_meddelanden_upload" on storage.objects
  $p$;
  execute $p$
    create policy "elda_meddelanden_upload" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'elda-meddelanden'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  execute $p$
    drop policy if exists "elda_meddelanden_delete" on storage.objects
  $p$;
  execute $p$
    create policy "elda_meddelanden_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'elda-meddelanden'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;
exception when others then
  raise notice 'Kunde inte skapa storage-policies för elda-meddelanden: %', sqlerrm;
end $$;

-- ================================================================
-- 3. Formaterat innehåll
-- ================================================================

alter table public.messages
  add column if not exists body_html text;

-- Ett meddelande kan bestå av formaterad text, ren text eller bara en bilaga.
-- Den gamla regeln krävde alltid en text på minst ett tecken, vilket gjorde
-- bilage-only-meddelanden omöjliga. Villkoret ersätts i stället av att minst
-- ett av fälten måste vara ifyllt.
alter table public.messages alter column body drop not null;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check check (
    char_length(coalesce(body, '')) <= 4000
    and (body is not null or body_html is not null)
  );

/**
 * Serverkontroll av formaterat innehåll. Saneringen görs i klienten före
 * sändning och igen vid visning, men servern avvisar ändå uppenbart farliga
 * konstruktioner så att osanerad HTML aldrig kan lagras via ett eget anrop.
 */
create or replace function public.elda_skola_html_is_safe(p_html text)
returns boolean
language sql
immutable
as $$
  select p_html is null
     or (
       char_length(p_html) <= 20000
       and p_html !~* '<\s*(script|style|iframe|object|embed|link|meta|base|form)\b'
       and p_html !~* '<[^>]*\son[a-z]+\s*='
       and p_html !~* 'javascript\s*:'
       and p_html !~* 'data\s*:\s*text/html'
       and p_html !~* 'vbscript\s*:'
     );
$$;

revoke all on function public.elda_skola_html_is_safe(text) from public, anon;
grant execute on function public.elda_skola_html_is_safe(text) to authenticated;

/**
 * Grov textversion av formaterat innehåll, för förhandsvisningen i listan.
 * Bara etiketter tas bort – innehållet är redan sanerat och begränsat till
 * enkla element, så ingen skriptkod kan finnas kvar här.
 */
create or replace function public.elda_skola_plain_text(p_html text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(coalesce(p_html, ''), '<[^>]*>', ' ', 'g'),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

revoke all on function public.elda_skola_plain_text(text) from public, anon;
grant execute on function public.elda_skola_plain_text(text) to authenticated;

-- Databaskontrollen gäller alla vägar till tabellen, även en funktion med
-- utökade rättigheter. Osanerad HTML kan därför aldrig lagras.
alter table public.messages drop constraint if exists messages_body_html_check;
alter table public.messages
  add constraint messages_body_html_check check (public.elda_skola_html_is_safe(body_html));

-- Meddelanden skrivs bara genom funktionerna nedan (och send_message) som
-- kontrollerar kanalåtkomst, längd och formatering. En direkt insert från
-- klienten skulle kringgå kontrollen av body_html.
drop policy if exists "messages_insert" on public.messages;

-- ================================================================
-- 4. Skicka, arkivera, skickat-vy och olästsumma
-- ================================================================

/** Skickar ett meddelande med valfritt formaterat innehåll och bilagor. */
create or replace function public.elda_skola_send_rich_message(
  p_channel uuid,
  p_body text,
  p_body_html text default null,
  p_attachment_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_html text := nullif(btrim(coalesce(p_body_html, '')), '');
  v_attachments int := coalesce(array_length(p_attachment_ids, 1), 0);
  v_row record;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if not public.has_school_org() then
    raise exception 'Ditt konto är inte kopplat till en skola. Kontakta systemadministratören.';
  end if;
  if not public.can_access_channel(p_channel) then
    raise exception 'Du har inte tillgång till den konversationen.';
  end if;
  if v_body = '' and v_attachments = 0 then
    raise exception 'Skriv ett meddelande eller bifoga en fil.';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Meddelandet är för långt (max 4000 tecken).';
  end if;
  if not public.elda_skola_html_is_safe(v_html) then
    raise exception 'Meddelandet innehåller otillåten formatering.';
  end if;

  -- Alla bilagor måste vara mina, oskickade och höra till samma kanal.
  if v_attachments > 0 then
    if exists (
      select 1 from unnest(p_attachment_ids) as id
      where not exists (
        select 1 from public.message_attachments a
        where a.id = id
          and a.uploader_id = v_me
          and a.message_id is null
          and a.channel_id = p_channel
      )
    ) then
      raise exception 'En bilaga tillhör inte dig eller den här konversationen.';
    end if;
  end if;

  insert into public.messages (channel_id, sender_id, body, body_html)
  values (p_channel, v_me, nullif(v_body, ''), v_html)
  returning id, channel_id, sender_id, body, body_html, created_at into v_row;

  if v_attachments > 0 then
    update public.message_attachments
       set message_id = v_row.id
     where id = any (p_attachment_ids)
       and uploader_id = v_me
       and message_id is null;
  end if;

  -- Ett nytt meddelande tar bort arkiveringen för alla deltagare, så att
  -- konversationen syns i inkorgen igen.
  delete from public.chat_archives where channel_id = p_channel;

  return jsonb_build_object(
    'id', v_row.id,
    'channel_id', v_row.channel_id,
    'sender_id', v_row.sender_id,
    'body', v_row.body,
    'body_html', v_row.body_html,
    'created_at', v_row.created_at,
    'attachments', v_attachments
  );
end;
$$;

revoke all on function public.elda_skola_send_rich_message(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.elda_skola_send_rich_message(uuid, text, text, uuid[]) to authenticated;

/** Arkiverad-markering per användare. */
create or replace function public.elda_skola_archive_channel(p_channel uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_channel(p_channel) then
    raise exception 'Du har inte tillgång till den konversationen.';
  end if;

  if coalesce(p_archived, false) then
    insert into public.chat_archives (channel_id, user_id)
    values (p_channel, auth.uid())
    on conflict (channel_id, user_id) do update set archived_at = now();
  else
    delete from public.chat_archives
     where channel_id = p_channel and user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.elda_skola_archive_channel(uuid, boolean) from public, anon;
grant execute on function public.elda_skola_archive_channel(uuid, boolean) to authenticated;

/**
 * Alla mina direkta konversationer med motpart, sista meddelande, oläst antal
 * och arkivstatus. Ersätter den tidigare listan och lägger till det som
 * meddelandevyn behöver.
 */
drop function if exists public.elda_skola_conversations();
create function public.elda_skola_conversations()
returns table (
  channel_id uuid,
  other_id uuid,
  other_username text,
  other_name text,
  other_role text,
  last_body text,
  last_at timestamptz,
  last_sender_id uuid,
  last_from_me boolean,
  unread_count int,
  archived boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    other.id,
    other.username,
    coalesce(nullif(trim(concat_ws(' ', other.first_name, other.last_name)), ''), other.username),
    other.role,
    coalesce(last_msg.body, public.elda_skola_plain_text(last_msg.body_html)),
    last_msg.created_at,
    last_msg.sender_id,
    (last_msg.sender_id = auth.uid()),
    coalesce((
      select count(*)::int
      from public.messages m
      where m.channel_id = c.id
        and m.sender_id <> auth.uid()
        and (last_read.read_at is null or m.created_at > last_read.read_at)
    ), 0),
    (arch.channel_id is not null)
  from public.chat_channels c
  join lateral (
    select p.id, p.username, p.first_name, p.last_name, p.role
    from public.profiles p
    where p.id = case when c.dm_user_a = auth.uid() then c.dm_user_b else c.dm_user_a end
  ) as other on true
  left join lateral (
    select m.body, m.body_html, m.created_at, m.sender_id
    from public.messages m
    where m.channel_id = c.id
    order by m.created_at desc
    limit 1
  ) as last_msg on true
  left join lateral (
    select r.channel_id
    from public.chat_archives r
    where r.channel_id = c.id and r.user_id = auth.uid()
  ) as arch on true
  left join lateral (
    select max(r.read_at) as read_at
    from public.chat_reads r
    where r.channel_id = c.id and r.user_id = auth.uid()
  ) as last_read on true
  where c.kind = 'direkt'
    and auth.uid() in (c.dm_user_a, c.dm_user_b)
    and public.same_school_org(other.id)
    -- En kanal utan meddelanden är ett påbörjat utkast. Den visas först när
    -- något faktiskt har skickats, så avbrutna utkast inte ligger i inkorgen.
    and last_msg.created_at is not null
  order by last_msg.created_at desc nulls last, other.username;
$$;

revoke all on function public.elda_skola_conversations() from public, anon;
grant execute on function public.elda_skola_conversations() to authenticated;

/** Skickat-vyn: konversationer där jag har skickat minst ett meddelande. */
drop function if exists public.elda_skola_sent_conversations();
create function public.elda_skola_sent_conversations()
returns table (
  channel_id uuid,
  other_id uuid,
  other_username text,
  other_name text,
  other_role text,
  last_sent_body text,
  last_sent_at timestamptz,
  sent_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    other.id,
    other.username,
    coalesce(nullif(trim(concat_ws(' ', other.first_name, other.last_name)), ''), other.username),
    other.role,
    coalesce(mine.body, public.elda_skola_plain_text(mine.body_html)),
    mine.created_at,
    mine.total
  from public.chat_channels c
  join lateral (
    select p.id, p.username, p.first_name, p.last_name, p.role
    from public.profiles p
    where p.id = case when c.dm_user_a = auth.uid() then c.dm_user_b else c.dm_user_a end
  ) as other on true
  join lateral (
    select
      m.body,
      m.body_html,
      m.created_at,
      (select count(*)::int from public.messages x
        where x.channel_id = c.id and x.sender_id = auth.uid()) as total
    from public.messages m
    where m.channel_id = c.id and m.sender_id = auth.uid()
    order by m.created_at desc
    limit 1
  ) as mine on true
  where c.kind = 'direkt'
    and auth.uid() in (c.dm_user_a, c.dm_user_b)
    and public.same_school_org(other.id)
  order by mine.created_at desc;
$$;

revoke all on function public.elda_skola_sent_conversations() from public, anon;
grant execute on function public.elda_skola_sent_conversations() to authenticated;

/** Totalt antal olästa: privata konversationer plus meddelanden från skolan. */
create or replace function public.elda_skola_unread_total()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
      select count(*)::int
      from public.messages m
      join public.chat_channels c on c.id = m.channel_id
      where c.kind = 'direkt'
        and auth.uid() in (c.dm_user_a, c.dm_user_b)
        and m.sender_id <> auth.uid()
        and not exists (
          select 1 from public.chat_reads r
          where r.channel_id = m.channel_id
            and r.user_id = auth.uid()
            and r.read_at >= m.created_at
        )
    ), 0)
    + coalesce((
      select count(*)::int
      from public.school_message_recipients r
      where r.user_id = auth.uid() and r.read_at is null
    ), 0);
$$;

revoke all on function public.elda_skola_unread_total() from public, anon;
grant execute on function public.elda_skola_unread_total() to authenticated;

/** Meddelanden i en kanal, inklusive formatering och bilagor. */
drop function if exists public.elda_skola_list_channel_messages(uuid);
create function public.elda_skola_list_channel_messages(p_channel uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_username text,
  sender_name text,
  body text,
  body_html text,
  created_at timestamptz,
  attachments jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_access_channel(p_channel) then
    raise exception 'Du har inte tillgång till den konversationen.';
  end if;

  return query
    select
      m.id,
      m.sender_id,
      coalesce(p.username, 'okänd'),
      coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, 'okänd'),
      m.body,
      m.body_html,
      m.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'file_name', a.file_name,
          'storage_path', a.storage_path,
          'mime_type', a.mime_type,
          'size_bytes', a.size_bytes
        ) order by a.created_at)
        from public.message_attachments a
        where a.message_id = m.id
      ), '[]'::jsonb)
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    where m.channel_id = p_channel
    order by m.created_at asc
    limit 300;
end;
$$;

revoke all on function public.elda_skola_list_channel_messages(uuid) from public, anon;
grant execute on function public.elda_skola_list_channel_messages(uuid) to authenticated;

/** Bilagor som ännu inte skickats, för den egna kladden. */
drop function if exists public.elda_skola_pending_attachments(uuid);
create function public.elda_skola_pending_attachments(p_channel uuid)
returns table (
  id uuid,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.file_name, a.mime_type, a.size_bytes, a.created_at
  from public.message_attachments a
  where a.channel_id = p_channel
    and a.uploader_id = auth.uid()
    and a.message_id is null
  order by a.created_at;
$$;

revoke all on function public.elda_skola_pending_attachments(uuid) from public, anon;
grant execute on function public.elda_skola_pending_attachments(uuid) to authenticated;

-- ================================================================
-- 5. Realtid
-- ================================================================

/**
 * Nya meddelanden, lässtatus och arkivering ska nå klienten direkt. Tabellerna
 * läggs till i Supabase realtime-publication om den finns; saknas realtime
 * fortsätter migrationen och appen hämtar i stället vid fokus.
 */
do $$
declare
  t text;
begin
  foreach t in array array[
    'messages', 'chat_reads', 'chat_archives', 'message_attachments',
    'school_message_recipients'
  ]
  loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when others then
  raise notice 'Kunde inte lägga till meddelandetabellerna i realtime: %', sqlerrm;
end $$;
