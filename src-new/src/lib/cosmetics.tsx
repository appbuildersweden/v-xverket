/**
 * Kosmetiken: aktivt tema, utrustade föremål och ägda produkter.
 *
 * Servern är sanningskällan. Här samlas allt som hör till utseendet i en enda
 * läsning, och resultatet kan sedan användas av hela appen: toppraden visar
 * avatar, ram och märke, profilen visar figur och dekoration, och det aktiva
 * temat sätts som `data-ui-tema` på <html> så att alla sidor följer med.
 *
 * Två regler styr det här lagret:
 *   * det får aldrig krascha appen. Går hämtningen inte igenom visas
 *     standardtemat och inga kosmetiska föremål — men inget ägande förloras,
 *     för ägandet ligger kvar i databasen och läses igen nästa gång.
 *   * det får aldrig bli en andra sanning. Ingen summa, inget pris och inget
 *     ägande räknas ut här; allt kommer från servern, och det lokala minnet
 *     används bara för att kunna måla rätt tema direkt vid start.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { fetchXpState, XpState } from './planner';
import {
  buildCollection,
  CollectionItem,
  equipProduct,
  EquippedMap,
  listEquipped,
  listMyPurchases,
  listSeasons,
  listShopProducts,
  purchaseProduct,
  PurchaseResult,
  ShopProduct,
  ShopPurchase,
  ShopSeason,
  unequipKind,
} from './shop';
import { CATEGORY_META, THEME_KEYS, EquipKind } from './shop-catalog';
import { Result } from './db';

const CACHE_PREFIX = 'elda-kosmetik:';

/**
 * Senaste läsningen per konto, i minnet.
 *
 * Panelen kan monteras om många gånger under en session (t.ex. när profilen
 * öppnas och stängs). Utan det här hade varje montering gjort fem nya
 * databasfrågor och shopen hade blinkat tom en kort stund. Cachen är bara en
 * bild av serverns svar: den används för att måla direkt och uppdateras alltid
 * av en ny hämtning, och den kan aldrig ändra XP, pris eller ägande.
 */
const snapshots = new Map<string, CosmeticsState>();

interface CachedCosmetics {
  themeKey: string | null;
  equipped: EquippedMap;
}

interface CosmeticsState {
  /** Sant när första hämtningen är klar (eller misslyckades). */
  ready: boolean;
  error: string | null;
  products: ShopProduct[];
  seasons: ShopSeason[];
  purchases: ShopPurchase[];
  equipped: EquippedMap;
  collection: CollectionItem[];
  xp: XpState | null;
  /** Temanyckeln som är aktiv, eller null för appens standardtema. */
  themeKey: string | null;
  themeProductId: string | null;
}

interface CosmeticsApi extends CosmeticsState {
  refresh: () => Promise<void>;
  purchase: (productId: string) => Promise<Result<PurchaseResult>>;
  equip: (productId: string) => Promise<Result<true>>;
  unequip: (kind: EquipKind) => Promise<Result<true>>;
  /** Slår på ett tema eleven äger, eller stänger av temat med null. */
  activateTheme: (productId: string | null) => Promise<Result<true>>;
  /** Föremålet som är utrustat på en plats, om något. */
  equippedItem: (kind: EquipKind) => CollectionItem | null;
}

const EMPTY: CosmeticsState = {
  ready: false,
  error: null,
  products: [],
  seasons: [],
  purchases: [],
  equipped: {},
  collection: [],
  xp: null,
  themeKey: null,
  themeProductId: null,
};

const Ctx = createContext<CosmeticsApi>({
  ...EMPTY,
  refresh: async () => {},
  purchase: async () => ({ ok: false, error: 'Shopen är inte tillgänglig.' }),
  equip: async () => ({ ok: false, error: 'Shopen är inte tillgänglig.' }),
  unequip: async () => ({ ok: false, error: 'Shopen är inte tillgänglig.' }),
  activateTheme: async () => ({ ok: false, error: 'Shopen är inte tillgänglig.' }),
  equippedItem: () => null,
});

/** Läser det lokala minnet. Fel här får aldrig stoppa appen. */
function readCache(userId: string): CachedCosmetics | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCosmetics;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      themeKey: typeof parsed.themeKey === 'string' ? parsed.themeKey : null,
      equipped: (parsed.equipped ?? {}) as EquippedMap,
    };
  } catch {
    return null;
  }
}

function writeCache(userId: string, value: CachedCosmetics): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(value));
  } catch {
    /* Minnescachen är frivillig. */
  }
}

function clearCache(userId: string): void {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
  } catch {
    /* ignorera */
  }
}

/**
 * Temanyckeln som ska användas. En nyckel som inte finns bland temana (t.ex.
 * efter en ändrad produkt) faller alltid tillbaka på standardtemat i stället
 * för att lämna appen utan färger.
 */
export function safeThemeKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return THEME_KEYS.includes(value) ? value : null;
}

/** Sätter temat på <html>. Ingen temanyckel betyder appens standardtema. */
export function applyThemeToDocument(themeKey: string | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (themeKey) root.dataset.uiTema = themeKey;
  else delete root.dataset.uiTema;
}

export const CosmeticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<CosmeticsState>(EMPTY);
  const loadedFor = useRef<string | null>(null);

  // Direkt vid start: måla det tema som senast var aktivt för det här kontot,
  // så att appen inte blinkar i standardfärgerna innan servern har svarat.
  useEffect(() => {
    if (!userId) {
      applyThemeToDocument(null);
      return;
    }
    const cached = readCache(userId);
    const themeKey = safeThemeKey(cached?.themeKey);
    applyThemeToDocument(themeKey);
    setState((prev) => ({
      ...prev,
      themeKey,
      equipped: cached?.equipped ?? {},
    }));
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(EMPTY);
      return;
    }

    const [products, seasons, purchases, equipped, xp] = await Promise.all([
      listShopProducts(),
      listSeasons(),
      listMyPurchases(),
      listEquipped(),
      fetchXpState(),
    ]);

    const problems: string[] = [];
    if (!products.ok) problems.push('produkter');
    if (!seasons.ok) problems.push('säsonger');
    if (!purchases.ok) problems.push('dina köp');
    if (!equipped.ok) problems.push('din utrustning');

    const productList = products.ok ? products.data : [];
    const purchaseList = purchases.ok ? purchases.data : [];
    const equippedMap = equipped.ok ? equipped.data : {};

    // Temat: bara ett ägt temaföremål räknas. Saknas det (eller är nyckeln
    // okänd) gäller standardtemat — appen kraschar aldrig på ett sparat tema.
    const equippedTheme = equippedMap.tema
      ? purchaseList.find((purchase) => purchase.product_id === equippedMap.tema) ?? null
      : null;
    const themeProductId = equippedTheme?.product_id ?? null;
    const themeKey = safeThemeKey(equippedTheme?.theme_key);

    applyThemeToDocument(themeKey);
    writeCache(userId, { themeKey, equipped: equippedMap });

    const next: CosmeticsState = {
      ready: true,
      error: problems.length > 0 ? `Kunde inte hämta ${problems.join(', ')} just nu.` : null,
      products: productList,
      seasons: seasons.ok ? seasons.data : [],
      purchases: purchaseList,
      equipped: equippedMap,
      collection: buildCollection(purchaseList, productList, equippedMap),
      xp: xp.ok ? xp.data : null,
      themeKey,
      themeProductId,
    };

    // Ett misslyckat svar ska inte skriva över en bra bild av kontot.
    if (problems.length === 0) snapshots.set(userId, next);
    setState(next);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      loadedFor.current = null;
      applyThemeToDocument(null);
      setState(EMPTY);
      return;
    }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;

    // Känd data ritas direkt; hämtningen nedan bekräftar den mot servern.
    const snapshot = snapshots.get(userId);
    if (snapshot) setState(snapshot);
    void refresh();
  }, [userId, refresh]);

  const purchase = useCallback(
    async (productId: string): Promise<Result<PurchaseResult>> => {
      const result = await purchaseProduct(productId);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const equip = useCallback(
    async (productId: string): Promise<Result<true>> => {
      const result = await equipProduct(productId);
      if (result.ok) await refresh();
      return result.ok ? { ok: true, data: true } : result;
    },
    [refresh],
  );

  const unequip = useCallback(
    async (kind: EquipKind): Promise<Result<true>> => {
      const result = await unequipKind(kind);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const activateTheme = useCallback(
    async (productId: string | null): Promise<Result<true>> => {
      if (productId === null) {
        const result = await unequipKind('tema');
        if (result.ok) {
          applyThemeToDocument(null);
          if (userId) clearCache(userId);
          await refresh();
        }
        return result;
      }
      const result = await equipProduct(productId);
      if (result.ok) await refresh();
      return result.ok ? { ok: true, data: true } : result;
    },
    [refresh, userId],
  );

  const equippedItem = useCallback(
    (kind: EquipKind): CollectionItem | null => {
      const productId = state.equipped[kind];
      if (!productId) return null;
      return state.collection.find((item) => item.productId === productId) ?? null;
    },
    [state.equipped, state.collection],
  );

  const value = useMemo<CosmeticsApi>(
    () => ({ ...state, refresh, purchase, equip, unequip, activateTheme, equippedItem }),
    [state, refresh, purchase, equip, unequip, activateTheme, equippedItem],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useCosmetics = () => useContext(Ctx);

/** Kategorins etikett, för listor och kvitton. */
export function categoryLabel(category: string): string {
  const meta = CATEGORY_META[category as keyof typeof CATEGORY_META];
  return meta?.label ?? category;
}
