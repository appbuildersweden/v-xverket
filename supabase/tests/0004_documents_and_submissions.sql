-- Elda – RLS-test för dokument, undervisningsmaterial och inlämningar.
--
-- Kör mot en LOKAL testdatabas (aldrig produktion):
--     supabase start
--     supabase test db          # kräver Docker igång
--
-- Testet skapar tillfälliga konton, en klass och några dokument i den lokala
-- databasen och rullar tillbaka allt på slutet, så inga riktiga data berörs.
--
-- Det som prövas är det som *inte* får gå att kringgå från klienten:
--   * en elev ser sina egna filer och material som delats med eleven eller klassen
--   * en elev kan INTE läsa en klasskamrats privata fil (det var en lucka förut)
--   * material som delats med en enskild elev kan inte läsas av klasskamrater
--   * läraren och den kopplade specialläraren ser elevens filer (inlämningar)
--   * en elev kan lämna in en fil till sin uppgift men inte koppla den till en
--     uppgift eleven inte har tillgång till
--   * bara ägaren (och admin) får ändra metadata och uppgiftskoppling

begin;

select plan(17);

-- ---------------------------------------------------------------- Testdata
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000e001', 'elev.ett@test.local',    '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e002', 'elev.tva@test.local',    '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e003', 'larare.ett@test.local',  '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e004', 'elev.tre@test.local',    '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e005', 'spec.ett@test.local',    '{"role":"speciallärare"}'::jsonb),
  ('00000000-0000-0000-0000-00000000e006', 'admin.dok@test.local',   '{"role":"admin"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, username, role, active, account_type, limited) values
  ('00000000-0000-0000-0000-00000000e001', 'eelevett01', 'elev',          true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e002', 'eelevtva02', 'elev',          true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e003', 'elaraett01', 'lärare',        true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e004', 'eelevtre03', 'elev',          true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e005', 'especett01', 'speciallärare', true, 'skola', false),
  ('00000000-0000-0000-0000-00000000e006', 'eadmindok1', 'admin',         true, 'skola', false)
on conflict (id) do update
  set username = excluded.username,
      role = excluded.role,
      account_type = excluded.account_type,
      limited = excluded.limited;

-- Läraren skapar en klass och eleven och klasskamraten blir medlemmar.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.create_class_with_code('Dokumentklass 9A', 'Matematik') $$,
  'läraren kan skapa klassen som testet använder'
);

select lives_ok(
  $$ select public.add_class_member(
       (select id from public.classes where name = 'Dokumentklass 9A'),
       '00000000-0000-0000-0000-00000000e001',
       'elev') $$,
  'läraren lägger till eleven i klassen'
);

select lives_ok(
  $$ select public.add_class_member(
       (select id from public.classes where name = 'Dokumentklass 9A'),
       '00000000-0000-0000-0000-00000000e002',
       'elev') $$,
  'läraren lägger till klasskamraten i klassen'
);

-- ------------------------------------------------------- Dokument i testet
-- Läraren laddar upp tre dokument: ett delat med klassen, ett delat med en elev
-- och en uppgift som materialet hör till.
reset role;

insert into public.student_tasks (id, created_by, student_id, title)
values
  ('00000000-0000-0000-0000-00000000f001',
   '00000000-0000-0000-0000-00000000e003',
   '00000000-0000-0000-0000-00000000e001',
   'Träna bråk'),
  ('00000000-0000-0000-0000-00000000f002',
   '00000000-0000-0000-0000-00000000e003',
   '00000000-0000-0000-0000-00000000e004',
   'Uppgift för en annan elev')
on conflict (id) do nothing;

insert into public.documents
  (id, owner_id, title, storage_path, mime_type, student_id, class_id, task_id)
values
  ('00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-00000000e003', 'Klassmaterial',
   '00000000-0000-0000-0000-00000000e003/klassmaterial.pdf',
   'application/pdf', null,
   (select id from public.classes where name = 'Dokumentklass 9A'), null),
  ('00000000-0000-0000-0000-00000000a002',
   '00000000-0000-0000-0000-00000000e003', 'Material till en elev',
   '00000000-0000-0000-0000-00000000e003/material-elev.pdf',
   'application/pdf',
   '00000000-0000-0000-0000-00000000e001', null, null),
  ('00000000-0000-0000-0000-00000000a003',
   '00000000-0000-0000-0000-00000000e001', 'Min egen fil',
   '00000000-0000-0000-0000-00000000e001/min-egen-fil.pdf',
   'application/pdf',
   '00000000-0000-0000-0000-00000000e001', null, null),
  ('00000000-0000-0000-0000-00000000a004',
   '00000000-0000-0000-0000-00000000e003', 'Uppgiftsmaterial',
   '00000000-0000-0000-0000-00000000e003/uppgiftsmaterial.pdf',
   'application/pdf',
   '00000000-0000-0000-0000-00000000e001', null,
   '00000000-0000-0000-0000-00000000f001')
on conflict (id) do nothing;

-- Specialläraren kopplas till eleven (det är den relationen som ger tillgång
-- till elevens inlämningar).
insert into public.student_links (speciallarare_id, elev_id)
values ('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-00000000e001')
on conflict do nothing;

-- ------------------------------------------------- 1. Eleven ser sina egna filer
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.documents),
  4::bigint,
  'eleven ser klassmaterial, material delat med eleven och sina egna filer'
);

select ok(
  public.can_see_document('00000000-0000-0000-0000-00000000a001'),
  'eleven får läsa klassmaterialet'
);

select ok(
  public.can_see_document('00000000-0000-0000-0000-00000000a002'),
  'eleven får läsa materialet som delats med eleven'
);

-- --------------------------------------------------- 2. Klasskamraten nekas
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.documents),
  1::bigint,
  'klasskamraten ser bara klassmaterialet'
);

select ok(
  not public.can_see_document('00000000-0000-0000-0000-00000000a002'),
  'klasskamraten kommer inte åt material som delats med en annan elev'
);

select ok(
  not public.can_see_document('00000000-0000-0000-0000-00000000a003'),
  'klasskamraten kommer inte åt en annan elevs egna fil'
);

select is(
  (select count(*) from public.documents where title = 'Min egen fil'),
  0::bigint,
  'en annan elevs egna fil syns inte ens i listan'
);

-- ------------------------------------------------- 3. Personal ser eleven
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select ok(
  public.can_see_document('00000000-0000-0000-0000-00000000a003'),
  'läraren för klassens elev ser elevens egna fil (inlämning)'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e005","role":"authenticated","app_metadata":{"role":"speciallärare"}}',
  true
);

select ok(
  public.can_see_document('00000000-0000-0000-0000-00000000a003'),
  'den kopplade specialläraren ser elevens inlämning'
);

-- -------------------------------------------- 4. Elevens filinlämning
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select lives_ok(
  $$ insert into public.documents
       (owner_id, title, storage_path, mime_type, student_id, class_id, task_id)
     values (
       '00000000-0000-0000-0000-00000000e001', 'mitt-svar.pdf',
       '00000000-0000-0000-0000-00000000e001/mitt-svar.pdf',
       'application/pdf',
       '00000000-0000-0000-0000-00000000e001', null,
       '00000000-0000-0000-0000-00000000f001') $$,
  'eleven kan lämna in en fil till sin egen uppgift'
);

select throws_ok(
  $$ insert into public.documents
       (owner_id, title, storage_path, mime_type, student_id, class_id, task_id)
     values (
       '00000000-0000-0000-0000-00000000e001', 'fel-uppgift.pdf',
       '00000000-0000-0000-0000-00000000e001/fel-uppgift.pdf',
       'application/pdf',
       '00000000-0000-0000-0000-00000000e001', null,
       '00000000-0000-0000-0000-00000000f002') $$,
  '42501',
  null,
  'eleven kan inte koppla en fil till en uppgift eleven inte har tillgång till'
);

-- Metadata och uppgiftskoppling får bara ägaren ändra.
select is(
  (select count(*) from public.documents
    where id = '00000000-0000-0000-0000-00000000a004'),
  1::bigint,
  'eleven ser materialet som hör till uppgiften'
);

-- En nekad UPDATE ger inget fel utan rör bara noll rader — därför kontrolleras
-- att innehållet faktiskt står kvar. Först den här elevens eget försök,
-- sedan klasskamratens försök mot samma rad.
update public.documents set title = 'Kapat'
  where id = '00000000-0000-0000-0000-00000000a004';
select is(
  (select title from public.documents where id = '00000000-0000-0000-0000-00000000a004'),
  'Uppgiftsmaterial',
  'elevens försök att ändra någon annans dokument ändrar ingenting'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

update public.documents set title = 'Kapat av klasskamrat'
  where id = '00000000-0000-0000-0000-00000000a003';

-- Kontrollen görs av läraren, som faktiskt ser raden; klasskamraten själv ser
-- den inte alls.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select is(
  (select title from public.documents where id = '00000000-0000-0000-0000-00000000a003'),
  'Min egen fil',
  'klasskamratens ändring av en annan elevs fil har ingen verkan'
);

select * from finish();

rollback;
