-- Elda Skola – RLS-test för skolorganisationer och kommunikationsregeln.
--
-- Kör mot en LOKAL testdatabas (aldrig produktion):
--     supabase start
--     supabase test db
--
-- Testet skapar två skolorganisationer med var sin lärare och elev, ett konto
-- utan skola, och prövar att:
--   * kommunikation inom samma skola fungerar,
--   * kommunikation över skolgränsen nekas av servern,
--   * ett konto utan skola inte kan starta vanliga interna meddelanden,
--   * ett klassmedlemskap över skolgränsen nekas,
--   * systemadministratören kan skicka systemutskick till en vald skola,
--   * publiceringar bara syns för rätt skola och inte före publiceringstiden.

begin;

select plan(13);

-- ---------------------------------------------------------------- Testdata
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000a0001', 'org.elev1@test.local',   '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0002', 'org.larare1@test.local', '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0003', 'org.elev2@test.local',   '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0004', 'org.larare2@test.local', '{"role":"lärare"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0005', 'org.elev3@test.local',   '{"role":"elev"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0006', 'org.admin@test.local',   '{"role":"admin"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, username, role, active, account_type, limited) values
  ('00000000-0000-0000-0000-0000000a0001', 'orgelev1',   'elev',   true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0002', 'orglarare1', 'lärare', true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0003', 'orgelev2',   'elev',   true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0004', 'orglarare2', 'lärare', true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0005', 'orgelev3',   'elev',   true, 'skola', false),
  ('00000000-0000-0000-0000-0000000a0006', 'orgadmin',   'admin',  true, 'skola', false)
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
  ('00000000-0000-0000-0000-0000000c0001', 'Klass Ett', '00000000-0000-0000-0000-0000000a0002', 'ORG001',
   '00000000-0000-0000-0000-0000000b0001'),
  ('00000000-0000-0000-0000-0000000c0002', 'Klass Två', '00000000-0000-0000-0000-0000000a0004', 'ORG002',
   '00000000-0000-0000-0000-0000000b0002')
on conflict (id) do nothing;

insert into public.class_members (class_id, user_id, member_role, added_by) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000a0002', 'larare', '00000000-0000-0000-0000-0000000a0002'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000a0001', 'elev',   '00000000-0000-0000-0000-0000000a0002'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000a0004', 'larare', '00000000-0000-0000-0000-0000000a0004'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000a0003', 'elev',   '00000000-0000-0000-0000-0000000a0004')
on conflict (class_id, user_id) do nothing;

-- Publiceringar skapas bara serversidigt, så fixturen skrivs innan rollen byts.
insert into public.school_publications
  (id, kind, title, summary, status, audience_organisation_ids, publish_at)
values
  ('00000000-0000-0000-0000-0000000d0001', 'nyhet', 'Nyhet för skola ett', 'Sammanfattning',
   'publicerad', array['00000000-0000-0000-0000-0000000b0001']::uuid[], now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000d0002', 'viktig', 'Viktigt för skola två', null,
   'publicerad', array['00000000-0000-0000-0000-0000000b0002']::uuid[], now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000d0003', 'uppdatering', 'Schemalagd uppdatering', null,
   'publicerad', array['00000000-0000-0000-0000-0000000b0001']::uuid[], now() + interval '1 day')
on conflict (id) do nothing;

-- ------------------------------------------------- Kommunikation i egen skola
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select lives_ok(
  $$ select public.open_direct_channel('00000000-0000-0000-0000-0000000a0002') $$,
  'eleven kan starta en konversation med sin lärare i samma skola'
);

select is(
  (select organisation_id from public.chat_channels where kind = 'direkt' limit 1),
  '00000000-0000-0000-0000-0000000b0001'::uuid,
  'kanalen knyts till den egna skolorganisationen'
);

select is(
  (select count(*) from public.list_message_contacts() where username = 'orglarare2'),
  0::bigint,
  'mottagarlistan innehåller ingen person från en annan skola'
);

-- --------------------------------------------- Kommunikation över skolgränsen
select throws_ok(
  $$ select public.open_direct_channel('00000000-0000-0000-0000-0000000a0004') $$,
  'P0001',
  null,
  'en elev kan inte starta en konversation med en lärare på en annan skola'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0004","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select throws_ok(
  $$ select public.open_direct_channel('00000000-0000-0000-0000-0000000a0001') $$,
  'P0001',
  null,
  'en lärare kan inte kontakta en elev på en annan skola'
);

-- --------------------------------------------------- Konto utan skolkoppling
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0005","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select throws_ok(
  $$ select public.open_direct_channel('00000000-0000-0000-0000-0000000a0002') $$,
  'P0001',
  null,
  'ett konto utan skola kan inte skicka vanliga interna meddelanden'
);

-- ------------------------------------------------ Klassmedlemskap över gränsen
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated","app_metadata":{"role":"lärare"}}',
  true
);

select throws_ok(
  $$ insert into public.class_members (class_id, user_id, member_role, added_by)
     values ('00000000-0000-0000-0000-0000000c0001',
             '00000000-0000-0000-0000-0000000a0003', 'elev',
             '00000000-0000-0000-0000-0000000a0002') $$,
  'P0001',
  null,
  'en elev från en annan skola kan inte läggas i klassen'
);

-- ------------------------------------------------- Systemutskick (endast admin)
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0006","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select is(
  public.elda_skola_send_system_message(
    'Driftinformation', 'Skola ett har underhåll i kväll.',
    array['00000000-0000-0000-0000-0000000b0001']::uuid[], null, null
  ),
  2,
  'systemutskicket når bara kontona i den valda skolan'
);

select is(
  (select count(*) from public.school_message_recipients r
    where r.user_id = '00000000-0000-0000-0000-0000000a0001'),
  1::bigint,
  'eleven i skola ett får systemutskicket'
);

select is(
  (select count(*) from public.school_message_recipients r
    where r.user_id = '00000000-0000-0000-0000-0000000a0003'),
  0::bigint,
  'eleven i skola två får inte systemutskicket'
);

-- ------------------------------------------------------------ Publiceringar
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.elda_skola_list_publications()),
  1::bigint,
  'eleven ser bara publicerad publicering för sin egen skola, inte den schemalagda'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0003","role":"authenticated","app_metadata":{"role":"elev"}}',
  true
);

select is(
  (select count(*) from public.elda_skola_list_publications()),
  1::bigint,
  'eleven i den andra skolan ser bara sin egen publicering'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0006","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select is(
  (select count(*) from public.elda_skola_admin_publications()),
  3::bigint,
  'systemadministratören ser alla publiceringar, även utkast och schemalagda'
);

select * from finish();

rollback;
