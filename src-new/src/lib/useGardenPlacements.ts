/**
 * Trädgårdens platser: hämtning, utplacering och borttagning.
 *
 * Allt går mot servern. Hooken håller bara det som redan är sparat i minnet
 * under tiden vyn är öppen — den hittar aldrig på en placering som inte kom
 * tillbaka från databasen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GARDEN_SLOT_COUNT } from './season';
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
  place: (itemKey: string) => Promise<void>;
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
    async (itemKey: string) => {
      setActionError(null);
      const exceptSame = placements.filter((placement) => placement.item_key !== itemKey);
      const slot = nextFreeSlot(exceptSame, GARDEN_SLOT_COUNT);
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
    remove,
    reload,
    clearError: () => setActionError(null),
  };
}
