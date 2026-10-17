-- Elda – RLS-test för schemaposter och uppgifter i adminpanelen.
--
-- Kör mot en LOKAL testdatabas (aldrig produktion):
--     supabase start
--     supabase test db          # kräver Docker igång
--
-- Testet skapar tillfälliga testkonton i den lokala databasen och rullar tillbaka
-- allt på slutet, så inga riktiga data berörs.
--
-- Det som prövas är det som *inte* får gå att kringgå från klienten:
--   * bara en administratör får skapa, ändra och ta bort schemaposter
--   * en schemapost för en klass går bara till klassens medlemmar
--   * en schemapost för en person går bara till personen själv
--   * ingen klient kan skriva direkt i schedule_entries
--   * en administratör kan skapa uppgifter, en lärare bara till sina egna elever
--     och klasser, och en elev bara läsa sina egna uppgifter
--   * en elev kan inte ändra en uppgift direkt i tabellen (bara status via
--     serverfunktionen student_set_task_status)

begin;

select plan(25);

-- ---------------------------------------------------------------- Testdata
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000d001', 'admin.schema@test.local', '{"role":"admin"}'::jsonb),
  ('00000000-0000-0000-0000-00000000d002', 'larare.schema@test.local', '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-00000000d003', 'elev.schema@test.local', '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000d004', 'elev.utanfor@test.local', '{"role":"elev"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, username, role, active, account_type, limited) values
  ('00000000-0000-0000-0000-00000000d001', 'eadmin01', 'admin', true, 'skola', false),
  ('00000000-0000-0000-0000-00000000d002', 'elara01', 'lärare', true, 'skola', false),
  ('00000000-0000-0000-0000-00000000d003', 'elev01', 'elev', true, 'skola', false),
  ('00000000-0000-0000-0000-00000000d004', 'elev02', 'elev', true, 'skola', false)
on conflict (id) do update
  set username = excluded.username,
      role = excluded.role,
      active = excluded.active;

-- ---------------------------------------------------------------- 1. Klassen
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select lives_ok(
  $$ select public.create_class_with_code('Schematest 7A', 'För schematesterna') $$,
  'läraren kan skapa klassen som schemat kopplas till'
);

-- ---------------------------------------------------------------- 2. Admin sköter schemat
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select lives_ok(
  format(
    $$ select public.add_class_member(%L, %L, 'elev') $$,
    (select id from public.classes where name = 'Schematest 7A'),
    '00000000-0000-0000-0000-00000000d003'
  ),
  'admin kan koppla eleven till klassen'
);

select lives_ok(
  format(
    $$ select public.create_schedule_entry('Matematik', 1, '08:00', '09:00', %L, null, 'Matte', 'Sal 12', null) $$,
    (select id from public.classes where name = 'Schematest 7A')
  ),
  'admin kan skapa en schemapost för en klass'
);

select lives_ok(
  format(
    $$ select public.update_schedule_entry(
         (select id from public.schedule_entries where title = 'Matematik'),
         'Matematik och problemlösning', 2, '09:15', '10:15', %L, null, 'Matte', 'Sal 12', null) $$,
    (select id from public.classes where name = 'Schematest 7A')
  ),
  'admin kan ändra en schemapost'
);

select lives_ok(
  $$ select public.create_schedule_entry('Läxhjälp', 3, '14:00', '15:00', null,
       '00000000-0000-0000-0000-00000000d003', null, null, 'Efter skolan') $$,
  'admin kan skapa en schemapost för en person'
);

select throws_ok(
  $$ select public.create_schedule_entry('Utan dag', 0, '08:00', '09:00', null,
       '00000000-0000-0000-0000-00000000d003', null, null, null) $$,
  'Veckodagen måste vara mellan 1 (måndag) och 7 (söndag).',
  'en ogiltig veckodag avvisas'
);

select throws_ok(
  $$ select public.create_schedule_entry('Fel ordning', 1, '10:00', '09:00', null,
       '00000000-0000-0000-0000-00000000d003', null, null, null) $$,
  'Sluttiden måste vara senare än starttiden.',
  'en sluttid före starttiden avvisas'
);

select throws_ok(
  format(
    $$ select public.create_schedule_entry('Två mål', 1, '08:00', '09:00', %L,
         '00000000-0000-0000-0000-00000000d003', null, null, null) $$,
    (select id from public.classes where name = 'Schematest 7A')
  ),
  'Välj antingen en klass eller en person.',
  'en post kan inte gälla både klass och person'
);

select throws_ok(
  $$ select public.create_schedule_entry('Inget mål', 1, '08:00', '09:00', null, null, null, null, null) $$,
  'Välj antingen en klass eller en person.',
  'en post måste gälla en klass eller en person'
);

select throws_ok(
  $$ select public.create_schedule_entry('Påhittad klass', 1, '08:00', '09:00',
       '00000000-0000-0000-0000-00000000ffff', null, null, null, null) $$,
  'Klassen hittades inte.',
  'en schemapost kan inte peka på en klass som inte finns'
);

-- ---------------------------------------------------------------- 3. Bara admin får skriva
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select throws_ok(
  $$ select public.create_schedule_entry('Lärarens post', 1, '08:00', '09:00', null,
       '00000000-0000-0000-0000-00000000d003', null, null, null) $$,
  'Endast administratörer får hantera scheman.',
  'en lärare kan inte skapa schemaposter'
);

select throws_ok(
  $$ select public.delete_schedule_entry((select id from public.schedule_entries limit 1)) $$,
  'Endast administratörer får hantera scheman.',
  'en lärare kan inte ta bort schemaposter'
);

-- ---------------------------------------------------------------- 4. Eleven ser sitt schema
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.schedule_entries),
  2::bigint,
  'eleven i klassen ser både klassposten och sin egen personpost'
);

select throws_ok(
  $$ select public.create_schedule_entry('Elevens post', 1, '08:00', '09:00', null,
       '00000000-0000-0000-0000-00000000d003', null, null, null) $$,
  'Endast administratörer får hantera scheman.',
  'en elev kan inte skapa schemaposter'
);

select throws_ok(
  $$ insert into public.schedule_entries (title, weekday, start_time, end_time, user_id)
     values ('Direkt insättning', 1, '08:00', '09:00', '00000000-0000-0000-0000-00000000d003') $$,
  'new row violates row-level security policy for table "schedule_entries"',
  'ingen klient får skriva direkt i schedule_entries'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.schedule_entries),
  0::bigint,
  'en elev utanför klassen ser varken klassposten eller någon annans personpost'
);

-- ---------------------------------------------------------------- 5. Uppgifter
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select lives_ok(
  $$ insert into public.student_tasks (created_by, student_id, title, subject)
     values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d003',
             'Admins uppgift', 'Matematik') $$,
  'admin kan skapa en uppgift till en elev'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select lives_ok(
  format(
    $$ insert into public.student_tasks (created_by, class_id, title)
       values ('00000000-0000-0000-0000-00000000d002', %L, 'Klassuppgift') $$,
    (select id from public.classes where name = 'Schematest 7A')
  ),
  'läraren kan ge en uppgift till sin egen klass'
);

select throws_ok(
  $$ insert into public.student_tasks (created_by, student_id, title)
     values ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d004',
             'Utanför klassen') $$,
  'new row violates row-level security policy for table "student_tasks"',
  'läraren kan inte ge en uppgift till en elev den inte undervisar'
);

select is(
  (select count(*) from public.student_tasks),
  2::bigint,
  'läraren ser sin egen klassuppgift och uppgiften till eleven i sin klass'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.student_tasks
    where student_id = '00000000-0000-0000-0000-00000000d003'),
  1::bigint,
  'eleven ser sin egen uppgift'
);

-- En elev kan läsa sin uppgift, men UPDATE-policyn gör att raden inte går att
-- ändra. Postgres uppdaterar då noll rader — utan fel — så testet prövar att
-- innehållet faktiskt står kvar oförändrat.
select lives_ok(
  $$ update public.student_tasks set title = 'Ändrad av eleven'
     where student_id = '00000000-0000-0000-0000-00000000d003' $$,
  'elevens uppdatering körs men träffar ingen rad'
);

select is(
  (select count(*) from public.student_tasks where title = 'Ändrad av eleven'),
  0::bigint,
  'eleven kan inte ändra innehållet i en uppgift direkt i tabellen'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select is(
  (select count(*) from public.student_tasks),
  2::bigint,
  'admin ser alla uppgifter'
);

select lives_ok(
  $$ select public.delete_schedule_entry(
       (select id from public.schedule_entries where title = 'Läxhjälp')) $$,
  'admin kan ta bort en schemapost'
);

select * from finish();

rollback;
