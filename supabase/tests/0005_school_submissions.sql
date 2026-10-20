-- Elda Skola – RLS-test för individuella inlämningar.
--
-- Kör mot en LOKAL testdatabas (aldrig produktion):
--     supabase start
--     supabase test db          # kräver Docker igång
--
-- Testet skapar två lärare, två elever, en klass och två uppgifter. Det prövar
-- att två elevers svar aldrig blandas, att en elev inte kan läsa eller ändra en
-- annan elevs rad, att en obehörig lärare nekas, att svaret låses vid inlämning
-- och att lärarens återkoppling når rätt elev.

begin;

select plan(30);

-- ---------------------------------------------------------------- Testdata
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000e101', 'skol.elev1@test.local', '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e102', 'skol.elev2@test.local', '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e103', 'skol.larare1@test.local', '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e104', 'skol.larare2@test.local', '{"role":"lärare"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, username, role, active, account_type, limited) values
  ('00000000-0000-0000-0000-00000000e101', 'eelevskol1', 'elev',   true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e102', 'eelevskol2', 'elev',   true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e103', 'elarskol1',  'lärare', true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e104', 'elarskol2',  'lärare', true, 'skola', false)
on conflict (id) do update
  set username = excluded.username,
      role = excluded.role,
      account_type = excluded.account_type,
      limited = excluded.limited;

insert into public.classes (id, name, created_by, join_code)
values ('00000000-0000-0000-0000-00000000c101', 'Inlämningsklass 9B',
        '00000000-0000-0000-0000-00000000e103', 'SKOL01')
on conflict (id) do nothing;

insert into public.class_members (class_id, user_id, member_role, added_by) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000e103', 'larare', '00000000-0000-0000-0000-00000000e103'),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000e101', 'elev',   '00000000-0000-0000-0000-00000000e103'),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000e102', 'elev',   '00000000-0000-0000-0000-00000000e103')
on conflict (class_id, user_id) do nothing;

insert into public.student_tasks
  (id, created_by, class_id, student_id, title, published)
values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e103',
   '00000000-0000-0000-0000-00000000c101', null, 'Klassuppgift: källor', true),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e103',
   '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000e101',
   'Enskild uppgift: Anna', true)
on conflict (id) do nothing;

-- En elevfil med class_id satt ska ändå inte bli läsbar för klasskamrater.
insert into public.documents
  (id, owner_id, title, storage_path, mime_type, student_id, class_id, task_id)
values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000e101',
   'Annas inlämning.pdf', '00000000-0000-0000-0000-00000000e101/annas-inlamning.pdf',
   'application/pdf', '00000000-0000-0000-0000-00000000e101',
   '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000f101')
on conflict (id) do nothing;

-- --------------------------------------------------- Elev 1: utkast och inlämning
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.student_tasks
    where id = '00000000-0000-0000-0000-00000000f102'),
  1::bigint,
  'eleven ser sin egen individuella uppgift'
);

select lives_ok(
  $$ select public.elda_skola_save_submission(
       '00000000-0000-0000-0000-00000000f101', 'Annas första utkast', 'utkast') $$,
  'eleven kan spara ett utkast'
);

select is(
  (select content from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e101'),
  'Annas första utkast',
  'utkastet sparas på elevens egen rad'
);

select throws_ok(
  $$ insert into public.school_submissions (task_id, student_id, content)
     values ('00000000-0000-0000-0000-00000000f101',
             '00000000-0000-0000-0000-00000000e101', 'Direktinsättning') $$,
  '42501',
  null,
  'klienten kan inte skriva direkt i inlämningstabellen'
);

select lives_ok(
  $$ select public.elda_skola_save_submission(
       '00000000-0000-0000-0000-00000000f101', 'Annas färdiga svar', 'inlamnad') $$,
  'eleven kan lämna in sitt svar'
);

select is(
  (select status from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e101'),
  'inlamnad',
  'inlämningen får status inlamnad'
);

select is(
  (select count(*) from public.school_submissions),
  1::bigint,
  'eleven ser bara sin egen inlämning'
);

-- --------------------------------------------------- Elev 2: eget svar, ingen åtkomst
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e102","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.school_submissions),
  0::bigint,
  'klasskamraten ser inte den andra elevens inlämning'
);

select is(
  (select count(*) from public.student_tasks
    where id = '00000000-0000-0000-0000-00000000f101'),
  1::bigint,
  'klasskamraten ser den gemensamma klassuppgiften'
);

select is(
  (select count(*) from public.student_tasks
    where id = '00000000-0000-0000-0000-00000000f102'),
  0::bigint,
  'klasskamraten ser inte en individuell uppgift till en annan elev'
);

select lives_ok(
  $$ select public.elda_skola_save_submission(
       '00000000-0000-0000-0000-00000000f101', 'Bertils helt egna svar', 'inlamnad') $$,
  'klasskamraten kan lämna in sitt eget svar'
);

select is(
  (select count(*) from public.school_submissions),
  1::bigint,
  'klasskamraten ser bara sin egen rad'
);

select is(
  (select content from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e102'),
  'Bertils helt egna svar',
  'klasskamratens svar ligger på en egen rad'
);

select throws_ok(
  $$ select public.elda_skola_save_submission(
       '00000000-0000-0000-0000-00000000f102', 'Bertil försöker svara åt Anna', 'utkast') $$,
  'P0001',
  null,
  'en elev kan inte lämna in en uppgift som tillhör en annan elev'
);

select throws_ok(
  $$ select public.elda_skola_review_submission(
       (select id from public.school_submissions
         where task_id = '00000000-0000-0000-0000-00000000f101'
           and student_id = '00000000-0000-0000-0000-00000000e101'),
       'Bertil försöker ge återkoppling', 'granskad') $$,
  'P0001',
  null,
  'en elev kan inte granska eller ge återkoppling'
);

-- --------------------------------------------------- Behörig lärare
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e104","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select is(
  (select count(*) from public.school_submissions),
  0::bigint,
  'en lärare som inte undervisar klassen ser inga inlämningar'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select is(
  (select count(*) from public.school_submissions),
  2::bigint,
  'klassens lärare ser båda elevernas inlämningar'
);

select is(
  (select count(*) from public.student_tasks
    where id = '00000000-0000-0000-0000-00000000f102'),
  1::bigint,
  'läraren ser den individuella uppgiften'
);

select lives_ok(
  $$ select public.elda_skola_review_submission(
       (select id from public.school_submissions
         where task_id = '00000000-0000-0000-0000-00000000f101'
           and student_id = '00000000-0000-0000-0000-00000000e101'),
       'Tydlig slutsats. Utveckla källkritiken.', 'granskad') $$,
  'läraren kan granska rätt elevs inlämning'
);

select is(
  (select feedback from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e101'),
  'Tydlig slutsats. Utveckla källkritiken.',
  'återkopplingen sparas på rätt inlämning'
);

-- --------------------------------------------------- Låst svar och komplettering
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select feedback from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e101'),
  'Tydlig slutsats. Utveckla källkritiken.',
  'eleven ser lärarens återkoppling'
);

select throws_ok(
  $$ select public.elda_skola_save_submission(
       '00000000-0000-0000-0000-00000000f101', 'Försök skriva över', 'utkast') $$,
  'P0001',
  null,
  'ett granskat svar kan inte skrivas över'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select lives_ok(
  $$ select public.elda_skola_review_submission(
       (select id from public.school_submissions
         where task_id = '00000000-0000-0000-0000-00000000f101'
           and student_id = '00000000-0000-0000-0000-00000000e101'),
       'Komplettera med en källförteckning.', 'aterlamnad') $$,
  'läraren kan återlämna för komplettering'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select status from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e101'),
  'aterlamnad',
  'eleven ser att uppgiften är återlämnad'
);

select lives_ok(
  $$ select public.elda_skola_save_submission(
       '00000000-0000-0000-0000-00000000f101', 'Annas komplettering', 'inlamnad') $$,
  'eleven kan lämna in en komplettering'
);

select is(
  (select content from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e101'),
  'Annas komplettering',
  'kompletteringen ersätter det gamla svaret'
);

select lives_ok(
  $$ select public.elda_skola_save_submission(
       '00000000-0000-0000-0000-00000000f101', 'Upprepat anrop', 'inlamnad') $$,
  'ett upprepat inlämningsanrop ger inget tekniskt fel'
);

select is(
  (select content from public.school_submissions
    where task_id = '00000000-0000-0000-0000-00000000f101'
      and student_id = '00000000-0000-0000-0000-00000000e101'),
  'Annas komplettering',
  'upprepat inlämningsanrop skriver inte över det inlämnade svaret'
);

-- --------------------------------------------------- Dokumentprivacy
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e102","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select ok(
  not public.can_see_document('00000000-0000-0000-0000-00000000a101'),
  'klasskamraten kommer inte åt en annan elevs inlämningsfil'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select ok(
  public.can_see_document('00000000-0000-0000-0000-00000000a101'),
  'läraren ser elevens inlämningsfil'
);

select * from finish();

rollback;
