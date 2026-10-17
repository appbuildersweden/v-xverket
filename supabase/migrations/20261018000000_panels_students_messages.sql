-- Elda – utvecklingssteg 4: klasser, elevkopplingar, uppgifter, meddelanden,
-- flashcards, provträning och dokument.
--
-- Migreringen är icke-destruktiv: den lägger bara till nya tabeller, kolumner
-- och policies. Inga befintliga rader ändras eller raderas.
--
-- Behörighetsmodellen:
--   * Allt som är privat skyddas av Row Level Security.
--   * XP, nivåer och upplåsningar beräknas enbart serversidigt i
--     security definer-funktioner. Klienten kan aldrig skriva XP.
--   * En lärare ser bara de elever som är kopplade till hen (student_links),
--     uppgifter hen själv har skapat eller uppgifter som delats med hens klass.
--   * En elev ser bara sin egen data, sin klass och sina egna meddelanden.

-- ================================================================
-- 1. Tabeller
-- ================================================================

-- ---------------------------------------------------------------- Klasser
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'elev' check (member_role in ('elev', 'larare')),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, user_id)
);

create index if not exists class_members_user_idx
  on public.class_members (user_id);

-- ------------------------------------------------- Koppling lärare ↔ elev
create table if not exists public.student_links (
  id uuid primary key default gen_random_uuid(),
  speciallarare_id uuid not null references auth.users (id) on delete cascade,
  elev_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (speciallarare_id, elev_id),
  check (speciallarare_id <> elev_id)
);

create index if not exists student_links_elev_idx
  on public.student_links (elev_id);

-- ------------------------------------------------- Tilldelade uppgifter
create table if not exists public.student_tasks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  student_id uuid references auth.users (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  instructions text,
  subject text,
  due_date date,
  status text not null default 'ej_paborjad'
    check (status in ('ej_paborjad', 'pagar', 'klar')),
  submission text,
  submitted_at timestamptz,
  completed_at timestamptz,
  -- Säkrar att en uppgift bara kan ge XP en gång (uniknyckel nedan).
  xp_awarded boolean not null default false,
  follow_up boolean not null default false,
  follow_up_note text,
  followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (student_id is not null or class_id is not null)
);

create index if not exists student_tasks_student_idx
  on public.student_tasks (student_id, status, due_date);
create index if not exists student_tasks_class_idx
  on public.student_tasks (class_id, status, due_date);
create index if not exists student_tasks_creator_idx
  on public.student_tasks (created_by, created_at);

-- XP-transaktioner måste kunna peka på en tilldelad uppgift också.
alter table public.xp_transactions
  add column if not exists student_task_id uuid
  references public.student_tasks (id) on delete set null;

-- En tilldelad uppgift ger XP exakt en gång, även vid samtidiga anrop.
create unique index if not exists xp_tx_one_per_student_task
  on public.xp_transactions (user_id, student_task_id)
  where student_task_id is not null;

-- ------------------------------------------------------------ Meddelanden
create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('global', 'klass', 'direkt')),
  class_id uuid references public.classes (id) on delete cascade,
  dm_user_a uuid references auth.users (id) on delete cascade,
  dm_user_b uuid references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- En global kanal, en kanal per klass och en kanal per samtalspar.
create unique index if not exists chat_channels_global_idx
  on public.chat_channels (kind) where kind = 'global';
create unique index if not exists chat_channels_class_idx
  on public.chat_channels (class_id) where class_id is not null;
create unique index if not exists chat_channels_dm_idx
  on public.chat_channels (dm_user_a, dm_user_b) where kind = 'direkt';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_idx
  on public.messages (channel_id, created_at);

insert into public.chat_channels (kind)
values ('global')
on conflict do nothing;

-- -------------------------------------------------------------- Flashcards
create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  subject text,
  -- Delade kortlekar kan övas av alla inloggade (t.ex. lärarens material).
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  answer text not null check (char_length(answer) between 1 and 1000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists flashcards_deck_idx
  on public.flashcards (deck_id, position);

-- Repetitionsstatus per användare och kort (ersätter aldrig kortet självt).
create table if not exists public.flashcard_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  known_count integer not null default 0 check (known_count >= 0),
  repeat_count integer not null default 0 check (repeat_count >= 0),
  last_result boolean,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- ----------------------------------------------------------- Provträning
create table if not exists public.quiz_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  subject text,
  description text,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

-- Frågorna (och därmed facit) är bara läsbara för ägaren och administratörer.
-- Elever får frågorna utan facit via funktionen get_quiz_questions.
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.quiz_sets (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 500),
  options text[] not null,
  correct_index integer not null check (correct_index >= 0),
  explanation text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check (array_length(options, 1) between 2 and 6),
  check (correct_index < array_length(options, 1))
);

create index if not exists quiz_questions_set_idx
  on public.quiz_questions (set_id, position);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.quiz_sets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null check (score >= 0),
  total integer not null check (total >= 0),
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_idx
  on public.quiz_attempts (user_id, completed_at);

-- -------------------------------------------------------------- Dokument
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  subject text,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  student_id uuid references auth.users (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists documents_owner_idx
  on public.documents (owner_id, created_at);
create index if not exists documents_student_idx
  on public.documents (student_id, created_at);
create index if not exists documents_class_idx
  on public.documents (class_id, created_at);

-- ================================================================
-- 2. Hjälpfunktioner (security definer => ingen rekursion i RLS)
-- ================================================================

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

-- Personal = administratör eller speciallärare.
create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('admin', 'speciallärare');
$$;

create or replace function public.is_class_member(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
        select 1 from public.class_members m
        where m.class_id = p_class and m.user_id = auth.uid()
      );
$$;

-- Sant om jag delar klass med personen (används för klasskamrater).
create or replace function public.shares_class(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user = auth.uid()
      or exists (
        select 1
        from public.class_members mine
        join public.class_members theirs on theirs.class_id = mine.class_id
        where mine.user_id = auth.uid() and theirs.user_id = p_user
      );
$$;

-- Sant om jag har rätt att se personens profil: mig själv, admin, en elev jag är
-- kopplad till som speciallärare, eller en klasskamrat.
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

create or replace function public.can_access_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channels c
    where c.id = p_channel
      and (
        c.kind = 'global'
        or public.is_admin()
        or (c.kind = 'direkt' and auth.uid() in (c.dm_user_a, c.dm_user_b))
        or (c.kind = 'klass' and c.class_id is not null
            and public.is_class_member(c.class_id))
      )
  );
$$;

create or replace function public.can_see_deck(p_deck uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.flashcard_decks d
    where d.id = p_deck
      and (d.owner_id = auth.uid() or d.is_shared or public.is_admin())
  );
$$;

create or replace function public.can_see_quiz_set(p_set uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.quiz_sets s
    where s.id = p_set
      and (s.owner_id = auth.uid() or s.is_shared or public.is_admin())
  );
$$;

create or replace function public.can_see_document(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_id
      and (
        d.owner_id = auth.uid()
        or public.is_admin()
        or (d.student_id is not null and public.can_see_user(d.student_id))
        or (d.class_id is not null and public.is_class_member(d.class_id))
      )
  );
$$;

-- ================================================================
-- 3. Row Level Security
-- ================================================================

alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.student_links enable row level security;
alter table public.student_tasks enable row level security;
alter table public.chat_channels enable row level security;
alter table public.messages enable row level security;
alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_progress enable row level security;
alter table public.quiz_sets enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.documents enable row level security;

-- ---------------------------------------------------------------- profiles
-- Personal får läsa profilen för en elev de är kopplad till, samt klasskamrater.
-- Det behövs för namn i elevlistor och klasslistor — aldrig för privata data.
drop policy if exists "profiles_select_linked" on public.profiles;
create policy "profiles_select_linked"
  on public.profiles for select
  to authenticated
  using (public.can_see_user(id));

-- ---------------------------------------------------------------- klasser
drop policy if exists "classes_select_member_or_staff" on public.classes;
create policy "classes_select_member_or_staff"
  on public.classes for select
  to authenticated
  using (public.is_staff() or public.is_class_member(id));

drop policy if exists "classes_staff_insert" on public.classes;
create policy "classes_staff_insert"
  on public.classes for insert
  to authenticated
  with check (public.is_staff() and created_by = auth.uid());

drop policy if exists "classes_owner_update" on public.classes;
create policy "classes_owner_update"
  on public.classes for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "classes_owner_delete" on public.classes;
create policy "classes_owner_delete"
  on public.classes for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists "class_members_select" on public.class_members;
create policy "class_members_select"
  on public.class_members for select
  to authenticated
  using (public.is_class_member(class_id));

drop policy if exists "class_members_staff_write" on public.class_members;
create policy "class_members_staff_write"
  on public.class_members for insert
  to authenticated
  with check (public.is_staff() and added_by = auth.uid());

drop policy if exists "class_members_staff_delete" on public.class_members;
create policy "class_members_staff_delete"
  on public.class_members for delete
  to authenticated
  using (public.is_staff());

-- ------------------------------------------------------- elevkopplingar
drop policy if exists "student_links_select" on public.student_links;
create policy "student_links_select"
  on public.student_links for select
  to authenticated
  using (
    speciallarare_id = auth.uid()
    or elev_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "student_links_staff_insert" on public.student_links;
create policy "student_links_staff_insert"
  on public.student_links for insert
  to authenticated
  with check (public.is_staff() and speciallarare_id = auth.uid());

drop policy if exists "student_links_staff_delete" on public.student_links;
create policy "student_links_staff_delete"
  on public.student_links for delete
  to authenticated
  using (speciallarare_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------- tilldelade uppgifter
drop policy if exists "student_tasks_select" on public.student_tasks;
create policy "student_tasks_select"
  on public.student_tasks for select
  to authenticated
  using (public.can_see_student_task(id));

-- Endast personal får skapa uppgifter, och bara i eget namn.
drop policy if exists "student_tasks_staff_insert" on public.student_tasks;
create policy "student_tasks_staff_insert"
  on public.student_tasks for insert
  to authenticated
  with check (public.is_staff() and created_by = auth.uid());

-- Eleven får aldrig skriva direkt i tabellen — status och inlämning går via
-- student_set_task_status, som kontrollerar ägarskap och delar ut XP en gång.
drop policy if exists "student_tasks_author_update" on public.student_tasks;
create policy "student_tasks_author_update"
  on public.student_tasks for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "student_tasks_author_delete" on public.student_tasks;
create policy "student_tasks_author_delete"
  on public.student_tasks for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- -------------------------------------------------------------- kanaler
drop policy if exists "chat_channels_select" on public.chat_channels;
create policy "chat_channels_select"
  on public.chat_channels for select
  to authenticated
  using (public.can_access_channel(id));

drop policy if exists "chat_channels_direct_insert" on public.chat_channels;
create policy "chat_channels_direct_insert"
  on public.chat_channels for insert
  to authenticated
  with check (
    (kind = 'direkt' and auth.uid() in (dm_user_a, dm_user_b))
    or (kind = 'klass' and public.is_staff())
  );

drop policy if exists "chat_channels_staff_update" on public.chat_channels;
create policy "chat_channels_staff_update"
  on public.chat_channels for update
  to authenticated
  using (public.is_staff() or public.is_admin())
  with check (public.is_staff() or public.is_admin());

drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
  on public.messages for select
  to authenticated
  using (public.can_access_channel(channel_id));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid() and public.can_access_channel(channel_id));

-- Inga update/delete-policyer: skickade meddelanden ändras inte.

-- ------------------------------------------------------------ flashcards
drop policy if exists "flashcard_decks_select" on public.flashcard_decks;
create policy "flashcard_decks_select"
  on public.flashcard_decks for select
  to authenticated
  using (owner_id = auth.uid() or is_shared or public.is_admin());

drop policy if exists "flashcard_decks_owner_insert" on public.flashcard_decks;
create policy "flashcard_decks_owner_insert"
  on public.flashcard_decks for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "flashcard_decks_owner_update" on public.flashcard_decks;
create policy "flashcard_decks_owner_update"
  on public.flashcard_decks for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "flashcard_decks_owner_delete" on public.flashcard_decks;
create policy "flashcard_decks_owner_delete"
  on public.flashcard_decks for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "flashcards_select" on public.flashcards;
create policy "flashcards_select"
  on public.flashcards for select
  to authenticated
  using (public.can_see_deck(deck_id));

drop policy if exists "flashcards_owner_write" on public.flashcards;
create policy "flashcards_owner_write"
  on public.flashcards for all
  to authenticated
  using (
    exists (
      select 1 from public.flashcard_decks d
      where d.id = deck_id and (d.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.flashcard_decks d
      where d.id = deck_id and (d.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "flashcard_progress_own" on public.flashcard_progress;
create policy "flashcard_progress_own"
  on public.flashcard_progress for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------- provträning
drop policy if exists "quiz_sets_select" on public.quiz_sets;
create policy "quiz_sets_select"
  on public.quiz_sets for select
  to authenticated
  using (owner_id = auth.uid() or is_shared or public.is_admin());

drop policy if exists "quiz_sets_owner_insert" on public.quiz_sets;
create policy "quiz_sets_owner_insert"
  on public.quiz_sets for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "quiz_sets_owner_update" on public.quiz_sets;
create policy "quiz_sets_owner_update"
  on public.quiz_sets for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "quiz_sets_owner_delete" on public.quiz_sets;
create policy "quiz_sets_owner_delete"
  on public.quiz_sets for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Frågorna innehåller facit och är därför bara läsbara för ägaren (och admin).
-- En elev får dem utan facit via get_quiz_questions.
drop policy if exists "quiz_questions_owner" on public.quiz_questions;
create policy "quiz_questions_owner"
  on public.quiz_questions for all
  to authenticated
  using (
    exists (
      select 1 from public.quiz_sets s
      where s.id = set_id and (s.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.quiz_sets s
      where s.id = set_id and (s.owner_id = auth.uid() or public.is_admin())
    )
  );

-- Egna resultat, samt ägarens resultat för att kunna följa upp.
drop policy if exists "quiz_attempts_select" on public.quiz_attempts;
create policy "quiz_attempts_select"
  on public.quiz_attempts for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.quiz_sets s
      where s.id = set_id and s.owner_id = auth.uid()
    )
  );

-- Resultat skrivs av submit_quiz_attempt (security definer) — aldrig direkt.
drop policy if exists "quiz_attempts_own_insert" on public.quiz_attempts;
create policy "quiz_attempts_own_insert"
  on public.quiz_attempts for insert
  to authenticated
  with check (user_id = auth.uid());

-- ------------------------------------------------------------- dokument
drop policy if exists "documents_select" on public.documents;
create policy "documents_select"
  on public.documents for select
  to authenticated
  using (public.can_see_document(id));

-- Personal får dela material med en elev eller en klass. En elev får bara
-- skapa sina egna privata dokument (student_id = sig själv).
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert"
  on public.documents for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      public.is_staff()
      or student_id = auth.uid()
    )
  );

drop policy if exists "documents_owner_update" on public.documents;
create policy "documents_owner_update"
  on public.documents for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "documents_owner_delete" on public.documents;
create policy "documents_owner_delete"
  on public.documents for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- ================================================================
-- 4. Serverfunktioner som klienten anropar
-- ================================================================

-- -------------------------------------------- Konton som personal får se
drop function if exists public.list_elev_accounts();
create function public.list_elev_accounts()
returns table (id uuid, username text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Endast personal får lista elevkonton.';
  end if;
  return query
    select p.id, p.username
    from public.profiles p
    where p.role = 'elev' and p.active
    order by p.username;
end;
$$;

drop function if exists public.list_staff_accounts();
create function public.list_staff_accounts()
returns table (id uuid, username text, role text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Endast personal får lista personalkonton.';
  end if;
  return query
    select p.id, p.username, p.role
    from public.profiles p
    where p.role in ('admin', 'speciallärare') and p.active
    order by p.username;
end;
$$;

-- ------------------------------------------------- Koppla elev till lärare
create or replace function public.link_student(p_elev uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not public.is_staff() then
    raise exception 'Endast personal får koppla elever.';
  end if;
  if p_elev = auth.uid() then
    raise exception 'Du kan inte koppla dig själv som elev.';
  end if;

  select role into v_role from public.profiles where id = p_elev;
  if v_role is null then
    raise exception 'Kontot hittades inte.';
  end if;
  if v_role <> 'elev' then
    raise exception 'Endast elevkonton kan kopplas.';
  end if;

  insert into public.student_links (speciallarare_id, elev_id)
  values (auth.uid(), p_elev)
  on conflict (speciallarare_id, elev_id) do nothing;
end;
$$;

create or replace function public.unlink_student(p_elev uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Endast personal får ta bort kopplingar.';
  end if;
  delete from public.student_links
  where speciallarare_id = auth.uid() and elev_id = p_elev;
end;
$$;

-- ------------------------------------------------------ Klasser och kanaler
create or replace function public.create_class(
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Endast personal får skapa klasser.';
  end if;
  if p_name is null or char_length(trim(p_name)) < 1 then
    raise exception 'Klassen måste ha ett namn.';
  end if;

  insert into public.classes (name, description, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), auth.uid())
  returning id into v_id;

  -- Den som skapar klassen blir lärare i den, så att den syns direkt.
  insert into public.class_members (class_id, user_id, member_role, added_by)
  values (v_id, auth.uid(), 'larare', auth.uid())
  on conflict (class_id, user_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.add_class_member(
  p_class uuid,
  p_user uuid,
  p_member_role text default 'elev'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not public.is_staff() then
    raise exception 'Endast personal får lägga till klassmedlemmar.';
  end if;
  if p_member_role not in ('elev', 'larare') then
    raise exception 'Ogiltig medlemsroll.';
  end if;

  select role into v_role from public.profiles where id = p_user;
  if v_role is null then
    raise exception 'Kontot hittades inte.';
  end if;
  if not exists (select 1 from public.classes where id = p_class) then
    raise exception 'Klassen hittades inte.';
  end if;

  insert into public.class_members (class_id, user_id, member_role, added_by)
  values (p_class, p_user, p_member_role, auth.uid())
  on conflict (class_id, user_id)
  do update set member_role = excluded.member_role;
end;
$$;

create or replace function public.remove_class_member(p_class uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Endast personal får ta bort klassmedlemmar.';
  end if;
  delete from public.class_members
  where class_id = p_class and user_id = p_user;
end;
$$;

-- Hämtar (eller skapar) klassens chattkanal.
create or replace function public.class_channel(p_class uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_class_member(p_class) then
    raise exception 'Du har inte tillgång till klassens chatt.';
  end if;

  select id into v_id
  from public.chat_channels
  where kind = 'klass' and class_id = p_class;

  if v_id is null then
    insert into public.chat_channels (kind, class_id, created_by)
    values ('klass', p_class, auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------ Direkta meddelanden
-- En direktkanal får bara öppnas mellan en elev och personal, i någon riktning.
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
  if not (public.is_staff() or v_other_role in ('admin', 'speciallärare')) then
    raise exception 'Kontakta en lärare — elever kan inte starta privata samtal.';
  end if;

  -- Normaliserad ordning så att paret alltid ger samma kanal.
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

-- Mina direkta samtal med motpartens namn och sista meddelandet.
drop function if exists public.list_my_direct_channels();
create function public.list_my_direct_channels()
returns table (
  channel_id uuid,
  other_id uuid,
  other_username text,
  last_body text,
  last_at timestamptz
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
    last_msg.body,
    last_msg.created_at
  from public.chat_channels c
  join lateral (
    select p.id, p.username
    from public.profiles p
    where p.id = case when c.dm_user_a = auth.uid() then c.dm_user_b else c.dm_user_a end
  ) as other on true
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.channel_id = c.id
    order by m.created_at desc
    limit 1
  ) as last_msg on true
  where c.kind = 'direkt'
    and auth.uid() in (c.dm_user_a, c.dm_user_b)
  order by last_msg.created_at desc nulls last, other.username;
$$;

-- Meddelanden i en kanal, med avsändarens namn. Kräver åtkomst till kanalen.
drop function if exists public.list_messages(uuid, integer);
create function public.list_messages(p_channel uuid, p_limit integer default 200)
returns table (
  id uuid,
  sender_id uuid,
  sender_username text,
  body text,
  created_at timestamptz
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
    select m.id, m.sender_id, coalesce(p.username, 'okänd'), m.body, m.created_at
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    where m.channel_id = p_channel
    order by m.created_at asc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- Skicka meddelande. Trimmar, validerar längd och kräver kanalåtkomst.
create or replace function public.send_message(p_channel uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_row record;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'Skriv ett meddelande först.';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Meddelandet är för långt (max 4000 tecken).';
  end if;
  if not public.can_access_channel(p_channel) then
    raise exception 'Du har inte tillgång till den konversationen.';
  end if;

  insert into public.messages (channel_id, sender_id, body)
  values (p_channel, v_me, v_body)
  returning id, channel_id, sender_id, body, created_at into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'channel_id', v_row.channel_id,
    'sender_id', v_row.sender_id,
    'sender_username', (select username from public.profiles where id = v_me),
    'body', v_row.body,
    'created_at', v_row.created_at
  );
end;
$$;

-- ---------------------------------------- Elevens status och inlämning
-- Eleven får bara ändra status/inlämning på en uppgift som är riktad till hen.
-- XP betalas ut exakt en gång när uppgiften blir klar — aldrig av klienten.
create or replace function public.student_set_task_status(
  p_task_id uuid,
  p_status text default null,
  p_submission text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_task public.student_tasks%rowtype;
  v_target boolean;
  v_xp integer := 0;
  v_per integer;
  v_total integer;
  v_unlocks jsonb;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;

  select * into v_task
  from public.student_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;

  v_target := v_task.student_id = v_me
           or (v_task.class_id is not null and public.is_class_member(v_task.class_id));

  if not v_target then
    raise exception 'Uppgiften är inte tilldelad dig.';
  end if;

  if p_status is not null and p_status not in ('ej_paborjad', 'pagar', 'klar') then
    raise exception 'Ogiltig status.';
  end if;

  if p_submission is not null and char_length(p_submission) > 20000 then
    raise exception 'Inlämningen är för lång.';
  end if;

  update public.student_tasks
  set status = coalesce(p_status, status),
      submission = case when p_submission is null then submission else nullif(trim(p_submission), '') end,
      submitted_at = case when p_submission is null then submitted_at
                          else coalesce(submitted_at, now()) end,
      completed_at = case
        when coalesce(p_status, status) = 'klar' then coalesce(completed_at, now())
        else null
      end,
      updated_at = now()
  where id = p_task_id
  returning * into v_task;

  -- XP en gång per uppgift: uniknyckeln på (user_id, student_task_id) skyddar
  -- även om två anrop kommer samtidigt.
  if v_task.status = 'klar' and not v_task.xp_awarded then
    v_per := coalesce(nullif((public.get_setting('xp_per_task') ->> '0')::int, 0), 10);
    insert into public.xp_transactions (user_id, amount, source, student_task_id, note)
    values (v_me, v_per, 'task', p_task_id, v_task.title)
    on conflict do nothing;
    if found then
      v_xp := v_per;
      update public.student_tasks set xp_awarded = true where id = p_task_id;
    end if;
  end if;

  perform public.refresh_user_xp(v_me);
  v_unlocks := public.check_reward_unlocks(v_me);
  v_total := public.total_xp(v_me);

  return jsonb_build_object(
    'status', v_task.status,
    'xp_awarded', v_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total),
    'unlocks', coalesce(v_unlocks, '[]'::jsonb)
  );
end;
$$;

-- Läraren markerar en uppföljning som genomförd.
create or replace function public.mark_follow_up(
  p_task_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_task public.student_tasks%rowtype;
begin
  select * into v_task from public.student_tasks where id = p_task_id;
  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;
  if not (v_task.created_by = v_me or public.is_admin()) then
    raise exception 'Du kan bara följa upp uppgifter du ansvarar för.';
  end if;

  update public.student_tasks
  set follow_up = true,
      follow_up_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), follow_up_note),
      followed_up_at = now(),
      updated_at = now()
  where id = p_task_id;
end;
$$;

-- ------------------------------------------------------- Provträning
-- Frågorna utan facit. Kräver att eleven har tillgång till övningen.
drop function if exists public.get_quiz_questions(uuid);
create function public.get_quiz_questions(p_set uuid)
returns table (
  id uuid,
  prompt text,
  options text[],
  -- Kolumnen citeras: i RETURNS TABLE tolkas namnen som parametrar, och
  -- "position" är ett reserverat nyckelord där (men tillåtet som kolumnnamn).
  "position" integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_see_quiz_set(p_set) then
    raise exception 'Övningen hittades inte eller är inte tillgänglig.';
  end if;

  return query
    select q.id, q.prompt, q.options, q.position
    from public.quiz_questions q
    where q.set_id = p_set
    order by q.position, q.created_at;
end;
$$;

-- Rättar ett försök serversidigt och sparar resultatet.
-- p_answers: [{"question_id":"...","choice":0}, ...]
create or replace function public.submit_quiz_attempt(
  p_set uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_q record;
  v_answer jsonb;
  v_choice integer;
  v_score integer := 0;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_ok boolean;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if not public.can_see_quiz_set(p_set) then
    raise exception 'Övningen hittades inte eller är inte tillgänglig.';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Ogiltiga svar.';
  end if;

  for v_q in
    select q.id, q.prompt, q.options, q.correct_index, q.explanation
    from public.quiz_questions q
    where q.set_id = p_set
    order by q.position, q.created_at
  loop
    v_total := v_total + 1;

    select a into v_answer
    from jsonb_array_elements(p_answers) as a
    where (a ->> 'question_id')::uuid = v_q.id
    limit 1;

    v_choice := null;
    if v_answer is not null and (v_answer ? 'choice') then
      begin
        v_choice := (v_answer ->> 'choice')::int;
      exception when others then
        v_choice := null;
      end;
    end if;

    v_ok := v_choice is not null and v_choice = v_q.correct_index;
    if v_ok then
      v_score := v_score + 1;
    end if;

    v_results := v_results || jsonb_build_object(
      'question_id', v_q.id,
      'prompt', v_q.prompt,
      'options', to_jsonb(v_q.options),
      'choice', v_choice,
      'correct_index', v_q.correct_index,
      'correct', v_ok,
      'explanation', v_q.explanation
    );
  end loop;

  if v_total = 0 then
    raise exception 'Övningen har inga frågor ännu.';
  end if;

  insert into public.quiz_attempts (set_id, user_id, score, total, answers)
  values (p_set, v_me, v_score, v_total, p_answers);

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'results', v_results
  );
end;
$$;

-- ================================================================
-- 5. XP-regel: personliga att-göra-uppgifter ger inte XP åt elever
-- ================================================================
-- Utan detta skulle en elev kunna skapa egna uppgifter i "Min planering" och
-- samla XP i det oändliga. Elevens XP kommer i stället från uppgifter som
-- personalen har tilldelat (student_set_task_status ovan).
create or replace function public.complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.spec_tasks%rowtype;
  v_xp integer := 0;
  v_per integer;
  v_unlocks jsonb;
  v_total integer;
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;

  select * into v_task
  from public.spec_tasks
  where id = p_task_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;

  update public.spec_tasks
  set status = 'klar',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_task_id;

  if not v_task.xp_awarded and public.is_staff() then
    v_per := coalesce(nullif((public.get_setting('xp_per_task') ->> '0')::int, 0), 10);
    insert into public.xp_transactions (user_id, amount, source, task_id, note)
    values (v_user, v_per, 'task', p_task_id, v_task.title)
    on conflict do nothing;
    if found then
      v_xp := v_per;
      update public.spec_tasks set xp_awarded = true where id = p_task_id;
    end if;
  end if;

  perform public.refresh_user_xp(v_user);
  v_unlocks := public.check_reward_unlocks(v_user);
  v_total := public.total_xp(v_user);

  return jsonb_build_object(
    'xp_awarded', v_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total),
    'unlocks', coalesce(v_unlocks, '[]'::jsonb)
  );
end;
$$;

-- ================================================================
-- 6. Behörigheter
-- ================================================================

revoke execute on function public.list_elev_accounts() from public, anon;
revoke execute on function public.list_staff_accounts() from public, anon;
revoke execute on function public.link_student(uuid) from public, anon;
revoke execute on function public.unlink_student(uuid) from public, anon;
revoke execute on function public.create_class(text, text) from public, anon;
revoke execute on function public.add_class_member(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_class_member(uuid, uuid) from public, anon;
revoke execute on function public.class_channel(uuid) from public, anon;
revoke execute on function public.open_direct_channel(uuid) from public, anon;
revoke execute on function public.list_my_direct_channels() from public, anon;
revoke execute on function public.list_messages(uuid, integer) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
revoke execute on function public.student_set_task_status(uuid, text, text) from public, anon;
revoke execute on function public.mark_follow_up(uuid, text) from public, anon;
revoke execute on function public.get_quiz_questions(uuid) from public, anon;
revoke execute on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;

grant execute on function public.list_elev_accounts() to authenticated;
grant execute on function public.list_staff_accounts() to authenticated;
grant execute on function public.link_student(uuid) to authenticated;
grant execute on function public.unlink_student(uuid) to authenticated;
grant execute on function public.create_class(text, text) to authenticated;
grant execute on function public.add_class_member(uuid, uuid, text) to authenticated;
grant execute on function public.remove_class_member(uuid, uuid) to authenticated;
grant execute on function public.class_channel(uuid) to authenticated;
grant execute on function public.open_direct_channel(uuid) to authenticated;
grant execute on function public.list_my_direct_channels() to authenticated;
grant execute on function public.list_messages(uuid, integer) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.student_set_task_status(uuid, text, text) to authenticated;
grant execute on function public.mark_follow_up(uuid, text) to authenticated;
grant execute on function public.get_quiz_questions(uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

-- ================================================================
-- 7. Lagring för dokument (best effort)
-- ================================================================
-- Bucketen är privat: filer nås bara via signerade länkar och bara av den som
-- har en dokumentrad som pekar på filen. Saknas storage-tillägget (t.ex. i en
-- lokal databas utan storage) fortsätter migreringen ändå — tabellerna ovan är
-- det viktiga — och appen visar då ett tydligt meddelande om att lagring
-- behöver konfigureras.

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('elda-dokument', 'elda-dokument', false)
  on conflict (id) do nothing;
exception when others then
  raise notice 'Kunde inte skapa storage-bucketen elda-dokument: %', sqlerrm;
end $$;

do $$
begin
  -- Läsning: ägarens egen mapp, eller en fil som delats via en dokumentrad.
  execute $p$
    drop policy if exists "elda_dokument_read" on storage.objects
  $p$;
  execute $p$
    create policy "elda_dokument_read" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'elda-dokument'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
          or exists (
            select 1 from public.documents d
            where d.storage_path = storage.objects.name
              and public.can_see_document(d.id)
          )
        )
      )
  $p$;

  execute $p$
    drop policy if exists "elda_dokument_upload" on storage.objects
  $p$;
  execute $p$
    create policy "elda_dokument_upload" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'elda-dokument'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  execute $p$
    drop policy if exists "elda_dokument_delete" on storage.objects
  $p$;
  execute $p$
    create policy "elda_dokument_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'elda-dokument'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
        )
      )
  $p$;
exception when others then
  raise notice 'Kunde inte skapa storage-policies för elda-dokument: %', sqlerrm;
end $$;
