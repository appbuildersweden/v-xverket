-- Elda – avklarade att-göra-poster ger XP för alla roller.
--
-- Tidigare betalade `complete_task` bara ut XP till personal (`is_staff()`).
-- En elev kunde därför bocka av en egen post utan att få poäng. Nu ger varje
-- ny, avklarad post 10 XP — oavsett roll.
--
-- Skyddet mot dubbel XP ligger kvar och är oförändrat:
--   * `spec_tasks.xp_awarded` sätts till true första gången posten blir klar,
--     och `reopen_task` öppnar bara poster som ännu inte har betalat XP.
--   * Det unika indexet `xp_tx_one_per_task` (user_id, task_id) gör att två
--     samtidiga anrop ändå bara kan skapa en rad.
--   * Att skapa en post ger ingen XP, och att ladda om sidan eller logga in
--     igen rör aldrig XP — bara en post som blir klar för första gången gör det.
--
-- Belöningar låses upp av samma anrop och bara när posten gav ny XP, så en
-- omladdning kan aldrig låsa upp något.

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

  -- XP betalas ut exakt en gång per post. Standardvärdet är 10 XP; en
  -- administratör kan sätta `xp_per_task` i inställningarna.
  if not v_task.xp_awarded then
    v_per := coalesce(
      nullif((public.get_setting('xp_per_task') ->> '0')::int, 0),
      10
    );
    insert into public.xp_transactions (user_id, amount, source, task_id, note)
    values (v_user, v_per, 'task', p_task_id, v_task.title)
    on conflict do nothing;
    if found then
      v_xp := v_per;
      update public.spec_tasks set xp_awarded = true where id = p_task_id;
    end if;
  end if;

  perform public.refresh_user_xp(v_user);

  -- Bara en post som gav ny XP kan låsa upp en belöning.
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

grant execute on function public.complete_task(uuid) to authenticated;
