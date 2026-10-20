import { supabase } from './supabase';

/**
 * Butiken och XP.
 *
 * Allt som rör XP, priser och ägande avgörs av databasen: `shop_purchase`
 * kontrollerar saldo, nivå, säsong och dubbelköp och skriver kvittot i samma
 * anrop. Klienten skickar bara ett produkt-id och en idempotensnyckel – aldrig
 * ett pris eller ett saldo.
 */

export type ShopCategory =
  | 'tema'
  | 'figur'
  | 'avatar'
  | 'profilram'
  | 'marke'
  | 'dekoration'
  | 'effekt';

export type ShopRarity = 'vanlig' | 'ovanlig' | 'sallsynt' | 'episk' | 'legendarisk';

export type EquipKind = 'tema' | 'avatar' | 'ram' | 'marke' | 'figur' | 'dekoration' | 'effekt';

export interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: ShopCategory;
  equip_kind: EquipKind | null;
  rarity: ShopRarity;
  price_xp: number;
  min_level: number;
  season_id: string | null;
  season_only: boolean;
  asset_key: string | null;
  theme_key: string | null;
  ornament_key: string | null;
  published: boolean;
  position: number;
}

export interface ShopPurchase {
  id: string;
  product_id: string | null;
  product_slug: string;
  name: string;
  category: ShopCategory;
  equip_kind: EquipKind | null;
  rarity: ShopRarity | null;
  price_xp: number;
  purchased_at: string;
}

export interface EquippedItem {
  kind: EquipKind;
  product_id: string;
}

export interface ShopSeason {
  id: string;
  name: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export interface XpState {
  total_xp: number;
  level: number;
}

/** Etiketter och ordning. Ordningen styr både sortering och färgskala. */
export const CATEGORY_META: Record<ShopCategory, { label: string; plural: string }> = {
  tema: { label: 'Tema', plural: 'Teman' },
  figur: { label: 'Figur', plural: 'Figurer' },
  avatar: { label: 'Avatar', plural: 'Avatarer' },
  profilram: { label: 'Profilram', plural: 'Profilramar' },
  marke: { label: 'Märke', plural: 'Märken' },
  dekoration: { label: 'Dekoration', plural: 'Dekorationer' },
  effekt: { label: 'Effekt', plural: 'Effekter' },
};

export const RARITY_META: Record<
  ShopRarity,
  { label: string; order: number; tone: 'neutral' | 'green' | 'blue' | 'amber' | 'red' }
> = {
  vanlig: { label: 'Vanlig', order: 1, tone: 'neutral' },
  ovanlig: { label: 'Ovanlig', order: 2, tone: 'green' },
  sallsynt: { label: 'Sällsynt', order: 3, tone: 'blue' },
  episk: { label: 'Episk', order: 4, tone: 'amber' },
  legendarisk: { label: 'Legendarisk', order: 5, tone: 'red' },
};

/**
 * Ikonerna som finns i `public/halloween/ikoner`. Butikens produkter pekar på
 * en av dem via `asset_key`; listan används av adminformuläret så att ingen
 * produkt kan spara en bild som inte finns i paketet.
 */
export const SHOP_ICON_KEYS = [
  'ikon-pumpalykta',
  'ikon-pumpor',
  'ikon-stor-pumpa',
  'ikon-vit-pumpa',
  'ikon-pumpahuvud',
  'ikon-spoke',
  'ikon-spoke-armar',
  'ikon-lakan',
  'ikon-skalle',
  'ikon-korsade-ben',
  'ikon-ben',
  'ikon-gravsten',
  'ikon-gravsten-kors',
  'ikon-stenkors',
  'ikon-trakors',
  'ikon-kista',
  'ikon-katt',
  'ikon-korp',
  'ikon-fladdermus',
  'ikon-hangande-fladdermus',
  'ikon-spindel',
  'ikon-spindelnat',
  'ikon-kittel',
  'ikon-trolldryck',
  'ikon-skallflaska',
  'ikon-gron-dryck',
  'ikon-trollbok',
  'ikon-trollstav',
  'ikon-kvast',
  'ikon-haxhatt',
  'ikon-mane',
  'ikon-lykta',
  'ikon-ljus',
  'ikon-kristallkula',
  'ikon-nyckel',
  'ikon-oga',
  'ikon-staket',
  'ikon-trad',
  'ikon-pergament',
  'ikon-godisspann',
  'ikon-karamell',
  'ikon-polkagris',
  'ikon-chokladkaka',
  'ikon-muffins',
  'ikon-kanderat-apple',
  'ikon-majsgodis',
  'ikon-klubba',
  'ikon-stenrose',
];

export const CATEGORIES: ShopCategory[] = [
  'tema',
  'figur',
  'avatar',
  'profilram',
  'marke',
  'dekoration',
  'effekt',
];

export const RARITIES: ShopRarity[] = ['vanlig', 'ovanlig', 'sallsynt', 'episk', 'legendarisk'];

export const EQUIP_LABEL: Record<EquipKind, string> = {
  tema: 'Tema',
  avatar: 'Avatar',
  ram: 'Profilram',
  marke: 'Märke',
  figur: 'Figur',
  dekoration: 'Dekoration',
  effekt: 'Effekt',
};

const fail = (error: { message?: string } | null, fallback: string): never => {
  throw new Error(error?.message?.trim() || fallback);
};

// ------------------------------------------------------------------ läsning

export async function loadXp(): Promise<XpState> {
  const { data, error } = await supabase.rpc('my_xp');
  if (error) fail(error, 'Kunde inte hämta XP-saldot.');
  const row = (data ?? {}) as { total_xp?: number; level?: number };
  return { total_xp: Number(row.total_xp ?? 0), level: Number(row.level ?? 1) };
}

/**
 * Alla produkter användaren får se. RLS släpper bara igenom publicerade
 * föremål – administratören ser även avpublicerade, för att kunna redigera dem.
 */
export async function listShopProducts(): Promise<ShopProduct[]> {
  const { data, error } = await supabase
    .from('shop_products')
    .select(
      'id,slug,name,description,category,equip_kind,rarity,price_xp,min_level,season_id,season_only,asset_key,theme_key,ornament_key,published,position',
    )
    .order('position', { ascending: true })
    .order('price_xp', { ascending: true });
  if (error) fail(error, 'Kunde inte hämta butikens föremål.');
  return (data ?? []) as ShopProduct[];
}

export async function listSeasons(): Promise<ShopSeason[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id,name,description,starts_at,ends_at,active')
    .order('active', { ascending: false })
    .order('name', { ascending: true });
  if (error) fail(error, 'Kunde inte hämta säsongerna.');
  return (data ?? []) as ShopSeason[];
}

export async function listMyPurchases(): Promise<ShopPurchase[]> {
  const { data, error } = await supabase
    .from('shop_purchases')
    .select('id,product_id,product_slug,name,category,equip_kind,rarity,price_xp,purchased_at')
    .order('purchased_at', { ascending: false });
  if (error) fail(error, 'Kunde inte hämta dina köp.');
  return (data ?? []) as ShopPurchase[];
}

export async function listMyEquipped(): Promise<EquippedItem[]> {
  const { data, error } = await supabase.from('user_equipped').select('kind,product_id');
  if (error) fail(error, 'Kunde inte hämta din utrustning.');
  return (data ?? []) as EquippedItem[];
}

// ------------------------------------------------------------------- köp

/** Nyckel som gör att ett upprepat anrop återanvänder samma köp. */
export function newPurchaseKey(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `butik-${random}`;
}

export interface PurchaseResult {
  ok: boolean;
  already: boolean;
  name: string;
  price_xp: number;
  total_xp: number;
  level: number;
}

export async function buyProduct(
  productId: string,
  idempotencyKey: string = newPurchaseKey(),
): Promise<PurchaseResult> {
  const { data, error } = await supabase.rpc('shop_purchase', {
    p_product_id: productId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) fail(error, 'Köpet kunde inte genomföras.');
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(row.ok),
    already: Boolean(row.already),
    name: String(row.name ?? ''),
    price_xp: Number(row.price_xp ?? 0),
    total_xp: Number(row.total_xp ?? 0),
    level: Number(row.level ?? 1),
  };
}

export async function equipProduct(productId: string): Promise<void> {
  const { error } = await supabase.rpc('shop_equip', { p_product_id: productId });
  if (error) fail(error, 'Föremålet kunde inte användas.');
}

export async function unequipKind(kind: EquipKind): Promise<void> {
  const { error } = await supabase.rpc('shop_unequip', { p_kind: kind });
  if (error) fail(error, 'Föremålet kunde inte tas av.');
}

// ------------------------------------------------------- administrationen

export interface ProductInput {
  id?: string | null;
  slug: string;
  name: string;
  description: string;
  category: ShopCategory;
  rarity: ShopRarity;
  priceXp: number;
  minLevel: number;
  seasonId: string;
  seasonOnly: boolean;
  assetKey: string;
  /** Krävs av databasen när kategorin är `tema`. */
  themeKey: string;
  published: boolean;
}

export async function adminSaveProduct(input: ProductInput): Promise<void> {
  const { error } = await supabase.rpc('admin_shop_save_product', {
    p_product: {
      id: input.id ?? '',
      slug: input.slug,
      name: input.name,
      description: input.description,
      category: input.category,
      rarity: input.rarity,
      price_xp: input.priceXp,
      min_level: input.minLevel,
      season_id: input.seasonId,
      season_only: input.seasonOnly,
      asset_key: input.assetKey,
      theme_key: input.themeKey,
      published: input.published,
    },
  });
  if (error) fail(error, 'Föremålet kunde inte sparas.');
}

export async function adminSetProductPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_shop_set_published', {
    p_product_id: id,
    p_published: published,
  });
  if (error) fail(error, 'Publiceringen kunde inte ändras.');
}

export async function adminSaveSeason(input: {
  id: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_shop_save_season', {
    p_season: {
      id: input.id,
      name: input.name,
      description: input.description,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      active: input.active,
    },
  });
  if (error) fail(error, 'Säsongen kunde inte sparas.');
}

// --------------------------------------------------------------- XP från admin

export interface XpAccount {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  active: boolean;
  total_xp: number;
  level: number;
}

export async function adminXpOverview(query = ''): Promise<XpAccount[]> {
  const { data, error } = await supabase.rpc('admin_xp_overview', {
    p_query: query,
    p_limit: 60,
  });
  if (error) fail(error, 'Kunde inte hämta XP-saldona.');
  return (data ?? []) as XpAccount[];
}

export async function adminGrantXp(input: {
  userId: string;
  amount: number;
  reason: string;
}): Promise<{ total_xp: number; level: number }> {
  const { data, error } = await supabase.rpc('admin_grant_xp', {
    p_user: input.userId,
    p_amount: input.amount,
    p_reason: input.reason,
  });
  if (error) fail(error, 'XP kunde inte ändras.');
  const row = (data ?? {}) as { total_xp?: number; level?: number };
  return { total_xp: Number(row.total_xp ?? 0), level: Number(row.level ?? 1) };
}

// ------------------------------------------------------------------ hjälpare

/**
 * Varför ett föremål inte kan köpas just nu, eller null när det går att köpa.
 * Samma regler som `shop_purchase` prövar på servern – här bara för att kunna
 * förklara dem i gränssnittet innan eleven klickar.
 */
export function purchaseBlocker(input: {
  product: Pick<ShopProduct, 'price_xp' | 'min_level' | 'season_only' | 'season_id'>;
  owned: boolean;
  totalXp: number;
  level: number;
  activeSeasons: string[];
}): string | null {
  const { product, owned, totalXp, level, activeSeasons } = input;
  if (owned) return 'Du äger redan det här föremålet.';
  if (product.season_only && (!product.season_id || !activeSeasons.includes(product.season_id))) {
    return 'Säsongen är inte aktiv just nu.';
  }
  if (level < product.min_level) return `Kräver nivå ${product.min_level}.`;
  if (totalXp < product.price_xp) {
    const missing = product.price_xp - totalXp;
    return `Du saknar ${missing} XP.`;
  }
  return null;
}

/** Sorterar så att det sällsynta och dyra ligger först inom varje grupp. */
export function sortProducts(products: ShopProduct[]): ShopProduct[] {
  return [...products].sort((a, b) => {
    const rarity = RARITY_META[b.rarity].order - RARITY_META[a.rarity].order;
    if (rarity !== 0) return rarity;
    if (a.position !== b.position) return a.position - b.position;
    return a.price_xp - b.price_xp;
  });
}

export function filterProducts(
  products: ShopProduct[],
  options: {
    category?: ShopCategory | 'alla';
    query?: string;
    onlyAffordable?: boolean;
    ownedIds?: Set<string>;
    totalXp?: number;
  },
): ShopProduct[] {
  const text = (options.query ?? '').trim().toLocaleLowerCase('sv');
  const category = options.category ?? 'alla';
  return products.filter((product) => {
    if (category !== 'alla' && product.category !== category) return false;
    if (options.onlyAffordable && (options.totalXp ?? 0) < product.price_xp) return false;
    if (!text) return true;
    return `${product.name} ${product.description ?? ''} ${CATEGORY_META[product.category].label}`
      .toLocaleLowerCase('sv')
      .includes(text);
  });
}

/** Antal föremål per kategori, för flikarna. */
export function categoryCounts(products: ShopProduct[]): Record<ShopCategory, number> {
  const counts = Object.fromEntries(CATEGORIES.map((key) => [key, 0])) as Record<
    ShopCategory,
    number
  >;
  for (const product of products) counts[product.category] += 1;
  return counts;
}
