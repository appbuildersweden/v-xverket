-- Elda – RLS-test för roller, klasskod, klassansökningar och granskning.
--
-- Kör mot en LOKAL testdatabas (aldrig produktion):
--     supabase start
--     supabase test db          # kräver Docker igång
--
-- Testet skapar tillfälliga testkonton i den lokala databasen och rullar tillbaka
-- allt på slutet, så inga riktiga data berörs.
--
-- Det som prövas är det som *inte* får gå att kringgå från klienten:
--   * en elev kan inte skapa klasser eller granska ansökningar
--   * en klasskod ger ingen åtkomst — bara en ansökan
--   * en annan lärare ser varken klassens ansökningar, elever eller klasslistan
--   * ett begränsat konto kan inte ansöka om klassmedlemskap
--   * bara admin ser och ändrar ansökningar, begränsningar och loggen

begin;

select plan(27);

-- ---------------------------------------------------------------- Testdata
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000c001', 'elev.klass@test.local',   '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c002', 'larare.ett@test.local',  '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c003', 'larare.tva@test.local',  '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c004', 'admin.klass@test.local', '{"role":"admin"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c005', 'priv.elev@test.local',   '{"role":"elev"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, username, role, active, account_type, limited) values
  ('00000000-0000-0000-0000-00000000c001', 'elevklass01', 'elev',    true, 'skola',  false),
  ('00000000-0000-0000-0000-00000000c002', 'elaraett01',  'lärare',  true, 'skola',  false),
  ('00000000-0000-0000-0000-00000000c003', 'elaratva02',  'lärare',  true, 'skola',  false),
  ('00000000-0000-0000-0000-00000000c004', 'eadminkl01',  'admin',   true, 'skola',  false),
  ('00000000-0000-0000-0000-00000000c005', 'epriver01',   'elev',    true, 'privat', false)
on conflict (id) do update
  set username = excluded.username,
      role = excluded.role,
      account_type = excluded.account_type,
      limited = excluded.limited;

-- En registreringsansökan finns i tabellen. Ingen klient får läsa den; bara
-- admin (och den skyddade funktionen `register` med rätt spårningskod).
insert into public.registration_applications
  (tracking_code, idempotency_key, kind, status, full_name, summary, bot_decision)
values
  ('TEST-CODE-0001', 'test-idempotency-0001', 'privat_elev', 'vantar', 'Test Elev', 'Testansökan', 'granskas')
on conflict (idempotency_key) do nothing;

-- ---------------------------------------------------------------- 1. Läraren skapar en klass
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select lives_ok(
  $$ select public.create_class_with_code('Testklass 8B', 'Matematik') $$,
  'läraren kan skapa en klass med klasskod'
);

select is(
  (select char_length(join_code) from public.classes where name = 'Testklass 8B'),
  6,
  'klasskoden har sex tecken'
);

select is(
  (select count(*) from public.list_my_classes()),
  1::bigint,
  'läraren ser sin egen klass i listan'
);

-- ---------------------------------------------------------------- 2. Eleven får ingen åtkomst
-- Lärarens konto används för att läsa koden (som bara klassens lärare får se).
create temporary table test_code as
  select join_code as code, id as class_id
  from public.classes
  where name = 'Testklass 8B';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select throws_ok(
  $$ select public.create_class_with_code('Elevklass', null) $$,
  'Endast lärare får skapa klasser.',
  'en elev kan inte skapa en klass'
);

select lives_ok(
  format($$ select public.request_class_join(%L) $$, (select code from test_code)),
  'en elev kan ansöka om en klass med klasskoden'
);

select is(
  (select count(*) from public.class_members
    where class_id = (select class_id from test_code)
      and user_id = '00000000-0000-0000-0000-00000000c001'),
  0::bigint,
  'klasskoden ger inget medlemskap — bara en ansökan'
);

select is(
  (select count(*) from public.class_join_requests
    where student_id = '00000000-0000-0000-0000-00000000c001' and status = 'vantar'),
  1::bigint,
  'ansökan ligger och väntar på lärarens beslut'
);

select is(
  (select count(*) from public.classes where id = (select class_id from test_code)),
  0::bigint,
  'eleven ser inte klassen förrän medlemskapet är godkänt'
);

select is(
  (select count(*) from public.registration_applications),
  0::bigint,
  'en elev kan inte läsa registreringsansökningar (RLS döljer raden)'
);

select throws_ok(
  $$ select public.list_registration_applications() $$,
  'Endast administratörer får granska ansökningar.',
  'en elev kan inte lista ansökningar ens via funktionen'
);

select throws_ok(
  $$ select public.set_account_restriction('00000000-0000-0000-0000-00000000c001', true, true) $$,
  'Endast administratörer får begränsa konton.',
  'en elev kan inte begränsa ett konto'
);

select is(
  (select count(*) from public.audit_log),
  0::bigint,
  'en elev kan inte läsa granskningsloggen'
);

-- ---------------------------------------------------------------- 3. Kollegan ser ingenting
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select is(
  (select count(*) from public.list_my_classes()),
  0::bigint,
  'en annan lärare ser inte klassens lista'
);

select is(
  (select count(*) from public.list_my_students()),
  0::bigint,
  'en annan lärare ser inte klassens elever'
);

select is(
  (select count(*) from public.list_class_join_requests()),
  0::bigint,
  'en annan lärare ser inte klassansökningarna'
);

select throws_ok(
  format(
    $$ select public.decide_class_join_request(%L, true) $$,
    (select id from public.class_join_requests limit 1)
  ),
  'Du är inte lärare för den klassen.',
  'en annan lärare kan inte avgöra klassansökan'
);

-- ---------------------------------------------------------------- 4. Klassens lärare godkänner
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select is(
  (select count(*) from public.list_class_join_requests()),
  1::bigint,
  'klassens lärare ser ansökan'
);

select lives_ok(
  format(
    $$ select public.decide_class_join_request(%L, true) $$,
    (select id from public.class_join_requests limit 1)
  ),
  'klassens lärare kan godkänna ansökan'
);

select is(
  (select count(*) from public.class_members
    where class_id = (select class_id from test_code)
      and user_id = '00000000-0000-0000-0000-00000000c001'),
  1::bigint,
  'först efter godkännandet blir eleven medlem'
);

-- ---------------------------------------------------------------- 5. Admin granskar och begränsar
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c004","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select lives_ok(
  $$ select public.list_registration_applications() $$,
  'admin kan lista registreringsansökningar'
);

select is(
  (select count(*) from public.list_registration_applications()),
  1::bigint,
  'admin får ansökan i svaret'
);

select is(
  (select count(*) from public.registration_applications),
  1::bigint,
  'admin får även läsa ansökan direkt (RLS-policy för admin)'
);

select ok(
  (select count(*) from public.list_audit_log()) > 0,
  'admin ser händelser i granskningsloggen'
);

select lives_ok(
  $$ select public.set_account_restriction('00000000-0000-0000-0000-00000000c005', true, true) $$,
  'admin kan begränsa ett konto'
);

select is(
  (select limited from public.profiles where id = '00000000-0000-0000-0000-00000000c005'),
  true,
  'begränsningen sparas på kontot'
);

select throws_ok(
  $$ select public.set_account_restriction('00000000-0000-0000-0000-00000000c004', true, true) $$,
  'Du kan inte begränsa ditt eget konto.',
  'admin kan inte begränsa sitt eget konto'
);

-- ---------------------------------------------------------------- 6. Begränsat konto nekas klass
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select throws_ok(
  format($$ select public.request_class_join(%L) $$, (select code from test_code)),
  'Kontot är begränsat. Kontakta administratören.',
  'ett begränsat konto kan inte ansöka om klassmedlemskap'
);

select * from finish();

rollback;
