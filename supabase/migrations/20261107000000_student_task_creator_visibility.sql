-- Läraren måste kunna läsa uppgiften direkt när den skapas.
--
-- Den tidigare policyn krävde can_see_student_task(id) även för skaparen.
-- Den funktionen är STABLE och läser tabellen i den aktuella command-snapshoten,
-- vilket innebär att den inte ser den rad som precis infogats. INSERT ... RETURNING
-- (som klienten använder för att få uppgiftens id) kontrollerar SELECT-policyn på
-- den nya raden och misslyckades därför med "new row violates row-level security
-- policy" – trots att insert-policyn släppte igenom.
--
-- Skaparens eget ägarskap kontrolleras nu direkt på raden. Det gör att utkast
-- fortfarande bara syns för sin skapare, medan alla andra måste passera
-- can_see_student_task och publiceringsregeln som förut.

drop policy if exists "student_tasks_select" on public.student_tasks;
create policy "student_tasks_select"
  on public.student_tasks for select
  to authenticated
  using (
    created_by = auth.uid()
    or (
      public.can_see_student_task(id)
      and (published or public.is_admin())
    )
  );

comment on policy "student_tasks_select" on public.student_tasks is
  'Skaparen ser alltid sina egna uppgifter (även utkast och nyinfogade rader). Övriga ser publicerade uppgifter de har behörighet till.';
