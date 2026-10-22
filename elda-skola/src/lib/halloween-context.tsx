import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './auth';
import { usePlatformFeatures } from './features';
import {
  applyTheme,
  clearLegacyThemePreference,
  readThemePreference,
  resolveThemeKey,
  writeThemePreference,
} from './halloween-theme';
import {
  buildCollection,
  equipProduct,
  loadHalloween,
  ownedPartSlugs,
  placeRoomItem,
  purchasePart,
  purchaseProduct,
  removeRoomItem,
  saveAvatarLook,
  unequipKind,
  type HalloweenPart,
  type HalloweenProduct,
  type HalloweenPurchase,
  type HalloweenRoomItem,
  type HalloweenSeason,
  type HalloweenState,
  type HalloweenUnlock,
  type EquippedMap,
  type OwnedItem,
  type PurchaseResult,
} from './halloween';
import type { Wallet } from './halloween-catalog';

/**
 * Delat Halloween-läge för hela skolappen.
 *
 * Providern laddar en gång per konto och håller sedan teman, saldo, ägande och
 * den sparade avataren synkroniserade. Varje handling går till servern och
 * läser om läget efteråt – inget ägande, pris eller saldo räknas ut i
 * klienten. Temat sätts på <html> så att alla sidor följer med, även de som
 * inte hör till Halloween-området.
 */

interface HalloweenApi {
  ready: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;

  products: HalloweenProduct[];
  seasons: HalloweenSeason[];
  purchases: HalloweenPurchase[];
  parts: HalloweenPart[];
  unlocks: HalloweenUnlock[];
  room: HalloweenRoomItem[];
  look: Record<string, string>;
  equipped: EquippedMap;
  wallet: Wallet;
  collection: OwnedItem[];
  ownedParts: ReadonlySet<string>;

  themeKey: string | null;
  freeTheme: boolean;
  setFreeTheme: (enabled: boolean) => void;
  activateTheme: (productId: string | null) => Promise<void>;

  purchaseProduct: (productId: string) => Promise<PurchaseResult>;
  purchasePart: (slug: string) => Promise<PurchaseResult>;
  equip: (productId: string) => Promise<void>;
  equipKind: (kind: string) => Promise<void>;
  unequip: (kind: string) => Promise<void>;
  saveLook: (look: Record<string, string>) => Promise<Record<string, string>>;
  placeRoom: (slug: string, slot: number) => Promise<void>;
  removeRoom: (slot: number) => Promise<void>;
}

const EMPTY_WALLET: Wallet = {
  total_xp: 0,
  level: 1,
  xp_per_level: 100,
  level_start_xp: 0,
  next_level_xp: 100,
};

const NOOP = async () => {
  throw new Error('Halloween är inte tillgängligt just nu.');
};

const HalloweenCtx = createContext<HalloweenApi>({
  ready: false,
  loading: false,
  error: null,
  reload: async () => {},
  products: [],
  seasons: [],
  purchases: [],
  parts: [],
  unlocks: [],
  room: [],
  look: {},
  equipped: {},
  wallet: EMPTY_WALLET,
  collection: [],
  ownedParts: new Set<string>(),
  themeKey: null,
  freeTheme: true,
  setFreeTheme: () => {},
  activateTheme: NOOP,
  purchaseProduct: NOOP,
  purchasePart: NOOP,
  equip: NOOP,
  equipKind: NOOP,
  unequip: NOOP,
  saveLook: NOOP,
  placeRoom: NOOP,
  removeRoom: NOOP,
});

export const HalloweenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { identity } = useAuth();
  const userId = identity?.id ?? null;
  // Skolan kan stänga av Halloween helt. Då används inget tema alls, även om
  // eleven har ett köpt tema utrustat – servern behåller valet tills det slås på.
  const features = usePlatformFeatures();

  const [state, setState] = useState<HalloweenState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Invändningen är personlig: den läses först när kontot är känt, och nollställs
  // när kontot byts så att ingen ärver någon annans tema.
  const [freeTheme, setFreeThemeState] = useState(
    () => readThemePreference(identity?.id ?? null).freeTheme,
  );
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    clearLegacyThemePreference();
    setFreeThemeState(readThemePreference(userId).freeTheme);
    return () => {
      // Lämnar eleven appen (utloggning eller annat konto) ska inget tema ligga
      // kvar på dokumentet och färga nästa persons inloggning.
      applyTheme(null);
    };
  }, [userId]);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadHalloween();
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta Halloween just nu.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      loadedFor.current = null;
      setState(null);
      return;
    }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    // Inget från förra kontot får hänga kvar medan det nya laddas.
    setState(null);
    setError(null);
    void reload();
  }, [userId, reload]);

  // Temat: köpt tema först, annars det fria säsongstemat om det är påslaget.
  const equippedThemeProductId = state?.equipped.tema ?? null;
  const equippedThemeKey = useMemo(() => {
    if (!state || !equippedThemeProductId) return null;
    return (
      state.purchases.find((row) => row.product_id === equippedThemeProductId)?.theme_key ?? null
    );
  }, [state, equippedThemeProductId]);

  const themeKey = useMemo(
    () => (features.halloween ? resolveThemeKey(equippedThemeKey, { freeTheme }) : null),
    [equippedThemeKey, freeTheme, features.halloween],
  );

  useEffect(() => {
    applyTheme(themeKey);
  }, [themeKey]);

  const setFreeTheme = useCallback(
    (enabled: boolean) => {
      if (!features.halloween) return;
      setFreeThemeState(enabled);
      writeThemePreference(userId, { freeTheme: enabled });
    },
    [userId, features.halloween],
  );

  const ownedParts = useMemo(
    () => ownedPartSlugs(state?.parts ?? [], state?.unlocks ?? []),
    [state],
  );

  const collection = useMemo(
    () =>
      buildCollection(
        state?.purchases ?? [],
        state?.parts ?? [],
        state?.unlocks ?? [],
        state?.equipped ?? {},
        { look: state?.look, room: state?.room },
      ),
    [state],
  );

  const activateTheme = useCallback(
    async (productId: string | null) => {
      if (productId === null) await unequipKind('tema');
      else await equipProduct(productId);
      await reload();
    },
    [reload],
  );

  const doPurchaseProduct = useCallback(
    async (productId: string) => {
      const result = await purchaseProduct(productId);
      await reload();
      return result;
    },
    [reload],
  );

  const doPurchasePart = useCallback(
    async (slug: string) => {
      const result = await purchasePart(slug);
      await reload();
      return result;
    },
    [reload],
  );

  const doEquip = useCallback(
    async (productId: string) => {
      await equipProduct(productId);
      await reload();
    },
    [reload],
  );

  const doUnequip = useCallback(
    async (kind: string) => {
      await unequipKind(kind);
      await reload();
    },
    [reload],
  );

  const doSaveLook = useCallback(async (look: Record<string, string>) => {
    const saved = await saveAvatarLook(look);
    setState((current) => (current ? { ...current, look: saved } : current));
    return saved;
  }, []);

  const doPlaceRoom = useCallback(
    async (slug: string, slot: number) => {
      await placeRoomItem(slug, slot);
      await reload();
    },
    [reload],
  );

  const doRemoveRoom = useCallback(
    async (slot: number) => {
      await removeRoomItem(slot);
      await reload();
    },
    [reload],
  );

  /** Utrusterar det som är utrustat på en plats (används av samlingen). */
  const equipKind = useCallback(
    async (kind: string) => {
      const productId = state?.equipped[kind];
      if (!productId) throw new Error('Inget är utrustat på den platsen.');
      await doEquip(productId);
    },
    [doEquip, state],
  );

  const value = useMemo<HalloweenApi>(
    () => ({
      ready: state !== null,
      loading,
      error,
      reload,
      products: state?.products ?? [],
      seasons: state?.seasons ?? [],
      purchases: state?.purchases ?? [],
      parts: state?.parts ?? [],
      unlocks: state?.unlocks ?? [],
      room: state?.room ?? [],
      look: state?.look ?? {},
      equipped: state?.equipped ?? {},
      wallet: state?.wallet ?? EMPTY_WALLET,
      collection,
      ownedParts,
      themeKey,
      freeTheme,
      setFreeTheme,
      activateTheme,
      purchaseProduct: doPurchaseProduct,
      purchasePart: doPurchasePart,
      equip: doEquip,
      equipKind,
      unequip: doUnequip,
      saveLook: doSaveLook,
      placeRoom: doPlaceRoom,
      removeRoom: doRemoveRoom,
    }),
    [
      state,
      loading,
      error,
      reload,
      collection,
      ownedParts,
      themeKey,
      freeTheme,
      setFreeTheme,
      activateTheme,
      doPurchaseProduct,
      doPurchasePart,
      doEquip,
      equipKind,
      doUnequip,
      doSaveLook,
      doPlaceRoom,
      doRemoveRoom,
    ],
  );

  return <HalloweenCtx.Provider value={value}>{children}</HalloweenCtx.Provider>;
};

/** Hook med ett tydligt fel om providern saknas, i stället för tom data. */
export function useHalloween(): HalloweenApi {
  return useContext(HalloweenCtx);
}

export type { HalloweenApi };
