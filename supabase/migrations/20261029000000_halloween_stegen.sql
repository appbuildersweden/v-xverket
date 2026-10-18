-- Elda – Halloween-stegen.
--
-- Migreringen är additiv och gör tre saker:
--   1. Lägger till `active` på belöningarna så att ett tema kan stängas av i
--      gränssnittet utan att historiken försvinner. Halloween är det enda
--      aktiva temat.
--   2. Skapar/skriver om de tio Halloween-belöningarna med exakt de XP-gränser
--      som ligger i `src/lib/halloween-rewards.ts`. Ändra siffrorna där och kör
--      om den här filen — servern och gränssnittet följs åt.
--   3. `check_reward_unlocks` hoppar över avstängda belöningar, så en gammal
--      rad som ligger kvar i biblioteket aldrig låses upp eller visas.
--
-- XP, nivåer och upplåsningar räknas fortfarande fram av samma security
-- definer-funktioner som förut. Ingen befintlig XP eller upplåsning ändras, och
-- belöningar som redan är upplåsta ligger kvar i elevens samling.

-- ------------------------------------------------------- 1. Aktiva teman

alter table public.reward_definitions
  add column if not exists active boolean not null default true;

comment on column public.reward_definitions.active is
  'false = belöningen ligger kvar i biblioteket men kan inte längre låsas upp eller visas.';

-- ------------------------------------------------------- 2. Halloween-stegen

insert into public.reward_definitions
  (name, description, theme, position, xp_required, bonus_xp, illustration, unlocks_items, rarity, is_final, active)
values
  ('Lysande pumpalykta', 'En pumpalykta som brinner hela natten. Det första du tänder i trädgården.', 'halloween', 101, 20, 0, 'pumpa-glod', '{pumpa-glod}', 'vanlig', false, true),
  ('Gulligt spöke', 'Ett litet spöke som svävar över gräset och håller dig sällskap när du pluggar.', 'halloween', 102, 50, 0, 'spoke', '{spoke}', 'vanlig', false, true),
  ('Svart katt', 'En svart katt med gula ögon. Hon väljer sin egen plats i trädgården.', 'halloween', 103, 100, 0, 'katt', '{katt}', 'ovanlig', false, true),
  ('Magisk kristall', 'En kristall som samlar månljus och lyser upp hela grusgången.', 'halloween', 104, 175, 0, 'kristall', '{kristall}', 'ovanlig', false, true),
  ('Halloween-lykta', 'En gammal lykta med levande låga. Den slocknar aldrig, hur det än blåser.', 'halloween', 105, 275, 0, 'lykta', '{lykta}', 'sallsynt', false, true),
  ('Fladdermusfigur', 'En fladdermus som hänger i trädet och sträcker på vingarna när du går förbi.', 'halloween', 106, 400, 0, 'fladdermus', '{fladdermus}', 'sallsynt', false, true),
  ('Häxkittel', 'Kitteln bubblar av grön dryck. Receptet är hemligt och byts varje natt.', 'halloween', 107, 550, 0, 'kittel', '{kittel}', 'sallsynt', false, true),
  ('Förtrollad svamp', 'En svamp som lyser i turkost. Den växer bara där någon har pluggat flitigt.', 'halloween', 108, 725, 0, 'svamp', '{svamp}', 'legendarisk', false, true),
  ('Magisk bok', 'En bok som skriver egna anteckningar. Sidorna glöder svagt i mörkret.', 'halloween', 109, 925, 0, 'bok', '{bok}', 'legendarisk', false, true),
  ('Sällsynt månlykta', 'En lykta fylld av månsken. Den sista och ovanligaste dekorationen i trädgården.', 'halloween', 110, 1200, 0, 'manlykta', '{manlykta}', 'legendarisk', false, true)
on conflict (name) do update set
  description = excluded.description,
  theme = excluded.theme,
  position = excluded.position,
  xp_required = excluded.xp_required,
  bonus_xp = excluded.bonus_xp,
  illustration = excluded.illustration,
  unlocks_items = excluded.unlocks_items,
  rarity = excluded.rarity,
  is_final = excluded.is_final,
  active = excluded.active;

-- Allt som inte är en del av stegen stängs av. Rader och redan upplåsta
-- föremål ligger kvar — bara upplåsning och visning stängs av.
update public.reward_definitions
set active = false
where name <> all (array[
  'Lysande pumpalykta',
  'Gulligt spöke',
  'Svart katt',
  'Magisk kristall',
  'Halloween-lykta',
  'Fladdermusfigur',
  'Häxkittel',
  'Förtrollad svamp',
  'Magisk bok',
  'Sällsynt månlykta'
]);

-- ------------------------------------------------------- 3. Upplåsningen

-- Samma funktion som i 20261028000000_halloween_unlocks_require_task, med ett
-- tillägg: bara aktiva belöningar kan låsas upp. Resten är oförändrat — en
-- slutförd uppgift krävs, och bonus-XP betalas en gång.
create or replace function public.check_reward_unlocks(
  p_user uuid,
  p_source_task uuid,
  p_source_kind text,
  p_source_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_rec record;
  v_unlocked jsonb := '[]'::jsonb;
  v_new boolean := false;
  v_bonus integer;
  v_title text;
begin
  if p_source_task is null then
    raise exception 'En belöning kan bara låsas upp av en slutförd uppgift.';
  end if;

  if p_source_kind = 'student' then
    if not exists (
      select 1
      from public.student_tasks st
      where st.id = p_source_task
        and st.status = 'klar'
        and (
          st.student_id = p_user
          or (
            st.class_id is not null
            and exists (
              select 1
              from public.class_members cm
              where cm.class_id = st.class_id and cm.user_id = p_user
            )
          )
        )
    ) then
      raise exception 'Uppgiften är inte slutförd eller tillhör inte eleven.';
    end if;
    select st.title into v_title from public.student_tasks st where st.id = p_source_task;
  elsif p_source_kind = 'spec' then
    if not exists (
      select 1
      from public.spec_tasks t
      where t.id = p_source_task
        and t.user_id = p_user
        and t.status = 'klar'
    ) then
      raise exception 'Uppgiften är inte slutförd eller tillhör eleven.';
    end if;
    select t.title into v_title from public.spec_tasks t where t.id = p_source_task;
  else
    raise exception 'Ogiltig typ av uppgift.';
  end if;

  v_total := public.total_xp(p_user);
  v_title := coalesce(nullif(trim(p_source_title), ''), v_title);

  for v_rec in
    select rd.*
    from public.reward_definitions rd
    where rd.active
      and rd.xp_required <= v_total
      and not exists (
        select 1 from public.reward_unlocks ru
        where ru.user_id = p_user and ru.reward_id = rd.id
      )
      and (
        not rd.is_final
        or not exists (
          select 1 from public.reward_definitions prev
          where prev.active
            and prev.position < rd.position
            and not exists (
              select 1 from public.reward_unlocks ru2
              where ru2.user_id = p_user and ru2.reward_id = prev.id
            )
        )
      )
    order by rd.xp_required, rd.position
  loop
    v_new := true;
    v_bonus := 0;

    insert into public.reward_unlocks (
      user_id,
      reward_id,
      source_task_id,
      source_task_title,
      source_kind
    )
    values (p_user, v_rec.id, p_source_task, v_title, p_source_kind);

    if v_rec.bonus_xp > 0 then
      insert into public.xp_transactions (user_id, amount, source, reward_id, note)
      values (p_user, v_rec.bonus_xp, 'reward_bonus', v_rec.id, v_rec.name)
      on conflict do nothing;
      if found then
        v_bonus := v_rec.bonus_xp;
        perform public.refresh_user_xp(p_user);
        v_total := public.total_xp(p_user);
      end if;
    end if;

    insert into public.unlocked_decorations (user_id, reward_id, item_key)
    select p_user, v_rec.id, item
    from unnest(v_rec.unlocks_items) as item
    on conflict do nothing;

    v_unlocked := v_unlocked || jsonb_build_object(
      'id', v_rec.id,
      'name', v_rec.name,
      'description', v_rec.description,
      'theme', v_rec.theme,
      'illustration', v_rec.illustration,
      'bonus_xp', v_bonus,
      'items', to_jsonb(v_rec.unlocks_items)
    );
  end loop;

  if v_new then
    v_unlocked := v_unlocked || public.check_reward_unlocks(
      p_user,
      p_source_task,
      p_source_kind,
      v_title
    );
  end if;

  return v_unlocked;
end;
$$;

revoke execute on function public.check_reward_unlocks(uuid, uuid, text, text)
  from public, anon, authenticated;
