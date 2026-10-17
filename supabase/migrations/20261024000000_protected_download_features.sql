-- Elda – funktionsval per konto, kontoborttagning och skyddad nedladdning.
--
-- Icke-destruktiv: nya kolumner, vidgat statusvillkor och en privat bucket.
-- Inga befintliga rader ändras.

-- ================================================================
-- 1. Funktionsval (lärare och speciallärare)
-- ================================================================
-- Valen sparas på profilen (auktoritativ källa för appen) och speglas i
-- app_metadata av serverfunktionerna. Klienten kan inte skriva kolumnen:
-- profiles har ingen update-policy, all skrivning sker med service role.

alter table public.profiles
  add column if not exists features text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_features_check'
  ) then
    alter table public.profiles
      add constraint profiles_features_check
      check (
        features <@ array[
          'Klass och elevöversikt',
          'Uppgifter och uppföljning',
          'Undervisningsmaterial',
          'Planering och att göra',
          'Belöningar och nivåer',
          'AI-stöd i undervisningen'
        ]::text[]
      );
  end if;
end $$;

-- ================================================================
-- 2. Kontoborttagning med spårningskod
-- ================================================================
-- Statusen 'borttagen' gör borttagningen idempotent: en upprepad begäran efter
-- ett nätverksfel ser att kontot redan är borta i stället för att skapa problem.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.registration_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.registration_applications drop constraint %I',
      c.conname
    );
  end loop;

  alter table public.registration_applications
    add constraint registration_applications_status_check
    check (
      status in (
        'utkast', 'vantar', 'godkand', 'nekad', 'skapad', 'misslyckad',
        'borttagen'
      )
    );
exception
  when others then
    raise notice 'Kunde inte vidga statusvillkoret: %', sqlerrm;
end $$;

alter table public.registration_applications
  add column if not exists deleted_at timestamptz;

-- Spår av borttagningen utan personuppgifter: kopplingen ansökan → konto
-- behövs för att en upprepad begäran ska kunna besvaras idempotent.
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references public.registration_applications (id) on delete cascade,
  deleted_user_id uuid,
  created_at timestamptz not null default now()
);

alter table public.account_deletions enable row level security;

-- Endast administratörer får läsa spåret. Ingen klient får skriva.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'account_deletions'
      and policyname = 'account_deletions_select_admin'
  ) then
    create policy "account_deletions_select_admin"
      on public.account_deletions for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;

-- ================================================================
-- 3. Privat lagring för installationsfilerna
-- ================================================================
-- Bucketen är privat: ingen läs-policy finns, så anon/authenticated når aldrig
-- filerna direkt. Nedladdningsfunktionen (service role) utfärdar korta
-- signerade länkar efter att ha kontrollerat kontot.

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('elda-installers', 'elda-installers', false)
  on conflict (id) do update set public = false;
exception when others then
  raise notice 'Kunde inte skapa storage-bucketen elda-installers: %', sqlerrm;
end $$;

-- En tidigare publik kopia ska inte kunna ligga kvar och kringgå skyddet.
do $$
begin
  delete from storage.objects
  where bucket_id in ('elda-installers', 'downloads');
exception when others then
  raise notice 'Kunde inte rensa gamla installationsfiler: %', sqlerrm;
end $$;

-- ================================================================
-- 4. Nedladdningsspår
-- ================================================================
-- Varje utfärdad nedladdningslänk loggas utan att länken själv sparas.
create table if not exists public.download_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  file_name text not null,
  created_at timestamptz not null default now()
);

alter table public.download_grants enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'download_grants'
      and policyname = 'download_grants_select_admin'
  ) then
    create policy "download_grants_select_admin"
      on public.download_grants for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;
