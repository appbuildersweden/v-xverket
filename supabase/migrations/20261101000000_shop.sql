-- Växverket/Elda – shopen: säsonger, produkter, köp och ägande.
--
-- XP är fortfarande serverns siffra. Ett köp är en rad i `xp_transactions` med
-- negativt belopp (source `shop_purchase`) plus en rad i `shop_purchases`, och
-- båda skrivs i samma funktion `shop_purchase` — atomiskt och med
-- idempotensnyckel, så att dubbelklick, omladdningar och upprepade anrop aldrig
-- kan debitera två gånger.
--
-- Klienten kan läsa men inte skriva:
--   * `shop_products`  – bara publicerade rader (admin ser alla)
--   * `seasons`        – läsbar för inloggade
--   * `shop_purchases` – bara sina egna (admin ser alla)
--   * `user_equipped`  – bara sina egna (admin ser alla)
-- All skrivning går genom security definer-funktionerna längst ned, som själva
-- kontrollerar pris, nivå, säsong, ägande och (för adminåtgärderna) att
-- anroparen är administratör.
--
-- Ägandet ligger i `shop_purchases` med en kopia av namn, pris och utseende vid
-- köptillfället. Att en administratör ändrar priset, avpublicerar produkten
-- eller avslutar säsongen rör därför aldrig ett redan genomfört köp.

-- ---------------------------------------------------------------- 1. Säsonger

create table if not exists public.seasons (
  id text primary key check (char_length(id) between 2 and 40),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.seasons is
  'Säsonger för shopen. Halloween är den första; kommande säsonger läggs till som rader.';

insert into public.seasons (id, name, description, starts_at, ends_at, active)
values (
  'halloween',
  'Halloween',
  'Pumpor, spöken och mörka skogar. Säsongens föremål går att köpa medan säsongen är aktiv.',
  '2026-10-01T00:00:00Z'::timestamptz,
  '2026-11-02T00:00:00Z'::timestamptz,
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at;

/**
 * Sant när säsongen är aktiv just nu. Serverns klocka och säsongens fönster
 * avgör — aldrig klientens.
 */
create or replace function public.season_is_active(p_season text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select s.active
       and (s.starts_at is null or s.starts_at <= now())
       and (s.ends_at is null or s.ends_at > now())
    from public.seasons s
    where s.id = p_season
  ), false);
$$;

-- ---------------------------------------------------------------- 2. Produkter

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 2 and 80),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  category text not null check (category in (
    'tema', 'figur', 'avatar', 'profilram', 'marke', 'dekoration', 'effekt'
  )),
  /** Platsen föremålet utrustas på. Null = enbart ett samlarobjekt. */
  equip_kind text check (equip_kind in (
    'tema', 'avatar', 'ram', 'marke', 'figur', 'dekoration', 'effekt'
  )),
  rarity text not null check (rarity in (
    'vanlig', 'ovanlig', 'sallsynt', 'episk', 'legendarisk'
  )),
  -- Fasta priser i XP. Aldrig pengar, aldrig slump.
  price_xp integer not null check (price_xp > 0 and price_xp <= 100000),
  min_level integer not null default 1 check (min_level between 1 and 99),
  season_id text references public.seasons (id) on delete set null,
  /** Sant = får bara köpas medan säsongen är aktiv. */
  season_only boolean not null default false,
  asset_key text,
  theme_key text,
  ornament_key text,
  published boolean not null default false,
  position integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ett UI-tema måste ha en temanyckel, annars finns ingen temafil att visa.
  constraint shop_products_theme_key_required
    check (category <> 'tema' or (theme_key is not null and char_length(theme_key) > 1))
);

comment on table public.shop_products is
  'Shopens produkter. Priser, sällsynthet och nivåkrav ändras av en administratör — inte i kod.';

create index if not exists shop_products_category_idx
  on public.shop_products (category, position);

/** Utrustningsplatsen som hör till en kategori. */
create or replace function public.equip_kind_for_category(p_category text)
returns text
language sql
immutable
as $$
  select case p_category
    when 'tema' then 'tema'
    when 'figur' then 'figur'
    when 'avatar' then 'avatar'
    when 'profilram' then 'ram'
    when 'marke' then 'marke'
    when 'dekoration' then 'dekoration'
    when 'effekt' then 'effekt'
    else null
  end;
$$;

-- ------------------------------------------------- 3. XP-transaktioner (köp)

-- Ett köp är en negativ XP-rad. Behållningen (positiva belopp) är oförändrad,
-- men noll är meningslöst och negativa belopp måste vara tillåtna.
alter table public.xp_transactions
  drop constraint if exists xp_transactions_amount_check;
alter table public.xp_transactions
  add constraint xp_transactions_amount_check check (amount <> 0);

alter table public.xp_transactions
  drop constraint if exists xp_transactions_source_check;
alter table public.xp_transactions
  add constraint xp_transactions_source_check
  check (source in ('task', 'reward_bonus', 'admin_adjustment', 'shop_purchase'));

alter table public.xp_transactions
  add column if not exists product_id uuid;

-- ---------------------------------------------------------------- 4. Köp

create table if not exists public.shop_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- On delete set null: en borttagen produkt får aldrig ta med sig ägandet.
  -- Raden nedanför behåller namn, pris och utseende från köptillfället.
  product_id uuid references public.shop_products (id) on delete set null,
  product_slug text not null,
  name text not null,
  category text not null,
  equip_kind text,
  rarity text,
  theme_key text,
  asset_key text,
  ornament_key text,
  price_xp integer not null check (price_xp > 0),
  min_level integer not null default 1,
  season_id text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  purchased_at timestamptz not null default now(),
  -- Ett föremål ägs en gång per konto …
  unique (user_id, product_id),
  -- … och ett anrop med samma nyckel får bara ge ett köp.
  unique (user_id, idempotency_key)
);

comment on table public.shop_purchases is
  'Genomförda köp: kvitto, ägande och pris vid köptillfället. Skrivs bara av shop_purchase().';

create index if not exists shop_purchases_user_idx
  on public.shop_purchases (user_id, purchased_at desc);

alter table public.xp_transactions
  drop constraint if exists xp_transactions_product_id_fkey;
alter table public.xp_transactions
  add constraint xp_transactions_product_id_fkey
  foreign key (product_id) references public.shop_products (id) on delete set null;

-- ------------------------------------------------------------ 5. Utrustning

create table if not exists public.user_equipped (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'tema', 'avatar', 'ram', 'marke', 'figur', 'dekoration', 'effekt'
  )),
  product_id uuid not null references public.shop_products (id) on delete cascade,
  equipped_at timestamptz not null default now(),
  primary key (user_id, kind)
);

comment on table public.user_equipped is
  'Aktivt tema och utrustade kosmetiska föremål per konto. Ett föremål per plats.';

-- ---------------------------------------------------------------- 6. RLS

alter table public.seasons enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_purchases enable row level security;
alter table public.user_equipped enable row level security;

drop policy if exists "seasons_select_authenticated" on public.seasons;
create policy "seasons_select_authenticated" on public.seasons
  for select to authenticated using (true);

-- Bara publicerade produkter syns. Avpublicering döljer produkten utan att röra
-- någons ägande; administratören ser allt för att kunna redigera.
drop policy if exists "shop_products_select_published" on public.shop_products;
create policy "shop_products_select_published" on public.shop_products
  for select to authenticated using (published or public.is_admin());

drop policy if exists "shop_purchases_select_own" on public.shop_purchases;
create policy "shop_purchases_select_own" on public.shop_purchases
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_equipped_select_own" on public.user_equipped;
create policy "user_equipped_select_own" on public.user_equipped
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

-- Inga insert/update/delete-policies: klienten kan inte skriva XP, priser,
-- ägande eller utrustning på egen hand. Allt går genom funktionerna nedan.

-- ---------------------------------------------------------------- 7. Köp

/**
 * Köper ett föremål för XP.
 *
 * Reglerna prövas här, på servern, och i den här ordningen:
 *   1. inloggad användare och en riktig idempotensnyckel,
 *   2. anropet är inte redan genomfört (samma nyckel ⇒ samma kvitto, ingen ny debitering),
 *   3. produkten finns, är publicerad och hör i så fall till en aktiv säsong,
 *   4. eleven äger den inte redan,
 *   5. nivåkravet är uppfyllt,
 *   6. XP-saldo räcker.
 *
 * XP-raden och kvittot skrivs i samma anrop, och användarens XP-rad låses först
 * så att två samtidiga köp inte kan spendera samma XP.
 */
create or replace function public.shop_purchase(p_product_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_product public.shop_products%rowtype;
  v_purchase public.shop_purchases%rowtype;
  v_total integer;
  v_level integer;
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'Köpet saknar en giltig nyckel och kunde inte genomföras.';
  end if;

  -- Lås XP-raden för användaren. Alla köp för samma konto blir därmed seriella,
  -- och två samtidiga anrop kan aldrig debitera samma poäng.
  insert into public.user_xp (user_id, total_xp)
  values (v_user, 0)
  on conflict (user_id) do nothing;
  perform 1 from public.user_xp where user_id = v_user for update;

  -- Redan genomfört köp med samma nyckel: svara med samma kvitto i stället för
  -- att debitera igen. Det gör upprepade nätverksanrop och dubbelklick säkra.
  select * into v_purchase
  from public.shop_purchases
  where user_id = v_user and idempotency_key = p_idempotency_key;

  if found then
    v_total := public.total_xp(v_user);
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'product_id', v_purchase.product_id,
      'slug', v_purchase.product_slug,
      'name', v_purchase.name,
      'price_xp', v_purchase.price_xp,
      'total_xp', v_total,
      'level', public.level_for_xp(v_total),
      'owned', true
    );
  end if;

  select * into v_product from public.shop_products where id = p_product_id for share;
  if not found then
    raise exception 'Föremålet finns inte.';
  end if;

  if exists (
    select 1 from public.shop_purchases
    where user_id = v_user and product_id = p_product_id
  ) then
    raise exception 'Du äger redan det här föremålet.';
  end if;

  if not v_product.published then
    raise exception 'Föremålet går inte att köpa just nu.';
  end if;

  if v_product.season_only and not public.season_is_active(v_product.season_id) then
    raise exception 'Föremålet hör till en säsong som inte är aktiv just nu.';
  end if;

  v_total := public.total_xp(v_user);
  v_level := public.level_for_xp(v_total);

  if v_level < v_product.min_level then
    raise exception 'Föremålet kräver nivå %, och du är nivå %.', v_product.min_level, v_level;
  end if;

  if v_total < v_product.price_xp then
    raise exception 'Du saknar % XP för det här köpet.', v_product.price_xp - v_total;
  end if;

  -- Två samtidiga anrop (dubbelklick, två flikar) kan båda ha passerat
  -- kontrollerna ovan. Det unika indexet avgör då: det ena köpet skrivs och det
  -- andra får en unique_violation. Vi fångar den och svarar med det köp som
  -- redan finns, i stället för att visa ett tekniskt fel — och utan att dra XP
  -- en andra gång.
  begin
    insert into public.shop_purchases (
      user_id, product_id, product_slug, name, category, equip_kind, rarity,
      theme_key, asset_key, ornament_key, price_xp, min_level, season_id, idempotency_key
    ) values (
      v_user, v_product.id, v_product.slug, v_product.name, v_product.category,
      coalesce(v_product.equip_kind, public.equip_kind_for_category(v_product.category)),
      v_product.rarity, v_product.theme_key, v_product.asset_key, v_product.ornament_key,
      v_product.price_xp, v_product.min_level, v_product.season_id, p_idempotency_key
    )
    returning * into v_purchase;
  exception when unique_violation then
    select * into v_purchase
    from public.shop_purchases
    where user_id = v_user
      and (idempotency_key = p_idempotency_key or product_id = p_product_id)
    order by purchased_at desc
    limit 1;

    if not found then
      raise;
    end if;

    v_total := public.total_xp(v_user);
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'product_id', v_purchase.product_id,
      'slug', v_purchase.product_slug,
      'name', v_purchase.name,
      'price_xp', v_purchase.price_xp,
      'total_xp', v_total,
      'level', public.level_for_xp(v_total),
      'owned', true
    );
  end;

  insert into public.xp_transactions (user_id, amount, source, product_id, note)
  values (v_user, -v_purchase.price_xp, 'shop_purchase', v_product.id, v_purchase.name);

  perform public.refresh_user_xp(v_user);
  v_total := public.total_xp(v_user);

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'product_id', v_product.id,
    'slug', v_purchase.product_slug,
    'name', v_purchase.name,
    'price_xp', v_purchase.price_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total),
    'owned', true
  );
end;
$$;

-- ------------------------------------------------------------ 8. Utrustning

/**
 * Utrusterar ett ägt föremål. Kostar aldrig XP, och kontrollerar att eleven
 * verkligen äger föremålet i `shop_purchases` innan raden skrivs.
 */
create or replace function public.shop_equip(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_purchase public.shop_purchases%rowtype;
  v_kind text;
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;

  select * into v_purchase
  from public.shop_purchases
  where user_id = v_user and product_id = p_product_id;

  if not found then
    raise exception 'Du äger inte det här föremålet.';
  end if;

  v_kind := coalesce(v_purchase.equip_kind, public.equip_kind_for_category(v_purchase.category));
  if v_kind is null then
    raise exception 'Det här föremålet är ett samlarobjekt och kan inte utrustas.';
  end if;

  insert into public.user_equipped (user_id, kind, product_id, equipped_at)
  values (v_user, v_kind, p_product_id, now())
  on conflict (user_id, kind) do update
    set product_id = excluded.product_id,
        equipped_at = now();

  return jsonb_build_object('ok', true, 'kind', v_kind, 'product_id', p_product_id, 'equipped', true);
end;
$$;

/** Tar bort utrustningen på en plats. Ett tema blir då standardtemat igen. */
create or replace function public.shop_unequip(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_kind is null or p_kind not in (
    'tema', 'avatar', 'ram', 'marke', 'figur', 'dekoration', 'effekt'
  ) then
    raise exception 'Ogiltig plats.';
  end if;

  delete from public.user_equipped where user_id = v_user and kind = p_kind;
  return jsonb_build_object('ok', true, 'kind', p_kind, 'equipped', false);
end;
$$;

-- ------------------------------------------------------ 9. Administratörens
-- Produkthanteringen kräver adminrollen (app_metadata.role = 'admin'). Det
-- räcker alltså inte att knappen är dold i gränssnittet.

create or replace function public.admin_shop_save_product(p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text := nullif(trim(coalesce(p_product ->> 'category', '')), '');
  v_rarity text := nullif(trim(coalesce(p_product ->> 'rarity', '')), '');
  v_slug text := nullif(trim(coalesce(p_product ->> 'slug', '')), '');
  v_name text := nullif(trim(coalesce(p_product ->> 'name', '')), '');
  v_price integer := coalesce((p_product ->> 'price_xp')::int, 0);
  v_min_level integer := coalesce((p_product ->> 'min_level')::int, 1);
  v_id uuid := nullif(p_product ->> 'id', '')::uuid;
  v_row public.shop_products%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får ändra shopens produkter.';
  end if;
  if v_slug is null or char_length(v_slug) < 2 then
    raise exception 'Produkten behöver ett id (slug) med minst två tecken.';
  end if;
  if v_name is null then
    raise exception 'Produkten behöver ett namn.';
  end if;
  if v_category is null or v_category not in (
    'tema', 'figur', 'avatar', 'profilram', 'marke', 'dekoration', 'effekt'
  ) then
    raise exception 'Ogiltig kategori.';
  end if;
  if v_rarity is null or v_rarity not in (
    'vanlig', 'ovanlig', 'sallsynt', 'episk', 'legendarisk'
  ) then
    raise exception 'Ogiltig sällsynthetsgrad.';
  end if;
  if v_price <= 0 or v_price > 100000 then
    raise exception 'XP-priset måste vara mellan 1 och 100 000.';
  end if;
  if v_min_level < 1 or v_min_level > 99 then
    raise exception 'Nivåkravet måste vara mellan 1 och 99.';
  end if;
  if v_category = 'tema' and nullif(trim(coalesce(p_product ->> 'theme_key', '')), '') is null then
    raise exception 'Ett UI-tema måste ha en temanyckel.';
  end if;

  if v_id is null then
    insert into public.shop_products (
      slug, name, description, category, equip_kind, rarity, price_xp, min_level,
      season_id, season_only, asset_key, theme_key, ornament_key, published, position
    ) values (
      v_slug, v_name, nullif(p_product ->> 'description', ''), v_category,
      coalesce(nullif(p_product ->> 'equip_kind', ''), public.equip_kind_for_category(v_category)),
      v_rarity, v_price, v_min_level,
      nullif(p_product ->> 'season_id', ''), coalesce((p_product ->> 'season_only')::boolean, false),
      nullif(p_product ->> 'asset_key', ''), nullif(p_product ->> 'theme_key', ''),
      nullif(p_product ->> 'ornament_key', ''), coalesce((p_product ->> 'published')::boolean, false),
      coalesce((p_product ->> 'position')::int, 100)
    )
    returning * into v_row;
  else
    update public.shop_products set
      slug = v_slug,
      name = v_name,
      description = nullif(p_product ->> 'description', ''),
      category = v_category,
      equip_kind = coalesce(nullif(p_product ->> 'equip_kind', ''), public.equip_kind_for_category(v_category)),
      rarity = v_rarity,
      price_xp = v_price,
      min_level = v_min_level,
      season_id = nullif(p_product ->> 'season_id', ''),
      season_only = coalesce((p_product ->> 'season_only')::boolean, false),
      asset_key = nullif(p_product ->> 'asset_key', ''),
      theme_key = nullif(p_product ->> 'theme_key', ''),
      ornament_key = nullif(p_product ->> 'ornament_key', ''),
      published = coalesce((p_product ->> 'published')::boolean, published),
      position = coalesce((p_product ->> 'position')::int, position),
      updated_at = now()
    where id = v_id
    returning * into v_row;

    if not found then
      raise exception 'Produkten finns inte.';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'product', to_jsonb(v_row));
end;
$$;

/**
 * Publicerar eller avpublicerar en produkt. Ägda köp påverkas inte: de ligger i
 * `shop_purchases` med sin egen kopia av namn, pris och utseende.
 */
create or replace function public.admin_shop_set_published(p_product_id uuid, p_published boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.shop_products%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får publicera shopens produkter.';
  end if;

  update public.shop_products
  set published = coalesce(p_published, false), updated_at = now()
  where id = p_product_id
  returning * into v_row;

  if not found then
    raise exception 'Produkten finns inte.';
  end if;

  return jsonb_build_object('ok', true, 'product', to_jsonb(v_row));
end;
$$;

/** Sparar en säsong (namn, beskrivning, fönster och aktiv/inaktiv). */
create or replace function public.admin_shop_save_season(p_season jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := nullif(trim(coalesce(p_season ->> 'id', '')), '');
  v_name text := nullif(trim(coalesce(p_season ->> 'name', '')), '');
  v_row public.seasons%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får ändra säsonger.';
  end if;
  if v_id is null then
    raise exception 'Säsongen behöver ett id.';
  end if;
  if v_name is null then
    raise exception 'Säsongen behöver ett namn.';
  end if;

  insert into public.seasons (id, name, description, starts_at, ends_at, active, updated_at)
  values (
    v_id, v_name, nullif(p_season ->> 'description', ''),
    nullif(p_season ->> 'starts_at', '')::timestamptz,
    nullif(p_season ->> 'ends_at', '')::timestamptz,
    coalesce((p_season ->> 'active')::boolean, false),
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    active = excluded.active,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'season', to_jsonb(v_row));
end;
$$;

-- ---------------------------------------------------------------- 10. Rättigheter

revoke execute on function public.shop_purchase(uuid, text) from public, anon;
revoke execute on function public.shop_equip(uuid) from public, anon;
revoke execute on function public.shop_unequip(text) from public, anon;

grant execute on function public.shop_purchase(uuid, text) to authenticated;
grant execute on function public.shop_equip(uuid) to authenticated;
grant execute on function public.shop_unequip(text) to authenticated;
grant execute on function public.admin_shop_save_product(jsonb) to authenticated;
grant execute on function public.admin_shop_set_published(uuid, boolean) to authenticated;
grant execute on function public.admin_shop_save_season(jsonb) to authenticated;
grant execute on function public.season_is_active(text) to authenticated;

-- ---------------------------------------------------------------- 11. Fröet
-- Samma rader som `src/lib/shop-catalog.ts`. Priser, sällsynthet och nivåkrav
-- får ändras här (eller i adminpanelen) utan att någon kod skrivs om.
-- `published` uppdateras inte vid en omkörning, så en avpublicering ligger kvar.

insert into public.shop_products (
  slug, name, description, category, equip_kind, rarity, price_xp, min_level,
  season_id, season_only, asset_key, theme_key, ornament_key, published, position
) values
  ('tema-pumpa', 'Pumpatema', 'Hela appen i pumpafältets färger: varma orange accenter, mörka stenytor och lyktor längs kanten.', 'tema', 'tema', 'ovanlig', 300, 2, 'halloween', true, 'ikon-pumpalykta', 'pumpa', null, true, 10),
  ('tema-spokhus', 'Spökhus', 'Ett herrgårdstema i nattblått och månljus: svala ytor, glasade fönster och en tyst sal.', 'tema', 'tema', 'sallsynt', 400, 2, 'halloween', true, 'ikon-gravsten-kors', 'spokhus', null, true, 11),
  ('tema-haxkonst', 'Häxkonst', 'Häxans kök: björkved, levande ljus, glödande kittlar och en trollbok som ligger framme.', 'tema', 'tema', 'sallsynt', 450, 3, 'halloween', true, 'ikon-kittel', 'haxkonst', null, true, 12),
  ('tema-haunted-forest', 'Haunted Forest', 'Den djupa skogen i månsken: dimma mellan stammarna, turkosa skuggor och stilla ljus.', 'tema', 'tema', 'episk', 500, 3, 'halloween', true, 'ikon-trad', 'haunted-forest', null, true, 13),
  ('tema-midnight', 'Midnight Halloween', 'Midnatt i neon: lila och magenta, lyktor över grusgången och en måne som lyser upp allt.', 'tema', 'tema', 'legendarisk', 600, 4, 'halloween', true, 'ikon-mane', 'midnight', null, true, 14),
  ('figur-pumpan', 'Pumpan', 'En liten pumpa med lyktansikte. Första figuren i samlingen.', 'figur', 'figur', 'vanlig', 60, 1, 'halloween', true, 'ikon-pumpalykta', null, null, true, 20),
  ('figur-lilla-spoket', 'Lilla spöket', 'Ett spöke som svävar stilla och tittar nyfiket tillbaka.', 'figur', 'figur', 'vanlig', 60, 1, 'halloween', true, 'ikon-spoke', null, null, true, 21),
  ('figur-fladdermusen', 'Fladdermusen', 'En fladdermus som flyger lågt över trädgården i skymningen.', 'figur', 'figur', 'vanlig', 60, 1, 'halloween', true, 'ikon-fladdermus', null, null, true, 22),
  ('figur-svarta-katten', 'Svarta katten', 'En svart katt med gula ögon som ser allt som rör sig.', 'figur', 'figur', 'ovanlig', 120, 2, 'halloween', true, 'ikon-katt', null, null, true, 23),
  ('figur-haxan', 'Häxan', 'Häxhatten ensam — resten av häxan syns bara i månsken.', 'figur', 'figur', 'ovanlig', 120, 2, 'halloween', true, 'ikon-haxhatt', null, null, true, 24),
  ('figur-skelettet', 'Skelettet', 'En skalle med tomma ögonhålor och ett leende kvar.', 'figur', 'figur', 'ovanlig', 120, 2, 'halloween', true, 'ikon-skalle', null, null, true, 25),
  ('figur-magiska-flaskan', 'Magiska flaskan', 'En flaska med dryck som glittrar. Receptet står ingenstans.', 'figur', 'figur', 'sallsynt', 200, 3, 'halloween', true, 'ikon-trolldryck', null, null, true, 26),
  ('figur-pumpakrigaren', 'Pumpakrigaren', 'Ett pumpahuvud med glatt ansikte och ett litet ljus i botten.', 'figur', 'figur', 'sallsynt', 200, 3, 'halloween', true, 'ikon-pumpahuvud', null, null, true, 27),
  ('figur-stjarnspoket', 'Stjärnspöket', 'Ett spöke som sträcker armarna i vädret när det blir uppspelt.', 'figur', 'figur', 'sallsynt', 200, 3, 'halloween', true, 'ikon-spoke-armar', null, null, true, 28),
  ('figur-korpmagikern', 'Korpmagikern', 'Korpen med gul näbb — den håller ordning på hela trädgården.', 'figur', 'figur', 'episk', 320, 4, 'halloween', true, 'ikon-korp', null, null, true, 29),
  ('figur-spokkungen', 'Spökkungen', 'Lakanet med två tomma ögon. Den som ser den slutar inte titta bort.', 'figur', 'figur', 'episk', 320, 4, 'halloween', true, 'ikon-lakan', null, null, true, 30),
  ('figur-pumpakungen', 'Pumpakungen', 'Säsongens sista figur: två pumpor sida vid sida, en stor och en liten.', 'figur', 'figur', 'legendarisk', 500, 5, 'halloween', true, 'ikon-pumpor', null, null, true, 31),
  ('avatar-katten', 'Kattavatar', 'Den svarta katten som avatar. Byter bara bilden — inget annat ändras.', 'avatar', 'avatar', 'ovanlig', 120, 2, 'halloween', false, 'ikon-katt', null, null, true, 40),
  ('avatar-korpen', 'Korpavatar', 'Korpen med den gula näbben.', 'avatar', 'avatar', 'sallsynt', 200, 3, 'halloween', false, 'ikon-korp', null, null, true, 41),
  ('avatar-skallen', 'Skalleavatar', 'En skalle, tom och leende.', 'avatar', 'avatar', 'sallsynt', 200, 3, 'halloween', false, 'ikon-skalle', null, null, true, 42),
  ('avatar-manen', 'Månavatar', 'Månskäran med stjärnan i släptåg.', 'avatar', 'avatar', 'episk', 320, 4, 'halloween', false, 'ikon-mane', null, null, true, 43),
  ('ram-spindelnatet', 'Spindelnätsramen', 'En tunn ram med spindelnät i hörnen.', 'profilram', 'ram', 'ovanlig', 120, 2, 'halloween', false, 'ikon-spindelnat', null, 'ikon-spindelnat', true, 50),
  ('ram-slime', 'Slemramen', 'En ram som droppar av grönt slem.', 'profilram', 'ram', 'sallsynt', 200, 3, 'halloween', false, 'ikon-kittel', null, 'ikon-kittel', true, 51),
  ('ram-manljuset', 'Månljusramen', 'En ram med stilla månljus runt avataren.', 'profilram', 'ram', 'sallsynt', 200, 3, 'halloween', false, 'ikon-mane', null, 'ikon-mane', true, 52),
  ('ram-pumpaglod', 'Pumpaglo', 'En ram som glöder svagt inifrån, som en pumpalykta.', 'profilram', 'ram', 'episk', 320, 4, 'halloween', false, 'ikon-pumpalykta', null, 'ikon-pumpalykta', true, 53),
  ('marke-ogat', 'Ögat', 'Ett öga med grön iris som märke bredvid namnet. Det första köpet i shopen.', 'marke', 'marke', 'vanlig', 40, 1, 'halloween', false, 'ikon-oga', null, null, true, 60),
  ('marke-spindelnatet', 'Spindelnätsmärket', 'Ett litet nät som håller ihop hörnet av namnet.', 'marke', 'marke', 'ovanlig', 120, 2, 'halloween', false, 'ikon-spindelnat', null, null, true, 61),
  ('marke-kristallen', 'Kristallmärket', 'En kristallkula som visar dimmor i stället för framtiden.', 'marke', 'marke', 'sallsynt', 200, 3, 'halloween', false, 'ikon-kristallkula', null, null, true, 62),
  ('marke-nyckeln', 'Nyckelmärket', 'En gammal nyckel. Ingen vet vilket lås den passar i.', 'marke', 'marke', 'episk', 320, 4, 'halloween', false, 'ikon-nyckel', null, null, true, 63),
  ('dekor-gravstenen', 'Gravstenen', 'En sten med bokstäverna RIP som dekoration på din profilsida.', 'dekoration', 'dekoration', 'vanlig', 60, 1, 'halloween', false, 'ikon-gravsten', null, null, true, 70),
  ('dekor-staketet', 'Järnstaketet', 'Ett smitt staket som håller ordning längst ned på profilen.', 'dekoration', 'dekoration', 'ovanlig', 120, 2, 'halloween', false, 'ikon-staket', null, null, true, 71),
  ('dekor-knotiga-tradet', 'Knotiga trädet', 'Ett träd utan löv, med grenar som ser ut som fingrar.', 'dekoration', 'dekoration', 'episk', 320, 4, 'halloween', false, 'ikon-trad', null, null, true, 72),
  ('effekt-dimman', 'Dimman', 'Långsam dimma som rör sig över appens nederkant.', 'effekt', 'effekt', 'vanlig', 80, 1, 'halloween', false, 'ikon-gravsten', null, null, true, 80),
  ('effekt-spokparaden', 'Spöktåget', 'Ett par små spöken som svävar förbi då och då.', 'effekt', 'effekt', 'sallsynt', 240, 3, 'halloween', false, 'ikon-spoke', null, null, true, 81),
  ('effekt-stjarnfallet', 'Stjärnfallet', 'Enstaka stjärnfall över appens överkant.', 'effekt', 'effekt', 'episk', 360, 4, 'halloween', false, 'ikon-mane', null, null, true, 82)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  equip_kind = excluded.equip_kind,
  rarity = excluded.rarity,
  price_xp = excluded.price_xp,
  min_level = excluded.min_level,
  season_id = excluded.season_id,
  season_only = excluded.season_only,
  asset_key = excluded.asset_key,
  theme_key = excluded.theme_key,
  ornament_key = excluded.ornament_key,
  position = excluded.position,
  updated_at = now();
