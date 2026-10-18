/**
 * Shopens produktkatalog — säsongens innehåll och alla UI-teman.
 *
 * Här ligger *innehållet*: namn, beskrivning, kategori, sällsynthet, XP-pris och
 * nivåkrav. Servern äger samma uppgifter i `shop_products` (migreringen
 * `20261101000000_shop.sql`), och det är därifrån appen läser dem i drift — en
 * administratör kan ändra ett pris utan att någon kod behöver skrivas om.
 * Katalogen används därför till tre saker:
 *
 *   1. den är fröet i migreringen (samma rader, samma priser),
 *   2. den är demolägets data (samma priser som servern visar),
 *   3. ett test jämför migreringens rader mot den här filen, så att fröet och
 *      koden inte kan glida ifrån varandra.
 *
 * Produkterna återanvänder de bilder som redan finns i projektet: ikonerna från
 * ikonarket (`ikon-…`) och de fem temabilderna (`assets/teman`). Inga externa
 * bildadresser används, så ett köpt tema kan inte sluta fungera för att en
 * främmande sajt försvinner.
 */

/** Kategorierna i shopen. Ordningen är den som visas i filtret. */
export type ShopCategory =
  | 'tema'
  | 'figur'
  | 'avatar'
  | 'profilram'
  | 'marke'
  | 'dekoration'
  | 'effekt';

/**
 * Sällsynthet. Enbart en kosmetisk klassificering — ingen slump, inga lådor
 * och inga köp med riktiga pengar. Priset styr vad föremålet kostar.
 */
export type ShopRarity = 'vanlig' | 'ovanlig' | 'sallsynt' | 'episk' | 'legendarisk';

/**
 * Vad ett föremål kan utrustas som. En plats i taget per sort: eleven kan ha
 * ett aktivt tema, en avatar, en ram, ett märke, en figur, en dekoration och en
 * effekt samtidigt. `null` betyder att föremålet bara är ett samlarobjekt.
 */
export type EquipKind = 'tema' | 'avatar' | 'ram' | 'marke' | 'figur' | 'dekoration' | 'effekt';

export interface ShopCategoryMeta {
  id: ShopCategory;
  label: string;
  /** Vad kategorin innehåller, i korthet. */
  description: string;
  /** Platsen föremålet utrustas på, eller null för rena samlarobjekt. */
  equipKind: EquipKind | null;
}

export const SHOP_CATEGORIES: readonly ShopCategoryMeta[] = [
  {
    id: 'tema',
    label: 'UI-teman',
    description: 'Kompletta teman för hela appen — färger, ytor, knappar och bakgrund.',
    equipKind: 'tema',
  },
  {
    id: 'figur',
    label: 'Figurer',
    description: 'Halloweenfigurer och samlarfigurer. Kan visas på profilen.',
    equipKind: 'figur',
  },
  {
    id: 'avatar',
    label: 'Avatarer',
    description: 'Bilden bredvid ditt namn.',
    equipKind: 'avatar',
  },
  {
    id: 'profilram',
    label: 'Profilramar',
    description: 'Ramen runt din avatar.',
    equipKind: 'ram',
  },
  {
    id: 'marke',
    label: 'Ikoner och märken',
    description: 'Ett litet märke bredvid ditt namn.',
    equipKind: 'marke',
  },
  {
    id: 'dekoration',
    label: 'Dekorationer',
    description: 'Dekorativa inslag på din profilsida.',
    equipKind: 'dekoration',
  },
  {
    id: 'effekt',
    label: 'Visuella effekter',
    description: 'Lugna effekter ovanpå appen. Stängs av med reducerad rörelse.',
    equipKind: 'effekt',
  },
];

export const CATEGORY_META: Readonly<Record<ShopCategory, ShopCategoryMeta>> = Object.fromEntries(
  SHOP_CATEGORIES.map((meta) => [meta.id, meta]),
) as Readonly<Record<ShopCategory, ShopCategoryMeta>>;

export interface ShopRarityMeta {
  id: ShopRarity;
  label: string;
  /** Kort förklaring som visas i produktvyn. */
  description: string;
}

/** Sällsynthetsgraderna i stigande ordning, med begripliga namn. */
export const SHOP_RARITIES: readonly ShopRarityMeta[] = [
  { id: 'vanlig', label: 'Vanlig', description: 'Ett första köp för den som vill börja samla.' },
  { id: 'ovanlig', label: 'Ovanlig', description: 'Lite mer ovanlig — kräver några uppgifter.' },
  { id: 'sallsynt', label: 'Sällsynt', description: 'Sällsynt och tydligt dyrare.' },
  { id: 'episk', label: 'Episk', description: 'Episk: för den som har sparat länge.' },
  {
    id: 'legendarisk',
    label: 'Legendarisk',
    description: 'Legendarisk — säsongens finaste föremål.',
  },
];

export const RARITY_META_SHOP: Readonly<Record<ShopRarity, ShopRarityMeta>> = Object.fromEntries(
  SHOP_RARITIES.map((meta) => [meta.id, meta]),
) as Readonly<Record<ShopRarity, ShopRarityMeta>>;

/** Säsonger i databasen. Fler säsonger läggs till som rader — inte som kod. */
export interface SeasonDefinition {
  id: string;
  name: string;
  description: string;
  /** Start och slut. Servern avgör tillgängligheten utifrån dessa. */
  startsAt: string;
  endsAt: string | null;
  active: boolean;
}

/**
 * Halloween är den första säsongen. Strukturen är densamma för kommande
 * säsonger (jul, vinter, alla hjärtans dag, påsk, sommar) — de läggs till som
 * rader i `seasons` och produkter kopplas till dem, utan att shoplogiken
 * behöver byggas om.
 */
export const SEASONS: readonly SeasonDefinition[] = [
  {
    id: 'halloween',
    name: 'Halloween',
    description:
      'Pumpor, spöken och mörka skogar. Säsongens föremål går att köpa medan säsongen är aktiv.',
    startsAt: '2026-10-01T00:00:00Z',
    endsAt: '2026-11-02T00:00:00Z',
    active: true,
  },
];

export const ACTIVE_SEASON_ID = 'halloween';

export interface ShopCatalogEntry {
  /** Stabilt id som följer med produkten genom köp, ägande och utrustning. */
  slug: string;
  name: string;
  description: string;
  category: ShopCategory;
  rarity: ShopRarity;
  /** Fast XP-pris. Ändras av en administratör i databasen. */
  priceXp: number;
  /** Lägsta nivå för att köpa. 1 = ingen nivågräns. */
  minLevel: number;
  seasonId: string;
  /** Sant = får bara köpas medan säsongen är aktiv. */
  seasonOnly: boolean;
  /** Ikonnyckeln i `assets/halloween-ikoner` som visas för föremålet. */
  assetKey: string;
  /** Temanyckeln i `assets/teman` — bara för UI-teman. */
  themeKey: string | null;
  /**
   * Dekorativ nyckel som temats CSS använder (t.ex. ramens hörn). Tom när
   * föremålet inte har någon extra dekoration — nya teman behöver alltså inte
   * ha samma detaljer som de här.
   */
  ornamentKey: string | null;
  position: number;
}

/**
 * Hela katalogen i visningsordning. Priserna är satta så att den första
 * figuren är inom räckhåll tidigt och de legendariska föremålen kräver en hel
 * säsongs arbete.
 */
export const SHOP_CATALOG: readonly ShopCatalogEntry[] = [
  // --------------------------------------------------------------- UI-teman
  {
    slug: 'tema-pumpa',
    name: 'Pumpatema',
    description:
      'Hela appen i pumpafältets färger: varma orange accenter, mörka stenytor och lyktor längs kanten.',
    category: 'tema',
    rarity: 'ovanlig',
    priceXp: 300,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-pumpalykta',
    themeKey: 'pumpa',
    ornamentKey: null,
    position: 10,
  },
  {
    slug: 'tema-spokhus',
    name: 'Spökhus',
    description:
      'Ett herrgårdstema i nattblått och månljus: svala ytor, glasade fönster och en tyst sal.',
    category: 'tema',
    rarity: 'sallsynt',
    priceXp: 400,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-gravsten-kors',
    themeKey: 'spokhus',
    ornamentKey: null,
    position: 11,
  },
  {
    slug: 'tema-haxkonst',
    name: 'Häxkonst',
    description:
      'Häxans kök: björkved, levande ljus, glödande kittlar och en trollbok som ligger framme.',
    category: 'tema',
    rarity: 'sallsynt',
    priceXp: 450,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-kittel',
    themeKey: 'haxkonst',
    ornamentKey: null,
    position: 12,
  },
  {
    slug: 'tema-haunted-forest',
    name: 'Haunted Forest',
    description:
      'Den djupa skogen i månsken: dimma mellan stammarna, turkosa skuggor och stilla ljus.',
    category: 'tema',
    rarity: 'episk',
    priceXp: 500,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-trad',
    themeKey: 'haunted-forest',
    ornamentKey: null,
    position: 13,
  },
  {
    slug: 'tema-midnight',
    name: 'Midnight Halloween',
    description:
      'Midnatt i neon: lila och magenta, lyktor över grusgången och en måne som lyser upp allt.',
    category: 'tema',
    rarity: 'legendarisk',
    priceXp: 600,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-mane',
    themeKey: 'midnight',
    ornamentKey: null,
    position: 14,
  },
  {
    slug: 'tema-ghostly-moonlight',
    name: 'Ghostly Moonlight',
    description:
      'Blåsvart natt med kallt månsken, silvergrå ytor och ett stilla spökljus över kanterna.',
    category: 'tema',
    rarity: 'episk',
    priceXp: 550,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-mane',
    themeKey: 'ghostly-moonlight',
    ornamentKey: null,
    position: 15,
  },
  {
    slug: 'tema-candy-crypt',
    name: 'Candy Crypt',
    description:
      'Godiskryptan: polkagrisrosa, karamell och mintgrönt i en lekfull palett med gulliga monster.',
    category: 'tema',
    rarity: 'ovanlig',
    priceXp: 350,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-godisspann',
    themeKey: 'candy-crypt',
    ornamentKey: null,
    position: 16,
  },

  // --------------------------------------------------------------- Figurer
  {
    slug: 'figur-pumpan',
    name: 'Pumpan',
    description: 'En liten pumpa med lyktansikte. Första figuren i samlingen.',
    category: 'figur',
    rarity: 'vanlig',
    priceXp: 60,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-pumpalykta',
    themeKey: null,
    ornamentKey: null,
    position: 20,
  },
  {
    slug: 'figur-lilla-spoket',
    name: 'Lilla spöket',
    description: 'Ett spöke som svävar stilla och tittar nyfiket tillbaka.',
    category: 'figur',
    rarity: 'vanlig',
    priceXp: 60,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-spoke',
    themeKey: null,
    ornamentKey: null,
    position: 21,
  },
  {
    slug: 'figur-fladdermusen',
    name: 'Fladdermusen',
    description: 'En fladdermus som flyger lågt över trädgården i skymningen.',
    category: 'figur',
    rarity: 'vanlig',
    priceXp: 60,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-fladdermus',
    themeKey: null,
    ornamentKey: null,
    position: 22,
  },
  {
    slug: 'figur-svarta-katten',
    name: 'Svarta katten',
    description: 'En svart katt med gula ögon som ser allt som rör sig.',
    category: 'figur',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-katt',
    themeKey: null,
    ornamentKey: null,
    position: 23,
  },
  {
    slug: 'figur-haxan',
    name: 'Häxan',
    description: 'Häxhatten ensam — resten av häxan syns bara i månsken.',
    category: 'figur',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-haxhatt',
    themeKey: null,
    ornamentKey: null,
    position: 24,
  },
  {
    slug: 'figur-skelettet',
    name: 'Skelettet',
    description: 'En skalle med tomma ögonhålor och ett leende kvar.',
    category: 'figur',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-skalle',
    themeKey: null,
    ornamentKey: null,
    position: 25,
  },
  {
    slug: 'figur-magiska-flaskan',
    name: 'Magiska flaskan',
    description: 'En flaska med dryck som glittrar. Receptet står ingenstans.',
    category: 'figur',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-trolldryck',
    themeKey: null,
    ornamentKey: null,
    position: 26,
  },
  {
    slug: 'figur-pumpakrigaren',
    name: 'Pumpakrigaren',
    description: 'Ett pumpahuvud med glatt ansikte och ett litet ljus i botten.',
    category: 'figur',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-pumpahuvud',
    themeKey: null,
    ornamentKey: null,
    position: 27,
  },
  {
    slug: 'figur-stjarnspoket',
    name: 'Stjärnspöket',
    description: 'Ett spöke som sträcker armarna i vädret när det blir uppspelt.',
    category: 'figur',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-spoke-armar',
    themeKey: null,
    ornamentKey: null,
    position: 28,
  },
  {
    slug: 'figur-korpmagikern',
    name: 'Korpmagikern',
    description: 'Korpen med gul näbb — den håller ordning på hela trädgården.',
    category: 'figur',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-korp',
    themeKey: null,
    ornamentKey: null,
    position: 29,
  },
  {
    slug: 'figur-spokkungen',
    name: 'Spökkungen',
    description: 'Lakanet med två tomma ögon. Den som ser den slutar inte titta bort.',
    category: 'figur',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-lakan',
    themeKey: null,
    ornamentKey: null,
    position: 30,
  },
  {
    slug: 'figur-pumpakungen',
    name: 'Pumpakungen',
    description: 'Säsongens sista figur: två pumpor sida vid sida, en stor och en liten.',
    category: 'figur',
    rarity: 'legendarisk',
    priceXp: 500,
    minLevel: 5,
    seasonId: 'halloween',
    seasonOnly: true,
    assetKey: 'ikon-pumpor',
    themeKey: null,
    ornamentKey: null,
    position: 31,
  },

  // --------------------------------------------------------------- Avatarer
  {
    slug: 'avatar-katten',
    name: 'Kattavatar',
    description: 'Den svarta katten som avatar. Byter bara bilden — inget annat ändras.',
    category: 'avatar',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-katt',
    themeKey: null,
    ornamentKey: null,
    position: 40,
  },
  {
    slug: 'avatar-korpen',
    name: 'Korpavatar',
    description: 'Korpen med den gula näbben.',
    category: 'avatar',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-korp',
    themeKey: null,
    ornamentKey: null,
    position: 41,
  },
  {
    slug: 'avatar-skallen',
    name: 'Skalleavatar',
    description: 'En skalle, tom och leende.',
    category: 'avatar',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-skalle',
    themeKey: null,
    ornamentKey: null,
    position: 42,
  },
  {
    slug: 'avatar-manen',
    name: 'Månavatar',
    description: 'Månskäran med stjärnan i släptåg.',
    category: 'avatar',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-mane',
    themeKey: null,
    ornamentKey: null,
    position: 43,
  },
  {
    slug: 'avatar-spoket',
    name: 'Spökavatar',
    description: 'Ett litet spöke som avatar. Det ser ut att sväva även när det står still.',
    category: 'avatar',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-spoke',
    themeKey: null,
    ornamentKey: null,
    position: 44,
  },
  {
    slug: 'avatar-pumpalyktan',
    name: 'Pumpalyktsavatar',
    description: 'En pumpalykta med glatt ansikte och ett ljus som aldrig slocknar.',
    category: 'avatar',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-pumpahuvud',
    themeKey: null,
    ornamentKey: null,
    position: 45,
  },
  {
    slug: 'avatar-haxan',
    name: 'Häxavatar',
    description: 'Häxhatten med spetsig topp — resten av häxan syns bara i månsken.',
    category: 'avatar',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-haxhatt',
    themeKey: null,
    ornamentKey: null,
    position: 46,
  },
  {
    slug: 'avatar-godisspannen',
    name: 'Godisspannsavatar',
    description: 'En spann full av godis. Färgerna hör till Candy Crypt-temat.',
    category: 'avatar',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-godisspann',
    themeKey: null,
    ornamentKey: null,
    position: 47,
  },

  // --------------------------------------------------------- Profilramar
  {
    slug: 'ram-spindelnatet',
    name: 'Spindelnätsramen',
    description: 'En tunn ram med spindelnät i hörnen.',
    category: 'profilram',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-spindelnat',
    themeKey: null,
    ornamentKey: 'ikon-spindelnat',
    position: 50,
  },
  {
    slug: 'ram-slime',
    name: 'Slemramen',
    description: 'En ram som droppar av grönt slem.',
    category: 'profilram',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-kittel',
    themeKey: null,
    ornamentKey: 'ikon-kittel',
    position: 51,
  },
  {
    slug: 'ram-manljuset',
    name: 'Månljusramen',
    description: 'En ram med stilla månljus runt avataren.',
    category: 'profilram',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-mane',
    themeKey: null,
    ornamentKey: 'ikon-mane',
    position: 52,
  },
  {
    slug: 'ram-pumpaglod',
    name: 'Pumpaglo',
    description: 'En ram som glöder svagt inifrån, som en pumpalykta.',
    category: 'profilram',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-pumpalykta',
    themeKey: null,
    ornamentKey: 'ikon-pumpalykta',
    position: 53,
  },
  {
    slug: 'ram-spokgloet',
    name: 'Spökgloet',
    description: 'En blek ring med ett svagt spökljus som följer avatarens kant.',
    category: 'profilram',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-spoke',
    themeKey: null,
    ornamentKey: 'ikon-spoke',
    position: 54,
  },
  {
    slug: 'ram-fladdermusvingar',
    name: 'Fladdermusvingar',
    description: 'Två små vingar som ramar in avataren utan att skymma den.',
    category: 'profilram',
    rarity: 'sallsynt',
    priceXp: 240,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-fladdermus',
    themeKey: null,
    ornamentKey: 'ikon-fladdermus',
    position: 55,
  },
  {
    slug: 'ram-trolldom',
    name: 'Trolldomsramen',
    description: 'En lila ram med en kristall i hörnet, som om den vore förtrollad.',
    category: 'profilram',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-kristallkula',
    themeKey: null,
    ornamentKey: 'ikon-kristallkula',
    position: 56,
  },
  {
    slug: 'ram-godisstangen',
    name: 'Godisstången',
    description: 'En randig godisstång runt avataren — sötare än den ser ut.',
    category: 'profilram',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-majsgodis',
    themeKey: null,
    ornamentKey: 'ikon-majsgodis',
    position: 57,
  },

  // -------------------------------------------------------- Ikoner och märken
  {
    slug: 'marke-ogat',
    name: 'Ögat',
    description:
      'Ett öga med grön iris som märke bredvid namnet. Det första köpet i shopen.',
    category: 'marke',
    rarity: 'vanlig',
    priceXp: 40,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-oga',
    themeKey: null,
    ornamentKey: null,
    position: 60,
  },
  {
    slug: 'marke-spindelnatet',
    name: 'Spindelnätsmärket',
    description: 'Ett litet nät som håller ihop hörnet av namnet.',
    category: 'marke',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-spindelnat',
    themeKey: null,
    ornamentKey: null,
    position: 61,
  },
  {
    slug: 'marke-kristallen',
    name: 'Kristallmärket',
    description: 'En kristallkula som visar dimmor i stället för framtiden.',
    category: 'marke',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-kristallkula',
    themeKey: null,
    ornamentKey: null,
    position: 62,
  },
  {
    slug: 'marke-nyckeln',
    name: 'Nyckelmärket',
    description: 'En gammal nyckel. Ingen vet vilket lås den passar i.',
    category: 'marke',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-nyckel',
    themeKey: null,
    ornamentKey: null,
    position: 63,
  },
  {
    slug: 'marke-pumpaskordaren',
    name: 'Pumpaskördaren',
    description: 'Två pumpor sida vid sida — för den som samlar på säsongens skörd.',
    category: 'marke',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-pumpor',
    themeKey: null,
    ornamentKey: null,
    position: 64,
  },
  {
    slug: 'marke-spokjakten',
    name: 'Spökjägaren',
    description: 'Ett spöke med armarna i vädret. Märket till den som vågar leta.',
    category: 'marke',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-spoke-armar',
    themeKey: null,
    ornamentKey: null,
    position: 65,
  },
  {
    slug: 'marke-midnattsvandraren',
    name: 'Midnattsvandraren',
    description: 'En lykta i mörkret — märket för den som är vaken när alla andra sover.',
    category: 'marke',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-lykta',
    themeKey: null,
    ornamentKey: null,
    position: 66,
  },
  {
    slug: 'marke-godissamlaren',
    name: 'Godissamlaren',
    description: 'En spann med godis. Det billigaste märket i shopen och det sötaste.',
    category: 'marke',
    rarity: 'vanlig',
    priceXp: 80,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-godisspann',
    themeKey: null,
    ornamentKey: null,
    position: 67,
  },

  // --------------------------------------------------------- Dekorationer
  {
    slug: 'dekor-gravstenen',
    name: 'Gravstenen',
    description: 'En sten med bokstäverna RIP som dekoration på din profilsida.',
    category: 'dekoration',
    rarity: 'vanlig',
    priceXp: 60,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-gravsten',
    themeKey: null,
    ornamentKey: null,
    position: 70,
  },
  {
    slug: 'dekor-staketet',
    name: 'Järnstaketet',
    description: 'Ett smitt staket som håller ordning längst ned på profilen.',
    category: 'dekoration',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-staket',
    themeKey: null,
    ornamentKey: null,
    position: 71,
  },
  {
    slug: 'dekor-knotiga-tradet',
    name: 'Knotiga trädet',
    description: 'Ett träd utan löv, med grenar som ser ut som fingrar.',
    category: 'dekoration',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-trad',
    themeKey: null,
    ornamentKey: null,
    position: 72,
  },
  {
    slug: 'dekor-lyktan',
    name: 'Ljuslyktan',
    description: 'En liten lykta som står på profilsidan och lyser åt dig.',
    category: 'dekoration',
    rarity: 'vanlig',
    priceXp: 60,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-lykta',
    themeKey: null,
    ornamentKey: null,
    position: 73,
  },
  {
    slug: 'dekor-kristallerna',
    name: 'Kristallerna',
    description: 'Tre kristaller som samlar månljus bredvid din profil.',
    category: 'dekoration',
    rarity: 'ovanlig',
    priceXp: 120,
    minLevel: 2,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-kristallkula',
    themeKey: null,
    ornamentKey: null,
    position: 74,
  },
  {
    slug: 'dekor-spoket',
    name: 'Spökbesöket',
    description: 'Ett litet spöke som håller dig sällskap på profilen.',
    category: 'dekoration',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-spoke',
    themeKey: null,
    ornamentKey: null,
    position: 75,
  },
  {
    slug: 'dekor-fladdermusen',
    name: 'Nattfladdermusen',
    description: 'En fladdermus som hänger upp och ned i profilens överkant.',
    category: 'dekoration',
    rarity: 'sallsynt',
    priceXp: 200,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-hangande-fladdermus',
    themeKey: null,
    ornamentKey: null,
    position: 76,
  },
  {
    slug: 'dekor-manskivan',
    name: 'Månskivan',
    description: 'En måne med stjärnor som lyser över profilen även dagtid.',
    category: 'dekoration',
    rarity: 'episk',
    priceXp: 320,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-mane',
    themeKey: null,
    ornamentKey: null,
    position: 77,
  },

  // ---------------------------------------------------- Visuella effekter
  {
    slug: 'effekt-dimman',
    name: 'Dimman',
    description: 'Långsam dimma som rör sig över appens nederkant.',
    category: 'effekt',
    rarity: 'vanlig',
    priceXp: 80,
    minLevel: 1,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-gravsten',
    themeKey: null,
    ornamentKey: null,
    position: 80,
  },
  {
    slug: 'effekt-spokparaden',
    name: 'Spöktåget',
    description: 'Ett par små spöken som svävar förbi då och då.',
    category: 'effekt',
    rarity: 'sallsynt',
    priceXp: 240,
    minLevel: 3,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-spoke',
    themeKey: null,
    ornamentKey: null,
    position: 81,
  },
  {
    slug: 'effekt-stjarnfallet',
    name: 'Stjärnfallet',
    description: 'Enstaka stjärnfall över appens överkant.',
    category: 'effekt',
    rarity: 'episk',
    priceXp: 360,
    minLevel: 4,
    seasonId: 'halloween',
    seasonOnly: false,
    assetKey: 'ikon-mane',
    themeKey: null,
    ornamentKey: null,
    position: 82,
  },
];

/** Katalogen som en uppslagstabell på slug. */
export const CATALOG_BY_SLUG: Readonly<Record<string, ShopCatalogEntry>> = Object.fromEntries(
  SHOP_CATALOG.map((entry) => [entry.slug, entry]),
);

/** Temanycklarna som har en egen temafil i `styles/teman.css`. */
export const THEME_KEYS: readonly string[] = SHOP_CATALOG.filter(
  (entry) => entry.themeKey !== null,
).map((entry) => entry.themeKey as string);

/** Priset ligger alltid i hela XP, aldrig i riktiga pengar. */
export function isValidPrice(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 100000;
}

/** Sant när nivåkravet är rimligt (1 = inget krav). */
export function isValidMinLevel(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 99;
}
