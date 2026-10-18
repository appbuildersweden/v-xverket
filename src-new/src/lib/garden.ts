/**
 * Sparade platser i säsongsträdgården.
 *
 * Placeringarna ligger i `garden_placements` och kan bara läsas av ägaren.
 * Själva skrivningen går genom serverfunktionerna `garden_place_item` och
 * `garden_remove_item`, som kontrollerar att föremålet verkligen är upplåst
 * innan det får ställas ut. Klienten kan alltså inte fylla trädgården med
 * föremål som eleven inte har tjänat ihop.
 *
 * Är migreringen inte körd svarar servern att funktionen saknas. Då visas ett
 * tydligt besked i gränssnittet i stället för att placeringar ser ut att sparas.
 */
import { Result, withClient } from './db';

export interface GardenPlacement {
  item_key: string;
  slot: number;
  updated_at: string;
}

/** Läser användarens egna placeringar (RLS begränsar raderna). */
export async function listGardenPlacements(): Promise<Result<GardenPlacement[]>> {
  return withClient(async (sup) => {
    const { data: userData, error: userErr } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (userErr || !uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup
      .from('garden_placements')
      .select('item_key, slot, updated_at')
      .eq('user_id', uid)
      .order('slot', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row) => ({
      item_key: String(row.item_key),
      slot: Number(row.slot),
      updated_at: String(row.updated_at ?? ''),
    }));
  });
}

/** Första lediga platsen, eller null när alla platser är upptagna. */
export function nextFreeSlot(
  placements: readonly GardenPlacement[],
  slotCount: number,
): number | null {
  const used = new Set(placements.map((placement) => placement.slot));
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

/** Ställer ett upplåst föremål på en plats. Servern avgör om det är tillåtet. */
export async function placeGardenItem(itemKey: string, slot: number): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('garden_place_item', {
      p_item_key: itemKey,
      p_slot: slot,
    });
    if (error) throw error;
    return true as const;
  });
}

/** Tar bort ett föremål från trädgården. */
export async function removeGardenItem(itemKey: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('garden_remove_item', { p_item_key: itemKey });
    if (error) throw error;
    return true as const;
  });
}
