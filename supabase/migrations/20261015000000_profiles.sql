-- Växverket: profiles-tabell för användarnamn, roll och aktiv status.
-- All skrivning sker serversidigt via Edge Functions (service role).
-- Klienter får enbart läsa — via RLS.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9._-]{3,32}$'),
  role text not null
    check (role in ('admin', 'speciallärare', 'elev')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Row Level Security: inga insert/update/delete-policy för klienter.
alter table public.profiles enable row level security;

-- Användare får läsa sin egen profil.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Administratörer får läsa alla profiler (rollen sätts serversidigt i
-- app_metadata och kan inte ändras av klienten).
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');

-- Fyll i profiler för befintliga inloggningskonton (t.ex. ejentu01).
-- Om ett konto saknar app_metadata.username används e-postadressens
-- lokala del. Kontrollera efter körning att ejentu01 har rätt användarnamn;
-- annars sätt app_metadata.username i Supabase-dashbordet och kör om.
insert into public.profiles (id, username, role, active)
select
  u.id,
  coalesce(
    nullif(lower(u.raw_app_meta_data ->> 'username'), ''),
    split_part(lower(coalesce(u.email, u.id::text)), '@', 1)
  ),
  coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'elev'),
  true
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict do nothing;
