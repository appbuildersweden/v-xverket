-- Växverket — dokument: rätt åtkomst och koppling till uppgifter.
--
-- 1. can_see_document använde can_see_user, som också är sant för klasskamrater.
--    Då kunde en elev läsa en klasskamrats privata fil, och material som en
--    lärare delat med en enskild elev kunde läsas av hela klassen. Behörigheten
--    bygger nu på exakt rätt relation: ägaren, eleven materialet delats med,
--    klassen materialet delats med, administratören, eller personal som är
--    kopplad till eleven. Klasskamrater räknas aldrig hit.
--
-- 2. Dokument kan kopplas till en uppgift: material som hör till uppgiften och
--    filer som en elev lämnar in. Kolumnen är ett tillägg — ingen befintlig rad
--    ändras, och kopplingen påverkar inte vilka som får läsa filen.
--
-- Migreringen är idempotent och rör ingen data.

-- ---------------------------------------------------------------- personal
-- Personal som är kopplad till eleven: speciallärare via student_links eller
-- lärare för elevens klass, samt administratör. Klasskamrater räknas aldrig hit
-- (det är skillnaden mot can_see_user).
create or replace function public.is_staff_for_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and (
       public.is_admin()
       or public.teaches_student(p_user)
       or exists (
         select 1
         from public.student_links l
         where l.elev_id = p_user
           and l.speciallarare_id = auth.uid()
       )
     );
$$;

revoke execute on function public.is_staff_for_user(uuid) from public, anon;
grant execute on function public.is_staff_for_user(uuid) to authenticated;

-- ---------------------------------------------------------------- dokument
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
        -- Delat med mig som elev (enskilt), eller med min klass.
        or d.student_id = auth.uid()
        or (d.class_id is not null and public.is_class_member(d.class_id))
        -- Personal som är kopplad till eleven ser elevens filer (t.ex. inlämningar).
        or (d.student_id is not null and public.is_staff_for_user(d.student_id))
      )
  );
$$;

revoke execute on function public.can_see_document(uuid) from public, anon;
grant execute on function public.can_see_document(uuid) to authenticated;

-- ------------------------------------------------------- koppling till uppgift
alter table public.documents
  add column if not exists task_id uuid references public.student_tasks (id) on delete set null;

create index if not exists documents_task_idx
  on public.documents (task_id, created_at);

-- Ett dokument får bara kopplas till en uppgift man själv har rätt att se.
-- Regeln läggs till i den befintliga insert-policyn (samma villkor som förut,
-- plus kravet på uppgiften).
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert"
  on public.documents for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      public.is_staff()
      or student_id = auth.uid()
    )
    and (task_id is null or public.can_see_student_task(task_id))
  );

-- Ägaren (och admin) får uppdatera metadata och uppgiftskoppling. Ägarkontrollen
-- är densamma som förut; bara uppgiftskopplingen är ny.
drop policy if exists "documents_owner_update" on public.documents;
create policy "documents_owner_update"
  on public.documents for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (
    (owner_id = auth.uid() or public.is_admin())
    and (task_id is null or public.can_see_student_task(task_id))
  );
