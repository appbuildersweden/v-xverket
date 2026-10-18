-- Elda – Halloween-trädgården.
--
-- Migreringen är additiv. Den:
--   1. Lägger till raritet på belöningarna (vanlig → legendarisk).
--   2. Ger Halloween-belöningarna riktiga tillgångsnycklar (ritad grafik i
--      appen i stället för emoji), tydligare beskrivningar och XP-nivåer som
--      går att nå med vanliga studier.
--   3. Lägger till fyra nya säsongsföremål på högre milstolpar.
--   4. Skapar `garden_placements` med RLS och två serverfunktioner som bara
--      låter eleven ställa ut föremål som faktiskt är upplåsta.
--
-- XP, nivåer och upplåsningar räknas fortfarande fram av samma
-- security definer-funktioner som förut (complete_task /
-- student_set_task_status). Inga upplåsningar skapas direkt här, och inga
-- befintliga användare, XP-rader eller andra teman ändras.

-- ---------------------------------------------------------------- 1. Raritet

alter table public.reward_definitions
  add column if not exists rarity text not null default 'vanlig';

do $$
begin
  alter table public.reward_definitions
    drop constraint if exists reward_definitions_rarity_check;
  alter table public.reward_definitions
    add constraint reward_definitions_rarity_check
    check (rarity in ('vanlig', 'ovanlig', 'sallsynt', 'legendarisk'));
exception
  when others then
    raise notice 'Kunde inte sätta rarity-villkoret: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------- 2. Halloween

-- Illustrationen är en nyckel till appens ritade grafik. `unlocks_items`
-- innehåller samma nycklar och är det servern kontrollerar vid utplacering.
update public.reward_definitions set
  description = 'En leende pumpalykta med varmt ljus. Det första du tänder i trädgården.',
  xp_required = 30,
  illustration = 'pumpa-glod',
  unlocks_items = '{pumpa-glod}',
  rarity = 'vanlig'
where name = 'Glad pumpa';

update public.reward_definitions set
  description = 'Ett litet spöke som svävar över gräset och håller dig sällskap när du pluggar.',
  xp_required = 70,
  illustration = 'spoke',
  unlocks_items = '{spoke,manskenslykta}',
  rarity = 'ovanlig'
where name = 'Svävande spöke';

update public.reward_definitions set
  description = 'Häxans kvast står lutad mot staketet. Den flyger bara på natten.',
  xp_required = 120,
  illustration = 'kvast',
  unlocks_items = '{kvast}',
  rarity = 'ovanlig'
where name = 'Liten häxa med kvast';

update public.reward_definitions set
  description = 'En svart katt med en alldeles för stor hatt. Hon väljer sin egen plats i trädgården.',
  xp_required = 160,
  illustration = 'katt',
  unlocks_items = '{katt,hatt}',
  rarity = 'ovanlig'
where name = 'Svart katt med häxhatt';

update public.reward_definitions set
  description = 'Ett snedställt hus med glödande fönster. Någon är hemma, men ingen öppnar.',
  xp_required = 220,
  illustration = 'hxhus',
  unlocks_items = '{hxhus,lykta}',
  rarity = 'sallsynt'
where name = 'Magiskt häxhus';

update public.reward_definitions set
  description = 'Kitteln bubblar av färgstark dryck. Receptet är hemligt.',
  xp_required = 280,
  illustration = 'kittel',
  unlocks_items = '{kittel,flaska}',
  rarity = 'sallsynt'
where name = 'Kitteln med färgglad dryck';

update public.reward_definitions set
  description = 'En svärm fladdermöss och lysande pumpor som gör hela trädgården levande.',
  xp_required = 340,
  illustration = 'fladdermus',
  unlocks_items = '{fladdermus,ljus}',
  rarity = 'ovanlig'
where name = 'Fladdermöss & lysande pumpor';

update public.reward_definitions set
  description = 'En gammal dator som startar av sig själv. Skärmen lyser lila, men ingen har rört tangentbordet.',
  xp_required = 420,
  illustration = 'spokdator',
  unlocks_items = '{spokdator}',
  rarity = 'sallsynt'
where name = 'Spöklig dator med lila sken';

update public.reward_definitions set
  description = 'En påse med godis från hela trädgården — och plats för flera föremål.',
  xp_required = 500,
  illustration = 'godispase',
  unlocks_items = '{godispase,svamp}',
  rarity = 'sallsynt'
where name = 'Halloweenpaketet';

-- Fyra föremål på de högre milstolparna. Positionerna 28–31 ligger efter den
-- befintliga stegen (1–27), så ingen tidigare rad flyttas.
insert into public.reward_definitions
  (name, description, theme, position, xp_required, bonus_xp, illustration, unlocks_items, rarity, is_final)
values
  ('Månskenslyktan', 'En lykta som brinner hela natten och visar vägen genom dimman.', 'halloween', 28, 600, 0, 'lykta', '{lykta,ljus}', 'sallsynt', false),
  ('Korpen på grinden', 'Korpen sitter på grinden och håller koll på allt som händer i trädgården.', 'halloween', 29, 720, 0, 'kraka', '{kraka}', 'sallsynt', false),
  ('Häxans nattdryck', 'En glödande flaska med ett recept som bara häxan känner till.', 'halloween', 30, 850, 0, 'flaska', '{flaska,kittel}', 'legendarisk', false),
  ('Kristallnatten', 'Kristaller och lysande svampar som bara syns när månen står högst.', 'halloween', 31, 1000, 0, 'kristall', '{kristall,svamp}', 'legendarisk', false)
on conflict (name) do nothing;

-- ---------------------------------------------------------------- 3. Platserna

create table if not exists public.garden_placements (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 64),
  slot smallint not null check (slot between 0 and 5),
  reward_id uuid references public.reward_definitions (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key),
  unique (user_id, slot)
);

comment on table public.garden_placements is
  'Elevens egna placeringar i säsongsträdgården. Skrivs bara via garden_place_item.';

alter table public.garden_placements enable row level security;

-- Eleven får läsa sina egna placeringar. Skrivning sker enbart via
-- security definer-funktionerna nedan, som kontrollerar upplåsningen först.
drop policy if exists "garden_placements_select_own" on public.garden_placements;
create policy "garden_placements_select_own" on public.garden_placements
  for select to authenticated using (auth.uid() = user_id);

/**
 * Ställer ett upplåst föremål på en plats (0–5).
 *
 * Föremålet måste finnas i `unlocked_decorations` för samma användare, vilket
 * bara de serverfunktioner som delar ut belöningar skriver till. Klienten kan
 * därför inte fylla trädgården med föremål den inte har tjänat ihop.
 */
create or replace function public.garden_place_item(p_item_key text, p_slot integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reward uuid;
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    raise exception 'Ogiltig plats i trädgården.';
  end if;

  select ud.reward_id into v_reward
  from public.unlocked_decorations ud
  where ud.user_id = v_user and ud.item_key = p_item_key
  limit 1;

  if v_reward is null then
    raise exception 'Föremålet är inte upplåst.';
  end if;

  -- Platsen har bara ett föremål: det som står där flyttas tillbaka till
  -- samlingen innan det nya ställs dit.
  delete from public.garden_placements
  where user_id = v_user and slot = p_slot;

  insert into public.garden_placements (user_id, item_key, slot, reward_id)
  values (v_user, p_item_key, p_slot, v_reward)
  on conflict (user_id, item_key) do update
    set slot = excluded.slot,
        reward_id = excluded.reward_id,
        updated_at = now();
end;
$$;

/** Tar bort ett föremål från trädgården. */
create or replace function public.garden_remove_item(p_item_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;

  delete from public.garden_placements
  where user_id = v_user and item_key = p_item_key;
end;
$$;

revoke execute on function public.garden_place_item(text, integer) from public, anon;
revoke execute on function public.garden_remove_item(text) from public, anon;
grant execute on function public.garden_place_item(text, integer) to authenticated;
grant execute on function public.garden_remove_item(text) to authenticated;
