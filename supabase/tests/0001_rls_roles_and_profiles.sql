-- Elda – RLS-test för roller, profiler och egen data.
--
-- Kör mot en LOKAL testdatabas (aldrig produktion):
--     supabase start
--     supabase test db          # kräver Docker igång
--
-- Testet skapar två tillfälliga testkonton i den lokala databasen och rullar
-- tillbaka allt på slutet (rollback), så inga produktionsdata berörs.

begin;

select plan(11);

-- ----------------------------------------------------------------
-- Testdata: två elever, en admin och en speciallärare
-- ----------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'elev.ett@test.local',    '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000a002', 'elev.tva@test.local',    '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000a003', 'special.larare@test.local','{"role":"speciallärare"}'::jsonb),
  ('00000000-0000-0000-0000-00000000a004', 'admin@test.local',       '{"role":"admin"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, username, role, active) values
  ('00000000-0000-0000-0000-00000000a001', 'elevett01',   'elev', true),
  ('00000000-0000-0000-0000-00000000a002', 'elevtva02',   'elev', true),
  ('00000000-0000-0000-0000-00000000a003', 'espec01',     'speciallärare', true),
  ('00000000-0000-0000-0000-00000000a004', 'eadmin01',    'admin', true)
on conflict (id) do update set username = excluded.username, role = excluded.role;

insert into public.spec_tasks (id, user_id, title) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', 'Elevens uppgift'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a003', 'Lärarens uppgift')
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 1. Anonyma anropare (anon) får inte läsa något skyddat
-- ----------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{}', true);

select is(
  (select count(*) from public.profiles),
  0::bigint,
  'anon kan inte läsa några profiler'
);

select is(
  (select count(*) from public.spec_tasks),
  0::bigint,
  'anon kan inte läsa några uppgifter'
);

-- ----------------------------------------------------------------
-- 2. Elev: bara sin egen rad
-- ----------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'elev ser exakt sin egen profil'
);

select is(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000a002'),
  0::bigint,
  'elev ser inte en annan elevs profil'
);

select is(
  (select count(*) from public.spec_tasks),
  1::bigint,
  'elev ser bara sina egna uppgifter'
);

-- Rollen får inte kunna ändras av användaren själv (ingen update-policy).
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a001';

select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-00000000a001'),
  'elev',
  'elev kan inte göra sig själv till admin'
);

-- XP får inte skrivas direkt av klienten (ingen insert-policy).
insert into public.xp_transactions (user_id, amount, source)
  values ('00000000-0000-0000-0000-00000000a001', 5000, 'admin_adjustment');

select is(
  (select count(*) from public.xp_transactions where user_id = '00000000-0000-0000-0000-00000000a001'),
  0::bigint,
  'klienten kan inte skriva egna XP-transaktioner'
);

-- ----------------------------------------------------------------
-- 3. Speciallärare: egen data, men inte adminrättigheter
-- ----------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated","app_metadata":{"role":"speciallärare"}}',
  true
);

-- Bara egna uppgifter (public.spec_tasks är personlig planering, inte per elev).
select is(
  (select count(*) from public.spec_tasks),
  1::bigint,
  'specialläraren ser bara sina egna uppgifter'
);

update public.reward_settings set value = '9999'::jsonb where key = 'xp_per_task';

select isnt(
  (select value from public.reward_settings where key = 'xp_per_task'),
  '9999'::jsonb,
  'specialläraren kan inte ändra XP-inställningar'
);

-- ----------------------------------------------------------------
-- 4. Admin: får läsa alla profiler och ändra inställningar
-- ----------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select is(
  (select count(*) from public.profiles where id in (
    '00000000-0000-0000-0000-00000000a001',
    '00000000-0000-0000-0000-00000000a002',
    '00000000-0000-0000-0000-00000000a003',
    '00000000-0000-0000-0000-00000000a004')),
  4::bigint,
  'admin får läsa alla profiler'
);

select lives_ok(
  $sql$ update public.reward_settings set value = '10'::jsonb where key = 'xp_per_task' $sql$,
  'admin får uppdatera XP-inställningar'
);

select * from finish();

rollback;
