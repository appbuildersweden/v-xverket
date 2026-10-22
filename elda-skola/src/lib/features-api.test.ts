import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('./supabase', () => ({
  supabase: { rpc: mock.rpc, auth: { getUser: vi.fn() } },
  errorMessage: (error: unknown) =>
    String((error as { message?: unknown } | null)?.message ?? 'Något gick fel.'),
}));

import { getPlatformFeatures, savePlatformFeatures } from './api';

const row = {
  shop_enabled: false,
  avatars_enabled: true,
  halloween_enabled: false,
  updated_at: '2026-10-21T12:00:00Z',
};

describe('funktionshantering via API', () => {
  it('mappar serverns rad till appens fält', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(getPlatformFeatures()).resolves.toEqual({
      shop: false,
      avatars: true,
      halloween: false,
      updated_at: '2026-10-21T12:00:00Z',
    });
    expect(mock.rpc).toHaveBeenCalledWith('elda_skola_platform_features');
  });

  it('faller tillbaka på allt påslaget när svaret är tomt', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getPlatformFeatures()).resolves.toEqual({
      shop: true,
      avatars: true,
      halloween: true,
      updated_at: null,
    });
  });

  it('skickar alla tre lägena när administratören sparar', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [row], error: null });
    const saved = await savePlatformFeatures({ shop: false, avatars: true, halloween: false });
    expect(mock.rpc).toHaveBeenCalledWith('elda_skola_save_platform_features', {
      p_shop_enabled: false,
      p_avatars_enabled: true,
      p_halloween_enabled: false,
    });
    expect(saved.shop).toBe(false);
    expect(saved.updated_at).toBe('2026-10-21T12:00:00Z');
  });

  it('kastar ett begripligt fel när servern nekar', async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for function elda_skola_save_platform_features' },
    });
    await expect(
      savePlatformFeatures({ shop: true, avatars: true, halloween: true }),
    ).rejects.toThrow(/permission denied/);
  });
});
