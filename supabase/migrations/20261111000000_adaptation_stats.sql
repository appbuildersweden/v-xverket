-- Elda Skola – integritetssäker statistik för anpassningar.
--
-- Adminpanelen ska kunna se att anpassningsflödet används utan att läsa
-- elevinnehållet. Därför returneras bara antal och senaste uppdatering, aldrig
-- elev, rubrik, beskrivning eller stödinsatser. Anpassningstexten är fortsatt
-- begränsad till de lärare som undervisar eleven (se school_adaptations_select).
--
-- Migrationen är additiv och ändrar ingen data.

create or replace function public.elda_skola_adaptation_stats()
returns table (
  total bigint,
  active bigint,
  completed bigint,
  students bigint,
  last_updated timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) as total,
    count(*) filter (where a.status = 'aktiv') as active,
    count(*) filter (where a.status = 'avslutad') as completed,
    count(distinct a.student_id) as students,
    max(a.updated_at) as last_updated
  from public.school_adaptations a
  where public.is_admin();
$$;

revoke all on function public.elda_skola_adaptation_stats() from public, anon;
grant execute on function public.elda_skola_adaptation_stats() to authenticated;
