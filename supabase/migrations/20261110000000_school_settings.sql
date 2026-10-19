-- Elda Skola – skolövergripande inställningar.
--
-- Tabellen har alltid exakt en rad (id = 1). Läsning är öppen för inloggade
-- användare eftersom värdena visas i gränssnittet (skolans namn), men bara
-- administratörer får ändra dem. Ingen klient kan skapa eller radera raden.
--
-- Migrationen är additiv och rör ingen befintlig data.

create table if not exists public.school_settings (
  id smallint primary key default 1 check (id = 1),
  school_name text not null default 'Elda Skola'
    check (char_length(btrim(school_name)) between 2 and 80),
  contact_email text
    check (
      contact_email is null
      or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.school_settings (id) values (1)
on conflict (id) do nothing;

alter table public.school_settings enable row level security;

drop policy if exists "school_settings_select" on public.school_settings;
create policy "school_settings_select"
  on public.school_settings for select
  to authenticated
  using (true);

-- Ingen insert- eller delete-policy: raden skapas av migrationen och tas aldrig
-- bort från klienten.
drop policy if exists "school_settings_admin_update" on public.school_settings;
create policy "school_settings_admin_update"
  on public.school_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

/** Läser skolans inställningar. Bara de fält gränssnittet behöver. */
create or replace function public.elda_skola_school_settings()
returns table (
  school_name text,
  contact_email text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.school_name, s.contact_email, s.updated_at
  from public.school_settings s
  where s.id = 1;
$$;

revoke all on function public.elda_skola_school_settings() from public, anon;
grant execute on function public.elda_skola_school_settings() to authenticated;

/**
 * Sparar skolans inställningar. Rollen kontrolleras i databasen, inte i
 * klienten, och värdena valideras igen här även om formuläret redan gjort det.
 */
create or replace function public.elda_skola_save_school_settings(
  p_school_name text,
  p_contact_email text default null
)
returns table (
  school_name text,
  contact_email text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_school_name, ''));
  v_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Ej inloggad.';
  end if;
  if not public.is_admin() then
    raise exception 'Endast administratörer får ändra skolans inställningar.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Skolans namn måste vara 2–80 tecken.';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Kontaktadressen måste vara en giltig e-postadress.';
  end if;

  update public.school_settings
     set school_name = v_name,
         contact_email = v_email,
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1;

  perform public.log_audit('school.settings.saved', 'school', 'settings');

  return query
    select s.school_name, s.contact_email, s.updated_at
    from public.school_settings s
    where s.id = 1;
end;
$$;

revoke all on function public.elda_skola_save_school_settings(text, text) from public, anon;
grant execute on function public.elda_skola_save_school_settings(text, text) to authenticated;
