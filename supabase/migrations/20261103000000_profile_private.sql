-- Elda: privata profiluppgifter och kontaktuppgifter.
--
-- Namn, roll, klass och skolplacering ligger kvar i profiles och class_members
-- och administreras av skolan. Här ligger bara uppgifter som användaren själv
-- äger: kontaktuppgifter. Tabellen är medvetet separat från profiles, eftersom
-- profiles redan kan läsas av klasskamrater och personal via
-- profiles_select_linked. Kontaktuppgifter får aldrig följa med i den läsningen.
--
-- Ingen klient skriver direkt till tabellen. Ändringen går genom
-- update_my_contact, som bara rör den inloggade användarens egen rad och
-- validerar värdena på servern. Det finns därför ingen insert/update-policy.

create table if not exists public.profile_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  contact_email text,
  phone text,
  mobile text,
  street_address text,
  postal_address text,
  alt_contact text,
  updated_at timestamptz not null default now(),

  constraint profile_private_contact_email_length
    check (contact_email is null or char_length(contact_email) between 3 and 254),
  constraint profile_private_phone_length
    check (phone is null or char_length(phone) between 1 and 40),
  constraint profile_private_mobile_length
    check (mobile is null or char_length(mobile) between 1 and 40),
  constraint profile_private_street_length
    check (street_address is null or char_length(street_address) between 1 and 120),
  constraint profile_private_postal_length
    check (postal_address is null or char_length(postal_address) between 1 and 120),
  constraint profile_private_alt_length
    check (alt_contact is null or char_length(alt_contact) between 1 and 200)
);

alter table public.profile_private enable row level security;

-- Endast ägaren får läsa raden. Klasskamrater, lärare och administratörer får
-- inte läsa kontaktuppgifterna via appen. Skolans eventuella behov av uppgiften
-- hanteras i så fall av en separat, granskad administrativ väg.
drop policy if exists "profile_private_select_own" on public.profile_private;
create policy "profile_private_select_own"
  on public.profile_private for select
  to authenticated
  using (user_id = auth.uid());

-- Inga skrivpolicies: all skrivning sker i funktionen nedan.

revoke all on public.profile_private from anon;
grant select on public.profile_private to authenticated;

/**
 * Sparar den inloggade användarens egna kontaktuppgifter.
 *
 * Funktionen tar aldrig emot ett användar-id. Den använder auth.uid(), vilket
 * gör det omöjligt att ändra någon annans rad även om klienten manipulerar
 * anropet. Tomma värden sparas som null, och e-postadressen måste se ut som en
 * e-postadress. Roll, namn, klass och skolplacering kan inte ändras här.
 */
create or replace function public.update_my_contact(
  p_contact_email text default null,
  p_phone text default null,
  p_mobile text default null,
  p_street_address text default null,
  p_postal_address text default null,
  p_alt_contact text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active boolean;
  v_email text := nullif(trim(coalesce(p_contact_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_mobile text := nullif(trim(coalesce(p_mobile, '')), '');
  v_street text := nullif(trim(coalesce(p_street_address, '')), '');
  v_postal text := nullif(trim(coalesce(p_postal_address, '')), '');
  v_alt text := nullif(trim(coalesce(p_alt_contact, '')), '');
begin
  if v_uid is null then
    raise exception 'Du behöver vara inloggad för att spara kontaktuppgifter.';
  end if;

  select p.active into v_active from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'Profilen hittades inte.';
  end if;
  if not coalesce(v_active, true) then
    raise exception 'Kontot är inaktiverat. Kontakta administratören.';
  end if;

  if v_email is not null
     and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-postadressen är inte giltig.';
  end if;
  if v_email is not null and char_length(v_email) > 254 then
    raise exception 'E-postadressen är för lång.';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'Telefonnumret är för långt.';
  end if;
  if v_mobile is not null and char_length(v_mobile) > 40 then
    raise exception 'Mobilnumret är för långt.';
  end if;
  if v_street is not null and char_length(v_street) > 120 then
    raise exception 'Gatuadressen är för lång.';
  end if;
  if v_postal is not null and char_length(v_postal) > 120 then
    raise exception 'Postadressen är för lång.';
  end if;
  if v_alt is not null and char_length(v_alt) > 200 then
    raise exception 'Den alternativa kontaktuppgiften är för lång.';
  end if;

  insert into public.profile_private (
    user_id, contact_email, phone, mobile, street_address, postal_address,
    alt_contact, updated_at
  ) values (
    v_uid, v_email, v_phone, v_mobile, v_street, v_postal, v_alt, now()
  )
  on conflict (user_id) do update set
    contact_email = excluded.contact_email,
    phone = excluded.phone,
    mobile = excluded.mobile,
    street_address = excluded.street_address,
    postal_address = excluded.postal_address,
    alt_contact = excluded.alt_contact,
    updated_at = now();

  return jsonb_build_object(
    'contactEmail', v_email,
    'phone', v_phone,
    'mobile', v_mobile,
    'streetAddress', v_street,
    'postalAddress', v_postal,
    'altContact', v_alt
  );
end;
$$;

revoke all on function public.update_my_contact(text, text, text, text, text, text) from public;
grant execute on function public.update_my_contact(text, text, text, text, text, text) to authenticated;

comment on table public.profile_private is
  'Användarens egna kontaktuppgifter. Separat från profiles så att klasskamrater inte kan läsa dem. Skrivs endast via update_my_contact.';
