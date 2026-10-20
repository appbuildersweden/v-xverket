import { supabase, errorMessage } from './supabase';
import {
  normalizeLook,
  type Rarity,
  type Wallet,
} from './halloween-catalog';

/**
 * Halloween-datalagret.
 *
 * Allt som räknas – XP, priser, ägande och vad som är upplåst – kommer från
 * servern. Här finns bara läsning och anrop till de security
 * definer-funktionerna som äger skrivningen; klienten kan aldrig sätta ett
 * saldo, ett pris eller en ägarrad själv.
 */

export interface HalloweenSeason {
  id: string;
  name: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export interface HalloweenProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  equip_kind: string | null;
  rarity: Rarity;
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

export interface HalloweenPurchase {
  id: string;
  product_id: string | null;
  product_slug: string;
  name: string;
  category: string;
  equip_kind: string | null;
  rarity: Rarity | null;
  theme_key: string | null;
  asset_key: string | null;
  ornament_key: string | null;
  price_xp: number;
  purchased_at: string;
}

export interface HalloweenPart {
  slug: string;
  slot: string;
  name: string;
  description: string | null;
  kind: 'del' | 'farg';
  color: string | null;
  rarity: Rarity;
  price_xp: number;
  min_level: number;
  free: boolean;
  position: number;
}

export interface HalloweenUnlock {
  part_slug: string;
  price_xp: number;
  unlocked_at: string;
}

export interface HalloweenRoomItem {
  slot: number;
  part_slug: string;
}

/** kind → product_id för utrustade shopföremål. */
export type EquippedMap = Record<string, string>;

export interface HalloweenState {
  products: HalloweenProduct[];
  seasons: HalloweenSeason[];
  purchases: HalloweenPurchase[];
  parts: HalloweenPart[];
  unlocks: HalloweenUnlock[];
  equipped: EquippedMap;
  look: Record<string, string>;
  wallet: Wallet;
  room: HalloweenRoomItem[];
}

export interface PurchaseResult {
  ok: boolean;
  already: boolean;
  slug?: string;
  name?: string;
  price_xp: number;
  total_xp: number;
  level: number;
}

const PRODUCT_FIELDS =
  'id,slug,name,description,category,equip_kind,rarity,price_xp,min_level,' +
  'season_id,season_only,asset_key,theme_key,ornament_key,published,position';

const PURCHASE_FIELDS =
  'id,product_id,product_slug,name,category,equip_kind,rarity,theme_key,' +
  'asset_key,ornament_key,price_xp,purchased_at';

const PART_FIELDS =
  'slug,slot,name,description,kind,color,rarity,price_xp,min_level,free,position';

function rows<T>(data: unknown): T[] {
  return (Array.isArray(data) ? data : []) as T[];
}

function fail(error: unknown): never {
  throw new Error(errorMessage(error, 'Något gick fel. Försök igen.'));
}

function toWallet(data: unknown): Wallet {
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const total = Number(row.total_xp ?? 0);
  const level = Number(row.level ?? 1);
  const per = Number(row.xp_per_level ?? 100);
  return {
    total_xp: Number.isFinite(total) ? total : 0,
    level: Number.isFinite(level) && level > 0 ? level : 1,
    xp_per_level: Number.isFinite(per) && per > 0 ? per : 100,
    level_start_xp: Number(row.level_start_xp ?? 0),
    next_level_xp: Number(row.next_level_xp ?? 100),
  };
}

/** Läser hela Halloween-läget i en omgång. */
export async function loadHalloween(): Promise<HalloweenState> {
  const [seasons, products, purchases, parts, unlocks, equipped, look, room, wallet] =
    await Promise.all([
      supabase.from('seasons').select('id,name,description,starts_at,ends_at,active'),
      supabase.from('shop_products').select(PRODUCT_FIELDS).order('position'),
      supabase.from('shop_purchases').select(PURCHASE_FIELDS).order('purchased_at', {
        ascending: false,
      }),
      supabase.from('halloween_avatar_parts').select(PART_FIELDS).order('position'),
      supabase
        .from('halloween_avatar_unlocks')
        .select('part_slug,price_xp,unlocked_at')
        .order('unlocked_at', { ascending: false }),
      supabase.from('user_equipped').select('kind,product_id'),
      supabase.from('halloween_looks').select('look').maybeSingle(),
      supabase.from('halloween_room_items').select('slot,part_slug').order('slot'),
      supabase.rpc('halloween_wallet'),
    ]);

  for (const result of [seasons, products, purchases, parts, unlocks, equipped, look, room, wallet]) {
    if (result.error) fail(result.error);
  }

  const equippedMap: EquippedMap = {};
  for (const row of rows<{ kind: string; product_id: string }>(equipped.data)) {
    equippedMap[row.kind] = row.product_id;
  }

  return {
    seasons: rows<HalloweenSeason>(seasons.data),
    products: rows<HalloweenProduct>(products.data),
    purchases: rows<HalloweenPurchase>(purchases.data),
    parts: rows<HalloweenPart>(parts.data),
    unlocks: rows<HalloweenUnlock>(unlocks.data),
    equipped: equippedMap,
    look: normalizeLook((look.data as { look?: unknown } | null)?.look),
    room: rows<HalloweenRoomItem>(room.data).filter(
      (row) => Number.isInteger(row.slot) && row.slot >= 0 && row.slot <= 5,
    ),
    wallet: toWallet(wallet.data),
  };
}

/** En ny idempotensnyckel per köpförsök. Samma nyckel får bara ge ett köp. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `halloween-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function toPurchaseResult(data: unknown): PurchaseResult {
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    ok: row.ok !== false,
    already: row.already === true,
    slug: typeof row.slug === 'string' ? row.slug : undefined,
    name: typeof row.name === 'string' ? row.name : undefined,
    price_xp: Number(row.price_xp ?? 0),
    total_xp: Number(row.total_xp ?? 0),
    level: Number(row.level ?? 1),
  };
}

/** Köper ett föremål ur den gemensamma shopen. Servern äger priset. */
export async function purchaseProduct(
  productId: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<PurchaseResult> {
  const { data, error } = await supabase.rpc('shop_purchase', {
    p_product_id: productId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) fail(error);
  return toPurchaseResult(data);
}

/** Köper en avatar-del. Servern kontrollerar ägande, nivå och XP. */
export async function purchasePart(
  slug: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<PurchaseResult> {
  const { data, error } = await supabase.rpc('halloween_buy_part', {
    p_slug: slug,
    p_idempotency_key: idempotencyKey,
  });
  if (error) fail(error);
  return toPurchaseResult(data);
}

/** Utrusterar ett ägt shopföremål (tema, ram, märke, figur, effekt). */
export async function equipProduct(productId: string): Promise<void> {
  const { error } = await supabase.rpc('shop_equip', { p_product_id: productId });
  if (error) fail(error);
}

/** Tar bort utrustningen på en plats. */
export async function unequipKind(kind: string): Promise<void> {
  const { error } = await supabase.rpc('shop_unequip', { p_kind: kind });
  if (error) fail(error);
}

/**
 * Sparar elevens utseende. Servern kontrollerar att varje del finns på rätt
 * plats och att eleven äger den, och returnerar det rensade utseendet.
 */
export async function saveAvatarLook(
  look: Record<string, string>,
): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('halloween_save_avatar', { p_look: look });
  if (error) fail(error);
  const row = (data && typeof data === 'object' ? data : {}) as { look?: unknown };
  return normalizeLook(row.look);
}

/** Ställer en dekoration på en plats i rummet. */
export async function placeRoomItem(partSlug: string, slot: number): Promise<void> {
  const { error } = await supabase.rpc('halloween_room_place', {
    p_slug: partSlug,
    p_slot: slot,
  });
  if (error) fail(error);
}

/** Tar bort dekorationen på en plats. */
export async function removeRoomItem(slot: number): Promise<void> {
  const { error } = await supabase.rpc('halloween_room_remove', { p_slot: slot });
  if (error) fail(error);
}

/* ------------------------------------------------------------- hjälpfunktioner */

/** Alla delar eleven får använda: gratis delar plus upplåsta. */
export function ownedPartSlugs(
  parts: readonly HalloweenPart[],
  unlocks: readonly HalloweenUnlock[],
): Set<string> {
  const owned = new Set(unlocks.map((row) => row.part_slug));
  for (const part of parts) {
    if (part.free) owned.add(part.slug);
  }
  return owned;
}

export function isSeasonActive(season: HalloweenSeason | null | undefined, now = new Date()): boolean {
  if (!season || !season.active) return false;
  const start = season.starts_at ? new Date(season.starts_at) : null;
  const end = season.ends_at ? new Date(season.ends_at) : null;
  if (start && start.getTime() > now.getTime()) return false;
  if (end && end.getTime() <= now.getTime()) return false;
  return true;
}

/** Ett ägt föremål, oavsett om det kom från shopen eller avatar-katalogen. */
export interface OwnedItem {
  kind: 'produkt' | 'del';
  /** Produkt-id eller delens slug. */
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  slot: string | null;
  rarity: Rarity;
  price_paid: number;
  acquired_at: string;
  equipped: boolean;
  /** Sant för föremål som kan utrustas på en plats. */
  canEquip: boolean;
  asset_key: string | null;
  ornament_key: string | null;
  theme_key: string | null;
}

/**
 * Bygger samlingen av riktiga köp och upplåsningar. Ren funktion: inga köp
 * hittas på, och ett föremål som inte längre finns i katalogen visas ändå med
 * det namn och pris som sparades vid köptillfället.
 */
export function buildCollection(
  purchases: readonly HalloweenPurchase[],
  parts: readonly HalloweenPart[],
  unlocks: readonly HalloweenUnlock[],
  equipped: EquippedMap,
  activeAvatar: { look?: Record<string, string>; room?: readonly HalloweenRoomItem[] } = {},
): OwnedItem[] {
  const productBySlug = new Map(purchases.map((row) => [row.product_slug, row]));
  const partBySlug = new Map(parts.map((row) => [row.slug, row]));
  const lookSlugs = new Set(Object.values(activeAvatar.look ?? {}));
  const roomSlugs = new Set((activeAvatar.room ?? []).map((row) => row.part_slug));
  const items: OwnedItem[] = [];

  for (const purchase of purchases) {
    const kind = purchase.equip_kind;
    const product = productBySlug.get(purchase.product_slug) ?? purchase;
    items.push({
      kind: 'produkt',
      id: purchase.product_id ?? purchase.product_slug,
      slug: purchase.product_slug,
      name: purchase.name,
      description: null,
      category: purchase.category,
      slot: kind,
      rarity: (purchase.rarity ?? 'vanlig') as Rarity,
      price_paid: purchase.price_xp,
      acquired_at: purchase.purchased_at,
      equipped: Boolean(kind && equipped[kind] === purchase.product_id),
      canEquip: Boolean(kind),
      asset_key: product.asset_key ?? null,
      ornament_key: product.ornament_key ?? null,
      theme_key: product.theme_key ?? null,
    });
  }

  for (const unlock of unlocks) {
    const part = partBySlug.get(unlock.part_slug);
    if (!part) continue;
    const isDecoration = part.slot === 'dekoration';
    items.push({
      kind: 'del',
      id: part.slug,
      slug: part.slug,
      name: part.name,
      description: part.description,
      category: part.slot,
      slot: part.slot,
      rarity: part.rarity,
      price_paid: unlock.price_xp,
      acquired_at: unlock.unlocked_at,
      equipped: isDecoration ? roomSlugs.has(part.slug) : lookSlugs.has(part.slug),
      canEquip: true,
      asset_key: part.slug,
      ornament_key: null,
      theme_key: null,
    });
  }

  return items.sort(
    (a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime(),
  );
}

/** Slår upp en del som hör till en plats i ett utseende. */
export function partForLook(
  parts: readonly HalloweenPart[],
  look: Record<string, string>,
  slot: string,
): HalloweenPart | null {
  const slug = look[slot];
  if (!slug) return null;
  return parts.find((part) => part.slug === slug) ?? null;
}

/** Antal ägda delar, för "x av y" i samlingen. */
export function partProgress(
  parts: readonly HalloweenPart[],
  owned: ReadonlySet<string>,
): { owned: number; total: number } {
  const relevant = parts.filter((part) => part.slot !== 'dekoration');
  return {
    owned: relevant.filter((part) => owned.has(part.slug)).length,
    total: relevant.length,
  };
}
