/**
 * Halloween-katalogens form: platser, paletter, teman och standardval.
 *
 * Det som avgör *vad* en del kostar, heter och kräver för nivå ligger i
 * databasen (`halloween_avatar_parts`) och läses därifrån. Här ligger bara det
 * klienten måste känna till för att kunna rita, gruppera och återställa
 * utseendet – plus standardvalen, som måste vara gratis delar i katalogen.
 */

/** Alla platser en avatar-del kan sitta på. Ordningen är ritytans ordning. */
export type AvatarSlot =
  | 'bakgrund'
  | 'effekt'
  | 'husdjur'
  | 'klader'
  | 'hudton'
  | 'ogon'
  | 'ogonfarg'
  | 'frisyr'
  | 'harfarg'
  | 'huvudbonad'
  | 'mask'
  | 'glasogon';

/** Dekorationer hör till rummet, inte till avataren. */
export type PartSlot = AvatarSlot | 'dekoration';

export type PartKind = 'del' | 'farg';

export interface SlotMeta {
  id: AvatarSlot;
  label: string;
  /** Kort hjälprad i avatarstudion. */
  hint: string;
  kind: PartKind;
  /** Sant när platsen får vara tom (hatt, mask, glasögon). */
  optional: boolean;
  group: 'Karaktär' | 'Kläder' | 'Scen';
}

/**
 * Platserna i den ordning de visas. Karaktären först, sedan kläder, sist scenen.
 * `optional` styr om panelen erbjuder "Ta bort".
 */
export const AVATAR_SLOTS: readonly SlotMeta[] = [
  {
    id: 'hudton',
    label: 'Hudton',
    hint: 'Välj den ton som passar dig.',
    kind: 'farg',
    optional: false,
    group: 'Karaktär',
  },
  {
    id: 'ogon',
    label: 'Ögon',
    hint: 'Formen på ögonen.',
    kind: 'del',
    optional: false,
    group: 'Karaktär',
  },
  {
    id: 'ogonfarg',
    label: 'Ögonfärg',
    hint: 'Färgen i iris.',
    kind: 'farg',
    optional: false,
    group: 'Karaktär',
  },
  {
    id: 'frisyr',
    label: 'Frisyr',
    hint: 'Hårets form.',
    kind: 'del',
    optional: false,
    group: 'Karaktär',
  },
  {
    id: 'harfarg',
    label: 'Hårfärg',
    hint: 'Hårets färg.',
    kind: 'farg',
    optional: false,
    group: 'Karaktär',
  },
  {
    id: 'klader',
    label: 'Kläder',
    hint: 'Dräkten du bär.',
    kind: 'del',
    optional: false,
    group: 'Kläder',
  },
  {
    id: 'huvudbonad',
    label: 'Huvudbonad',
    hint: 'Hatt, huva eller krona.',
    kind: 'del',
    optional: true,
    group: 'Kläder',
  },
  {
    id: 'mask',
    label: 'Mask',
    hint: 'Döljer ansiktet helt eller delvis.',
    kind: 'del',
    optional: true,
    group: 'Kläder',
  },
  {
    id: 'glasogon',
    label: 'Glasögon',
    hint: 'Bågar och glas.',
    kind: 'del',
    optional: true,
    group: 'Kläder',
  },
  {
    id: 'bakgrund',
    label: 'Bakgrund',
    hint: 'Scenen bakom dig.',
    kind: 'del',
    optional: false,
    group: 'Scen',
  },
  {
    id: 'effekt',
    label: 'Effekt',
    hint: 'Ljus och partiklar runt omkring.',
    kind: 'del',
    optional: true,
    group: 'Scen',
  },
  {
    id: 'husdjur',
    label: 'Husdjur',
    hint: 'Sällskapet som följer med.',
    kind: 'del',
    optional: true,
    group: 'Scen',
  },
];

export const AVATAR_SLOT_IDS: readonly AvatarSlot[] = AVATAR_SLOTS.map((slot) => slot.id);

export const SLOT_BY_ID: Record<AvatarSlot, SlotMeta> = AVATAR_SLOTS.reduce(
  (all, slot) => ({ ...all, [slot.id]: slot }),
  {} as Record<AvatarSlot, SlotMeta>,
);

export function slotLabel(slot: PartSlot): string {
  if (slot === 'dekoration') return 'Dekoration';
  return SLOT_BY_ID[slot]?.label ?? slot;
}

/** Det utseende en elev har innan något är sparat. Alla val är gratis delar. */
export const DEFAULT_LOOK: Readonly<Record<AvatarSlot, string>> = {
  hudton: 'ton-3',
  ogon: 'oga-vanlig',
  ogonfarg: 'ogonfarg-gron',
  frisyr: 'har-kort',
  harfarg: 'harfarg-brun',
  klader: 'klad-hoodie',
  huvudbonad: '',
  mask: '',
  glasogon: '',
  bakgrund: 'bg-maneskog',
  effekt: 'fx-glod',
  husdjur: 'pet-katt',
};

/** Ett utseende som bara innehåller kända platser och strängvärden. */
export type AvatarLook = Partial<Record<AvatarSlot, string>>;

/**
 * Gör om ett sparat utseende till ett komplett sådant. Okända platser och
 * tomma värden faller tillbaka på standardvalet, så en gammal eller trasig rad
 * aldrig kan lämna avataren utan frisyr eller hudton.
 */
export function normalizeLook(raw: unknown): Record<AvatarSlot, string> {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const look = { ...DEFAULT_LOOK } as Record<AvatarSlot, string>;
  for (const slot of AVATAR_SLOTS) {
    const value = source[slot.id];
    if (typeof value === 'string' && value.trim()) {
      look[slot.id] = value.trim();
    }
  }
  return look;
}

export type Rarity = 'vanlig' | 'ovanlig' | 'sallsynt' | 'episk' | 'legendarisk';

export const RARITY_ORDER: readonly Rarity[] = [
  'vanlig',
  'ovanlig',
  'sallsynt',
  'episk',
  'legendarisk',
];

export const RARITY_META: Record<Rarity, { label: string; tone: string }> = {
  vanlig: { label: 'Vanlig', tone: 'rarity-vanlig' },
  ovanlig: { label: 'Ovanlig', tone: 'rarity-ovanlig' },
  sallsynt: { label: 'Sällsynt', tone: 'rarity-sallsynt' },
  episk: { label: 'Episk', tone: 'rarity-episk' },
  legendarisk: { label: 'Legendarisk', tone: 'rarity-legendarisk' },
};

export function isRarity(value: string | null | undefined): value is Rarity {
  return typeof value === 'string' && (RARITY_ORDER as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ teman */

/**
 * Temanycklarna. `halloween` är det fria säsongstemat som alla elever kan slå
 * på och av; de övriga är köpta teman ur shopen (samma nycklar som produkterna
 * `tema-*` använder).
 */
export const FREE_THEME_KEY = 'halloween';

export const THEME_KEYS = [
  'pumpa',
  'spokhus',
  'haxkonst',
  'haunted-forest',
  'midnight',
  'ghostly-moonlight',
  'candy-crypt',
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

export interface ThemeMeta {
  key: string;
  label: string;
  description: string;
  /** Färger för förhandsvisningen i shopen. */
  swatches: [string, string, string];
}

export const THEME_META: Record<string, ThemeMeta> = {
  halloween: {
    key: 'halloween',
    label: 'Nattens Elda',
    description:
      'Säsongens fria tema: varma accenter och månsken i detaljerna. Appens vanliga färger ligger kvar.',
    swatches: ['#f4f1e8', '#b0630f', '#7d5a3a'],
  },
  pumpa: {
    key: 'pumpa',
    label: 'Pumpatema',
    description: 'Varma orange accenter, mörka stenytor och lyktor längs kanten.',
    swatches: ['#231a16', '#f08a34', '#6d4a34'],
  },
  spokhus: {
    key: 'spokhus',
    label: 'Spökhus',
    description: 'Nattblått och månljus: svala ytor, glasade fönster och en tyst sal.',
    swatches: ['#101826', '#8fb8e8', '#33465f'],
  },
  haxkonst: {
    key: 'haxkonst',
    label: 'Häxkonst',
    description: 'Björkved, levande ljus, glödande kittlar och en trollbok som ligger framme.',
    swatches: ['#1b1712', '#d9b26a', '#6b7f4a'],
  },
  'haunted-forest': {
    key: 'haunted-forest',
    label: 'Haunted Forest',
    description: 'Dimma mellan stammarna, turkosa skuggor och stilla ljus.',
    swatches: ['#0f1a18', '#5fd1b4', '#2c4a44'],
  },
  midnight: {
    key: 'midnight',
    label: 'Midnight Halloween',
    description: 'Midnatt i neon: lila och magenta, lyktor över grusgången och en måne som lyser upp allt.',
    swatches: ['#140f22', '#c65cff', '#ff8a5c'],
  },
  'ghostly-moonlight': {
    key: 'ghostly-moonlight',
    label: 'Ghostly Moonlight',
    description: 'Kallt månsken över kyrkogården: silvergrå ytor, gravstenar i dimman och ett stilla spökljus.',
    swatches: ['#0b1220', '#dbe8f7', '#5a6d84'],
  },
  'candy-crypt': {
    key: 'candy-crypt',
    label: 'Candy Crypt',
    description: 'Godiskryptan: polkagrisrosa, mintgrönt och karamell i en lekfull palett med godis längs kanten.',
    swatches: ['#1c1020', '#ff9ec4', '#8ff0d5'],
  },
};

/** Bara kända nycklar får sättas på dokumentet. */
export function safeThemeKey(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === FREE_THEME_KEY) return value;
  return (THEME_KEYS as readonly string[]).includes(value) ? value : null;
}

/* ------------------------------------------------------------ shop-kategorier */

export const PRODUCT_CATEGORIES = [
  'tema',
  'figur',
  'avatar',
  'profilram',
  'marke',
  'dekoration',
  'effekt',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_META: Record<
  string,
  { label: string; plural: string; description: string }
> = {
  tema: {
    label: 'Tema',
    plural: 'Teman',
    description: 'Byter hela appens färger och ljus.',
  },
  figur: {
    label: 'Figur',
    plural: 'Figurer',
    description: 'Små figurer som visas på din profil.',
  },
  avatar: {
    label: 'Avatar',
    plural: 'Avatarer',
    description: 'Porträttbilder som kan ersätta initialen.',
  },
  profilram: {
    label: 'Profilram',
    plural: 'Profilramar',
    description: 'Ram runt avataren.',
  },
  marke: {
    label: 'Märke',
    plural: 'Märken',
    description: 'Ett litet märke bredvid ditt namn.',
  },
  dekoration: {
    label: 'Dekoration',
    plural: 'Dekorationer',
    description: 'Föremål till din profil och din samling.',
  },
  effekt: {
    label: 'Effekt',
    plural: 'Effekter',
    description: 'Partiklar och ljus runt appen.',
  },
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'Föremål';
  return CATEGORY_META[category]?.label ?? category;
}

/** Utrustningsplatsen som hör till en produktkategori. */
export function equipKindFor(category: string): string | null {
  switch (category) {
    case 'tema':
      return 'tema';
    case 'figur':
      return 'figur';
    case 'avatar':
      return 'avatar';
    case 'profilram':
      return 'ram';
    case 'marke':
      return 'marke';
    case 'dekoration':
      return 'dekoration';
    case 'effekt':
      return 'effekt';
    default:
      return null;
  }
}

/* --------------------------------------------------------------- XP och nivå */

export interface Wallet {
  total_xp: number;
  level: number;
  xp_per_level: number;
  level_start_xp: number;
  next_level_xp: number;
}

/** Andel av vägen till nästa nivå, 0–1. Aldrig NaN. */
export function levelProgress(wallet: Wallet | null): number {
  if (!wallet || wallet.xp_per_level <= 0) return 0;
  const span = wallet.next_level_xp - wallet.level_start_xp;
  if (span <= 0) return 1;
  const done = wallet.total_xp - wallet.level_start_xp;
  return Math.min(1, Math.max(0, done / span));
}

/** Sant när saldot räcker. Används bara för text och knappstatus. */
export function canAfford(wallet: Wallet | null, price: number): boolean {
  if (!wallet) return false;
  return wallet.total_xp >= price;
}

/* -------------------------------------------------------------- filtrering */

export interface FilterableItem {
  name: string;
  description?: string | null;
  category?: string | null;
  slot?: string | null;
  rarity?: string | null;
  price_xp: number;
  owned: boolean;
  min_level: number;
}

export type SortMode = 'rekommenderad' | 'pris-upp' | 'pris-ner' | 'namn' | 'raritet';

export const SORT_LABELS: Record<SortMode, string> = {
  rekommenderad: 'Rekommenderad',
  'pris-upp': 'Lägst pris först',
  'pris-ner': 'Högst pris först',
  namn: 'Namn A–Ö',
  raritet: 'Sällsyntast först',
};

export const AVAILABILITY_LABELS = {
  alla: 'Alla',
  agda: 'Ägda',
  nya: 'Inte ägda',
} as const;

export type Availability = keyof typeof AVAILABILITY_LABELS;

/**
 * Filtrerar och sorterar shopens föremål. Ren funktion, så att urvalet kan
 * testas utan databas och beter sig likadant för produkter och avatar-delar.
 */
export function filterItems<T extends FilterableItem>(
  items: readonly T[],
  options: {
    query?: string;
    group?: string;
    availability?: Availability;
    sort?: SortMode;
  } = {},
): T[] {
  const text = (options.query ?? '').trim().toLowerCase();
  const group = options.group ?? 'alla';
  const availability = options.availability ?? 'alla';

  const filtered = items.filter((item) => {
    if (group !== 'alla' && (item.slot ?? item.category) !== group) return false;
    if (availability === 'agda' && !item.owned) return false;
    if (availability === 'nya' && item.owned) return false;
    if (!text) return true;
    return `${item.name} ${item.description ?? ''} ${item.category ?? ''} ${item.slot ?? ''}`
      .toLowerCase()
      .includes(text);
  });

  const sort = options.sort ?? 'rekommenderad';
  return [...filtered].sort((a, b) => {
    switch (sort) {
      case 'pris-upp':
        return a.price_xp - b.price_xp || a.name.localeCompare(b.name, 'sv');
      case 'pris-ner':
        return b.price_xp - a.price_xp || a.name.localeCompare(b.name, 'sv');
      case 'namn':
        return a.name.localeCompare(b.name, 'sv');
      case 'raritet': {
        const rank = (value: string | null | undefined) => {
          const index = RARITY_ORDER.indexOf((value ?? 'vanlig') as Rarity);
          return index < 0 ? 0 : index;
        };
        return rank(b.rarity) - rank(a.rarity) || a.name.localeCompare(b.name, 'sv');
      }
      default:
        // Rekommenderad: det du inte äger och har råd med först, sedan pris.
        if (a.owned !== b.owned) return a.owned ? 1 : -1;
        return a.price_xp - b.price_xp || a.name.localeCompare(b.name, 'sv');
    }
  });
}

/** Kort etikett för ett föremåls status. */
export function itemStatus(
  item: { owned: boolean; price_xp: number; min_level: number },
  wallet: Wallet | null,
): { label: string; tone: 'green' | 'amber' | 'neutral' | 'blue' } {
  if (item.owned) return { label: 'Ägs', tone: 'green' };
  if (wallet && wallet.level < item.min_level) {
    return { label: `Nivå ${item.min_level}`, tone: 'blue' };
  }
  if (item.price_xp === 0) return { label: 'Gratis', tone: 'green' };
  if (!wallet || wallet.total_xp < item.price_xp) {
    return { label: `Saknar ${item.price_xp - (wallet?.total_xp ?? 0)} XP`, tone: 'amber' };
  }
  return { label: 'Kan köpas', tone: 'neutral' };
}

/** Namn på rummets sex platser. */
export const ROOM_SLOT_LABELS: readonly string[] = [
  'Vänster fram',
  'Mitten fram',
  'Höger fram',
  'Vänster bak',
  'Mitten bak',
  'Höger bak',
];
