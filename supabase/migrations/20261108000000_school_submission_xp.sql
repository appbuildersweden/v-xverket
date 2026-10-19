-- Elda Skola – XP när en inlämning godkänns.
--
-- En inlämning ger XP exakt en gång: när läraren övergår den till 'granskad'
-- första gången. XP-beloppet är samma regel som övriga uppgifter
-- (get_setting('xp_per_task'), standard 10). Återlämnad eller ny inlämning
-- ger ingen ny XP, eftersom xp_awarded redan är satt.
--
-- Skyddet är tredelat:
--   * school_submissions.xp_awarded sätts i samma transaktion som insertet.
--   * Unikt index (user_id, school_submission_id) i xp_transactions.
--   * Funktionen låser raden med FOR UPDATE innan den läser xp_awarded.
--
-- complete_task (Elda-appens spec_tasks) ändras inte.

-- ----------------------------------------------------------------
-- Kolumner
-- ----------------------------------------------------------------

alter table public.school_submissions
  add column if not exists xp_awarded boolean not null default false;

-- När eleven har sett XP-popupen. Null betyder att den ännu inte visats.
alter table public.school_submissions
  add column if not exists xp_celebrated_at timestamptz;

alter table public.xp_transactions
  add column if not exists school_submission_id uuid
  references public.school_submissions (id) on delete set null;

create unique index if not exists xp_tx_one_per_school_submission
  on public.xp_transactions (user_id, school_submission_id)
  where school_submission_id is not null;

-- Lägg till den nya källan utan att tappa de befintliga.
alter table public.xp_transactions
  drop constraint if exists xp_transactions_source_check;
alter table public.xp_transactions
  add constraint xp_transactions_source_check
  check (source in (
    'task', 'reward_bonus', 'admin_adjustment', 'shop_purchase', 'school_submission'
  ));

-- Befintliga godkända inlämningar är redan klara. De ska inte få XP i
-- efterhand, och eleven ska inte få en popup för något som hände tidigare.
update public.school_submissions
set xp_awarded = true,
    xp_celebrated_at = coalesce(xp_celebrated_at, feedback_at, updated_at)
where status = 'granskad';

-- ----------------------------------------------------------------
-- Lärarens granskning (ersätter föregående version)
-- ----------------------------------------------------------------

create or replace function public.elda_skola_review_submission(
  p_submission uuid,
  p_feedback text default null,
  p_status text default 'granskad'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_sub public.school_submissions%rowtype;
  v_task public.student_tasks%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'granskad')));
  v_feedback text := nullif(trim(coalesce(p_feedback, '')), '');
  v_per integer;
  v_xp integer := 0;
  v_total integer;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if v_status not in ('granskad', 'aterlamnad') then
    raise exception 'Ogiltig granskningsstatus.';
  end if;
  if v_feedback is not null and char_length(v_feedback) > 10000 then
    raise exception 'Återkopplingen är för lång (max 10 000 tecken).';
  end if;
  if v_status = 'aterlamnad' and v_feedback is null then
    raise exception 'Skriv en kort förklaring när du återlämnar för komplettering.';
  end if;

  select * into v_sub
  from public.school_submissions
  where id = p_submission
  for update;

  if not found then
    raise exception 'Inlämningen hittades inte.';
  end if;

  select * into v_task from public.student_tasks where id = v_sub.task_id;
  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;

  if not (
    v_task.created_by = v_me
    or public.is_admin()
    or public.is_class_teacher(v_task.class_id)
    or public.elda_skola_teaches(v_sub.student_id)
  ) then
    raise exception 'Du har inte behörighet till den här inlämningen.';
  end if;

  if v_sub.status = 'utkast' then
    raise exception 'Eleven har inte lämnat in uppgiften ännu.';
  end if;

  update public.school_submissions
  set status = v_status,
      feedback = v_feedback,
      feedback_at = case when v_feedback is not null then now() else feedback_at end,
      reviewed_by = v_me,
      returned_at = case when v_status = 'aterlamnad' then now() else null end,
      updated_at = now()
  where id = p_submission
  returning * into v_sub;

  -- XP bara vid första godkännandet. Återlämnad och sedan ny inlämning
  -- räknas inte som en ny prestation, eftersom xp_awarded redan är satt.
  if v_status = 'granskad' and not v_sub.xp_awarded then
    v_per := coalesce(nullif((public.get_setting('xp_per_task') ->> '0')::int, 0), 10);
    insert into public.xp_transactions
      (user_id, amount, source, school_submission_id, note)
    values
      (v_sub.student_id, v_per, 'school_submission', v_sub.id, v_task.title)
    on conflict do nothing;
    if found then
      v_xp := v_per;
      update public.school_submissions
      set xp_awarded = true
      where id = v_sub.id;
      v_sub.xp_awarded := true;
      perform public.refresh_user_xp(v_sub.student_id);
    end if;
  end if;

  v_total := public.total_xp(v_sub.student_id);

  perform public.log_audit(
    case when v_status = 'aterlamnad'
         then 'school.submission.returned'
         else 'school.submission.reviewed'
    end,
    'school_submission',
    v_sub.id::text,
    jsonb_build_object(
      'task_id', v_sub.task_id,
      'student_id', v_sub.student_id,
      'xp_awarded', v_xp
    )
  );

  return jsonb_build_object(
    'id', v_sub.id,
    'task_id', v_sub.task_id,
    'student_id', v_sub.student_id,
    'class_id', v_sub.class_id,
    'content', v_sub.content,
    'status', v_sub.status,
    'feedback', v_sub.feedback,
    'feedback_at', v_sub.feedback_at,
    'submitted_at', v_sub.submitted_at,
    'returned_at', v_sub.returned_at,
    'created_at', v_sub.created_at,
    'updated_at', v_sub.updated_at,
    'xp_awarded', v_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total)
  );
end;
$$;

revoke execute on function public.elda_skola_review_submission(uuid, text, text) from public, anon;
grant execute on function public.elda_skola_review_submission(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------
-- Eleven: markera XP-popupen som visad
-- ----------------------------------------------------------------

/**
 * Anropas av eleven när popupen har visats. Bara inlämningar som faktiskt
 * gav XP och som ännu inte har visats kan markeras. Returnerar XP-beloppet
 * och det aktuella saldot så att popupen visar samma siffror som databasen.
 */
create or replace function public.elda_skola_celebrate_submission_xp(
  p_submission uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_amount integer := 0;
  v_total integer;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;

  update public.school_submissions
  set xp_celebrated_at = now()
  where id = p_submission
    and student_id = v_me
    and xp_awarded
    and xp_celebrated_at is null;

  select coalesce(sum(x.amount), 0) into v_amount
  from public.xp_transactions x
  where x.user_id = v_me
    and x.school_submission_id = p_submission;

  v_total := public.total_xp(v_me);

  return jsonb_build_object(
    'xp_awarded', v_amount,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total)
  );
end;
$$;

revoke execute on function public.elda_skola_celebrate_submission_xp(uuid) from public, anon;
grant execute on function public.elda_skola_celebrate_submission_xp(uuid) to authenticated;
