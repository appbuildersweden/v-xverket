-- Elda Skola – stäng läckan där klasskamrater kunde läsa en individuell uppgift.
--
-- Den tidigare can_see_student_task använde can_see_user, som också är sant för
-- klasskamrater. Då kunde en klasskamrat läsa en uppgift som var tilldelad en
-- annan elev – inklusive den äldre student_tasks.submission-kolumnen och
-- follow_up_note. Nu gäller:
--
--   * en klasstilldelad uppgift (student_id = null) delas med klassen
--   * en individuell uppgift (student_id satt) syns bara för eleven,
--     undervisande personal/speciallärare och admin
--
-- Migreringen är additiv och ändrar ingen data.

create or replace function public.can_see_student_task(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.student_tasks t
    where t.id = p_id
      and (
        t.created_by = auth.uid()
        or t.student_id = auth.uid()
        or public.is_admin()
        -- Individuell uppgift: bara eleven och personal som ansvarar för eleven.
        or (t.student_id is not null and public.is_staff_for_user(t.student_id))
        -- Klassuppgift: bara när uppgiften inte är knuten till en enskild elev.
        or (
          t.student_id is null
          and t.class_id is not null
          and public.is_class_member(t.class_id)
        )
      )
  );
$$;

revoke execute on function public.can_see_student_task(uuid) from public, anon;
grant execute on function public.can_see_student_task(uuid) to authenticated;
