import { useCallback, useEffect, useState } from 'react';
import { getPlatformFeatures, savePlatformFeatures } from './api';
import { isConfigured } from './supabase';
import type { PlatformFeatures } from './types';

/**
 * Plattformens funktionsväxlar – delade av hela appen.
 *
 * Växlarna hämtas en gång per inloggning och hålls i en liten modulcache, så
 * att menyn, butiken och Halloween-området alltid visar samma läge utan egna
 * anrop. När administratören sparar uppdateras cachen och alla lyssnare ritar
 * om direkt. Servern är ändå den som avgör: köp, upplåsningar och teman
 * kontrolleras i databasen även om gränssnittet skulle visa fel.
 *
 * Standardläget är att allt är påslaget. Det gör appen användbar innan första
 * svaret har kommit, och en avstängning slår igenom så snart servern svarat.
 */

export const DEFAULT_PLATFORM_FEATURES: PlatformFeatures = {
  shop: true,
  avatars: true,
  halloween: true,
  updated_at: null,
};

/** Sidor som styrs av en funktion. Övriga sidor påverkas inte. */
const PAGE_FEATURES: Record<string, keyof Omit<PlatformFeatures, 'updated_at'>> = {
  butik: 'shop',
  halloween: 'halloween',
};

export function isPageEnabled(page: string, features: PlatformFeatures): boolean {
  const feature = PAGE_FEATURES[page];
  return feature ? features[feature] : true;
}

let cache: PlatformFeatures = DEFAULT_PLATFORM_FEATURES;
const listeners = new Set<(features: PlatformFeatures) => void>();

export function cachedPlatformFeatures(): PlatformFeatures {
  return cache;
}

export function applyPlatformFeatures(next: PlatformFeatures): void {
  cache = next;
  for (const listener of listeners) listener(cache);
}

export function subscribePlatformFeatures(
  listener: (features: PlatformFeatures) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Hämtar växlarna och kastar felet vidare, så att adminpanelen kan visa att
 * den inte vet vilket läge som gäller. Utan serverkonfiguration (tester) är
 * cachen det enda svaret.
 */
export async function refreshPlatformFeatures(): Promise<PlatformFeatures> {
  if (!isConfigured) return cache;
  const next = await getPlatformFeatures();
  applyPlatformFeatures(next);
  return next;
}

/**
 * Hämtar växlarna från servern. Ett misslyckat anrop får aldrig slå ut
 * gränssnittet – då behålls det senast kända läget.
 */
export async function loadPlatformFeatures(): Promise<PlatformFeatures> {
  try {
    return await refreshPlatformFeatures();
  } catch {
    return cache;
  }
}

/** Sparar växlarna och uppdaterar cachen så att alla vyer följer med direkt. */
export async function savePlatformFeatureFlags(input: {
  shop: boolean;
  avatars: boolean;
  halloween: boolean;
}): Promise<PlatformFeatures> {
  const saved = await savePlatformFeatures(input);
  applyPlatformFeatures(saved);
  return saved;
}

/** Prenumererar på växlarna. Används av meny, sidor och tema. */
export function usePlatformFeatures(): PlatformFeatures {
  const [features, setFeatures] = useState(cache);

  useEffect(() => {
    setFeatures(cache);
    return subscribePlatformFeatures(setFeatures);
  }, []);

  return features;
}

/** Laddar växlarna en gång när kontot är känt. */
export function useLoadPlatformFeatures(ready: boolean): void {
  const load = useCallback(() => {
    void loadPlatformFeatures();
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);
}
