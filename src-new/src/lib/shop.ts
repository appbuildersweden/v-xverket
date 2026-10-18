/**
 * Shopen: produkter, köp och utrustning.
 *
 * Allt som rör poäng och ägande avgörs av servern. Den här filen läser
 * produkter och kvitton, räknar ut vad eleven får göra *just nu* — så att
 * gränssnittet kan förklara varför ett köp inte går — och skickar köpet till
 * databasfunktionen `shop_purchase`, som prövar pris, nivå, säsong och ägande en
 * gång till innan något dras. Klienten räknar alltså aldrig ut ett saldo, ett
 * pris eller ett ägande som servern inte har sagt ja till.
 *
 * Ett köp är idempotent: samma nyckel ger samma kvitto och aldrig en andra
 * debitering. Nyckeln skapas en gång per köpförsök och återanvänds om anropet
 * måste göras om (dubbelklick, omladdning, nytt nätverksförsök).
 */
import { Result, query, withClient } from './db';
import {
  CATEGORY_META,
  EquipKind,
  ShopCategory,
  ShopRarity,
  CATALOG_BY_SLUG,
} from './shop-catalog';
import { levelFromXp } from './planner';

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

export interface ShopSeason {
  id: string;
  name: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

/** Ett genomfört köp. Innehåller kopian från köptillfället. */
export interface ShopPurchase {
  id: string;
  product_id: string | null;
  product_slug: string;
  name: string;
  category: ShopCategory;
  equip_kind: EquipKind | null;
  rarity: ShopRarity | null;
  theme_key: string | null;
  asset_key: string | null;
  ornament_key: string | null;
  price_xp: number;
  purchased_at: string;
}

/** Aktivt tema och utrustade föremål: plats → produkt-id. */
export type EquippedMap = Partial<Record<EquipKind, string>>;

/** Vad en utrustningsplats kallas i gränssnittet. */
export const EQUIP_KIND_LABELS: Readonly<Record<EquipKind, string>> = {
  tema: 'tema',
  avatar: 'avatar',
  ram: 'profilram',
  marke: 'märke',
  figur: 'figur',
  dekoration: 'dekoration',
  effekt: 'effekt',
};

export interface PurchaseResult {
  /** Sant när servern svarade med ett redan genomfört köp (samma nyckel). */
  already: boolean;
  productId: string | null;
  slug: string;
  name: string;
  priceXp: number;
  totalXp: number;
  level: number;
}

// ---------------------------------------------------------------- Säsonger

/**
 * Sant när säsongen är aktiv vid en viss tidpunkt. Samma regel som serverns
 * `season_is_active`, men bara för visning — den avgörande kontrollen görs i
 * databasen.
 */
export function seasonActiveAt(season: ShopSeason | null | undefined, at: Date): boolean {
  if (!season || !season.active) return false;
  if (season.starts_at && new Date(season.starts_at).getTime() > at.getTime()) return false;
  if (season.ends_at && new Date(season.ends_at).getTime() <= at.getTime()) return false;
  return true;
}

// ---------------------------------------------------------------- Produktvy

/** Hur en produkt ser ut för en viss elev just nu. */
export type ProductState =
  | 'available'
  | 'owned'
  | 'equipped'
  | 'level'
  | 'season'
  | 'unpublished'
  | 'xp';

/** Vad eleven ser för tillstånd, och varför ett köp inte går igenom. */
export interface ProductView {
  product: ShopProduct;
  state: ProductState;
  /** Texten som hör till tillståndet. */
  label: string;
  owned: boolean;
  equipped: boolean;
  /** XP som fattas, 0 när saldot räcker. */
  xpMissing: number;
  levelOk: boolean;
  /** Sant när säsongen tillåter köp (alltid sant för icke säsongsbundna). */
  seasonOk: boolean;
  /** Elevens nivå, räknad på samma sätt som servern. */
  level: number;
  /** Sant bara när servern skulle godkänna ett köp. */
  buyable: boolean;
}

export const PRODUCT_STATE_LABELS: Readonly<Record<ProductState, string>> = {
  available: 'Tillgänglig',
  owned: 'Ägs',
  equipped: 'Används',
  level: 'Kräver högre nivå',
  season: 'Utanför säsong',
  unpublished: 'Utgått ur sortimentet',
  xp: 'För lite XP',
};

export interface ViewContext {
  totalXp: number;
  xpPerLevel: number;
  ownedSlugs: ReadonlySet<string>;
  ownedIds: ReadonlySet<string>;
  equippedIds: ReadonlySet<string>;
  seasonById: ReadonlyMap<string, ShopSeason>;
  now: Date;
}

/** Räknar fram hur produkten visas och om den går att köpa. Ren funktion. */
export function viewProduct(product: ShopProduct, ctx: ViewContext): ProductView {
  const owned = ctx.ownedIds.has(product.id) || ctx.ownedSlugs.has(product.slug);
  const equipped = product.id ? ctx.equippedIds.has(product.id) : false;
  const level = levelFromXp(ctx.totalXp, ctx.xpPerLevel);
  const levelOk = level >= product.min_level;
  const xpMissing = Math.max(product.price_xp - ctx.totalXp, 0);
  const season = product.season_id ? ctx.seasonById.get(product.season_id) ?? null : null;
  const seasonOk = !product.season_only || seasonActiveAt(season, ctx.now);

  let state: ProductState;
  if (equipped) state = 'equipped';
  else if (owned) state = 'owned';
  else if (!product.published) state = 'unpublished';
  else if (!seasonOk) state = 'season';
  else if (!levelOk) state = 'level';
  else if (xpMissing > 0) state = 'xp';
  else state = 'available';

  return {
    product,
    state,
    label: PRODUCT_STATE_LABELS[state],
    owned,
    equipped,
    xpMissing,
    levelOk,
    seasonOk,
    level,
    buyable: !owned && product.published && seasonOk && levelOk && xpMissing === 0,
  };
}

/** Gränssnittet förklarar alltid varför ett köp inte går igenom. */
export function purchaseBlockReason(view: ProductView): string | null {
  if (view.buyable) return null;
  if (view.owned) return 'Du äger redan det här föremålet.';
  if (!view.product.published) {
    return 'Föremålet säljs inte längre. Det du redan äger ligger kvar i samlingen.';
  }
  if (!view.seasonOk) return 'Föremålet hör till en säsong som inte är aktiv just nu.';
  if (!view.levelOk) {
    return `Föremålet kräver nivå ${view.product.min_level}. Du är nivå ${view.level}.`;
  }
  if (view.xpMissing > 0) {
    return `Du saknar ${view.xpMissing} XP för det här köpet.`;
  }
  return 'Köpet kan inte genomföras just nu.';
}

// ---------------------------------------------------------------- Filter

export interface ShopFilters {
  category?: ShopCategory | 'alla';
  season?: string | 'alla';
  rarity?: ShopRarity | 'alla';
  /** Högsta pris i XP. Tomt = ingen gräns. */
  maxPrice?: number | null;
  query?: string;
  /** Visa bara föremål eleven inte äger. */
  onlyAvailable?: boolean;
}

export type ShopSort = 'pris-upp' | 'pris-ner' | 'namn' | 'nyast' | 'sallsyntast';

export const SHOP_SORTS: readonly { id: ShopSort; label: string }[] = [
  { id: 'pris-upp', label: 'Lägsta pris först' },
  { id: 'pris-ner', label: 'Högsta pris först' },
  { id: 'namn', label: 'Namn (A–Ö)' },
  { id: 'sallsyntast', label: 'Sällsyntast först' },
  { id: 'nyast', label: 'Senast tillagda först' },
];

const RARITY_WEIGHT: Readonly<Record<ShopRarity, number>> = {
  vanlig: 0,
  ovanlig: 1,
  sallsynt: 2,
  episk: 3,
  legendarisk: 4,
};

export function filterProductViews(
  views: readonly ProductView[],
  filters: ShopFilters = {},
): ProductView[] {
  const text = (filters.query ?? '').trim().toLowerCase();
  return views.filter((view) => {
    const { product } = view;
    if (filters.category && filters.category !== 'alla' && product.category !== filters.category) {
      return false;
    }
    if (filters.season && filters.season !== 'alla' && (product.season_id ?? '') !== filters.season) {
      return false;
    }
    if (filters.rarity && filters.rarity !== 'alla' && product.rarity !== filters.rarity) return false;
    if (typeof filters.maxPrice === 'number' && filters.maxPrice > 0 && product.price_xp > filters.maxPrice) {
      return false;
    }
    if (filters.onlyAvailable && view.owned) return false;
    if (text) {
      const hay = `${product.name} ${product.description ?? ''} ${product.slug}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

export function sortProductViews(
  views: readonly ProductView[],
  sort: ShopSort = 'pris-upp',
): ProductView[] {
  const list = [...views];
  list.sort((a, b) => {
    switch (sort) {
      case 'pris-ner':
        return b.product.price_xp - a.product.price_xp || compareName(a, b);
      case 'namn':
        return compareName(a, b);
      case 'sallsyntast':
        return (
          RARITY_WEIGHT[b.product.rarity] - RARITY_WEIGHT[a.product.rarity] ||
          b.product.price_xp - a.product.price_xp
        );
      case 'nyast':
        return b.product.position - a.product.position || compareName(a, b);
      default:
        return a.product.price_xp - b.product.price_xp || compareName(a, b);
    }
  });
  return list;
}

function compareName(a: ProductView, b: ProductView): number {
  return a.product.name.localeCompare(b.product.name, 'sv');
}

/** Lägsta och högsta pris bland produkterna, för prisfiltret. */
export function priceBounds(products: readonly ShopProduct[]): { min: number; max: number } {
  if (products.length === 0) return { min: 0, max: 0 };
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const product of products) {
    min = Math.min(min, product.price_xp);
    max = Math.max(max, product.price_xp);
  }
  return { min: Number.isFinite(min) ? min : 0, max };
}

/** Antal produkter per kategori, för filterflikarna. */
export function countByCategory(
  views: readonly ProductView[],
): Record<ShopCategory | 'alla', number> {
  const counts = {} as Record<ShopCategory | 'alla', number>;
  counts.alla = views.length;
  for (const meta of Object.values(CATEGORY_META)) counts[meta.id] = 0;
  for (const view of views) counts[view.product.category] += 1;
  return counts;
}

// ---------------------------------------------------------------- Idempotens

const pendingKeys = new Map<string, string>();

/** Nya köpnycklar. Kryptografiskt slumpad när webbläsaren kan, annars unik. */
export function newIdempotencyKey(scope: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000_000)}`;
  return `${scope}:${random}`;
}

/**
 * Nyckeln för ett pågående köp. Samma nyckel används om anropet måste göras om,
 * så att ett nytt försök efter ett avbrott inte kan bli ett andra köp.
 */
export function idempotencyKeyFor(productId: string): string {
  const existing = pendingKeys.get(productId);
  if (existing) return existing;
  const key = newIdempotencyKey('kop');
  pendingKeys.set(productId, key);
  return key;
}

/** Glömmer nyckeln efter ett svar — nästa köp är ett nytt köp. */
export function clearIdempotencyKey(productId: string): void {
  pendingKeys.delete(productId);
}

/** Bara för tester: glöm alla pågående köpnycklar. */
export function resetIdempotencyKeys(): void {
  pendingKeys.clear();
}

// ---------------------------------------------------------------- Läsning

export async function listShopProducts(): Promise<Result<ShopProduct[]>> {
  return query<ShopProduct>((sup) =>
    sup.from('shop_products').select('*').order('position', { ascending: true }),
  );
}

/** Alla produkter, även avpublicerade. Kräver adminroll (RLS avgör). */
export async function listAllProducts(): Promise<Result<ShopProduct[]>> {
  return query<ShopProduct>((sup) =>
    sup.from('shop_products').select('*').order('position', { ascending: true }),
  );
}

export async function listSeasons(): Promise<Result<ShopSeason[]>> {
  return query<ShopSeason>((sup) => sup.from('seasons').select('*').order('id', { ascending: true }));
}

export async function listMyPurchases(): Promise<Result<ShopPurchase[]>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup
      .from('shop_purchases')
      .select('*')
      .eq('user_id', uid)
      .order('purchased_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ShopPurchase[];
  });
}

export async function listEquipped(): Promise<Result<EquippedMap>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup.from('user_equipped').select('kind, product_id').eq('user_id', uid);
    if (error) throw error;

    const map: EquippedMap = {};
    for (const row of (data ?? []) as { kind: EquipKind; product_id: string }[]) {
      map[row.kind] = row.product_id;
    }
    return map;
  });
}

// ---------------------------------------------------------------- Köp

/**
 * Köper ett föremål. Nyckeln gör anropet idempotent: går nätet ner och eleven
 * trycker igen blir det samma köp, aldrig två.
 */
export async function purchaseProduct(productId: string): Promise<Result<PurchaseResult>> {
  return withClient(async (sup) => {
    const key = idempotencyKeyFor(productId);
    const { data, error } = await sup.rpc('shop_purchase', {
      p_product_id: productId,
      p_idempotency_key: key,
    });
    if (error) throw error;

    clearIdempotencyKey(productId);
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      already: r.already === true,
      productId: r.product_id ? String(r.product_id) : null,
      slug: String(r.slug ?? ''),
      name: String(r.name ?? ''),
      priceXp: Number(r.price_xp ?? 0),
      totalXp: Number(r.total_xp ?? 0),
      level: Number(r.level ?? 1),
    };
  });
}

/** Utrusterar ett ägt föremål (tema, avatar, ram, märke, figur, dekoration, effekt). */
export async function equipProduct(productId: string): Promise<Result<{ kind: EquipKind }>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('shop_equip', { p_product_id: productId });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return { kind: String(r.kind ?? '') as EquipKind };
  });
}

/** Tar bort utrustningen på en plats. Ett tema blir standardtemat igen. */
export async function unequipKind(kind: EquipKind): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('shop_unequip', { p_kind: kind });
    if (error) throw error;
    return true as const;
  });
}

// ---------------------------------------------------------------- Admin

export interface ProductDraft {
  id?: string;
  slug: string;
  name: string;
  description: string;
  category: ShopCategory;
  rarity: ShopRarity;
  price_xp: number;
  min_level: number;
  season_id: string | null;
  season_only: boolean;
  asset_key: string;
  theme_key: string;
  ornament_key: string;
  published: boolean;
  position: number;
}

/** Kontrollerar ett produktutkast i gränssnittet. Servern prövar samma regler. */
export function validateProductDraft(draft: ProductDraft): string | null {
  if (draft.slug.trim().length < 2) return 'Produkten behöver ett id (slug) med minst två tecken.';
  if (!/^[a-z0-9-]+$/.test(draft.slug.trim())) {
    return 'Id:t får bara innehålla små bokstäver, siffror och bindestreck.';
  }
  if (draft.name.trim().length < 1) return 'Produkten behöver ett namn.';
  if (!Number.isInteger(draft.price_xp) || draft.price_xp < 1 || draft.price_xp > 100000) {
    return 'XP-priset måste vara ett heltal mellan 1 och 100 000.';
  }
  if (!Number.isInteger(draft.min_level) || draft.min_level < 1 || draft.min_level > 99) {
    return 'Nivåkravet måste vara ett heltal mellan 1 och 99.';
  }
  if (draft.category === 'tema' && draft.theme_key.trim().length < 2) {
    return 'Ett UI-tema måste ha en temanyckel (t.ex. pumpa).';
  }
  if (!CATEGORY_META[draft.category]) return 'Välj en kategori.';
  if (CATALOG_BY_SLUG[draft.slug.trim()] && !draft.id) {
    return 'Det finns redan en produkt med det id:t.';
  }
  return null;
}

/** Sparar en produkt (ny eller befintlig). Kräver adminroll — servern avgör. */
export async function saveProduct(draft: ProductDraft): Promise<Result<ShopProduct>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('admin_shop_save_product', {
      p_product: {
        ...draft,
        id: draft.id ?? null,
        season_id: draft.season_id,
        description: draft.description,
        asset_key: draft.asset_key || null,
        theme_key: draft.theme_key || null,
        ornament_key: draft.ornament_key || null,
      },
    });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return (r.product ?? r) as ShopProduct;
  });
}

export async function setProductPublished(
  productId: string,
  published: boolean,
): Promise<Result<ShopProduct>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('admin_shop_set_published', {
      p_product_id: productId,
      p_published: published,
    });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return (r.product ?? r) as ShopProduct;
  });
}

export interface SeasonDraft {
  id: string;
  name: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

/** Sparar en säsong. Kräver adminroll — servern avgör. */
export async function saveSeason(draft: SeasonDraft): Promise<Result<ShopSeason>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('admin_shop_save_season', { p_season: draft });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return (r.season ?? r) as ShopSeason;
  });
}

// ---------------------------------------------------------------- Samlingen

export interface CollectionItem {
  /** Kvittots id — föremålet finns kvar även om produkten skulle tas bort. */
  id: string;
  productId: string | null;
  slug: string;
  name: string;
  description: string | null;
  category: ShopCategory;
  equipKind: EquipKind | null;
  rarity: ShopRarity;
  assetKey: string | null;
  themeKey: string | null;
  ornamentKey: string | null;
  priceXp: number;
  purchasedAt: string;
  equipped: boolean;
  /** Sant när produkten fortfarande går att köpa i shopen. */
  stillForSale: boolean;
}

/**
 * Samlar ägda föremål ur kvittona. Produktens nuvarande rad används bara för
 * beskrivning och bild; namn, pris och utseende kommer från köptillfället, så
 * en senare ändring skriver aldrig om historiken.
 */
export function buildCollection(
  purchases: readonly ShopPurchase[],
  products: readonly ShopProduct[],
  equipped: EquippedMap,
): CollectionItem[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const bySlug = new Map(products.map((product) => [product.slug, product]));

  return purchases.map((purchase) => {
    const current = (purchase.product_id ? byId.get(purchase.product_id) : undefined) ?? bySlug.get(purchase.product_slug);
    const equipKind =
      purchase.equip_kind ??
      (current ? current.equip_kind : null) ??
      CATEGORY_META[purchase.category]?.equipKind ??
      null;
    return {
      id: purchase.id,
      productId: purchase.product_id,
      slug: purchase.product_slug,
      name: purchase.name,
      description: current?.description ?? null,
      category: purchase.category,
      equipKind,
      rarity: purchase.rarity ?? current?.rarity ?? 'vanlig',
      assetKey: purchase.asset_key ?? current?.asset_key ?? null,
      themeKey: purchase.theme_key ?? current?.theme_key ?? null,
      ornamentKey: purchase.ornament_key ?? current?.ornament_key ?? null,
      priceXp: purchase.price_xp,
      purchasedAt: purchase.purchased_at,
      equipped: Boolean(equipKind && purchase.product_id && equipped[equipKind] === purchase.product_id),
      stillForSale: Boolean(current?.published),
    };
  });
}

/** Bara de föremål som kan utrustas (övriga är samlarobjekt). */
export function equippedList(collection: readonly CollectionItem[]): CollectionItem[] {
  return collection.filter((item) => item.equipped);
}
