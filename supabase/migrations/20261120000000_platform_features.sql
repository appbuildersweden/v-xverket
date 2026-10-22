-- Elda Skola – funktionshantering.
--
-- Skolans administratör ska kunna stänga av XP-shoppen, avatarer/figurer och
-- Halloween-temat för eleverna. Inställningarna ligger i en enda rad
-- (`platform_features`) och gäller därför hela skolplattformen och alla
-- enheter, inte bara administratörens webbläsare.
--
-- Viktigt: avstängningen tar aldrig bort data. XP, köp, upplåsta delar och
-- sparade avatarer ligger kvar oförändrade – bara nya köp, upplåsningar och
-- byten stoppas medan funktionen är avstängd. Det är därför reglerna sitter i
-- databasen (triggers) och inte bara i gränssnittet: en klient kan inte köpa
-- eller låsa upp något genom att anropa API:t direkt.
--
-- Migrationen är additiv och rör ingen befintlig data.

-- ================================================================ 1. Tabellen

create table if not exists public.platform_features (
  id smallint primary key default 1 check (id = 1),
  shop_enabled boolean not null default true,
  avatars_enabled boolean not null default true,
  halloween_enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.platform_features is
  'Plattformens funktionsväxlar. Exakt en rad. Skrivs bara av adminfunktionen.';

insert into public.platform_features (id) values (1)
on conflict (id) do nothing;

alter table public.platform_features enable row level security;

-- Alla inloggade behöver kunna läsa växlarna för att meny och sidor ska kunna
-- anpassas. Det finns medvetet ingen insert-, update- eller delete-policy:
-- raden skapas här och ändras bara genom funktionen nedan.
drop policy if exists "platform_features_select" on public.platform_features;
create policy "platform_features_select"
  on public.platform_features for select
  to authenticated
  using (true);

-- ================================================================ 2. Läshjälp

/**
 * Sant när en funktion är påslagen. Okänt namn ger false, så ett stavfel kan
 * aldrig råka öppna något som administrationen har stängt av.
 */
create or replace function public.platform_feature_enabled(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case p_feature
        when 'shop' then f.shop_enabled
        when 'avatars' then f.avatars_enabled
        when 'halloween' then f.halloween_enabled
        else false
      end
      from public.platform_features f
      where f.id = 1
    ),
    false
  );
$$;

revoke all on function public.platform_feature_enabled(text) from public, anon;
grant execute on function public.platform_feature_enabled(text) to authenticated;

/** Växlarna som gränssnittet läser. Bara de fält som behövs. */
create or replace function public.elda_skola_platform_features()
returns table (
  shop_enabled boolean,
  avatars_enabled boolean,
  halloween_enabled boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.shop_enabled, f.avatars_enabled, f.halloween_enabled, f.updated_at
  from public.platform_features f
  where f.id = 1;
$$;

revoke all on function public.elda_skola_platform_features() from public, anon;
grant execute on function public.elda_skola_platform_features() to authenticated;

/**
 * Sparar växlarna. Rollen kontrolleras i databasen – inte i klienten – och
 * varje ändring loggas i aktivitetsloggen.
 */
create or replace function public.elda_skola_save_platform_features(
  p_shop_enabled boolean,
  p_avatars_enabled boolean,
  p_halloween_enabled boolean
)
returns table (
  shop_enabled boolean,
  avatars_enabled boolean,
  halloween_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Ej inloggad.';
  end if;
  if not public.is_admin() then
    raise exception 'Endast administratörer får ändra funktionshanteringen.';
  end if;
  if p_shop_enabled is null or p_avatars_enabled is null or p_halloween_enabled is null then
    raise exception 'Alla funktioner måste ha ett läge.';
  end if;

  update public.platform_features
     set shop_enabled = p_shop_enabled,
         avatars_enabled = p_avatars_enabled,
         halloween_enabled = p_halloween_enabled,
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1;

  perform public.log_audit('platform.features.saved', 'platform', 'features');

  return query
    select f.shop_enabled, f.avatars_enabled, f.halloween_enabled, f.updated_at
    from public.platform_features f
    where f.id = 1;
end;
$$;

revoke all on function public.elda_skola_save_platform_features(boolean, boolean, boolean)
  from public, anon;
grant execute on function public.elda_skola_save_platform_features(boolean, boolean, boolean)
  to authenticated;

-- ================================================================ 3. Spärrar

/** Köp i XP-shoppen nekas när shoppen är avstängd. */
create or replace function public.shop_purchases_feature_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_feature_enabled('shop') then
    raise exception 'XP-shoppen är avstängd av skolan.';
  end if;
  if new.category in ('avatar', 'figur') then
    if not public.platform_feature_enabled('avatars') then
      raise exception 'Avatarer och figurer är avstängda av skolan.';
    end if;
  elsif new.category = 'tema' then
    if not public.platform_feature_enabled('halloween') then
      raise exception 'Halloween-temat är avstängt av skolan.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shop_purchases_feature_guard on public.shop_purchases;
create trigger shop_purchases_feature_guard
  before insert on public.shop_purchases
  for each row execute function public.shop_purchases_feature_guard();

/** Upplåsning av avatar- och figurdeler nekas när avatarer är avstängda. */
create or replace function public.halloween_unlocks_feature_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_feature_enabled('avatars') then
    raise exception 'Avatarer och figurer är avstängda av skolan.';
  end if;
  return new;
end;
$$;

drop trigger if exists halloween_unlocks_feature_guard on public.halloween_avatar_unlocks;
create trigger halloween_unlocks_feature_guard
  before insert on public.halloween_avatar_unlocks
  for each row execute function public.halloween_unlocks_feature_guard();

/** Ett sparat utseende ändras inte när avatarer är avstängda. */
create or replace function public.halloween_looks_feature_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_feature_enabled('avatars') then
    raise exception 'Avatarer och figurer är avstängda av skolan.';
  end if;
  return new;
end;
$$;

drop trigger if exists halloween_looks_feature_guard on public.halloween_looks;
create trigger halloween_looks_feature_guard
  before insert or update on public.halloween_looks
  for each row execute function public.halloween_looks_feature_guard();

/**
 * Utrustning: ett tema kan inte aktiveras när Halloween är avstängt, och en
 * avatar eller figur kan inte bytas när avatarer är avstängda. Redan utrustade
 * föremål ligger kvar – bara nya val stoppas.
 */
create or replace function public.user_equipped_feature_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'tema' then
    if not public.platform_feature_enabled('halloween') then
      raise exception 'Halloween-temat är avstängt av skolan.';
    end if;
  elsif new.kind in ('avatar', 'figur') then
    if not public.platform_feature_enabled('avatars') then
      raise exception 'Avatarer och figurer är avstängda av skolan.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_equipped_feature_guard on public.user_equipped;
create trigger user_equipped_feature_guard
  before insert or update on public.user_equipped
  for each row execute function public.user_equipped_feature_guard();

/** Rummet hör till Halloween-området och ändras inte när det är avstängt. */
create or replace function public.halloween_room_feature_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_feature_enabled('halloween') then
    raise exception 'Halloween är avstängt av skolan.';
  end if;
  return new;
end;
$$;

drop trigger if exists halloween_room_feature_guard on public.halloween_room_items;
create trigger halloween_room_feature_guard
  before insert or update on public.halloween_room_items
  for each row execute function public.halloween_room_feature_guard();
