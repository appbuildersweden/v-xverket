-- Elda – belöningar kräver en ny, slutförd uppgift.
--
-- Tidigare kunde `check_reward_unlocks` anropas direkt av en inloggad klient.
-- Då kunde en elev som redan hade XP låsa upp en belöning utan att göra en ny
-- uppgift. Den här migreringen stänger den vägen:
--
--   1. `reward_unlocks` får källa: vilken uppgift som låste upp belöningen,
--      så att gränssnittet kan visa det.
--   2. `check_reward_unlocks` kräver ett slutfört uppgifts-ID som tillhör
--      eleven. Utan en sådan uppgift avbryts anropet.
--   3. `complete_task` och `student_set_task_status` anropar bara
--      upplåsningen när uppgiften faktiskt gav ny XP — alltså första gången
--      den blir klar. Att öppna sidan, ladda om eller klicka ger ingen XP.
--   4. Klienten får inte längre köra upplåsningsfunktionen direkt.
--
-- XP-betalningen har redan unika index per uppgift (user_id, task_id) och
-- (user_id, student_task_id), så samma uppgift kan aldrig ge dubbel XP eller
-- dubbla belöningar.

-- ------------------------------------------------------- 1. Källan till upplåsningen

alter table public.reward_unlocks
  add column if not exists source_task_id uuid,
  add column if not exists source_task_title text,
  add column if not exists source_kind text;

do $$
begin
  alter table public.reward_unlocks
    drop constraint if exists reward_unlocks_source_kind_check;
  alter table public.reward_unlocks
    add constraint reward_unlocks_source_kind_check
    check (source_kind is null or source_kind in ('spec', 'student'));
exception
  when others then
    raise notice 'Kunde inte sätta källvillkoret på reward_unlocks: %', sqlerrm;
end $$;

comment on column public.reward_unlocks.source_task_title is
  'Uppgiften som utlöste upplåsningen. NULL för belöningar som låstes upp före den här migreringen.';

-- ------------------------------------------------------- 2. Upplåsning

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
  -- Utan en slutförd uppgift finns ingen belöning att låsa upp. Kontrollen
  -- ligger här (inte bara i anroparen) så att funktionen inte kan missbrukas.
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
    where rd.xp_required <= v_total
      and not exists (
        select 1 from public.reward_unlocks ru
        where ru.user_id = p_user and ru.reward_id = rd.id
      )
      -- Den sista belöningen kräver att alla tidigare steg är avklarade.
      and (
        not rd.is_final
        or not exists (
          select 1 from public.reward_definitions prev
          where prev.position < rd.position
            and not exists (
              select 1 from public.reward_unlocks ru2
              where ru2.user_id = p_user and ru2.reward_id = prev.id
            )
        )
      )
    order by rd.position
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

    -- Bonus-XP betalas bara vid själva upplåsningen (unique-index skyddar
    -- mot dubbeltag även om funktionen körs om).
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

  -- En bonus kan själv kvalificera till nya belöningar. Samma uppgift är
  -- fortfarande källan till hela kedjan.
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

-- ------------------------------------------------------- 3. Slutförda uppgifter

create or replace function public.complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.spec_tasks%rowtype;
  v_xp integer := 0;
  v_per integer;
  v_unlocks jsonb := '[]'::jsonb;
  v_total integer;
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;

  select * into v_task
  from public.spec_tasks
  where id = p_task_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;

  update public.spec_tasks
  set status = 'klar',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_task_id;

  if not v_task.xp_awarded and public.is_staff() then
    v_per := coalesce(nullif((public.get_setting('xp_per_task') ->> '0')::int, 0), 10);
    insert into public.xp_transactions (user_id, amount, source, task_id, note)
    values (v_user, v_per, 'task', p_task_id, v_task.title)
    on conflict do nothing;
    if found then
      v_xp := v_per;
      update public.spec_tasks set xp_awarded = true where id = p_task_id;
    end if;
  end if;

  perform public.refresh_user_xp(v_user);

  -- Endast en uppgift som gav ny XP kan låsa upp en belöning.
  if v_xp > 0 then
    v_unlocks := public.check_reward_unlocks(v_user, p_task_id, 'spec', v_task.title);
  end if;

  v_total := public.total_xp(v_user);

  return jsonb_build_object(
    'xp_awarded', v_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total),
    'unlocks', coalesce(v_unlocks, '[]'::jsonb)
  );
end;
$$;

create or replace function public.student_set_task_status(
  p_task_id uuid,
  p_status text default null,
  p_submission text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_task public.student_tasks%rowtype;
  v_target boolean;
  v_xp integer := 0;
  v_per integer;
  v_total integer;
  v_unlocks jsonb := '[]'::jsonb;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;

  select * into v_task
  from public.student_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;

  v_target := v_task.student_id = v_me
           or (v_task.class_id is not null and public.is_class_member(v_task.class_id));

  if not v_target then
    raise exception 'Uppgiften är inte tilldelad dig.';
  end if;

  if p_status is not null and p_status not in ('ej_paborjad', 'pagar', 'klar') then
    raise exception 'Ogiltig status.';
  end if;

  if p_submission is not null and char_length(p_submission) > 20000 then
    raise exception 'Inlämningen är för lång.';
  end if;

  update public.student_tasks
  set status = coalesce(p_status, status),
      submission = case when p_submission is null then submission else nullif(trim(p_submission), '') end,
      submitted_at = case when p_submission is null then submitted_at
                          else coalesce(submitted_at, now()) end,
      completed_at = case
        when coalesce(p_status, status) = 'klar' then coalesce(completed_at, now())
        else null
      end,
      updated_at = now()
  where id = p_task_id
  returning * into v_task;

  -- XP en gång per uppgift: uniknyckeln på (user_id, student_task_id) skyddar
  -- även om två anrop kommer samtidigt.
  if v_task.status = 'klar' and not v_task.xp_awarded then
    v_per := coalesce(nullif((public.get_setting('xp_per_task') ->> '0')::int, 0), 10);
    insert into public.xp_transactions (user_id, amount, source, student_task_id, note)
    values (v_me, v_per, 'task', p_task_id, v_task.title)
    on conflict do nothing;
    if found then
      v_xp := v_per;
      update public.student_tasks set xp_awarded = true where id = p_task_id;
    end if;
  end if;

  perform public.refresh_user_xp(v_me);

  -- Belöningar öppnas bara när uppgiften gav ny XP, aldrig vid omladdning
  -- eller när en redan avklarad uppgift öppnas igen.
  if v_xp > 0 then
    v_unlocks := public.check_reward_unlocks(v_me, p_task_id, 'student', v_task.title);
  end if;

  v_total := public.total_xp(v_me);

  return jsonb_build_object(
    'status', v_task.status,
    'xp_awarded', v_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total),
    'unlocks', coalesce(v_unlocks, '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------- 4. Behörigheter

-- Den gamla versionen (ett argument) får inte ligga kvar: den saknade
-- kontrollen att en uppgift faktiskt hade slutförts.
drop function if exists public.check_reward_unlocks(uuid);

revoke execute on function public.check_reward_unlocks(uuid, uuid, text, text)
  from public, anon, authenticated;
-- XP-saldot får bara räknas om av serverfunktionerna.
revoke execute on function public.refresh_user_xp(uuid) from public, anon, authenticated;

grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.student_set_task_status(uuid, text, text) to authenticated;
