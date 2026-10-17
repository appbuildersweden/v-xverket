-- Elda – registreringsbot, kontosystem, roller och grundpaneler.
--
-- Migreringen är icke-destruktiv: nya tabeller, nya kolumner, vidgade
-- CHECK-villkor, nya policies och nya funktioner. Inga befintliga rader ändras
-- eller raderas, och inga befintliga funktioner byts ut på ett sätt som ändrar
-- beteendet för de roller som redan finns.
--
-- Rollmodellen behåller projektets befintliga interna värden (ett enda
-- rollsystem, ingen parallell modell):
--
--   admin          = administratör
--   lärare         = lärare (ny i den här migreringen)
--   speciallärare  = befintlig roll, oförändrad
--   elev           = elev. Typen styrs av profiles.account_type:
--                    'skola'  = skolelev
--                    'privat' = privat elev
--
-- Klassfunktioner kräver alltid ett *godkänt* klassmedlemskap
-- (public.class_members). En klasskod ger aldrig åtkomst i sig – den skapar
-- bara en förfrågan som klassens lärare måste godkänna.

-- ================================================================
-- 1. Roller och kontotyp
-- ================================================================

-- Vidga rollvillkoret så att 'lärare' ryms. Postgres namnger CHECK-villkoret
-- automatiskt, så vi letar upp det i stället för att gissa namnet.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin', 'lärare', 'speciallärare', 'elev'));
exception
  when others then
    raise notice 'Kunde inte vidga rollvillkoret på profiles: %', sqlerrm;
end $$;

alter table public.profiles
  add column if not exists account_type text not null default 'skola',
  add column if not exists organisation text,
  add column if not exists limited boolean not null default false,
  add column if not exists created_by_application uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_account_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('skola', 'privat'));
  end if;
end $$;

-- Alla nya konton skapas av en Edge Function – aldrig av klienten.
-- Begränsade konton (limited) får logga in men inte skapa klasser eller ansöka
-- om medlemskap; det kontrolleras i funktionerna längre ner.

-- ================================================================
-- 2. Klasser: klasskod
-- ================================================================

alter table public.classes
  add column if not exists join_code text,
  add column if not exists join_code_rotated_at timestamptz,
  add column if not exists archived boolean not null default false;

create unique index if not exists classes_join_code_idx
  on public.classes (join_code) where join_code is not null;

-- Klasskoden är sex tecken utan tecken som är lätta att blanda ihop (I, O, 0, 1).
create or replace function public.generate_class_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- ================================================================
-- 3. Nya tabeller
-- ================================================================

-- ------------------------------------------------- Registreringsansökningar
-- Ansökan finns innan kontot gör det, därför är ägaren inte en user_id utan en
-- spårningskod som bara den sökande (och admin) känner till. Ingen klient har
-- läs- eller skrivpolicy på tabellen: allt går via den skyddade funktionen
-- `register` och admins granskningsfunktioner.
create table if not exists public.registration_applications (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique,
  idempotency_key text not null unique,
  kind text not null check (kind in ('skolelev', 'privat_elev', 'larare')),
  status text not null default 'utkast'
    check (status in ('utkast', 'vantar', 'godkand', 'nekad', 'skapad', 'misslyckad')),
  full_name text,
  email text,
  payload jsonb not null default '{}'::jsonb,
  summary text,
  risk_flags text[] not null default '{}',
  bot_decision text,
  attempts integer not null default 0,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  review_note text,
  created_user_id uuid references auth.users (id) on delete set null,
  created_username text,
  created_class_id uuid references public.classes (id) on delete set null,
  created_class_code text,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registration_applications_status_idx
  on public.registration_applications (status, created_at desc);

-- ------------------------------------------------- Registreringskonversation
create table if not exists public.registration_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.registration_applications (id) on delete cascade,
  role text not null check (role in ('bot', 'user', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists registration_messages_app_idx
  on public.registration_messages (application_id, created_at);

-- ------------------------------------------------------- Klassansökningar
-- En elev kan ansöka med klasskod. Medlemskapet skapas först när klassens
-- lärare godkänner ansökan.
create table if not exists public.class_join_requests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'vantar'
    check (status in ('vantar', 'godkand', 'nekad')),
  note text,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  unique (class_id, student_id)
);

create index if not exists class_join_requests_status_idx
  on public.class_join_requests (status, requested_at);

-- ---------------------------------------------------------- Villkorsgodkännande
create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

-- ------------------------------------------------------------ Granskningslogg
-- Skrivs endast av serversidefunktionerna (security definer / service role).
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text,
  action text not null,
  subject_type text,
  subject_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx
  on public.audit_log (created_at desc);

-- ================================================================
-- 4. Hjälpfunktioner
-- ================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin';
$$;

-- Lärare = personal med egen klass. Behörigheten ligger i rollsystemet, inte i
-- gränssnittet.
create or replace function public.is_larare()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('admin', 'lärare');
$$;

/** Sant om jag är lärare (eller admin) för klassen. */
create or replace function public.is_class_teacher(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_class is not null
     and (
       public.is_admin()
       or exists (
         select 1 from public.class_members m
         where m.class_id = p_class
           and m.user_id = auth.uid()
           and m.member_role = 'larare'
       )
     );
$$;

/** Sant om personen är elev i en klass som jag är lärare för. */
create or replace function public.teaches_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and (
       public.is_admin()
       or exists (
         select 1
         from public.class_members student
         join public.class_members teacher on teacher.class_id = student.class_id
         where student.user_id = p_user
           and teacher.user_id = auth.uid()
           and teacher.member_role = 'larare'
       )
     );
$$;

/**
 * Skriver en rad i granskningsloggen. Anropas från funktionerna nedan och från
 * Edge Functions (service role). Loggar aldrig lösenord, nycklar eller
 * konversationsinnehåll — bara vad som hände och av vem.
 */
create or replace function public.log_audit(
  p_action text,
  p_subject_type text default null,
  p_subject_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, actor_role, action, subject_type, subject_id, details)
  values (
    auth.uid(),
    public.current_app_role(),
    p_action,
    p_subject_type,
    p_subject_id,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

-- Läraren ska se profilen för elever i sina egna klasser (namn i listor och
-- uppgifter). Övriga lärares elever förblir osynliga.
create or replace function public.can_see_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and (
       p_user = auth.uid()
       or public.is_admin()
       or exists (
         select 1 from public.student_links l
         where l.elev_id = p_user and l.speciallarare_id = auth.uid()
       )
       or public.teaches_student(p_user)
       or public.shares_class(p_user)
     );
$$;

create or replace function public.can_see_student_task(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.student_tasks t
    where t.id = p_id
      and (
        t.created_by = auth.uid()
        or t.student_id = auth.uid()
        or public.is_admin()
        or (t.student_id is not null and public.can_see_user(t.student_id))
        or (t.class_id is not null and public.is_class_member(t.class_id))
      )
  );
$$;

-- ================================================================
-- 5. Row Level Security
-- ================================================================

alter table public.registration_applications enable row level security;
alter table public.registration_messages enable row level security;
alter table public.class_join_requests enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.audit_log enable row level security;

-- Ansökningar och konversationer: ingen klientåtkomst alls. Användaren följer
-- sin ansökan via den skyddade funktionen `register` med sin spårningskod, och
-- admin läser via list_registration_applications().
drop policy if exists "registration_applications_admin" on public.registration_applications;
create policy "registration_applications_admin"
  on public.registration_applications for select
  to authenticated
  using (public.is_admin());

drop policy if exists "registration_messages_admin" on public.registration_messages;
create policy "registration_messages_admin"
  on public.registration_messages for select
  to authenticated
  using (public.is_admin());

-- Klassansökningar: eleven ser sina egna, klassens lärare ser sina klassers.
drop policy if exists "class_join_requests_select" on public.class_join_requests;
create policy "class_join_requests_select"
  on public.class_join_requests for select
  to authenticated
  using (student_id = auth.uid() or public.is_class_teacher(class_id));

drop policy if exists "class_join_requests_student_insert" on public.class_join_requests;
create policy "class_join_requests_student_insert"
  on public.class_join_requests for insert
  to authenticated
  with check (student_id = auth.uid() and status = 'vantar');

drop policy if exists "class_join_requests_teacher_update" on public.class_join_requests;
create policy "class_join_requests_teacher_update"
  on public.class_join_requests for update
  to authenticated
  using (public.is_class_teacher(class_id))
  with check (public.is_class_teacher(class_id));

-- Villkor: egen läsning. Skrivning sker serversidigt vid kontoskapandet.
drop policy if exists "terms_select_own" on public.terms_acceptances;
create policy "terms_select_own"
  on public.terms_acceptances for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Granskningsloggen är läsbar för admin och skrivs bara av funktionerna.
drop policy if exists "audit_log_admin" on public.audit_log;
create policy "audit_log_admin"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- Lärare får skapa uppgifter till elever i sina egna klasser och till sina egna
-- klasser. Elevens egna uppgifter kan eleven fortsatt inte skriva direkt i.
drop policy if exists "student_tasks_teacher_insert" on public.student_tasks;
create policy "student_tasks_teacher_insert"
  on public.student_tasks for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (student_id is not null and public.teaches_student(student_id))
      or (class_id is not null and public.is_class_teacher(class_id))
    )
  );

-- Klassmedlemmar: klassens lärare får lägga till och ta bort medlemmar.
drop policy if exists "class_members_class_teacher_write" on public.class_members;
create policy "class_members_class_teacher_write"
  on public.class_members for insert
  to authenticated
  with check (public.is_class_teacher(class_id));

drop policy if exists "class_members_class_teacher_delete" on public.class_members;
create policy "class_members_class_teacher_delete"
  on public.class_members for delete
  to authenticated
  using (public.is_class_teacher(class_id) or user_id = auth.uid());

-- Klasser: klassens lärare får uppdatera sin class (kod, namn, arkivering).
drop policy if exists "classes_class_teacher_update" on public.classes;
create policy "classes_class_teacher_update"
  on public.classes for update
  to authenticated
  using (public.is_class_teacher(id))
  with check (public.is_class_teacher(id));

-- ================================================================
-- 6. Funktioner för klasser, elever och ansökningar
-- ================================================================

grant execute on function public.generate_class_code() to authenticated;

/**
 * Skapar en klass med en unik klasskod och gör anroparen till klassens lärare.
 * Endast lärare och admin får skapa klasser, och ett begränsat konto nekas.
 */
create or replace function public.create_class_with_code(
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
  v_code text;
  v_try int := 0;
  v_limited boolean;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if not public.is_larare() then
    raise exception 'Endast lärare får skapa klasser.';
  end if;
  select limited into v_limited from public.profiles where id = v_me;
  if coalesce(v_limited, false) then
    raise exception 'Kontot är begränsat. Kontakta administratören.';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Ge klassen ett namn (minst 2 tecken).';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'Klassnamnet är för långt (max 80 tecken).';
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.generate_class_code();
    exit when not exists (select 1 from public.classes where join_code = v_code);
    if v_try >= 10 then
      raise exception 'Kunde inte skapa en unik klasskod. Försök igen.';
    end if;
  end loop;

  insert into public.classes (name, description, created_by, join_code, join_code_rotated_at)
  values (v_name, nullif(trim(coalesce(p_description, '')), ''), v_me, v_code, now())
  returning id into v_id;

  insert into public.class_members (class_id, user_id, member_role, added_by)
  values (v_id, v_me, 'larare', v_me)
  on conflict (class_id, user_id) do update set member_role = 'larare';

  perform public.log_audit('class.created', 'class', v_id::text, jsonb_build_object('name', v_name));

  return jsonb_build_object('id', v_id, 'name', v_name, 'join_code', v_code);
end;
$$;

/** Ny klasskod till en klass man är lärare för (gammal kod slutar gälla). */
create or replace function public.rotate_class_code(p_class uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try int := 0;
begin
  if not public.is_class_teacher(p_class) then
    raise exception 'Du är inte lärare för den klassen.';
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.generate_class_code();
    exit when not exists (select 1 from public.classes where join_code = v_code);
    if v_try >= 10 then
      raise exception 'Kunde inte skapa en unik klasskod. Försök igen.';
    end if;
  end loop;

  update public.classes
    set join_code = v_code, join_code_rotated_at = now()
    where id = p_class;

  perform public.log_audit('class.code_rotated', 'class', p_class::text);

  return v_code;
end;
$$;

/** Klasserna jag är med i (elev) eller lärare för (lärare). */
create or replace function public.list_my_classes()
returns table (
  id uuid,
  name text,
  description text,
  member_role text,
  member_count integer,
  join_code text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.description,
    mine.member_role,
    (select count(*)::int from public.class_members m where m.class_id = c.id),
    case when mine.member_role = 'larare' or public.is_admin() then c.join_code else null end,
    c.created_at
  from public.class_members mine
  join public.classes c on c.id = mine.class_id
  where mine.user_id = auth.uid()
    and not c.archived
  order by c.name;
$$;

/** Eleverna i de klasser jag är lärare för. */
create or replace function public.list_my_students()
returns table (
  id uuid,
  username text,
  account_type text,
  class_id uuid,
  class_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    p.id,
    p.username,
    p.account_type,
    c.id as class_id,
    c.name as class_name
  from public.class_members teacher
  join public.classes c on c.id = teacher.class_id
  join public.class_members student on student.class_id = c.id
  join public.profiles p on p.id = student.user_id
  where teacher.user_id = auth.uid()
    and teacher.member_role = 'larare'
    and student.user_id <> auth.uid()
    and p.role = 'elev'
  order by p.username;
$$;

/** Administratörskonton, så att en lärare kan kontakta en administratör. */
create or replace function public.list_admin_accounts()
returns table (id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username
  from public.profiles p
  where p.role = 'admin' and p.active
  order by p.username;
$$;

/**
 * Elevens ansökan om att gå med i en klass med hjälp av en klasskod.
 * Koden ger ingen åtkomst – den skapar en förfrågan som klassens lärare avgör.
 */
create or replace function public.request_class_join(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_class public.classes;
  v_limited boolean;
  v_status text;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if v_code = '' then
    raise exception 'Ange klasskoden du har fått av din lärare.';
  end if;

  select limited into v_limited from public.profiles where id = v_me;
  if coalesce(v_limited, false) then
    raise exception 'Kontot är begränsat. Kontakta administratören.';
  end if;

  select * into v_class
  from public.classes
  where join_code = v_code and not archived;

  if v_class.id is null then
    raise exception 'Klasskoden stämmer inte. Kontrollera med din lärare.';
  end if;

  if exists (
    select 1 from public.class_members m
    where m.class_id = v_class.id and m.user_id = v_me
  ) then
    raise exception 'Du är redan med i den klassen.';
  end if;

  select status into v_status
  from public.class_join_requests
  where class_id = v_class.id and student_id = v_me;

  if v_status = 'vantar' then
    return jsonb_build_object(
      'status', 'vantar',
      'class_id', v_class.id,
      'class_name', v_class.name,
      'message', 'Din ansökan väntar redan på din lärares godkännande.'
    );
  end if;

  insert into public.class_join_requests (class_id, student_id, status, requested_at, decided_by, decided_at)
  values (v_class.id, v_me, 'vantar', now(), null, null)
  on conflict (class_id, student_id)
    do update set status = 'vantar', requested_at = now(), decided_by = null, decided_at = null;

  perform public.log_audit('class.join_requested', 'class', v_class.id::text);

  return jsonb_build_object(
    'status', 'vantar',
    'class_id', v_class.id,
    'class_name', v_class.name,
    'message', 'Ansökan är skickad. Din lärare behöver godkänna den innan du ser klassens innehåll.'
  );
end;
$$;

/** Klassansökningar som väntar på min åtgärd som lärare. */
create or replace function public.list_class_join_requests()
returns table (
  id uuid,
  class_id uuid,
  class_name text,
  student_id uuid,
  student_username text,
  status text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.class_id,
    c.name,
    r.student_id,
    p.username,
    r.status,
    r.requested_at
  from public.class_join_requests r
  join public.classes c on c.id = r.class_id
  join public.profiles p on p.id = r.student_id
  where public.is_class_teacher(r.class_id)
  order by (r.status = 'vantar') desc, r.requested_at desc;
$$;

/**
 * Lärarens beslut om en klassansökan. Ett godkännande skapar medlemskapet som
 * ger eleven tillgång till klassens innehåll – koden gör det aldrig själv.
 */
create or replace function public.decide_class_join_request(
  p_request uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_req public.class_join_requests;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;

  select * into v_req from public.class_join_requests where id = p_request;
  if v_req.id is null then
    raise exception 'Ansökan hittades inte.';
  end if;
  if not public.is_class_teacher(v_req.class_id) then
    raise exception 'Du är inte lärare för den klassen.';
  end if;

  update public.class_join_requests
    set status = case when p_approve then 'godkand' else 'nekad' end,
        decided_by = v_me,
        decided_at = now()
    where id = p_request;

  if p_approve then
    insert into public.class_members (class_id, user_id, member_role, added_by)
    values (v_req.class_id, v_req.student_id, 'elev', v_me)
    on conflict (class_id, user_id) do update set member_role = 'elev';
  else
    delete from public.class_members
    where class_id = v_req.class_id
      and user_id = v_req.student_id
      and member_role = 'elev';
  end if;

  perform public.log_audit(
    case when p_approve then 'class.join_approved' else 'class.join_denied' end,
    'class',
    v_req.class_id::text,
    jsonb_build_object('student_id', v_req.student_id)
  );

  return jsonb_build_object('status', case when p_approve then 'godkand' else 'nekad' end);
end;
$$;

/** Tar bort en elev ur en klass man är lärare för. */
create or replace function public.remove_class_student(p_class uuid, p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_class_teacher(p_class) then
    raise exception 'Du är inte lärare för den klassen.';
  end if;

  delete from public.class_members
  where class_id = p_class and user_id = p_student and member_role = 'elev';

  perform public.log_audit(
    'class.student_removed',
    'class',
    p_class::text,
    jsonb_build_object('student_id', p_student)
  );
end;
$$;

-- ------------------------------------------------- Admin: ansökningar

/** Registreringsansökningar för admin. Filtreras på status om så önskas. */
create or replace function public.list_registration_applications(p_status text default null)
returns table (
  id uuid,
  kind text,
  status text,
  full_name text,
  summary text,
  risk_flags text[],
  bot_decision text,
  created_at timestamptz,
  decided_at timestamptz,
  review_note text,
  created_username text,
  created_class_code text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får granska ansökningar.';
  end if;

  return query
    select
      a.id, a.kind, a.status, a.full_name, a.summary, a.risk_flags, a.bot_decision,
      a.created_at, a.decided_at, a.review_note, a.created_username, a.created_class_code
    from public.registration_applications a
    where p_status is null or a.status = p_status
    order by (a.status = 'vantar') desc, a.created_at desc
    limit 200;
end;
$$;

/**
 * Admins beslut om en ansökan: godkänn, begränsa eller stäng av.
 *
 *  - 'godkand'  → kontot aktiveras (eller lämnas aktivt) utan begränsning.
 *  - 'begransad'→ kontot är aktivt men begränsat (limited), och får inte skapa
 *                 klasser eller ansöka om medlemskap.
 *  - 'nekad'    → ansökan avslås. Kontot (om det skapades automatiskt) stängs av
 *                 så att ingen obehörig kommer in.
 */
create or replace function public.decide_registration_application(
  p_application uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_app public.registration_applications;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får granska ansökningar.';
  end if;
  if p_decision not in ('godkand', 'begransad', 'nekad') then
    raise exception 'Ogiltigt beslut.';
  end if;

  select * into v_app from public.registration_applications where id = p_application;
  if v_app.id is null then
    raise exception 'Ansökan hittades inte.';
  end if;

  update public.registration_applications
    set status = case p_decision
                   when 'godkand' then 'godkand'
                   when 'begransad' then 'godkand'
                   else 'nekad'
                 end,
        review_note = nullif(trim(coalesce(p_note, '')), ''),
        decided_by = v_me,
        decided_at = now(),
        updated_at = now()
    where id = p_application;

  if v_app.created_user_id is not null then
    update public.profiles
      set limited = (p_decision = 'begransad'),
          active = (p_decision <> 'nekad')
      where id = v_app.created_user_id;

    perform public.log_audit(
      'account.' || p_decision,
      'user',
      v_app.created_user_id::text,
      jsonb_build_object('application', p_application)
    );
  else
    perform public.log_audit(
      'application.' || p_decision,
      'application',
      p_application::text
    );
  end if;

  return jsonb_build_object('ok', true, 'decision', p_decision);
end;
$$;

/** Begränsa eller stäng av ett konto direkt (admin). */
create or replace function public.set_account_restriction(
  p_user uuid,
  p_limited boolean,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får begränsa konton.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Du kan inte begränsa ditt eget konto.';
  end if;

  update public.profiles
    set limited = coalesce(p_limited, limited),
        active = coalesce(p_active, active)
    where id = p_user;

  perform public.log_audit(
    case when p_active = false then 'account.disabled' else 'account.restricted' end,
    'user',
    p_user::text,
    jsonb_build_object('limited', p_limited, 'active', p_active)
  );

  return jsonb_build_object('ok', true);
end;
$$;

/** Granskningsloggen för admin. */
create or replace function public.list_audit_log(p_limit integer default 100)
returns table (
  id uuid,
  actor_username text,
  actor_role text,
  action text,
  subject_type text,
  subject_id text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får läsa loggen.';
  end if;

  return query
    select
      l.id, p.username, l.actor_role, l.action, l.subject_type, l.subject_id, l.details, l.created_at
    from public.audit_log l
    left join public.profiles p on p.id = l.actor_id
    order by l.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- ================================================================
-- 7. Direkta samtal: lärare ↔ elev i egen klass och lärare ↔ admin
-- ================================================================

-- Befintliga regler behålls; två nya vägar läggs till:
--   * lärare får starta samtal med en elev i sin egen klass
--   * lärare får starta samtal med en administratör
create or replace function public.open_direct_channel(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_other_role text;
  v_id uuid;
  v_allowed boolean := false;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'Välj en annan person.';
  end if;

  select role into v_other_role from public.profiles where id = p_other;
  if v_other_role is null then
    raise exception 'Kontot hittades inte.';
  end if;

  if public.is_staff() or v_other_role in ('admin', 'speciallärare') then
    v_allowed := true;
  elsif public.current_app_role() = 'lärare'
        and (v_other_role = 'admin' or public.teaches_student(p_other)) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'Kontakta en lärare — elever kan inte starta privata samtal.';
  end if;

  if v_me < p_other then
    v_a := v_me;
    v_b := p_other;
  else
    v_a := p_other;
    v_b := v_me;
  end if;

  select id into v_id
  from public.chat_channels
  where kind = 'direkt' and dm_user_a = v_a and dm_user_b = v_b;

  if v_id is null then
    insert into public.chat_channels (kind, dm_user_a, dm_user_b, created_by)
    values ('direkt', v_a, v_b, v_me)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ================================================================
-- 7b. Lärarens egna ytor i befintliga tabeller
-- ================================================================
--
-- `is_staff()` är avsiktligt oförändrad (admin + speciallärare). Den används på
-- många ställen för personalens bredare rättigheter — att länka elever, lista
-- konton och läsa alla klasser. En enskild lärare ska ha just sina egna klasser
-- och sina egna elever, så de ytorna öppnas i stället med klass- och
-- elevvillkor (is_class_teacher / teaches_student). Det håller isär rollerna:
-- en lärare kan aldrig se en annan lärares klass eller en privat elev som inte
-- anslutit till någon klass.

-- Material: läraren får dela ett dokument med sin egen klass eller med en elev
-- i sin egen klass. Ägaren är alltid anroparen, och RLS gäller fortfarande för
-- läsning (can_see_document) och borttagning (documents_owner_delete).
drop policy if exists "documents_teacher_insert" on public.documents;
create policy "documents_teacher_insert"
  on public.documents for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      (student_id is not null and public.teaches_student(student_id))
      or (class_id is not null and public.is_class_teacher(class_id))
    )
  );

-- Klassens chattkanal: läraren öppnar den via class_channel() (security definer)
-- när hen är medlem i klassen. Direktkanaler täcks av open_direct_channel().

-- ================================================================
-- 8. Behörigheter på funktionerna
-- ================================================================

revoke execute on function public.create_class_with_code(text, text) from public, anon;
revoke execute on function public.rotate_class_code(uuid) from public, anon;
revoke execute on function public.list_my_classes() from public, anon;
revoke execute on function public.list_my_students() from public, anon;
revoke execute on function public.list_admin_accounts() from public, anon;
revoke execute on function public.request_class_join(text) from public, anon;
revoke execute on function public.list_class_join_requests() from public, anon;
revoke execute on function public.decide_class_join_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_class_student(uuid, uuid) from public, anon;
revoke execute on function public.list_registration_applications(text) from public, anon;
revoke execute on function public.decide_registration_application(uuid, text, text) from public, anon;
revoke execute on function public.set_account_restriction(uuid, boolean, boolean) from public, anon;
revoke execute on function public.list_audit_log(integer) from public, anon;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon;

grant execute on function public.create_class_with_code(text, text) to authenticated;
grant execute on function public.rotate_class_code(uuid) to authenticated;
grant execute on function public.list_my_classes() to authenticated;
grant execute on function public.list_my_students() to authenticated;
grant execute on function public.list_admin_accounts() to authenticated;
grant execute on function public.request_class_join(text) to authenticated;
grant execute on function public.list_class_join_requests() to authenticated;
grant execute on function public.decide_class_join_request(uuid, boolean) to authenticated;
grant execute on function public.remove_class_student(uuid, uuid) to authenticated;
grant execute on function public.list_registration_applications(text) to authenticated;
grant execute on function public.decide_registration_application(uuid, text, text) to authenticated;
grant execute on function public.set_account_restriction(uuid, boolean, boolean) to authenticated;
grant execute on function public.list_audit_log(integer) to authenticated;
