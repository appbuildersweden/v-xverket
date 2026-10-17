-- Elda – utvecklingssteg 5: trädgårdens belöningar.
--
-- Migreringen är icke-destruktiv. Den gör tre saker och inget annat:
--   1. Vidgar temat CHECK-villkoret på reward_definitions så att temat
--      'tradgard' ryms. Alla befintliga rader är fortfarande giltiga.
--   2. Lägger till fyra nya belöningar (blomma, sol, stjärna, hjärta) på
--      milstolparna 25, 50, 75 och 100 XP — bara om de inte redan finns.
--   3. Lägger tillbaka dem i belöningsbiblioteket med tydliga texter.
--
-- Inga befintliga belöningar, upplåsningar, XP eller användare ändras.
-- Upplåsningen sker med samma serversidefunktioner som resten av
-- belöningssystemet (complete_task / student_set_task_status), så en uppgift
-- kan aldrig ge XP eller en belöning två gånger.

-- ---------------------------------------------------------------- 1. Temat

do $$
declare
  c record;
begin
  -- Hitta CHECK-villkoret som rör theme (namnet auto-genereras av Postgres,
  -- så vi letar upp det i stället för att gissa).
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.reward_definitions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%theme%'
  loop
    execute format('alter table public.reward_definitions drop constraint %I', c.conname);
  end loop;

  alter table public.reward_definitions
    add constraint reward_definitions_theme_check
    check (theme in ('it', 'halloween', 'special', 'jul', 'tradgard'));
exception
  when others then
    raise notice 'Kunde inte vidga temat på reward_definitions: %', sqlerrm;
end $$;

-- ------------------------------------------------------- 2. Trädgården

-- Position 24–27 ligger efter den befintliga stegen (1–23) så att inga
-- befintliga rader flyttas. XP-nivåerna är 25, 50, 75 och 100.
insert into public.reward_definitions
  (name, description, theme, position, xp_required, bonus_xp, illustration, unlocks_items, is_final)
values
  ('Blomma', 'En liten blomma slår ut i din trädgård.', 'tradgard', 24, 25, 0, '🌸', '{blomma}', false),
  ('Sol', 'Solen värmer trädgården och allt växer lite fortare.', 'tradgard', 25, 50, 0, '☀️', '{sol}', false),
  ('Stjärna', 'En stjärna lyser över trädet på kvällen.', 'tradgard', 26, 75, 0, '⭐', '{stjarna}', false),
  ('Hjärta', 'Ett hjärta i trädgården för allt du klarar.', 'tradgard', 27, 100, 0, '❤️', '{hjarta}', false)
on conflict do nothing;

comment on table public.unlocked_decorations is
  'Föremål som låsts upp via belöningar, t.ex. blomma, sol, stjärna och hjärta i trädgården.';
