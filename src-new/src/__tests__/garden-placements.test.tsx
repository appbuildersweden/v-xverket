import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGardenPlacements } from '../lib/useGardenPlacements';

/**
 * Hooken som håller trädgårdens platser. Testerna beskriver reglerna: ett
 * föremål hamnar på vald plats, och när platsen är upptagen byter de två plats
 * i stället för att något försvinner.
 */
const mocks = vi.hoisted(() => ({
  listGardenPlacements: vi.fn(),
  placeGardenItem: vi.fn(),
  removeGardenItem: vi.fn(),
}));

vi.mock('../lib/garden', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/garden')>();
  return {
    ...actual,
    listGardenPlacements: mocks.listGardenPlacements,
    placeGardenItem: mocks.placeGardenItem,
    removeGardenItem: mocks.removeGardenItem,
  };
});

function placement(item_key: string, slot: number) {
  return { item_key, slot, updated_at: '2026-10-01T10:00:00Z' };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('trädgårdens placeringar', () => {
  it('ställer ett föremål på den plats eleven väljer', async () => {
    mocks.listGardenPlacements.mockResolvedValue({ ok: true, data: [] });
    mocks.placeGardenItem.mockResolvedValue({ ok: true, data: true });

    const { result } = renderHook(() => useGardenPlacements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.place('pumpa-glod', 4);
    });

    expect(mocks.placeGardenItem).toHaveBeenCalledWith('pumpa-glod', 4);
    expect(result.current.actionError).toBeNull();
  });

  it('byter plats med föremålet som står på den valda platsen', async () => {
    mocks.listGardenPlacements.mockResolvedValue({
      ok: true,
      data: [placement('pumpa-glod', 0), placement('katt', 4)],
    });
    mocks.placeGardenItem.mockResolvedValue({ ok: true, data: true });

    const { result } = renderHook(() => useGardenPlacements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.move('pumpa-glod', 4);
    });

    expect(mocks.placeGardenItem).toHaveBeenNthCalledWith(1, 'pumpa-glod', 4);
    expect(mocks.placeGardenItem).toHaveBeenNthCalledWith(2, 'katt', 0);
    expect(result.current.actionError).toBeNull();
  });

  it('visar serverns fel när en flytt inte är tillåten', async () => {
    mocks.listGardenPlacements.mockResolvedValue({ ok: true, data: [placement('katt', 2)] });
    mocks.placeGardenItem.mockResolvedValue({
      ok: false,
      error: 'Föremålet är inte upplåst.',
    });

    const { result } = renderHook(() => useGardenPlacements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.place('katt', 5);
    });

    expect(result.current.actionError).toBe('Föremålet är inte upplåst.');
  });
});
