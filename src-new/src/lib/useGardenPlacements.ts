/**
 * Trädgårdens platser: hämtning, utplacering och borttagning.
 *
 * Allt går mot servern. Hooken håller bara det som redan är sparat i minnet
 * under tiden vyn är öppen — den hittar aldrig på en placering som inte kom
 * tillbaka från databasen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GARDEN_SLOT_COUNT, isValidSlot } from './season';
import {
  GardenPlacement,
  listGardenPlacements,
  nextFreeSlot,
  placeGardenItem,
  removeGardenItem,
} from './garden';

interface GardenPlacementsState {
  placements: GardenPlacement[];
  loading: boolean;
  /** Fel vid hämtning — påverkar hela trädgården. */
  loadError: string | null;
  /** Fel vid en enskild åtgärd, t.ex. full trädgård. */
  actionError: string | null;
  busyKey: string | null;
  /**
   * Ställer ett föremål på en plats. Utan `slot` väljs första lediga plats.
   * Står det redan något på platsen flyttas det tillbaka till samlingen.
   */
  place: (itemKey: string, slot?: number) => Promise<void>;
  /**
   * Flyttar ett placerat föremål till en annan plats. Står det något där byter
   * de två plats, så inget föremål försvinner av misstag.
   */
  move: (itemKey: string, slot: number) => Promise<void>;
  remove: (itemKey: string) => Promise<void>;
  reload: () => Promise<void>;
  clearError: () => void;
}

export function useGardenPlacements(): GardenPlacementsState {
  const [placements, setPlacements] = useState<GardenPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const result = await listGardenPlacements();
    if (!mounted.current) return;
    if (result.ok) {
      setPlacements(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const place = useCallback(
    async (itemKey: string, target?: number) => {
      setActionError(null);
      const exceptSame = placements.filter((placement) => placement.item_key !== itemKey);
      const slot =
        typeof target === 'number' && isValidSlot(target)
          ? target
          : nextFreeSlot(exceptSame, GARDEN_SLOT_COUNT);
      if (slot === null) {
        setActionError('Alla platser i trädgården är upptagna. Ta bort ett föremål först.');
        return;
      }

      setBusyKey(itemKey);
      const result = await placeGardenItem(itemKey, slot);
      if (!mounted.current) return;
      setBusyKey(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      await reload();
    },
    [placements, reload],
  );

  const move = useCallback(
    async (itemKey: string, slot: number) => {
      if (!isValidSlot(slot)) return;
      setActionError(null);

      const current = placements.find((placement) => placement.item_key === itemKey) ?? null;
      if (current && current.slot === slot) return;

      const occupant =
        placements.find(
          (placement) => placement.slot === slot && placement.item_key !== itemKey,
        ) ?? null;

      setBusyKey(itemKey);
      const first = await placeGardenItem(itemKey, slot);
      if (!mounted.current) return;
      if (!first.ok) {
        setBusyKey(null);
        setActionError(first.error);
        return;
      }

      // Den som stod på platsen flyttas till platsen föremålet lämnade, eller
      // till första lediga plats när föremålet inte stod ute. Servern avgör om
      // flytten är tillåten — klienten gissar aldrig.
      if (occupant) {
        const backSlot =
          current?.slot ??
          nextFreeSlot(
            placements.filter(
              (placement) =>
                placement.item_key !== occupant.item_key &&
                placement.item_key !== itemKey,
            ),
            GARDEN_SLOT_COUNT,
          );
        if (backSlot !== null && backSlot !== slot) {
          const second = await placeGardenItem(occupant.item_key, backSlot);
          if (!mounted.current) return;
          if (!second.ok) {
            setBusyKey(null);
            setActionError(second.error);
            await reload();
            return;
          }
        }
      }

      setBusyKey(null);
      await reload();
    },
    [placements, reload],
  );

  const remove = useCallback(
    async (itemKey: string) => {
      setActionError(null);
      setBusyKey(itemKey);
      const result = await removeGardenItem(itemKey);
      if (!mounted.current) return;
      setBusyKey(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      await reload();
    },
    [reload],
  );

  return {
    placements,
    loading,
    loadError,
    actionError,
    busyKey,
    place,
    move,
    remove,
    reload,
    clearError: () => setActionError(null),
  };
}
