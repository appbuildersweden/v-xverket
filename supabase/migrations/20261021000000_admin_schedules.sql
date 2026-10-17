-- Elda – scheman (adminpanelens scheman-hantering).
--
-- Migreringen är icke-destruktiv: en ny tabell, tre RPC:er och policies. Inga
-- befintliga tabeller, rader eller funktioner ändras.
--
-- En schemapost är antingen kopplad till en klass (då ser klassens medlemmar
-- den) eller till en person (då ser bara personen den, tillsammans med den
-- personal som redan har rätt att se personen). Endast administratörer skriver —
-- det är samma modell som resten av adminpanelen, och varje ändring loggas.

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  subject text,
  room text,
  -- 1 = måndag … 7 = söndag. Veckodag i stället för datum: schemat upprepas.
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  class_id uuid references public.classes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- En post gäller antingen en klass eller en person — aldrig båda och aldrig
  -- ingen av dem, så listan kan alltid förklara vem posten gäller.
  constraint schedule_entries_target
    check ((class_id is not null and user_id is null) or (class_id is null and user_id is not null)),
  constraint schedule_entries_time check (end_time > start_time)
);

create index if not exists schedule_entries_weekday_idx
  on public.schedule_entries (weekday, start_time);

create index if not exists schedule_entries_class_idx
  on public.schedule_entries (class_id, weekday);

create index if not exists schedule_entries_user_idx
  on public.schedule_entries (user_id, weekday);

alter table public.schedule_entries enable row level security;

-- Läsning: admin ser allt. En klasspost går till klassens medlemmar, en
-- personpost till personen själv och till den personal som redan får se
-- personen (can_see_user). Ingen annan ser något.
drop policy if exists "schedule_entries_select" on public.schedule_entries;
create policy "schedule_entries_select"
  on public.schedule_entries for select
  to authenticated
  using (
    public.is_admin()
    or (class_id is not null and public.is_class_member(class_id))
    or (user_id is not null and public.can_see_user(user_id))
  );

-- Skrivning sker uteslutande genom funktionerna nedan, som kontrollerar
-- adminrollen och loggar ändringen. Därför finns inga insert/update/delete-
-- policies för klienten.

-- ================================================================
-- 2. Funktioner (endast administratörer)
-- ================================================================

/**
 * Skapar en schemapost för en klass eller en person.
 * Veckodag 1–7 (måndag–söndag), tider i formatet HH:MM.
 */
create or replace function public.create_schedule_entry(
  p_title text,
  p_weekday integer,
  p_start_time time,
  p_end_time time,
  p_class uuid default null,
  p_user uuid default null,
  p_subject text default null,
  p_room text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får hantera scheman.';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'Ge schemaposten en rubrik (minst 2 tecken).';
  end if;
  if p_weekday is null or p_weekday < 1 or p_weekday > 7 then
    raise exception 'Veckodagen måste vara mellan 1 (måndag) och 7 (söndag).';
  end if;
  if p_start_time is null or p_end_time is null then
    raise exception 'Ange både start- och sluttid.';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'Sluttiden måste vara senare än starttiden.';
  end if;
  if (p_class is null) = (p_user is null) then
    raise exception 'Välj antingen en klass eller en person.';
  end if;
  -- Målet måste finnas: annars blir posten osynlig och omöjlig att förstå.
  if p_class is not null and not exists (select 1 from public.classes where id = p_class) then
    raise exception 'Klassen hittades inte.';
  end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Kontot hittades inte.';
  end if;

  insert into public.schedule_entries (
    title, subject, room, weekday, start_time, end_time, class_id, user_id, note, created_by
  )
  values (
    v_title,
    nullif(trim(coalesce(p_subject, '')), ''),
    nullif(trim(coalesce(p_room, '')), ''),
    p_weekday,
    p_start_time,
    p_end_time,
    p_class,
    p_user,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  perform public.log_audit(
    'schedule.created',
    'schedule',
    v_id::text,
    jsonb_build_object('weekday', p_weekday, 'class', p_class, 'user', p_user)
  );

  return jsonb_build_object('id', v_id);
end;
$$;

/** Uppdaterar en schemapost. Samma kontroller som vid skapandet. */
create or replace function public.update_schedule_entry(
  p_id uuid,
  p_title text,
  p_weekday integer,
  p_start_time time,
  p_end_time time,
  p_class uuid default null,
  p_user uuid default null,
  p_subject text default null,
  p_room text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får hantera scheman.';
  end if;
  if not exists (select 1 from public.schedule_entries where id = p_id) then
    raise exception 'Schemaposten hittades inte.';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'Ge schemaposten en rubrik (minst 2 tecken).';
  end if;
  if p_weekday is null or p_weekday < 1 or p_weekday > 7 then
    raise exception 'Veckodagen måste vara mellan 1 (måndag) och 7 (söndag).';
  end if;
  if p_start_time is null or p_end_time is null then
    raise exception 'Ange både start- och sluttid.';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'Sluttiden måste vara senare än starttiden.';
  end if;
  if (p_class is null) = (p_user is null) then
    raise exception 'Välj antingen en klass eller en person.';
  end if;
  if p_class is not null and not exists (select 1 from public.classes where id = p_class) then
    raise exception 'Klassen hittades inte.';
  end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Kontot hittades inte.';
  end if;

  update public.schedule_entries
    set title = v_title,
        subject = nullif(trim(coalesce(p_subject, '')), ''),
        room = nullif(trim(coalesce(p_room, '')), ''),
        weekday = p_weekday,
        start_time = p_start_time,
        end_time = p_end_time,
        class_id = p_class,
        user_id = p_user,
        note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
    where id = p_id;

  perform public.log_audit(
    'schedule.updated',
    'schedule',
    p_id::text,
    jsonb_build_object('weekday', p_weekday, 'class', p_class, 'user', p_user)
  );

  return jsonb_build_object('id', p_id);
end;
$$;

/** Tar bort en schemapost. Posten är schemadata — inga elevsvar påverkas. */
create or replace function public.delete_schedule_entry(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får hantera scheman.';
  end if;
  if not exists (select 1 from public.schedule_entries where id = p_id) then
    raise exception 'Schemaposten hittades inte.';
  end if;

  delete from public.schedule_entries where id = p_id;

  perform public.log_audit('schedule.deleted', 'schedule', p_id::text);

  return jsonb_build_object('ok', true);
end;
$$;

-- ================================================================
-- 3. Behörigheter
-- ================================================================

revoke execute on function public.create_schedule_entry(text, integer, time, time, uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.update_schedule_entry(uuid, text, integer, time, time, uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.delete_schedule_entry(uuid) from public, anon;

grant execute on function public.create_schedule_entry(text, integer, time, time, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.update_schedule_entry(uuid, text, integer, time, time, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.delete_schedule_entry(uuid) to authenticated;
