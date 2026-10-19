-- Elda Skola – rättar adminvakten i anpassningsstatistiken.
--
-- En aggregatfråga utan GROUP BY returnerar alltid en rad, även när filtret
-- inte matchar något. Den tidigare varianten gav därför en icke-admin en rad
-- med nollor i stället för ett tomt svar. Funktionen kontrollerar nu rollen
-- uttryckligen och returnerar inga rader alls för den som inte är admin.
--
-- Migrationen ersätter bara funktionen och rör ingen data.

create or replace function public.elda_skola_adaptation_stats()
returns table (
  total bigint,
  active bigint,
  completed bigint,
  students bigint,
  last_updated timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return;
  end if;

  return query
    select
      count(*) as total,
      count(*) filter (where a.status = 'aktiv') as active,
      count(*) filter (where a.status = 'avslutad') as completed,
      count(distinct a.student_id) as students,
      max(a.updated_at) as last_updated
    from public.school_adaptations a;
end;
$$;

revoke all on function public.elda_skola_adaptation_stats() from public, anon;
grant execute on function public.elda_skola_adaptation_stats() to authenticated;
