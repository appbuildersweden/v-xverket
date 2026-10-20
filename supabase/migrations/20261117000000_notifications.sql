-- ------------------------------------------------------------------
-- Gemensam notifikationstjänst för Elda Skola.
--
-- Notifikationer skapas enbart av databas-triggers från verkliga händelser.
-- Klienter kan varken skapa, ändra eller ta bort rader; de kan bara läsa sina
-- egna rader via RLS och markera dem som lästa via definierade funktioner.
-- Mottagarna beräknas i databasen, aldrig i frontend.
-- ------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'new_message', 'new_assignment', 'assignment_feedback', 'announcement_published'
  )),
  title text not null check (char_length(title) between 1 and 200),
  body text check (body is null or char_length(body) <= 500),
  -- Appens sidnyckel (t.ex. 'uppgifter') och den källa notifikationen gäller.
  target_page text not null check (char_length(target_page) between 1 and 60),
  source_id uuid,
  -- Dubblettskydd: samma händelse ger aldrig fler än en rad per mottagare.
  source_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, read_at, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (recipient_id = auth.uid());

-- Inga insert-, update- eller delete-policies för klienter.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- Intern hjälpare: skapar en notifikation, eller gör inget om den redan finns.
create or replace function public.notify_user(
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_target_page text,
  p_source_id uuid,
  p_source_key text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications
    (recipient_id, kind, title, body, target_page, source_id, source_key)
  values
    (p_recipient, p_kind, p_title, nullif(p_body, ''), p_target_page, p_source_id, p_source_key)
  on conflict (source_key) do nothing;
$$;

revoke all on function public.notify_user(uuid, text, text, text, text, uuid, text) from public;

-- ------------------------------------------------------------ RPC:er
create or replace function public.elda_skola_unread_notifications()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer from public.notifications
  where recipient_id = auth.uid() and read_at is null;
$$;

create or replace function public.elda_skola_mark_notification_read(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  update public.notifications
     set read_at = now()
   where id = p_id and recipient_id = auth.uid() and read_at is null;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function public.elda_skola_mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  update public.notifications
     set read_at = now()
   where recipient_id = auth.uid() and read_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.elda_skola_unread_notifications() from public;
revoke all on function public.elda_skola_mark_notification_read(uuid) from public;
revoke all on function public.elda_skola_mark_all_notifications_read() from public;
grant execute on function public.elda_skola_unread_notifications() to authenticated;
grant execute on function public.elda_skola_mark_notification_read(uuid) to authenticated;
grant execute on function public.elda_skola_mark_all_notifications_read() to authenticated;

-- ------------------------------------------------------- Händelse-triggers

-- Nytt meddelande: en rad per mottagare i school_message_recipients (avsändaren undantas).
create or replace function public.notify_school_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
begin
  select sender_id into v_sender from public.school_messages where id = new.message_id;
  if new.user_id is distinct from v_sender then
    perform public.notify_user(
      new.user_id, 'new_message', 'Ett nytt meddelande har kommit',
      null, 'meddelanden', new.message_id,
      'new_message:' || new.message_id || ':' || new.user_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists school_message_recipients_notify on public.school_message_recipients;
create trigger school_message_recipients_notify
  after insert on public.school_message_recipients
  for each row execute function public.notify_school_message_recipient();

-- Ny uppgift: till en namngiven elev, annars till eleverna i klassen (ej skaparen).
create or replace function public.notify_new_student_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := 'Ny uppgift: ' || coalesce(nullif(new.subject, ''), 'Övrigt');
begin
  if new.student_id is not null and new.student_id is distinct from new.created_by then
    perform public.notify_user(
      new.student_id, 'new_assignment', v_title, new.title,
      'uppgifter', new.id, 'new_assignment:' || new.id || ':' || new.student_id
    );
  end if;
  if new.class_id is not null then
    insert into public.notifications
      (recipient_id, kind, title, body, target_page, source_id, source_key)
    select m.user_id, 'new_assignment', v_title, new.title, 'uppgifter', new.id,
           'new_assignment:' || new.id || ':' || m.user_id
      from public.class_members m
     where m.class_id = new.class_id
       and m.member_role = 'elev'
       and m.user_id is distinct from new.created_by
       and m.user_id is distinct from new.student_id
    on conflict (source_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists student_tasks_notify on public.student_tasks;
create trigger student_tasks_notify
  after insert on public.student_tasks
  for each row execute function public.notify_new_student_task();

-- Återkoppling: när läraren granskar eller återlämnar en inlämning med kommentar.
create or replace function public.notify_submission_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_title text;
begin
  select title into v_task_title from public.student_tasks where id = new.task_id;
  perform public.notify_user(
    new.student_id, 'assignment_feedback', 'Din uppgift har fått återkoppling',
    v_task_title, 'uppgifter', new.task_id,
    'assignment_feedback:' || new.id || ':' || new.status || ':' || coalesce(new.feedback_at, new.updated_at)::text
  );
  return new;
end;
$$;

drop trigger if exists school_submissions_feedback_notify on public.school_submissions;
create trigger school_submissions_feedback_notify
  after update on public.school_submissions
  for each row
  when (
    new.status in ('granskad', 'aterlamnad')
    and new.feedback is not null
    and (old.feedback is distinct from new.feedback or old.status is distinct from new.status)
  )
  execute function public.notify_submission_feedback();

-- Ny information i klassen: till klassens elever (ej författaren).
create or replace function public.notify_class_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications
    (recipient_id, kind, title, body, target_page, source_id, source_key)
  select m.user_id, 'announcement_published', 'Ny information har publicerats för din klass',
         new.title, 'meddelanden', new.id, 'announcement_published:' || new.id || ':' || m.user_id
    from public.class_members m
   where m.class_id = new.class_id
     and m.user_id is distinct from new.author_id
  on conflict (source_key) do nothing;
  return new;
end;
$$;

drop trigger if exists school_announcements_notify on public.school_announcements;
create trigger school_announcements_notify
  after insert on public.school_announcements
  for each row execute function public.notify_class_announcement();

-- Realtid: idempotent tillägg i publikationen. RLS gäller även för realtid.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
