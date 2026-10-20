-- Elda Skola – RLS-test för bilagor, arkivering och skickat-vy.
--
-- Kör mot en LOKAL testdatabas (aldrig produktion):
--     supabase start
--     supabase test db
--
-- Testet bygger vidare på 0006: två skolor med var sin lärare och elev. Det
-- prövar att en bilaga bara nås av deltagarna i konversationen (och först när
-- den skickats), att ett konto i en annan skola varken kan se eller skapa
-- bilagor där, att arkivering är personlig och att skickat-vyn bara innehåller
-- egna meddelanden.

begin;

select plan(23);

-- ---------------------------------------------------------------- Testdata
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000a0001', 'org.elev1@test.local',   '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0002', 'org.larare1@test.local', '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0003', 'org.elev2@test.local',   '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0004', 'org.larare2@test.local', '{"role":"lärare"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, username, role, active, account_type, limited) values
  ('00000000-0000-0000-0000-0000000a0001', 'orgelev1',   'elev',   true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0002', 'orglarare1', 'lärare', true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0003', 'orgelev2',   'elev',   true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0004', 'orglarare2', 'lärare', true, 'skola', false)
on conflict (id) do update
  set username = excluded.username,
      role = excluded.role,
      active = excluded.active,
      account_type = excluded.account_type,
      limited = excluded.limited;

insert into public.school_organisations (id, name, slug, active) values
  ('00000000-0000-0000-0000-0000000b0001', 'Testskolan Ett', 'testskolan-ett', true),
  ('00000000-0000-0000-0000-0000000b0002', 'Testskolan Två', 'testskolan-tva', true)
on conflict (id) do nothing;

insert into public.school_memberships (user_id, organisation_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000b0001'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000b0001'),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000b0002'),
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-0000000b0002')
on conflict do nothing;

insert into public.classes (id, name, created_by, join_code, organisation_id) values
  ('00000000-0000-0000-0000-0000000c0001', 'Klass Ett', '00000000-0000-0000-0000-0000000a0002', 'BIL001',
   '00000000-0000-0000-0000-0000000b0001'),
  ('00000000-0000-0000-0000-0000000c0002', 'Klass Två', '00000000-0000-0000-0000-0000000a0004', 'BIL002',
   '00000000-0000-0000-0000-0000000b0002')
on conflict (id) do nothing;

insert into public.class_members (class_id, user_id, member_role, added_by) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000a0002', 'larare', '00000000-0000-0000-0000-0000000a0002'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000a0001', 'elev',   '00000000-0000-0000-0000-0000000a0002'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000a0004', 'larare', '00000000-0000-0000-0000-0000000a0004'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000a0003', 'elev',   '00000000-0000-0000-0000-0000000a0004')
on conflict (class_id, user_id) do nothing;

-- En fast konversation mellan läraren och eleven i skola ett. Den skrivs innan
-- rollen byts så att testet har ett stabilt id även för nekade anrop (en klient
-- i en annan skola kan inte ens läsa fram kanalens id).
insert into public.chat_channels (id, kind, dm_user_a, dm_user_b, organisation_id) values
  ('00000000-0000-0000-0000-0000000e0001',
   'direkt',
   '00000000-0000-0000-0000-0000000a0002',
   '00000000-0000-0000-0000-0000000a0001',
   '00000000-0000-0000-0000-0000000b0001')
on conflict (id) do nothing;

-- ------------------------------------------------------------ Lärare: bilaga
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select lives_ok(
  $$ insert into public.message_attachments
       (channel_id, uploader_id, file_name, storage_path, mime_type, size_bytes)
     values (
       '00000000-0000-0000-0000-0000000e0001',
       '00000000-0000-0000-0000-0000000a0002',
       'prov.pdf',
       '00000000-0000-0000-0000-0000000a0002/prov.pdf',
       'application/pdf', 2048) $$,
  'läraren kan bifoga en fil till sin konversation'
);

select is(
  (select count(*) from public.message_attachments),
  1::bigint,
  'läraren ser sin egen oskickade bilaga'
);

-- ------------------------------------------------- Elev: bara efter sändning
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.message_attachments),
  0::bigint,
  'en oskickad bilaga är privat för uppladdaren, även för eleven i samma konversation'
);

select lives_ok(
  $$ select public.elda_skola_archive_channel('00000000-0000-0000-0000-0000000e0001', true) $$,
  'eleven kan arkivera sin konversation'
);

select is(
  (select count(*) from public.chat_archives),
  1::bigint,
  'arkiveringen sparas för eleven'
);

-- -------------------------------------------------------- Annan skola nekas
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0003","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.message_attachments),
  0::bigint,
  'ett konto i en annan skola ser inte bilagan'
);

select throws_ok(
  $$ insert into public.message_attachments
       (channel_id, uploader_id, file_name, storage_path, mime_type, size_bytes)
     values (
       '00000000-0000-0000-0000-0000000e0001',
       '00000000-0000-0000-0000-0000000a0003',
       'intrang.pdf',
       '00000000-0000-0000-0000-0000000a0003/intrang.pdf',
       'application/pdf', 2048) $$,
  '42501',
  null,
  'ett konto i en annan skola kan inte bifoga en fil i konversationen'
);

select throws_ok(
  $$ select public.elda_skola_archive_channel('00000000-0000-0000-0000-0000000e0001', true) $$,
  'P0001',
  null,
  'ett konto i en annan skola kan inte arkivera konversationen'
);

-- Arkiveringen är personlig: läraren är opåverkad i samma konversation.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select is(
  (select count(*) from public.chat_archives),
  0::bigint,
  'arkiveringen syns inte för den andra deltagaren'
);

-- -------------------------------------------------- Skicka med bilaga
select lives_ok(
  $$ select public.elda_skola_send_rich_message(
       '00000000-0000-0000-0000-0000000e0001',
       'Här är provet.',
       '<p>Här är <strong>provet</strong>.</p>',
       array[(select id from public.message_attachments limit 1)]::uuid[]) $$,
  'läraren kan skicka ett formaterat meddelande med bilaga'
);

select is(
  (select count(*) from public.message_attachments where message_id is not null),
  1::bigint,
  'bilagan kopplas till meddelandet'
);

select is(
  (select body from public.messages where channel_id = '00000000-0000-0000-0000-0000000e0001'),
  null::text,
  'ett meddelande får sakna ren text när det har formaterat innehåll'
);

select is(
  (select body_html from public.messages where channel_id = '00000000-0000-0000-0000-0000000e0001'),
  '<p>Här är <strong>provet</strong>.</p>',
  'det formaterade innehållet sparas som det sanerade klienten skickade'
);

select throws_ok(
  $$ insert into public.messages (channel_id, sender_id, body)
     values (
       '00000000-0000-0000-0000-0000000e0001',
       '00000000-0000-0000-0000-0000000a0002',
       'direkt insatt') $$,
  '42501',
  null,
  'ett meddelande kan inte skrivas direkt i tabellen, utan bara via funktionen'
);

select throws_ok(
  $$ select public.elda_skola_send_rich_message(
       '00000000-0000-0000-0000-0000000e0001', '',
       '<p>Hej</p><script>alert(1)</script>', null) $$,
  'P0001',
  null,
  'servern avvisar osanerat innehåll med skript'
);

select is(
  (select count(*) from public.chat_archives),
  0::bigint,
  'ett nytt meddelande tar tillbaka konversationen till inkorgen'
);

select is(
  (select count(*) from public.elda_skola_sent_conversations()),
  1::bigint,
  'skickat-vyn innehåller konversationen för läraren'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.elda_skola_sent_conversations()),
  0::bigint,
  'skickat-vyn innehåller inte lärarens meddelande för eleven'
);

select is(
  (select archived from public.elda_skola_conversations()
    where channel_id = '00000000-0000-0000-0000-0000000e0001'),
  false,
  'konversationen är tillbaka i inkorgen efter ett nytt meddelande'
);

select is(
  (select count(*) from public.elda_skola_conversations()
    where channel_id = '00000000-0000-0000-0000-0000000e0001'),
  1::bigint,
  'eleven ser konversationen i inkorgen'
);

select is(
  (select last_body from public.elda_skola_conversations()
    where channel_id = '00000000-0000-0000-0000-0000000e0001'),
  'Här är provet.',
  'förhandsvisningen visar texten även när meddelandet bara har formaterat innehåll'
);

select is(
  (select count(*) from public.message_attachments),
  1::bigint,
  'elevens bilaga blir läsbar för eleven när meddelandet skickats'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0003","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.message_attachments),
  0::bigint,
  'bilagan förblir otillgänglig för ett konto i en annan skola även efter sändning'
);

select * from finish();

rollback;
