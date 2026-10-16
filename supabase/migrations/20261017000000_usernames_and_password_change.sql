-- Elda: automatiska användarnamn (e + 3 + 2 + NN) och tvingat lösenordsbyte.
--
-- Allt som rör konton avgörs serversidigt. Klienten kan läsa sin egen profil
-- men aldrig skriva must_change_password eller rollen.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists must_change_password boolean not null default false;

-- Befintliga konton ska inte tvingas byta lösenord av misstag.
update public.profiles set must_change_password = false where must_change_password is null;

-- ----------------------------------------------------------------
-- Normalisering av svenska tecken (å/ä/ö -> a/a/o, é -> e osv.)
-- ----------------------------------------------------------------

create or replace function public.username_letters(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(
    regexp_replace(
      translate(
        lower(coalesce(p_text, '')),
        'áàâãäåāăąéèêëēĕėęěíìîïīĭįıóòôõöøōŏőúùûüūŭůűųýÿñçšžđðþæœ',
        'aaaaaaaaaaeeeeeeeeeeeeiiiiiiiiioooooooooooooouuuuuuuuuuyncszddpthao'
      ),
      '[^a-z0-9]', '', 'g'
    ),
    ''
  );
$$;

-- Skolans fastställda namn. Grundregeln är e + 3 bokstäver av förnamnet + 2 av
-- efternamnet, men för dessa namn gäller skolans egna förkortningar. Samma lista
-- finns i admin-users-funktionen — ändra på båda ställena.
create or replace function public.username_override(p_first text, p_last text)
returns text
language sql
immutable
as $$
  select case public.username_letters(p_first) || '|' || public.username_letters(p_last)
    when 'jens|turesson'  then 'ejentu'
    when 'anna|andersson' then 'eannaad'
    when 'lisa|karlsson'  then 'elisaka'
    when 'erik|nilsson'   then 'eerikni'
    else null
  end;
$$;

-- Grundregeln: 3 bokstäver av förnamnet + 2 av efternamnet. Är en del kortare
-- fylls den ut med 'x' så att resultatet alltid blir giltigt (aldrig tomt).
create or replace function public.username_base(p_first text, p_last text)
returns text
language plpgsql
immutable
as $$
declare
  f text;
  l text;
  o text;
begin
  o := public.username_override(p_first, p_last);
  if o is not null then
    return o;
  end if;

  f := public.username_letters(p_first);
  l := public.username_letters(p_last);

  -- 'e' + 3 + 2 = 6 tecken, alltid inom användarnamnsregeln.
  if length(f) = 0 and length(l) = 0 then
    return 'eelexx';
  end if;

  f := rpad(left(f, 3), 3, 'x');
  l := rpad(left(l, 2), 2, 'x');

  return 'e' || f || l;
end;
$$;

-- ----------------------------------------------------------------
-- Nästa lediga användarnamn: ejentu01, ejentu02, ...
-- ----------------------------------------------------------------

create or replace function public.next_username(p_first text, p_last text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base text := public.username_base(p_first, p_last);
  n int;
begin
  -- Max 99 enligt tvåsiffrigt löpnummer; är alla tagna används ett längre
  -- löpnummer i stället för att skapa ett ogiltigt namn.
  for n in 1..99 loop
    if not exists (
      select 1 from public.profiles where username = base || lpad(n::text, 2, '0')
    ) then
      return base || lpad(n::text, 2, '0');
    end if;
  end loop;

  for n in 100..9999 loop
    if not exists (
      select 1 from public.profiles where username = base || n::text
    ) then
      return base || n::text;
    end if;
  end loop;

  raise exception 'Inga lediga användarnamn för %', base;
end;
$$;

grant execute on function public.next_username(text, text) to authenticated;
grant execute on function public.username_base(text, text) to authenticated;

-- ----------------------------------------------------------------
-- Administratörens konto (ejentu01) skapas/reserveras av den säkra
-- engångsskriptvägen: scripts/skapa-admin.mjs. Den kräver service role-nyckeln
-- och körs en gång av ägaren — lösenordet hamnar aldrig i kod eller loggar.
-- ----------------------------------------------------------------
