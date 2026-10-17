/**
 * Demoläget – ett tydligt avgränsat utvecklingsläge.
 *
 * Modulen är medvetet liten och utan exempeldata: den håller bara flaggan och
 * den lokala klienten. Själva demodatan och den falska klienten ligger i
 * `src/demo/`, som bara laddas från utvecklingsbyggets startgren, så att ett
 * produktionsbygge aldrig innehåller eller hämtar den koden.
 *
 * Flaggan kräver dessutom `import.meta.env.DEV`, som Vite sätter till false i
 * produktionsbygget. Demoläget kan därför inte slås på i en riktig installation,
 * och det rör varken autentisering, roller eller behörigheter: det byter bara ut
 * transporten mot en lokal klient med exempeldata som aldrig når Supabase.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEMO_STORAGE_KEY = 'elda-demolage';

let demoClient: SupabaseClient | null = null;

/** Sant bara i utvecklingsbygget (alltid false i `dist`). */
export function demoSupported(): boolean {
  return import.meta.env.DEV === true;
}

/** Läser om demoläget är påslaget. Alltid false utanför utvecklingsbygget. */
export function demoRequested(): boolean {
  if (!demoSupported()) return false;
  try {
    return window.sessionStorage.getItem(DEMO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemoRequested(on: boolean): void {
  if (!demoSupported()) return;
  try {
    if (on) window.sessionStorage.setItem(DEMO_STORAGE_KEY, '1');
    else window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* sessionStorage kan saknas — då är demoläget helt enkelt av */
  }
}

/** Den lokala klienten i demoläget, annars null. */
export function getDemoClient(): SupabaseClient | null {
  return demoSupported() ? demoClient : null;
}

export function registerDemoClient(client: SupabaseClient | null): void {
  if (!demoSupported()) return;
  demoClient = client;
}

/** Sant när appen kör mot den lokala klienten i stället för Supabase. */
export function demoActive(): boolean {
  return getDemoClient() !== null;
}

/**
 * Lämnar demoläget och går tillbaka till den vanliga inloggningssidan.
 * Sessionen i minnet rensas och adressens `?demo=1` tas bort.
 */
export function leaveDemo(): void {
  setDemoRequested(false);
  registerDemoClient(null);
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    // Adressens hash pekar på en rutt i panelen. Tas den inte bort blir den
    // nya adressen identisk med den nuvarande, och då laddar webbläsaren inte
    // om — demoläget skulle ligga kvar trots att det stängts av.
    url.hash = '';
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

