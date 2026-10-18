-- ============================================================================
--  Shopens utökning: fler teman, avatarer, ramar, märken och dekorationer
-- ============================================================================
-- `20261101000000_shop.sql` byggde shopen och fröade de första 35 produkterna.
-- Den här migreringen lägger till resten av säsongens sortiment enligt samma
-- principer:
--
--   * alla priser är hela XP — inga riktiga pengar, ingen slump,
--   * alla bilder finns redan i projektet (ikonarket och temafilerna),
--   * temana har en temanyckel som det finns en temafil för i `styles/teman.css`,
--   * `on conflict (slug) do update` gör omkörningen säker och låter en
--     administratörs ändrade pris ligga kvar tills nästa migrering skriver över
--     det (precis som föregående migrering).
--
-- Migreringen rör inga användardata: den lägger bara till rader i katalogen.
-- Ägande, XP och utrustning ligger i andra tabeller och påverkas inte.
-- ============================================================================

insert into public.shop_products (
  slug, name, description, category, equip_kind, rarity, price_xp, min_level,
  season_id, season_only, asset_key, theme_key, ornament_key, published, position
) values
  -- ------------------------------------------------------------- UI-teman
  ('tema-ghostly-moonlight', 'Ghostly Moonlight', 'Blåsvart natt med kallt månsken, silvergrå ytor och ett stilla spökljus över kanterna.', 'tema', 'tema', 'episk', 550, 3, 'halloween', true, 'ikon-mane', 'ghostly-moonlight', null, true, 15),
  ('tema-candy-crypt', 'Candy Crypt', 'Godiskryptan: polkagrisrosa, karamell och mintgrönt i en lekfull palett med gulliga monster.', 'tema', 'tema', 'ovanlig', 350, 2, 'halloween', true, 'ikon-godisspann', 'candy-crypt', null, true, 16),

  -- -------------------------------------------------------------- Avatarer
  ('avatar-spoket', 'Spökavatar', 'Ett litet spöke som avatar. Det ser ut att sväva även när det står still.', 'avatar', 'avatar', 'sallsynt', 200, 3, 'halloween', false, 'ikon-spoke', null, null, true, 44),
  ('avatar-pumpalyktan', 'Pumpalyktsavatar', 'En pumpalykta med glatt ansikte och ett ljus som aldrig slocknar.', 'avatar', 'avatar', 'ovanlig', 120, 2, 'halloween', false, 'ikon-pumpahuvud', null, null, true, 45),
  ('avatar-haxan', 'Häxavatar', 'Häxhatten med spetsig topp — resten av häxan syns bara i månsken.', 'avatar', 'avatar', 'sallsynt', 200, 3, 'halloween', false, 'ikon-haxhatt', null, null, true, 46),
  ('avatar-godisspannen', 'Godisspannsavatar', 'En spann full av godis. Färgerna hör till Candy Crypt-temat.', 'avatar', 'avatar', 'ovanlig', 120, 2, 'halloween', false, 'ikon-godisspann', null, null, true, 47),

  -- ------------------------------------------------------------ Profilramar
  ('ram-spokgloet', 'Spökgloet', 'En blek ring med ett svagt spökljus som följer avatarens kant.', 'profilram', 'ram', 'sallsynt', 200, 3, 'halloween', false, 'ikon-spoke', null, 'ikon-spoke', true, 54),
  ('ram-fladdermusvingar', 'Fladdermusvingar', 'Två små vingar som ramar in avataren utan att skymma den.', 'profilram', 'ram', 'sallsynt', 240, 3, 'halloween', false, 'ikon-fladdermus', null, 'ikon-fladdermus', true, 55),
  ('ram-trolldom', 'Trolldomsramen', 'En lila ram med en kristall i hörnet, som om den vore förtrollad.', 'profilram', 'ram', 'episk', 320, 4, 'halloween', false, 'ikon-kristallkula', null, 'ikon-kristallkula', true, 56),
  ('ram-godisstangen', 'Godisstången', 'En randig godisstång runt avataren — sötare än den ser ut.', 'profilram', 'ram', 'ovanlig', 120, 2, 'halloween', false, 'ikon-majsgodis', null, 'ikon-majsgodis', true, 57),

  -- -------------------------------------------------------- Ikoner och märken
  ('marke-pumpaskordaren', 'Pumpaskördaren', 'Två pumpor sida vid sida — för den som samlar på säsongens skörd.', 'marke', 'marke', 'ovanlig', 120, 2, 'halloween', false, 'ikon-pumpor', null, null, true, 64),
  ('marke-spokjakten', 'Spökjägaren', 'Ett spöke med armarna i vädret. Märket till den som vågar leta.', 'marke', 'marke', 'sallsynt', 200, 3, 'halloween', false, 'ikon-spoke-armar', null, null, true, 65),
  ('marke-midnattsvandraren', 'Midnattsvandraren', 'En lykta i mörkret — märket för den som är vaken när alla andra sover.', 'marke', 'marke', 'episk', 320, 4, 'halloween', false, 'ikon-lykta', null, null, true, 66),
  ('marke-godissamlaren', 'Godissamlaren', 'En spann med godis. Det billigaste märket i shopen och det sötaste.', 'marke', 'marke', 'vanlig', 80, 1, 'halloween', false, 'ikon-godisspann', null, null, true, 67),

  -- ----------------------------------------------------------- Dekorationer
  ('dekor-lyktan', 'Ljuslyktan', 'En liten lykta som står på profilsidan och lyser åt dig.', 'dekoration', 'dekoration', 'vanlig', 60, 1, 'halloween', false, 'ikon-lykta', null, null, true, 73),
  ('dekor-kristallerna', 'Kristallerna', 'Tre kristaller som samlar månljus bredvid din profil.', 'dekoration', 'dekoration', 'ovanlig', 120, 2, 'halloween', false, 'ikon-kristallkula', null, null, true, 74),
  ('dekor-spoket', 'Spökbesöket', 'Ett litet spöke som håller dig sällskap på profilen.', 'dekoration', 'dekoration', 'sallsynt', 200, 3, 'halloween', false, 'ikon-spoke', null, null, true, 75),
  ('dekor-fladdermusen', 'Nattfladdermusen', 'En fladdermus som hänger upp och ned i profilens överkant.', 'dekoration', 'dekoration', 'sallsynt', 200, 3, 'halloween', false, 'ikon-hangande-fladdermus', null, null, true, 76),
  ('dekor-manskivan', 'Månskivan', 'En måne med stjärnor som lyser över profilen även dagtid.', 'dekoration', 'dekoration', 'episk', 320, 4, 'halloween', false, 'ikon-mane', null, null, true, 77)
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
