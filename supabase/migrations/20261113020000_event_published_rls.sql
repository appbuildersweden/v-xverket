-- Elda Skola – utkast i planeringen ska inte läcka till klassen.
--
-- Den tidigare select-policyn släppte igenom alla poster till klassens
-- medlemmar, även de som admin hade sparat som utkast. Nu krävs publicerad
-- status för alla utom skaparen och administratörer.

drop policy if exists "school_events_select" on public.school_events;
create policy "school_events_select"
  on public.school_events for select
  to authenticated
  using (
    (
      created_by = auth.uid()
      or public.is_admin()
      or (class_id is not null and public.is_class_member(class_id))
    )
    and (published or created_by = auth.uid() or public.is_admin())
  );
