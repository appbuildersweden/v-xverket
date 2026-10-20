-- Elda Skola – Halloween: avatarbyggare, samling, rum och köp av avatar-delar.
--
-- Migrationen är additiv. Den rör inte befintliga användare, XP-rader, köp eller
-- den gemensamma shopens produkter (som Windows-appen också läser), utan lägger
-- till en egen, avgränsad modell för de lager som bygger upp eleven avatar:
--
--   1. halloween_avatar_parts   – katalogen: plats, namn, raritet och XP-pris
--   2. halloween_avatar_unlocks – vem som har låst upp vilken del (ägande)
--   3. halloween_looks          – elevens sparade utseende (en rad per konto)
--   4. halloween_room_items     – elevens personliga Halloween-rum (6 platser)
--
-- Ekonomi: samma XP som resten av Elda. Ett köp är en negativ rad i
-- `xp_transactions` (source `shop_purchase`) plus en rad i unlocks, skrivna i
-- samma anrop. XP-raden låses först, så två samtidiga köp kan aldrig spendera
-- samma poäng, och en idempotensnyckel gör dubbelklick och omförsök ofarliga.
--
-- Klienten kan läsa katalogen och sina egna rader. All skrivning går genom
-- security definer-funktionerna längst ned; det finns inga insert/update/
-- delete-policyer på tabellerna.

-- ================================================================
-- 1. Katalogen
-- ================================================================

create table if not exists public.halloween_avatar_parts (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  -- Var delen sitter. 'dekoration' är inte en avatar-del utan ett föremål i
  -- elevens Halloween-rum.
  slot text not null check (slot in (
    'bakgrund', 'effekt', 'husdjur', 'klader',
    'hudton', 'ogon', 'ogonfarg', 'frisyr', 'harfarg',
    'huvudbonad', 'mask', 'glasogon', 'dekoration'
  )),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text,
  -- 'del' ritas som form, 'farg' är en palett (hudton, hårfärg, ögonfärg).
  kind text not null default 'del' check (kind in ('del', 'farg')),
  color text,
  rarity text not null default 'vanlig'
    check (rarity in ('vanlig', 'ovanlig', 'sallsynt', 'episk', 'legendarisk')),
  price_xp integer not null default 0 check (price_xp >= 0 and price_xp <= 100000),
  min_level integer not null default 1 check (min_level between 1 and 99),
  free boolean not null default false,
  position integer not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint halloween_parts_color_format
    check (kind <> 'farg' or color ~ '^#[0-9a-f]{6}$'),
  constraint halloween_parts_price_rule
    check ((free and price_xp = 0) or (not free and price_xp > 0)),
  constraint halloween_parts_kind_slot
    check (kind <> 'farg' or slot in ('hudton', 'harfarg', 'ogonfarg'))
);

comment on table public.halloween_avatar_parts is
  'Halloween-avatarens delar och paletter. Priser och nivåkrav ligger i databasen, inte i klienten.';

create index if not exists halloween_parts_slot_idx
  on public.halloween_avatar_parts (slot, position);

alter table public.halloween_avatar_parts enable row level security;

-- Publicerade delar är läsbara för alla inloggade. Avpublicering döljer delen
-- utan att röra någons ägande eller sparade utseende.
drop policy if exists "halloween_parts_select_published" on public.halloween_avatar_parts;
create policy "halloween_parts_select_published"
  on public.halloween_avatar_parts for select
  to authenticated
  using (published or public.is_admin());

-- ================================================================
-- 2. Ägande
-- ================================================================

create table if not exists public.halloween_avatar_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  part_slug text not null references public.halloween_avatar_parts (slug) on delete cascade,
  price_xp integer not null check (price_xp >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, part_slug),
  -- Ett anrop med samma nyckel får bara ge ett köp.
  unique (user_id, idempotency_key)
);

comment on table public.halloween_avatar_unlocks is
  'Upplåsta avatar-delar per konto. Skrivs bara av halloween_buy_part().';

create index if not exists halloween_unlocks_user_idx
  on public.halloween_avatar_unlocks (user_id, unlocked_at desc);

alter table public.halloween_avatar_unlocks enable row level security;

drop policy if exists "halloween_unlocks_select_own" on public.halloween_avatar_unlocks;
create policy "halloween_unlocks_select_own"
  on public.halloween_avatar_unlocks for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ================================================================
-- 3. Elevens utseende
-- ================================================================

create table if not exists public.halloween_looks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- {"frisyr":"har-bob","klader":"klad-pumpatroja", ...} – bara val som
  -- eleven äger, kontrollerat av halloween_save_avatar().
  look jsonb not null default '{}'::jsonb check (jsonb_typeof(look) = 'object'),
  updated_at timestamptz not null default now()
);

comment on table public.halloween_looks is
  'Elevens sparade Halloween-avatar. Skrivs bara av halloween_save_avatar().';

alter table public.halloween_looks enable row level security;

drop policy if exists "halloween_looks_select_own" on public.halloween_looks;
create policy "halloween_looks_select_own"
  on public.halloween_looks for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ================================================================
-- 4. Halloween-rummet
-- ================================================================
--
-- Rummet har sex fasta platser. Det ligger i en egen tabell i stället för i
-- Eldas `garden_placements`, eftersom den tabellen ägs av Windows-appens
-- belöningssystem: ett föremål därifrån får aldrig blandas ihop med en
-- dekoration som eleven har köpt i Elda Skola.

create table if not exists public.halloween_room_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot between 0 and 5),
  part_slug text not null references public.halloween_avatar_parts (slug) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

comment on table public.halloween_room_items is
  'Elevens personliga Halloween-rum: ett föremål per plats. Skrivs bara av halloween_room_place().';

alter table public.halloween_room_items enable row level security;

drop policy if exists "halloween_room_select_own" on public.halloween_room_items;
create policy "halloween_room_select_own"
  on public.halloween_room_items for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ================================================================
-- 5. Läshjälp: saldo
-- ================================================================

/**
 * Elevens XP-saldo och nivå enligt samma regler som shopen använder. Räknas
 * alltid fram på servern – klienten kan aldrig skicka in ett saldo.
 */
create or replace function public.halloween_wallet()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_total integer;
  v_level integer;
  v_per integer;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  v_total := public.total_xp(v_me);
  v_level := public.level_for_xp(v_total);
  v_per := coalesce(nullif((public.get_setting('xp_per_level') ->> '0')::int, 0), 100);
  if v_per < 1 then
    v_per := 100;
  end if;
  return jsonb_build_object(
    'total_xp', v_total,
    'level', v_level,
    'xp_per_level', v_per,
    'level_start_xp', (v_level - 1) * v_per,
    'next_level_xp', v_level * v_per
  );
end;
$$;

-- ================================================================
-- 6. Köp av en avatar-del
-- ================================================================

/**
 * Låser upp en avatar-del för XP.
 *
 * Samma regler som shop_purchase(): idempotensnyckel, ägande, publicering,
 * nivåkrav och saldo prövas på servern, och XP-raden låses innan saldot läses.
 * Gratis delar behöver aldrig köpas – de ägs av alla och avvisas här.
 */
create or replace function public.halloween_buy_part(
  p_slug text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_part public.halloween_avatar_parts%rowtype;
  v_unlock public.halloween_avatar_unlocks%rowtype;
  v_total integer;
  v_level integer;
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_slug is null or char_length(btrim(p_slug)) < 2 then
    raise exception 'Föremålet finns inte.';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'Köpet saknar en giltig nyckel och kunde inte genomföras.';
  end if;

  -- Seriella köp per konto: två flikar kan aldrig spendera samma XP.
  insert into public.user_xp (user_id, total_xp)
  values (v_user, 0)
  on conflict (user_id) do nothing;
  perform 1 from public.user_xp where user_id = v_user for update;

  -- Redan genomfört anrop: samma kvitto, ingen ny debitering.
  select * into v_unlock
  from public.halloween_avatar_unlocks
  where user_id = v_user and idempotency_key = p_idempotency_key;

  if found then
    v_total := public.total_xp(v_user);
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'slug', v_unlock.part_slug,
      'price_xp', v_unlock.price_xp,
      'total_xp', v_total,
      'level', public.level_for_xp(v_total),
      'owned', true
    );
  end if;

  select * into v_part
  from public.halloween_avatar_parts
  where slug = p_slug
  for share;

  if not found then
    raise exception 'Föremålet finns inte.';
  end if;
  if not v_part.published then
    raise exception 'Föremålet går inte att köpa just nu.';
  end if;
  if v_part.free then
    raise exception 'Föremålet är gratis och behöver inte köpas.';
  end if;
  if exists (
    select 1 from public.halloween_avatar_unlocks
    where user_id = v_user and part_slug = p_slug
  ) then
    raise exception 'Du äger redan det här föremålet.';
  end if;

  v_total := public.total_xp(v_user);
  v_level := public.level_for_xp(v_total);

  if v_level < v_part.min_level then
    raise exception 'Föremålet kräver nivå %, och du är nivå %.',
      v_part.min_level, v_level;
  end if;
  if v_total < v_part.price_xp then
    raise exception 'Du saknar % XP för det här köpet.', v_part.price_xp - v_total;
  end if;

  -- Två samtidiga köp kan båda ha passerat kontrollerna. Det unika primärnyckeln
  -- avgör: det ena köpet skrivs, det andra får en unique_violation och svarar
  -- med det köp som redan finns – utan att dra XP en andra gång.
  begin
    insert into public.halloween_avatar_unlocks
      (user_id, part_slug, price_xp, idempotency_key)
    values
      (v_user, v_part.slug, v_part.price_xp, p_idempotency_key)
    returning * into v_unlock;
  exception when unique_violation then
    select * into v_unlock
    from public.halloween_avatar_unlocks
    where user_id = v_user
      and (idempotency_key = p_idempotency_key or part_slug = p_slug)
    order by unlocked_at desc
    limit 1;

    if not found then
      raise;
    end if;

    v_total := public.total_xp(v_user);
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'slug', v_unlock.part_slug,
      'price_xp', v_unlock.price_xp,
      'total_xp', v_total,
      'level', public.level_for_xp(v_total),
      'owned', true
    );
  end;

  insert into public.xp_transactions (user_id, amount, source, note)
  values (v_user, -v_unlock.price_xp, 'shop_purchase', 'Halloween: ' || v_part.name);

  perform public.refresh_user_xp(v_user);
  v_total := public.total_xp(v_user);

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'slug', v_part.slug,
    'name', v_part.name,
    'price_xp', v_unlock.price_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total),
    'owned', true
  );
end;
$$;

-- ================================================================
-- 7. Spara utseendet
-- ================================================================

/**
 * Sparar elevens avatar.
 *
 * Varje värde måste vara en publicerad del på rätt plats som eleven äger
 * (eller som är gratis). Okända platser ignoreras så att en nyare klient kan
 * skicka fält som den här versionen inte känner till, men ett okänt eller
 * olåst föremål avvisas – en elev kan aldrig spara något den inte har.
 */
create or replace function public.halloween_save_avatar(p_look jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_slug text;
  v_part public.halloween_avatar_parts%rowtype;
  v_clean jsonb := '{}'::jsonb;
  v_allowed text[] := array[
    'bakgrund', 'effekt', 'husdjur', 'klader',
    'hudton', 'ogon', 'ogonfarg', 'frisyr', 'harfarg',
    'huvudbonad', 'mask', 'glasogon'
  ];
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_look is null or jsonb_typeof(p_look) <> 'object' then
    raise exception 'Utseendet kunde inte sparas.';
  end if;
  if length(p_look::text) > 4000 then
    raise exception 'Utseendet innehåller för mycket data.';
  end if;

  for v_key, v_slug in
    select key, value from jsonb_each_text(p_look)
  loop
    if not (v_key = any (v_allowed)) then
      continue;
    end if;

    select * into v_part
    from public.halloween_avatar_parts
    where slug = v_slug and published;

    if not found then
      raise exception 'Föremålet ”%” finns inte.', v_slug;
    end if;
    if v_part.slot <> v_key then
      raise exception 'Föremålet ”%” passar inte på den platsen.', v_part.name;
    end if;
    if not v_part.free and not exists (
      select 1 from public.halloween_avatar_unlocks
      where user_id = v_me and part_slug = v_part.slug
    ) then
      raise exception 'Du äger inte föremålet ”%”.', v_part.name;
    end if;

    v_clean := v_clean || jsonb_build_object(v_key, v_part.slug);
  end loop;

  insert into public.halloween_looks (user_id, look, updated_at)
  values (v_me, v_clean, now())
  on conflict (user_id) do update
    set look = excluded.look,
        updated_at = now();

  return jsonb_build_object('ok', true, 'look', v_clean, 'updated_at', now());
end;
$$;

-- ================================================================
-- 8. Halloween-rummet
-- ================================================================

/** Ställer ett ägt (eller gratis) dekoration på en av rummets sex platser. */
create or replace function public.halloween_room_place(p_slug text, p_slot integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_part public.halloween_avatar_parts%rowtype;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    raise exception 'Ogiltig plats i rummet.';
  end if;

  select * into v_part
  from public.halloween_avatar_parts
  where slug = p_slug and published;

  if not found then
    raise exception 'Dekorationen finns inte.';
  end if;
  if v_part.slot <> 'dekoration' then
    raise exception 'Föremålet är ingen dekoration.';
  end if;
  if not v_part.free and not exists (
    select 1 from public.halloween_avatar_unlocks
    where user_id = v_me and part_slug = v_part.slug
  ) then
    raise exception 'Du äger inte dekorationen ”%”.', v_part.name;
  end if;

  -- Samma dekoration får bara stå på en plats.
  delete from public.halloween_room_items
  where user_id = v_me and part_slug = v_part.slug;

  insert into public.halloween_room_items (user_id, slot, part_slug, updated_at)
  values (v_me, p_slot, v_part.slug, now())
  on conflict (user_id, slot) do update
    set part_slug = excluded.part_slug,
        updated_at = now();
end;
$$;

/** Tar bort dekorationen på en plats. */
create or replace function public.halloween_room_remove(p_slot integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    raise exception 'Ogiltig plats i rummet.';
  end if;

  delete from public.halloween_room_items
  where user_id = v_me and slot = p_slot;
end;
$$;

-- ================================================================
-- 9. Rättigheter
-- ================================================================

revoke all on function public.halloween_wallet() from public, anon;
revoke all on function public.halloween_buy_part(text, text) from public, anon;
revoke all on function public.halloween_save_avatar(jsonb) from public, anon;
revoke all on function public.halloween_room_place(text, integer) from public, anon;
revoke all on function public.halloween_room_remove(integer) from public, anon;

grant execute on function public.halloween_wallet() to authenticated;
grant execute on function public.halloween_buy_part(text, text) to authenticated;
grant execute on function public.halloween_save_avatar(jsonb) to authenticated;
grant execute on function public.halloween_room_place(text, integer) to authenticated;
grant execute on function public.halloween_room_remove(integer) to authenticated;

-- ================================================================
-- 10. Katalogen (frö)
-- ================================================================
--
-- Samma nycklar som ritas i `elda-skola/src/components/halloween/AvatarArt.tsx`
-- och listas i `elda-skola/src/lib/halloween-catalog.ts`. Priser, raritet och
-- nivåkrav får ändras här utan att någon klientkod skrivs om; `published`
-- uppdateras inte vid en omkörning, så en avpublicering ligger kvar.

insert into public.halloween_avatar_parts
  (slug, slot, name, description, kind, color, rarity, price_xp, min_level, free, position)
values
  -- Bakgrunder
  ('bg-maneskog', 'bakgrund', 'Månskogen', 'Höga stammar, dimma mellan träden och en måne som knappt syns.', 'del', null, 'vanlig', 0, 1, true, 10),
  ('bg-spokhus', 'bakgrund', 'Spökhuset', 'Ett hus med glödande fönster. Ingen har sett vem som tänder ljusen.', 'del', null, 'vanlig', 0, 1, true, 11),
  ('bg-pumpafalt', 'bakgrund', 'Pumpafältet', 'Rader av pumpor så långt ögat når, och en lykta längst bort.', 'del', null, 'ovanlig', 40, 1, false, 12),
  ('bg-gravgard', 'bakgrund', 'Gravgården', 'Sneda stenar, svart gräs och en grind som står öppen.', 'del', null, 'ovanlig', 40, 1, false, 13),
  ('bg-stjarnhimmel', 'bakgrund', 'Stjärnhimlen', 'Kall, klar natt med stjärnor och ett svagt norrsken.', 'del', null, 'sallsynt', 80, 2, false, 14),
  ('bg-haxkok', 'bakgrund', 'Häxköket', 'Kittlar, torkade örter och hyllor som aldrig riktigt står still.', 'del', null, 'sallsynt', 80, 2, false, 15),

  -- Effekter
  ('fx-glod', 'effekt', 'Varma glöd', 'Små glödande prickar som stiger långsamt mot taket.', 'del', null, 'vanlig', 0, 1, true, 20),
  ('fx-dimma', 'effekt', 'Markdimma', 'Låg dimma som rullar in över marken.', 'del', null, 'ovanlig', 40, 1, false, 21),
  ('fx-stjarnfall', 'effekt', 'Stjärnfall', 'Enstaka stjärnfall över axeln.', 'del', null, 'sallsynt', 90, 2, false, 22),
  ('fx-fladdermussvarm', 'effekt', 'Fladdermussvärm', 'En liten svärm som cirklar runt huvudet och försvinner igen.', 'del', null, 'episk', 140, 3, false, 23),

  -- Husdjur
  ('pet-katt', 'husdjur', 'Nattkatten', 'En svart katt med gula ögon som sitter bredvid dig hela natten.', 'del', null, 'vanlig', 0, 1, true, 30),
  ('pet-fladdermus', 'husdjur', 'Fladdermusen', 'Hänger upp och ned i kanten och sträcker på vingarna när du rör dig.', 'del', null, 'ovanlig', 60, 1, false, 31),
  ('pet-spoke', 'husdjur', 'Lilla spöket', 'Ett spöke i lagom storlek som svävar strax bakom axeln.', 'del', null, 'sallsynt', 90, 2, false, 32),
  ('pet-korp', 'husdjur', 'Korpen', 'Sitter på din axel och kommenterar allt som händer.', 'del', null, 'sallsynt', 110, 2, false, 33),

  -- Kläder
  ('klad-hoodie', 'klader', 'Natt-hoodien', 'En mjuk, mörk hoodie med diskret månmärke.', 'del', null, 'vanlig', 0, 1, true, 40),
  ('klad-pumpatroja', 'klader', 'Pumpatröjan', 'Stickad tröja med pumpamönster över bröstet.', 'del', null, 'ovanlig', 50, 1, false, 41),
  ('klad-spokdrakt', 'klader', 'Spökdräkten', 'Ett lakan med ögonhål. Klassiskt av en anledning.', 'del', null, 'ovanlig', 60, 1, false, 42),
  ('klad-vampyrkappa', 'klader', 'Vampyrkappan', 'Hög krage och rött foder. Kappan rör sig även när det inte blåser.', 'del', null, 'sallsynt', 110, 2, false, 43),
  ('klad-skelett', 'klader', 'Skelettdräkten', 'Benvita revben över en mörk kropp. Ser bättre ut i månljus.', 'del', null, 'episk', 150, 3, false, 44),
  ('klad-kattdrakt', 'klader', 'Kattdräkten', 'Mjuk päls, svans och ett par öron som sitter fast i huvan.', 'del', null, 'episk', 150, 3, false, 45),

  -- Hudtoner (palett)
  ('ton-1', 'hudton', 'Ljus', 'Ljus hudton.', 'farg', '#f4d7c4', 'vanlig', 0, 1, true, 50),
  ('ton-2', 'hudton', 'Ljus mellan', 'Ljus mellanton.', 'farg', '#e8bfa5', 'vanlig', 0, 1, true, 51),
  ('ton-3', 'hudton', 'Mellan', 'Mellanton.', 'farg', '#d6a37e', 'vanlig', 0, 1, true, 52),
  ('ton-4', 'hudton', 'Varm mellan', 'Varm mellanton.', 'farg', '#b17a54', 'vanlig', 0, 1, true, 53),
  ('ton-5', 'hudton', 'Mörk', 'Mörk hudton.', 'farg', '#8a5a3b', 'vanlig', 0, 1, true, 54),
  ('ton-6', 'hudton', 'Djup', 'Djup hudton.', 'farg', '#5f3a26', 'vanlig', 0, 1, true, 55),

  -- Ögon
  ('oga-vanlig', 'ogon', 'Vanliga ögon', 'Runda ögon med en liten glans.', 'del', null, 'vanlig', 0, 1, true, 60),
  ('oga-glow', 'ogon', 'Glödande ögon', 'Ögon som lyser svagt inifrån.', 'del', null, 'ovanlig', 50, 1, false, 61),
  ('oga-katt', 'ogon', 'Kattögon', 'Smala pupiller som följer ljuset.', 'del', null, 'ovanlig', 60, 1, false, 62),

  -- Ögonfärger (palett)
  ('ogonfarg-gron', 'ogonfarg', 'Grön', 'Grön iris.', 'farg', '#39804b', 'vanlig', 0, 1, true, 70),
  ('ogonfarg-amber', 'ogonfarg', 'Bärnsten', 'Bärnstensgul iris.', 'farg', '#d09b2c', 'vanlig', 0, 1, true, 71),
  ('ogonfarg-bla', 'ogonfarg', 'Blå', 'Blå iris.', 'farg', '#3f6fa8', 'vanlig', 0, 1, true, 72),
  ('ogonfarg-rod', 'ogonfarg', 'Röd', 'Röd iris, som i skenet av en lykta.', 'farg', '#a13c3c', 'vanlig', 0, 1, true, 73),
  ('ogonfarg-lila', 'ogonfarg', 'Lila', 'Lila iris med ett svagt sken.', 'farg', '#7a5aa8', 'vanlig', 0, 1, true, 74),

  -- Frisyrer
  ('har-kort', 'frisyr', 'Kort', 'Kort och rakt, lätt att ha under en hatt.', 'del', null, 'vanlig', 0, 1, true, 80),
  ('har-bob', 'frisyr', 'Bob', 'Kort bob med rak lugg.', 'del', null, 'ovanlig', 30, 1, false, 81),
  ('har-langt', 'frisyr', 'Långt', 'Långt hår som faller över axlarna.', 'del', null, 'ovanlig', 40, 1, false, 82),
  ('har-tofs', 'frisyr', 'Tofs', 'Högt tofs med ett par testar som sticker ut.', 'del', null, 'ovanlig', 40, 1, false, 83),
  ('har-lockar', 'frisyr', 'Lockar', 'Stora lockar som rör sig när du gör något.', 'del', null, 'sallsynt', 90, 2, false, 84),

  -- Hårfärger (palett)
  ('harfarg-svart', 'harfarg', 'Svart', 'Nästan blått i månljus.', 'farg', '#221f2b', 'vanlig', 0, 1, true, 90),
  ('harfarg-brun', 'harfarg', 'Brun', 'Varm brun.', 'farg', '#4a3324', 'vanlig', 0, 1, true, 91),
  ('harfarg-blond', 'harfarg', 'Blond', 'Ljusblond.', 'farg', '#c9a86a', 'vanlig', 0, 1, true, 92),
  ('harfarg-morkblond', 'harfarg', 'Mörkblond', 'Mörkblond, nästan röd i ljuset.', 'farg', '#8a6a44', 'vanlig', 0, 1, true, 93),
  ('harfarg-lila', 'harfarg', 'Lila', 'Lila med lite glans.', 'farg', '#6b4b8a', 'ovanlig', 40, 1, false, 94),
  ('harfarg-silver', 'harfarg', 'Silver', 'Silvervitt som månsken.', 'farg', '#c7cbd6', 'sallsynt', 60, 2, false, 95),

  -- Huvudbonader
  ('hatt-pumpa', 'huvudbonad', 'Pumpalyktan', 'En liten pumpa med lyktansikte, buren som hatt.', 'del', null, 'ovanlig', 50, 1, false, 100),
  ('hatt-spokhuva', 'huvudbonad', 'Spökhuva', 'En huva som döljer det mesta av ansiktet.', 'del', null, 'ovanlig', 60, 1, false, 101),
  ('hatt-hax', 'huvudbonad', 'Häxhatten', 'Spetsig hatt med brett brätte och ett spänne.', 'del', null, 'sallsynt', 100, 2, false, 102),
  ('hatt-horn', 'huvudbonad', 'Hornen', 'Ett par horn som gör siluetten omisskännlig.', 'del', null, 'episk', 140, 3, false, 103),
  ('hatt-krona', 'huvudbonad', 'Nattkronan', 'En krona av mörkt silver och svarta stenar.', 'del', null, 'legendarisk', 200, 4, false, 104),

  -- Masker
  ('mask-pumpa', 'mask', 'Pumpamasken', 'Ett leende ansikte med skurna ögon.', 'del', null, 'ovanlig', 60, 1, false, 110),
  ('mask-spoke', 'mask', 'Spökmasken', 'Ett blekt ansikte med tomma ögon.', 'del', null, 'ovanlig', 60, 1, false, 111),
  ('mask-skalle', 'mask', 'Skallemasken', 'En skalle med ett leende som inte går att tolka.', 'del', null, 'sallsynt', 100, 2, false, 112),

  -- Glasögon
  ('glas-runda', 'glasogon', 'Runda glasögon', 'Tunna, runda bågar.', 'del', null, 'vanlig', 0, 1, true, 120),
  ('glas-monokel', 'glasogon', 'Monokel', 'En monokel med kedja.', 'del', null, 'ovanlig', 40, 1, false, 121),
  ('glas-stjarnform', 'glasogon', 'Stjärnglasögon', 'Stjärnformade glas med mörka bågar.', 'del', null, 'episk', 120, 2, false, 122),

  -- Dekorationer till rummet
  ('dekor-pumpalykta', 'dekoration', 'Pumpalyktan', 'En lykta som brinner hela natten.', 'del', null, 'vanlig', 0, 1, true, 130),
  ('dekor-gravsten', 'dekoration', 'Gravstenen', 'En sned sten med ett namn som regnat bort.', 'del', null, 'vanlig', 0, 1, true, 131),
  ('dekor-spoke', 'dekoration', 'Spöket i hörnet', 'Ett spöke som håller sig i skuggan.', 'del', null, 'ovanlig', 40, 1, false, 132),
  ('dekor-lykta', 'dekoration', 'Gatlyktan', 'En gammal lykta med levande låga.', 'del', null, 'ovanlig', 50, 1, false, 133),
  ('dekor-kittel', 'dekoration', 'Kitteln', 'Bubblar av grön dryck. Receptet är hemligt.', 'del', null, 'sallsynt', 90, 2, false, 134),
  ('dekor-manlykta', 'dekoration', 'Månlyktan', 'En lykta fylld av månsken.', 'del', null, 'episk', 150, 3, false, 135)
on conflict (slug) do update set
  slot = excluded.slot,
  name = excluded.name,
  description = excluded.description,
  kind = excluded.kind,
  color = excluded.color,
  rarity = excluded.rarity,
  price_xp = excluded.price_xp,
  min_level = excluded.min_level,
  free = excluded.free,
  position = excluded.position,
  updated_at = now();
