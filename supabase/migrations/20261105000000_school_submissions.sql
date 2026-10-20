-- Elda Skola – individuella inlämningar per elev.
--
-- Den befintliga student_tasks-raden är uppgiften (en klassuppgift eller en
-- uppgift till en enskild elev). Här ligger varje elevs eget svar, status,
-- inlämningstid och lärarens återkoppling. Därmed blandas aldrig två elevers
-- svar, och en klasstilldelad uppgift kan ha en inlämning per elev.
--
-- All skrivning går genom serverfunktionerna längst ned. Det finns medvetet
-- inga insert/update/delete-policyer för klienten: en elev kan inte ändra sin
-- status till "granskad" eller skriva i en annan elevs rad ens med en direkt
-- PostgREST-förfrågan.

create table if not exists public.school_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.student_tasks (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  -- Klassen sparas som en kontrolluppgift. Behörigheten avgörs fortfarande av
  -- uppgiften och medlemskapet, aldrig av det här fältet.
  class_id uuid references public.classes (id) on delete set null,
  content text,
  status text not null default 'utkast'
    check (status in ('utkast', 'inlamnad', 'aterlamnad', 'granskad')),
  feedback text,
  feedback_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- En elev kan bara ha en aktiv inlämningsrad per uppgift. Upprepade anrop
  -- uppdaterar samma rad i stället för att skapa dubbletter.
  constraint school_submissions_task_student_key unique (task_id, student_id),
  constraint school_submissions_content_length
    check (content is null or char_length(content) <= 20000),
  constraint school_submissions_feedback_length
    check (feedback is null or char_length(feedback) <= 10000)
);

create index if not exists school_submissions_task_idx
  on public.school_submissions (task_id, status);
create index if not exists school_submissions_student_idx
  on public.school_submissions (student_id, status, updated_at desc);
create index if not exists school_submissions_class_idx
  on public.school_submissions (class_id, updated_at desc);

alter table public.school_submissions enable row level security;

-- En elev ser bara sin egen rad. Lärare som undervisar eleven, kopplad
-- speciallärare och admin ser raden. Klasskamrater ser den aldrig.
drop policy if exists "school_submissions_select" on public.school_submissions;
create policy "school_submissions_select"
  on public.school_submissions for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.is_staff_for_user(student_id)
  );

-- Inga skrivpolicyer. Allt går via elda_skola_save_submission och
-- elda_skola_review_submission nedan.

revoke all on public.school_submissions from anon;
grant select on public.school_submissions to authenticated;

-- ================================================================
-- Hjälpfunktioner
-- ================================================================

/**
 * Sant om uppgiften är publicerad och faktiskt tilldelad p_student.
 * En klasstilldelad uppgift kräver elevmedlemskap i klassen. En enskild
 * uppgift kräver att eleven är mottagaren, även om eleven också är med i
 * klassen.
 */
create or replace function public.elda_skola_task_assigned_to(
  p_task uuid,
  p_student uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_tasks t
    where t.id = p_task
      and t.published
      and t.archived_at is null
      and (
        t.student_id = p_student
        or (
          t.student_id is null
          and t.class_id is not null
          and exists (
            select 1
            from public.class_members m
            join public.profiles p on p.id = m.user_id
            where m.class_id = t.class_id
              and m.user_id = p_student
              and m.member_role = 'elev'
              and p.role = 'elev'
              and p.active
              and coalesce(p.account_type, 'skola') <> 'privat'
          )
        )
      )
  );
$$;

revoke execute on function public.elda_skola_task_assigned_to(uuid, uuid) from public, anon;
grant execute on function public.elda_skola_task_assigned_to(uuid, uuid) to authenticated;

-- ================================================================
-- Elevens spara/inlämna
-- ================================================================

/**
 * Sparar ett utkast eller lämnar in elevens eget svar.
 *
 * Statusövergångar:
 *   (ingen rad) / utkast / återlämnad  -> utkast eller inlämnad
 *   inlämnad                            -> låst (ett upprepat inlämningsanrop
 *                                          returnerar samma rad oförändrad)
 *   granskad                            -> låst
 *
 * En elev kan alltså komplettera efter att läraren har återlämnat uppgiften,
 * men inte skriva om ett svar som redan ligger hos läraren.
 */
create or replace function public.elda_skola_save_submission(
  p_task uuid,
  p_content text,
  p_status text default 'utkast'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_task public.student_tasks%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'utkast')));
  v_content text := nullif(trim(coalesce(p_content, '')), '');
  v_sub public.school_submissions%rowtype;
  v_existing public.school_submissions%rowtype;
  v_has_file boolean := false;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;

  select * into v_profile from public.profiles where id = v_me;
  if not found
     or v_profile.role <> 'elev'
     or not v_profile.active
     or coalesce(v_profile.account_type, 'skola') = 'privat' then
    raise exception 'Bara aktiva skolelever kan lämna in uppgifter.';
  end if;

  if v_status not in ('utkast', 'inlamnad') then
    raise exception 'Ogiltig status för en inlämning.';
  end if;
  if v_content is not null and char_length(v_content) > 20000 then
    raise exception 'Inlämningen är för lång (max 20 000 tecken).';
  end if;

  select * into v_task from public.student_tasks where id = p_task;
  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;
  if not v_task.published or v_task.archived_at is not null then
    raise exception 'Uppgiften är inte publicerad.';
  end if;
  if not public.elda_skola_task_assigned_to(p_task, v_me) then
    raise exception 'Uppgiften är inte tilldelad dig.';
  end if;

  -- Atomisk upsert: uniknyckeln (task_id, student_id) förhindrar dubbletter
  -- även om två flikar sparar samtidigt. WHERE-villkoret gör att en rad som
  -- redan är inlämnad eller granskad inte kan skrivas över.
  insert into public.school_submissions
    (task_id, student_id, class_id, content, status, submitted_at)
  values
    (p_task, v_me, v_task.class_id, v_content, v_status,
     case when v_status = 'inlamnad' then now() else null end)
  on conflict (task_id, student_id) do update
    set content = excluded.content,
        status = excluded.status,
        -- En ny inlämning får den tid då eleven faktiskt lämnade in igen.
        submitted_at = case
          when excluded.status = 'inlamnad' then now()
          else public.school_submissions.submitted_at
        end,
        returned_at = case
          when excluded.status = 'inlamnad' then null
          else public.school_submissions.returned_at
        end,
        updated_at = now()
    where public.school_submissions.status in ('utkast', 'aterlamnad')
  returning * into v_sub;

  if not found then
    select * into v_existing
    from public.school_submissions
    where task_id = p_task and student_id = v_me;

    -- Dubbelklick på "Lämna in": första anropet vann. Det andra ska inte
    -- skriva över något, men inte heller visas som ett tekniskt fel.
    if found and v_existing.status = 'inlamnad' and v_status = 'inlamnad' then
      v_sub := v_existing;
    else
      raise exception 'Inlämningen är låst. Läraren måste återlämna den innan du kan ändra svaret.';
    end if;
  end if;

  -- Ett inlämnat svar får vara tomt bara om eleven har en bifogad fil.
  if v_sub.status = 'inlamnad' and v_sub.content is null then
    select exists (
      select 1
      from public.documents d
      where d.task_id = p_task
        and d.student_id = v_me
        and d.owner_id = v_me
    ) into v_has_file;
    if not v_has_file then
      raise exception 'Skriv ett svar eller bifoga en fil innan du lämnar in.';
    end if;
  end if;

  if v_sub.status = 'inlamnad' then
    perform public.log_audit(
      'school.submission.submitted',
      'school_submission',
      v_sub.id::text,
      jsonb_build_object('task_id', p_task, 'student_id', v_me)
    );
  end if;

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
    'updated_at', v_sub.updated_at
  );
end;
$$;

revoke execute on function public.elda_skola_save_submission(uuid, text, text) from public, anon;
grant execute on function public.elda_skola_save_submission(uuid, text, text) to authenticated;

-- ================================================================
-- Lärarens återkoppling
-- ================================================================

/**
 * Sparar lärarens återkoppling och markerar inlämningen som granskad eller
 * återlämnad för komplettering. Bara en lärare som undervisar eleven (eller
 * uppgiftens skapare/admin) får göra detta.
 */
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

  perform public.log_audit(
    case when v_status = 'aterlamnad'
         then 'school.submission.returned'
         else 'school.submission.reviewed'
    end,
    'school_submission',
    v_sub.id::text,
    jsonb_build_object('task_id', v_sub.task_id, 'student_id', v_sub.student_id)
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
    'updated_at', v_sub.updated_at
  );
end;
$$;

revoke execute on function public.elda_skola_review_submission(uuid, text, text) from public, anon;
grant execute on function public.elda_skola_review_submission(uuid, text, text) to authenticated;

-- ================================================================
-- Dokument: elevens egna filer får inte läcka till klasskamrater
-- ================================================================
--
-- Den tidigare regeln gav alla klassmedlemmar läsning när class_id var satt,
-- även för en elevs egen inlämning. Nu avgör student_id först: en fil som är
-- knuten till en elev är bara för eleven, undervisande personal och admin.
-- Klassdelat material (student_id null) fungerar som förut.

create or replace function public.can_see_document(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_id
      and (
        d.owner_id = auth.uid()
        or public.is_admin()
        -- Riktad till mig som elev, eller till en elev jag ansvarar för.
        or d.student_id = auth.uid()
        or (d.student_id is not null and public.is_staff_for_user(d.student_id))
        -- Klassmaterial får bara klassmedlemmar se när det inte är knutet till
        -- en enskild elev.
        or (d.student_id is null and d.class_id is not null and public.is_class_member(d.class_id))
        or (d.student_id is null and d.task_id is not null and public.can_see_student_task(d.task_id))
      )
  );
$$;

revoke execute on function public.can_see_document(uuid) from public, anon;
grant execute on function public.can_see_document(uuid) to authenticated;

-- ================================================================
-- Backfill av befintliga individuella uppgifter
-- ================================================================
--
-- Klassuppgifter hade tidigare ett enda gemensamt svar. Det kan inte på ett
-- säkert sätt tillskrivas en enskild elev, så de lämnas orörda i student_tasks.
-- Individuella uppgifter (student_id satt) är däremot entydiga och flyttas in
-- som elevens inlämning så att ingen befintlig data försvinner.

insert into public.school_submissions
  (task_id, student_id, class_id, content, status, feedback, feedback_at,
   reviewed_by, submitted_at, created_at, updated_at)
select
  t.id,
  t.student_id,
  t.class_id,
  nullif(trim(coalesce(t.submission, '')), ''),
  case
    when t.followed_up_at is not null then 'granskad'
    when t.submitted_at is not null then 'inlamnad'
    else 'utkast'
  end,
  t.follow_up_note,
  t.followed_up_at,
  case when t.followed_up_at is not null then t.created_by else null end,
  t.submitted_at,
  t.created_at,
  t.updated_at
from public.student_tasks t
where t.student_id is not null
  and (
    t.submission is not null
    or t.submitted_at is not null
    or t.followed_up_at is not null
    or t.status in ('pagar', 'klar')
  )
on conflict (task_id, student_id) do nothing;
