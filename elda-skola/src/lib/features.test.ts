import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PLATFORM_FEATURES,
  applyPlatformFeatures,
  cachedPlatformFeatures,
  isPageEnabled,
  loadPlatformFeatures,
  subscribePlatformFeatures,
} from './features';

/**
 * Funktionsväxlarna är rena data: standardläget är allt påslaget, bara butiken
 * och Halloween styrs av en växel, och cachen uppdaterar alla lyssnare direkt.
 */

describe('funktionsväxlar', () => {
  beforeEach(() => {
    applyPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
  });

  it('har allt påslaget som standard', () => {
    expect(DEFAULT_PLATFORM_FEATURES).toEqual({
      shop: true,
      avatars: true,
      halloween: true,
      updated_at: null,
    });
    expect(cachedPlatformFeatures()).toEqual(DEFAULT_PLATFORM_FEATURES);
  });

  it('styr bara butiken och Halloween – inte vanliga skolsidor', () => {
    const off = { ...DEFAULT_PLATFORM_FEATURES, shop: false, halloween: false };
    expect(isPageEnabled('butik', off)).toBe(false);
    expect(isPageEnabled('halloween', off)).toBe(false);
    expect(isPageEnabled('hem', off)).toBe(true);
    expect(isPageEnabled('uppgifter', off)).toBe(true);
    expect(isPageEnabled('profil', off)).toBe(true);
    // Okänd sida påverkas inte av en avstängning.
    expect(isPageEnabled('okand-sida', off)).toBe(true);
  });

  it('uppdaterar cachen och alla lyssnare', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePlatformFeatures(listener);

    const next = { ...DEFAULT_PLATFORM_FEATURES, shop: false, updated_at: '2026-10-21T10:00:00Z' };
    applyPlatformFeatures(next);

    expect(cachedPlatformFeatures()).toEqual(next);
    expect(listener).toHaveBeenCalledWith(next);

    unsubscribe();
    applyPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('behåller senast kända läge när servern inte kan nås', async () => {
    const off = { ...DEFAULT_PLATFORM_FEATURES, avatars: false };
    applyPlatformFeatures(off);
    // Utan Supabase-konfiguration (som i testet) finns inget att hämta.
    await expect(loadPlatformFeatures()).resolves.toEqual(off);
    expect(cachedPlatformFeatures()).toEqual(off);
  });
});
