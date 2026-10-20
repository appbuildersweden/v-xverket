-- Elda Skola – kommun på skolorna, admin-XP och butikens administration.
--
-- 1. Skolorganisationen får en kommun. Den anges när skolan skapas och syns
--    när ett konto kopplas till skolan.
-- 2. Systemadministratören kan ge och dra XP. Summan skrivs som en vanlig
--    XP-transaktion (source = 'admin_adjustment'), så saldot räknas om på
--    samma sätt som efter en uppgift. Ingen klient kan skriva XP själv.
-- 3. Administratörens översikt över XP-saldon.
--
-- Butikens köp, utrustning och produktadministration finns redan i
-- 20261101000000_shop.sql och ändras inte här.

-- ------------------------------------------------------ 1. Kommun på skolan

alter table public.school_organisations
  add column if not exists municipality text;

alter table public.school_organisations
  drop constraint if exists school_organisations_municipality_check;
alter table public.school_organisations
  add constraint school_organisations_municipality_check
  check (municipality is null or char_length(btrim(municipality)) between 2 and 80);

comment on column public.school_organisations.municipality is
  'Kommunen skolan ligger i, t.ex. "Ronneby". Används för sökning och för att visa skolans ort.';

-- Sökning på kommun ska inte behöva läsa hela tabellen.
create index if not exists school_organisations_municipality_idx
  on public.school_organisations (lower(btrim(municipality)))
  where municipality is not null;

-- ------------------------------------- 2. Organisationerna med kommun
-- Returtypen ändras, därför måste funktionerna skapas om i stället för att
-- ersättas. Rättigheterna sätts om efteråt.

drop function if exists public.elda_skola_my_organisation();
create function public.elda_skola_my_organisation()
returns table (
  id uuid,
  name text,
  municipality text,
  contact_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.municipality, o.contact_email
  from public.school_organisations o
  where o.id = public.current_school_org();
$$;

revoke all on function public.elda_skola_my_organisation() from public, anon;
grant execute on function public.elda_skola_my_organisation() to authenticated;

drop function if exists public.elda_skola_admin_organisations();
create function public.elda_skola_admin_organisations()
returns table (
  id uuid,
  name text,
  slug text,
  municipality text,
  contact_email text,
  active boolean,
  members int,
  students int,
  teachers int,
  special_teachers int,
  classes int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.slug,
    o.municipality,
    o.contact_email,
    o.active,
    (select count(*)::int from public.school_memberships m where m.organisation_id = o.id and m.left_at is null),
    (select count(*)::int from public.school_memberships m join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id and m.left_at is null and p.role = 'elev'),
    (select count(*)::int from public.school_memberships m join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id and m.left_at is null and p.role = 'lärare'),
    (select count(*)::int from public.school_memberships m join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id and m.left_at is null and p.role = 'speciallärare'),
    (select count(*)::int from public.classes c where c.organisation_id = o.id),
    o.created_at
  from public.school_organisations o
  where public.is_admin()
  order by o.active desc, o.name;
$$;

revoke all on function public.elda_skola_admin_organisations() from public, anon;
grant execute on function public.elda_skola_admin_organisations() to authenticated;

drop function if exists public.elda_skola_admin_save_organisation(uuid, text, text, text, boolean);
create function public.elda_skola_admin_save_organisation(
  p_id uuid default null,
  p_name text default null,
  p_slug text default null,
  p_contact_email text default null,
  p_active boolean default true,
  p_municipality text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_municipality text := nullif(btrim(coalesce(p_municipality, '')), '');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får hantera skolor.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Skolans namn måste vara 2–120 tecken.';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'Kortnamnet får bara innehålla a–z, siffror och bindestreck.';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Kontaktadressen måste vara en giltig e-postadress.';
  end if;
  if v_municipality is not null
     and (char_length(v_municipality) < 2 or char_length(v_municipality) > 80) then
    raise exception 'Kommunen måste vara 2–80 tecken.';
  end if;

  if p_id is null then
    insert into public.school_organisations (name, slug, municipality, contact_email, active, created_by)
    values (v_name, v_slug, v_municipality, v_email, coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.school_organisations
       set name = v_name,
           slug = v_slug,
           municipality = v_municipality,
           contact_email = v_email,
           active = coalesce(p_active, true),
           updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Skolan hittades inte.';
    end if;
  end if;

  perform public.log_audit(
    'school.organisation.saved',
    'school_organisation',
    v_id::text,
    jsonb_build_object('municipality', v_municipality)
  );

  return v_id;
end;
$$;

revoke all on function public.elda_skola_admin_save_organisation(uuid, text, text, text, boolean, text)
  from public, anon;
grant execute on function public.elda_skola_admin_save_organisation(uuid, text, text, text, boolean, text)
  to authenticated;

-- --------------------------------------------------- 3. XP från adminpanelen

/**
 * Översikt över konton och deras XP-saldo. Bara systemadministratören.
 * Sökningen matchar namn och användarnamn.
 */
create or replace function public.admin_xp_overview(
  p_query text default null,
  p_limit integer default 40
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  role text,
  active boolean,
  total_xp integer,
  level integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
    p.role,
    p.active,
    coalesce(x.total_xp, 0),
    public.level_for_xp(coalesce(x.total_xp, 0))
  from public.profiles p
  left join public.user_xp x on x.user_id = p.id
  where public.is_admin()
    and (
      p_query is null
      or btrim(p_query) = ''
      or p.username ilike '%' || btrim(p_query) || '%'
      or coalesce(p.first_name, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(p.last_name, '') ilike '%' || btrim(p_query) || '%'
    )
  order by coalesce(x.total_xp, 0) desc, p.username
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.admin_xp_overview(text, integer) from public, anon;
grant execute on function public.admin_xp_overview(text, integer) to authenticated;

/**
 * Ger (eller drar) XP för ett konto. Beloppet skrivs som en vanlig
 * XP-transaktion, så historiken, saldot och nivån uppdateras av samma
 * funktioner som används när en uppgift blir godkänd.
 *
 * Ett negativt saldo tillåts aldrig: ett för stort avdrag avvisas i stället för
 * att eleven hamnar under noll.
 */
create or replace function public.admin_grant_xp(
  p_user uuid,
  p_amount integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_total integer;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får ändra XP.';
  end if;
  if p_user is null then
    raise exception 'Välj ett konto.';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'Ange ett XP-belopp som inte är noll.';
  end if;
  if abs(p_amount) > 100000 then
    raise exception 'Ett enskilt XP-belopp får vara högst 100 000.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'Skriv en kort anledning (minst 3 tecken) – den sparas i historiken.';
  end if;

  select role into v_role from public.profiles where id = p_user;
  if v_role is null then
    raise exception 'Kontot finns inte.';
  end if;

  -- Lås saldot så att två samtidiga justeringar inte kan räkna på samma värde.
  insert into public.user_xp (user_id, total_xp) values (p_user, 0)
  on conflict (user_id) do nothing;
  perform 1 from public.user_xp where user_id = p_user for update;

  v_total := public.total_xp(p_user);
  if v_total + p_amount < 0 then
    raise exception 'Avdraget är större än saldot (%). Kontot har % XP.', p_amount, v_total;
  end if;

  insert into public.xp_transactions (user_id, amount, source, note)
  values (p_user, p_amount, 'admin_adjustment', v_reason);

  perform public.refresh_user_xp(p_user);
  v_total := public.total_xp(p_user);

  perform public.log_audit(
    'xp.adjusted',
    'profile',
    p_user::text,
    jsonb_build_object('amount', p_amount, 'reason', v_reason, 'total_xp', v_total)
  );

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user,
    'amount', p_amount,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total)
  );
end;
$$;

revoke all on function public.admin_grant_xp(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_xp(uuid, integer, text) to authenticated;

/** Den inloggades egen XP-rad. Används av butiken för att visa saldo. */
create or replace function public.my_xp()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_xp', public.total_xp(auth.uid()),
    'level', public.level_for_xp(public.total_xp(auth.uid()))
  );
$$;

revoke all on function public.my_xp() from public, anon;
grant execute on function public.my_xp() to authenticated;
