-- Elda Skola – arkivera klasser i stället för att radera dem.
--
-- Arkivering bevarar elever, uppgifter och inlämningar. Klassens medlemmar och
-- historik rörs inte; en arkiverad klass kan återaktiveras.

create or replace function public.elda_skola_admin_set_class_archived(
  p_class uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får arkivera klasser.';
  end if;
  if not exists (select 1 from public.classes where id = p_class) then
    raise exception 'Klassen hittades inte.';
  end if;

  update public.classes
     set archived = coalesce(p_archived, false)
   where id = p_class;

  perform public.log_audit(
    'school.class.archived',
    'class',
    p_class::text,
    jsonb_build_object('archived', coalesce(p_archived, false))
  );
end;
$$;

revoke all on function public.elda_skola_admin_set_class_archived(uuid, boolean) from public, anon;
grant execute on function public.elda_skola_admin_set_class_archived(uuid, boolean) to authenticated;
