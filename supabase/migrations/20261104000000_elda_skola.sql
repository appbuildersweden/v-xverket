-- Elda Skola – skolans egna tabeller, åtkomstregler och serverfunktioner.
--
-- Migrationen är additiv: nya tabeller och kolumner, nya funktioner och nya
-- policies. Ingen befintlig rad ändras, och Eldas vanliga autentisering och
-- kontomodell är orörda. Lärare är rollen 'lärare', skolelever är 'elev' med
-- profiles.account_type = 'skola'.
--
-- All behörighet avgörs här och i RLS. Klienten får aldrig avgöra vem som får
-- läsa eller skriva skolans data.

-- ================================================================
-- 1. Hjälpfunktioner
-- ================================================================

/** Sant för en lärare (eller administratör). Rollen kommer från app_metadata. */
create or replace function public.elda_skola_is_larare()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('lärare', 'admin');
$$;

/** Sant om jag är lärare i en klass som eleven är med i. */
create or replace function public.elda_skola_teaches(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_student is not null
     and p_student <> auth.uid()
     and (
       public.is_admin()
       or exists (
         select 1
         from public.class_members student
         join public.class_members teacher on teacher.class_id = student.class_id
         where student.user_id = p_student
           and teacher.user_id = auth.uid()
           and teacher.member_role = 'larare'
       )
     );
$$;

revoke execute on function public.elda_skola_is_larare() from public, anon;
revoke execute on function public.elda_skola_teaches(uuid) from public, anon;
grant execute on function public.elda_skola_is_larare() to authenticated;
grant execute on function public.elda_skola_teaches(uuid) to authenticated;

-- ================================================================
-- 2. Nya kolumner på befintliga tabeller
-- ================================================================

-- Ämnet hör till klassen (ämnesklass), inte till eleven. En elev kan därför
-- vara med i flera ämnesklasser med samma konto och profil.
alter table public.classes
  add column if not exists subject text;

-- En uppgift kan sparas som utkast och arkiveras utan att raderas. Befintliga
-- uppgifter är publicerade, så inget försvinner för eleverna.
alter table public.student_tasks
  add column if not exists published boolean not null default true,
  add column if not exists archived_at timestamptz;

create index if not exists student_tasks_class_published_idx
  on public.student_tasks (class_id, published, archived_at);

-- Ett utkast får bara läsas av den lärare som skapade det. Elever ser bara
-- publicerade uppgifter, även om de är med i klassen.
drop policy if exists "student_tasks_select" on public.student_tasks;
create policy "student_tasks_select"
  on public.student_tasks for select
  to authenticated
  using (
    public.can_see_student_task(id)
    and (published or created_by = auth.uid() or public.is_admin())
  );

-- Lärare får skapa klasser i eget namn. En lärare kan aldrig skapa en klass
-- åt någon annan.
drop policy if exists "classes_teacher_insert" on public.classes;
create policy "classes_teacher_insert"
  on public.classes for insert
  to authenticated
  with check (public.elda_skola_is_larare() and created_by = auth.uid());

-- Lärare får skapa uppgifter i eget namn.
drop policy if exists "student_tasks_teacher_insert" on public.student_tasks;
create policy "student_tasks_teacher_insert"
  on public.student_tasks for insert
  to authenticated
  with check (
    public.elda_skola_is_larare()
    and created_by = auth.uid()
    and (class_id is null or public.is_class_teacher(class_id))
    and (student_id is null or public.elda_skola_teaches(student_id))
  );

-- Lärare får lägga till och ta bort medlemmar – men bara i klasser de själva
-- är lärare för.
drop policy if exists "class_members_teacher_write" on public.class_members;
create policy "class_members_teacher_write"
  on public.class_members for insert
  to authenticated
  with check (public.is_class_teacher(class_id) and added_by = auth.uid());

drop policy if exists "class_members_teacher_delete" on public.class_members;
create policy "class_members_teacher_delete"
  on public.class_members for delete
  to authenticated
  using (public.is_class_teacher(class_id));

-- Material: lärare får ladda upp till sina egna klasser/elever.
drop policy if exists "documents_teacher_insert" on public.documents;
create policy "documents_teacher_insert"
  on public.documents for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.elda_skola_is_larare()
    and (class_id is null or public.is_class_teacher(class_id))
    and (student_id is null or public.elda_skola_teaches(student_id))
  );

-- ================================================================
-- 3. Nya tabeller
-- ================================================================

-- ------------------------------------------------- Meddelanden till klass
create table if not exists public.school_announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists school_announcements_class_idx
  on public.school_announcements (class_id, created_at desc);

-- Lässtatus per elev. Ingen annan än eleven själv skriver här.
create table if not exists public.school_announcement_reads (
  announcement_id uuid not null references public.school_announcements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- ---------------------------------------------------------- Kalenderhändelser
create table if not exists public.school_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists school_events_start_idx
  on public.school_events (starts_at);
create index if not exists school_events_class_idx
  on public.school_events (class_id, starts_at);

-- ----------------------------------------------------- Läraktiviteter
create table if not exists public.school_activities (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  subject text,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  instructions text,
  kind text not null default 'uppgift'
    check (kind in ('uppgift', 'diskussion', 'reflektion', 'grupparbete', 'quiz', 'ovning')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_activities_class_idx
  on public.school_activities (class_id, published, created_at desc);

-- Elevens avbockning av en aktivitet. En rad per elev och aktivitet.
create table if not exists public.school_activity_completions (
  activity_id uuid not null references public.school_activities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

-- ------------------------------------------------------------ Anpassningar
--
-- Känslig information. Läses bara av lärare som undervisar eleven i en
-- gemensam klass, skrivs bara av skaparen (eller admin) och syns aldrig för
-- eleven i elevpanelen.
create table if not exists public.school_adaptations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  class_id uuid references public.classes (id) on delete set null,
  task_id uuid references public.student_tasks (id) on delete set null,
  subject text,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  measures text,
  status text not null default 'aktiv' check (status in ('aktiv', 'avslutad')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_adaptations_student_idx
  on public.school_adaptations (student_id, status, created_at desc);
create index if not exists school_adaptations_class_idx
  on public.school_adaptations (class_id, created_at desc);

-- ================================================================
-- 4. Row Level Security
-- ================================================================

alter table public.school_announcements enable row level security;
alter table public.school_announcement_reads enable row level security;
alter table public.school_events enable row level security;
alter table public.school_activities enable row level security;
alter table public.school_activity_completions enable row level security;
alter table public.school_adaptations enable row level security;

-- ---------------------------------------------------------- meddelanden
drop policy if exists "school_announcements_select" on public.school_announcements;
create policy "school_announcements_select"
  on public.school_announcements for select
  to authenticated
  using (public.is_class_member(class_id) or public.is_class_teacher(class_id));

drop policy if exists "school_announcements_teacher_insert" on public.school_announcements;
create policy "school_announcements_teacher_insert"
  on public.school_announcements for insert
  to authenticated
  with check (public.is_class_teacher(class_id) and author_id = auth.uid());

drop policy if exists "school_announcements_author_write" on public.school_announcements;
create policy "school_announcements_author_write"
  on public.school_announcements for update
  to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists "school_announcements_author_delete" on public.school_announcements;
create policy "school_announcements_author_delete"
  on public.school_announcements for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

drop policy if exists "school_announcement_reads_own" on public.school_announcement_reads;
create policy "school_announcement_reads_own"
  on public.school_announcement_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.school_announcements a
      where a.id = announcement_id and public.is_class_member(a.class_id)
    )
  );

-- ---------------------------------------------------------- händelser
drop policy if exists "school_events_select" on public.school_events;
create policy "school_events_select"
  on public.school_events for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or (class_id is not null and public.is_class_member(class_id))
  );

drop policy if exists "school_events_teacher_insert" on public.school_events;
create policy "school_events_teacher_insert"
  on public.school_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.elda_skola_is_larare()
    and (class_id is null or public.is_class_teacher(class_id))
  );

drop policy if exists "school_events_author_write" on public.school_events;
create policy "school_events_author_write"
  on public.school_events for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "school_events_author_delete" on public.school_events;
create policy "school_events_author_delete"
  on public.school_events for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- -------------------------------------------------------- aktiviteter
drop policy if exists "school_activities_select" on public.school_activities;
create policy "school_activities_select"
  on public.school_activities for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.is_class_teacher(class_id)
    or (published and public.is_class_member(class_id))
  );

drop policy if exists "school_activities_teacher_insert" on public.school_activities;
create policy "school_activities_teacher_insert"
  on public.school_activities for insert
  to authenticated
  with check (public.is_class_teacher(class_id) and created_by = auth.uid());

drop policy if exists "school_activities_author_write" on public.school_activities;
create policy "school_activities_author_write"
  on public.school_activities for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "school_activities_author_delete" on public.school_activities;
create policy "school_activities_author_delete"
  on public.school_activities for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists "school_activity_completions_own" on public.school_activity_completions;
create policy "school_activity_completions_own"
  on public.school_activity_completions for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.school_activities a
      where a.id = activity_id
        and a.published
        and public.is_class_member(a.class_id)
    )
  );

-- -------------------------------------------------------- anpassningar
-- Lärare som undervisar eleven får läsa. Obehöriga lärare, klasskamrater och
-- eleven själv nekas av RLS – inte av gränssnittet.
drop policy if exists "school_adaptations_select" on public.school_adaptations;
create policy "school_adaptations_select"
  on public.school_adaptations for select
  to authenticated
  using (public.elda_skola_teaches(student_id));

drop policy if exists "school_adaptations_teacher_insert" on public.school_adaptations;
create policy "school_adaptations_teacher_insert"
  on public.school_adaptations for insert
  to authenticated
  with check (created_by = auth.uid() and public.elda_skola_teaches(student_id));

drop policy if exists "school_adaptations_author_write" on public.school_adaptations;
create policy "school_adaptations_author_write"
  on public.school_adaptations for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "school_adaptations_author_delete" on public.school_adaptations;
create policy "school_adaptations_author_delete"
  on public.school_adaptations for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- ================================================================
-- 5. Serverfunktioner
-- ================================================================

/** Mina klasser, med ämne, medlemsroll, antal och klasskod för lärare. */
create or replace function public.elda_skola_my_classes()
returns table (
  id uuid,
  name text,
  description text,
  subject text,
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
    c.subject,
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

/** Skapa klass med ämne. Endast lärare; anroparen blir klassens lärare. */
create or replace function public.elda_skola_create_class(
  p_name text,
  p_subject text default null,
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
  if not public.elda_skola_is_larare() then
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

  insert into public.classes (name, description, subject, created_by, join_code, join_code_rotated_at)
  values (
    v_name,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    v_me,
    v_code,
    now()
  )
  returning id into v_id;

  insert into public.class_members (class_id, user_id, member_role, added_by)
  values (v_id, v_me, 'larare', v_me)
  on conflict (class_id, user_id) do update set member_role = 'larare';

  perform public.log_audit('school.class.created', 'class', v_id::text, jsonb_build_object('name', v_name));

  return jsonb_build_object('id', v_id, 'name', v_name, 'join_code', v_code);
end;
$$;

/** Redigera klassens namn, ämne och beskrivning. Endast klassens lärare. */
create or replace function public.elda_skola_update_class(
  p_class uuid,
  p_name text,
  p_subject text default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  if not public.is_class_teacher(p_class) then
    raise exception 'Du är inte lärare för den klassen.';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Ge klassen ett namn (minst 2 tecken).';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'Klassnamnet är för långt (max 80 tecken).';
  end if;

  update public.classes
  set name = v_name,
      subject = nullif(trim(coalesce(p_subject, '')), ''),
      description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_class;

  perform public.log_audit('school.class.updated', 'class', p_class::text);
end;
$$;

/** Lärarens elever, med namn och klass. En rad per elev och klass. */
create or replace function public.elda_skola_my_students()
returns table (
  id uuid,
  username text,
  first_name text,
  last_name text,
  account_type text,
  class_id uuid,
  class_name text,
  class_subject text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    p.id,
    p.username,
    p.first_name,
    p.last_name,
    p.account_type,
    c.id as class_id,
    c.name as class_name,
    c.subject as class_subject
  from public.class_members teacher
  join public.classes c on c.id = teacher.class_id
  join public.class_members student on student.class_id = c.id
  join public.profiles p on p.id = student.user_id
  where teacher.user_id = auth.uid()
    and teacher.member_role = 'larare'
    and student.user_id <> auth.uid()
    and p.role = 'elev'
    and p.active
  order by p.username;
$$;

/** Klasslista med visningsnamn. Kräver medlemskap i klassen. */
create or replace function public.elda_skola_class_roster(p_class uuid)
returns table (
  id uuid,
  username text,
  display_name text,
  member_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    coalesce(
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.username
    ) as display_name,
    m.member_role
  from public.class_members m
  join public.profiles p on p.id = m.user_id
  where m.class_id = p_class
    and (public.is_class_member(p_class) or public.is_class_teacher(p_class))
  order by m.member_role desc, display_name;
$$;

/** Lägg till ett befintligt skolkonto i en klass. Läraren äger åtgärden. */
create or replace function public.elda_skola_add_student(
  p_class uuid,
  p_username text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_username text := lower(trim(coalesce(p_username, '')));
  v_student uuid;
  v_type text;
begin
  if not public.is_class_teacher(p_class) then
    raise exception 'Du är inte lärare för den klassen.';
  end if;
  if v_username = '' then
    raise exception 'Ange elevens användarnamn.';
  end if;

  select id, account_type into v_student, v_type
  from public.profiles
  where username = v_username and role = 'elev' and active;

  if v_student is null then
    raise exception 'Inget aktivt elevkonto med det användarnamnet hittades.';
  end if;
  if v_type = 'privat' then
    raise exception 'Kontot är ett privat elevkonto i Elda och kan inte läggas till i en skolklass.';
  end if;

  insert into public.class_members (class_id, user_id, member_role, added_by)
  values (p_class, v_student, 'elev', v_me)
  on conflict (class_id, user_id) do update set member_role = 'elev';

  perform public.log_audit(
    'school.class.student_added',
    'class',
    p_class::text,
    jsonb_build_object('student_id', v_student)
  );

  return v_student;
end;
$$;

/** Ta bort eleven från klassen. Kontot, profilen och uppgifterna finns kvar. */
create or replace function public.elda_skola_remove_student(
  p_class uuid,
  p_student uuid
)
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
  where class_id = p_class
    and user_id = p_student
    and member_role = 'elev';

  perform public.log_audit(
    'school.class.student_removed',
    'class',
    p_class::text,
    jsonb_build_object('student_id', p_student)
  );
end;
$$;

/** Byt eget för- och efternamn. Roll, klass och skoltillhörighet är orörbara. */
create or replace function public.elda_skola_update_my_name(
  p_first_name text default null,
  p_last_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_first text := nullif(trim(coalesce(p_first_name, '')), '');
  v_last text := nullif(trim(coalesce(p_last_name, '')), '');
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if v_first is null then
    raise exception 'Förnamn får inte vara tomt.';
  end if;
  if char_length(v_first) > 60 or char_length(coalesce(v_last, '')) > 60 then
    raise exception 'Namnet är för långt.';
  end if;

  update public.profiles
  set first_name = v_first,
      last_name = v_last
  where id = v_me and active;

  if not found then
    raise exception 'Profilen kunde inte uppdateras.';
  end if;
end;
$$;

/** Meddelanden för mina klasser, med avsändarnamn och min lässtatus. */
create or replace function public.elda_skola_list_announcements()
returns table (
  id uuid,
  class_id uuid,
  author_id uuid,
  author_name text,
  title text,
  body text,
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
    a.author_id,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username) as author_name,
    a.title,
    a.body,
    a.created_at,
    r.read_at,
    (select count(*)::int from public.school_announcement_reads rc where rc.announcement_id = a.id) as read_count,
    (select count(*)::int from public.class_members m where m.class_id = a.class_id and m.member_role = 'elev') as recipient_count
  from public.school_announcements a
  join public.profiles p on p.id = a.author_id
  left join public.school_announcement_reads r
    on r.announcement_id = a.id and r.user_id = auth.uid()
  where public.is_class_member(a.class_id) or public.is_class_teacher(a.class_id)
  order by a.created_at desc;
$$;

/** Aktiviteter för mina klasser. Elever ser bara publicerade, med avbockning. */
create or replace function public.elda_skola_list_activities()
returns table (
  id uuid,
  class_id uuid,
  class_name text,
  subject text,
  title text,
  description text,
  instructions text,
  kind text,
  published boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  completed boolean
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
    a.subject,
    a.title,
    a.description,
    a.instructions,
    a.kind,
    a.published,
    a.created_by,
    a.created_at,
    a.updated_at,
    (comp.user_id is not null) as completed
  from public.school_activities a
  join public.classes c on c.id = a.class_id
  left join public.school_activity_completions comp
    on comp.activity_id = a.id and comp.user_id = auth.uid()
  where public.is_class_teacher(a.class_id)
     or (a.published and public.is_class_member(a.class_id))
  order by a.created_at desc;
$$;

/** Elevens avbockning av en publicerad aktivitet i sin egen klass. */
create or replace function public.elda_skola_set_activity_done(
  p_activity uuid,
  p_done boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_class uuid;
  v_published boolean;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;

  select class_id, published into v_class, v_published
  from public.school_activities where id = p_activity;

  if v_class is null then
    raise exception 'Aktiviteten hittades inte.';
  end if;
  if not v_published or not public.is_class_member(v_class) then
    raise exception 'Aktiviteten är inte tillgänglig för dig.';
  end if;

  if coalesce(p_done, false) then
    insert into public.school_activity_completions (activity_id, user_id)
    values (p_activity, v_me)
    on conflict (activity_id, user_id) do nothing;
  else
    delete from public.school_activity_completions
    where activity_id = p_activity and user_id = v_me;
  end if;
end;
$$;

/** Anpassningar för de elever jag undervisar. Aldrig för eleven själv. */
create or replace function public.elda_skola_list_adaptations()
returns table (
  id uuid,
  student_id uuid,
  student_name text,
  class_id uuid,
  class_name text,
  subject text,
  task_id uuid,
  title text,
  description text,
  measures text,
  status text,
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
    coalesce(nullif(trim(concat_ws(' ', s.first_name, s.last_name)), ''), s.username) as student_name,
    a.class_id,
    c.name as class_name,
    a.subject,
    a.task_id,
    a.title,
    a.description,
    a.measures,
    a.status,
    a.created_by,
    coalesce(nullif(trim(concat_ws(' ', t.first_name, t.last_name)), ''), t.username) as creator_name,
    a.created_at,
    a.updated_at
  from public.school_adaptations a
  join public.profiles s on s.id = a.student_id
  join public.profiles t on t.id = a.created_by
  left join public.classes c on c.id = a.class_id
  where public.elda_skola_is_larare()
    and public.elda_skola_teaches(a.student_id)
  order by a.status, a.updated_at desc;
$$;

/** Skapa eller uppdatera en anpassning. Endast behörig lärare. */
create or replace function public.elda_skola_save_adaptation(
  p_id uuid default null,
  p_student uuid default null,
  p_class uuid default null,
  p_subject text default null,
  p_task uuid default null,
  p_title text default null,
  p_description text default null,
  p_measures text default null,
  p_status text default 'aktiv'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_status text := coalesce(nullif(trim(p_status), ''), 'aktiv');
  v_id uuid;
  v_owner uuid;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if not public.elda_skola_is_larare() then
    raise exception 'Endast lärare får hantera anpassningar.';
  end if;
  if p_student is null or not public.elda_skola_teaches(p_student) then
    raise exception 'Du undervisar inte eleven.';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'Ge anpassningen en rubrik (minst 2 tecken).';
  end if;
  if v_status not in ('aktiv', 'avslutad') then
    raise exception 'Ogiltig status.';
  end if;
  if p_class is not null and not public.is_class_teacher(p_class) then
    raise exception 'Du är inte lärare för den klassen.';
  end if;

  if p_id is null then
    insert into public.school_adaptations (
      student_id, class_id, task_id, subject, title, description, measures, status, created_by
    )
    values (
      p_student,
      p_class,
      p_task,
      nullif(trim(coalesce(p_subject, '')), ''),
      v_title,
      nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_measures, '')), ''),
      v_status,
      v_me
    )
    returning id into v_id;
  else
    select created_by into v_owner from public.school_adaptations where id = p_id;
    if v_owner is null then
      raise exception 'Anpassningen hittades inte.';
    end if;
    if v_owner <> v_me and not public.is_admin() then
      raise exception 'Du kan bara ändra anpassningar du själv har skapat.';
    end if;

    update public.school_adaptations
    set student_id = p_student,
        class_id = p_class,
        task_id = p_task,
        subject = nullif(trim(coalesce(p_subject, '')), ''),
        title = v_title,
        description = nullif(trim(coalesce(p_description, '')), ''),
        measures = nullif(trim(coalesce(p_measures, '')), ''),
        status = v_status,
        updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  perform public.log_audit(
    'school.adaptation.saved',
    'user',
    p_student::text,
    jsonb_build_object('adaptation_id', v_id, 'status', v_status)
  );

  return v_id;
end;
$$;

/** Ta bort en anpassning. Skaparen eller en administratör. */
create or replace function public.elda_skola_delete_adaptation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;

  select created_by into v_owner from public.school_adaptations where id = p_id;
  if v_owner is null then
    raise exception 'Anpassningen hittades inte.';
  end if;
  if v_owner <> v_me and not public.is_admin() then
    raise exception 'Du kan bara ta bort anpassningar du själv har skapat.';
  end if;

  delete from public.school_adaptations where id = p_id;
  perform public.log_audit('school.adaptation.deleted', 'adaptation', p_id::text);
end;
$$;

-- ================================================================
-- 6. Behörigheter
-- ================================================================

revoke execute on function public.elda_skola_my_classes() from public, anon;
revoke execute on function public.elda_skola_create_class(text, text, text) from public, anon;
revoke execute on function public.elda_skola_update_class(uuid, text, text, text) from public, anon;
revoke execute on function public.elda_skola_my_students() from public, anon;
revoke execute on function public.elda_skola_class_roster(uuid) from public, anon;
revoke execute on function public.elda_skola_add_student(uuid, text) from public, anon;
revoke execute on function public.elda_skola_remove_student(uuid, uuid) from public, anon;
revoke execute on function public.elda_skola_update_my_name(text, text) from public, anon;
revoke execute on function public.elda_skola_list_announcements() from public, anon;
revoke execute on function public.elda_skola_list_activities() from public, anon;
revoke execute on function public.elda_skola_set_activity_done(uuid, boolean) from public, anon;
revoke execute on function public.elda_skola_list_adaptations() from public, anon;
revoke execute on function public.elda_skola_save_adaptation(uuid, uuid, uuid, text, uuid, text, text, text, text) from public, anon;
revoke execute on function public.elda_skola_delete_adaptation(uuid) from public, anon;

grant execute on function public.elda_skola_my_classes() to authenticated;
grant execute on function public.elda_skola_create_class(text, text, text) to authenticated;
grant execute on function public.elda_skola_update_class(uuid, text, text, text) to authenticated;
grant execute on function public.elda_skola_my_students() to authenticated;
grant execute on function public.elda_skola_class_roster(uuid) to authenticated;
grant execute on function public.elda_skola_add_student(uuid, text) to authenticated;
grant execute on function public.elda_skola_remove_student(uuid, uuid) to authenticated;
grant execute on function public.elda_skola_update_my_name(text, text) to authenticated;
grant execute on function public.elda_skola_list_announcements() to authenticated;
grant execute on function public.elda_skola_list_activities() to authenticated;
grant execute on function public.elda_skola_set_activity_done(uuid, boolean) to authenticated;
grant execute on function public.elda_skola_list_adaptations() to authenticated;
grant execute on function public.elda_skola_save_adaptation(uuid, uuid, uuid, text, uuid, text, text, text, text) to authenticated;
grant execute on function public.elda_skola_delete_adaptation(uuid) to authenticated;
