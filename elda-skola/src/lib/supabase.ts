import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Supabase-klienten är appens enda väg till data. Den använder samma projekt,
 * samma anon-nyckel och samma session som den vanliga Elda-appen. Ingen
 * service-rollnyckel finns i klienten.
 */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  isConfigured ? url : 'https://konfiguration-saknas.supabase.co',
  isConfigured ? anonKey : 'konfiguration-saknas',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/** Gör databasfel begripliga utan att läcka tekniska detaljer. */
export function errorMessage(error: unknown, fallback = 'Något gick fel. Försök igen.'): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) return translate(message);
  }
  if (typeof error === 'string' && error.trim()) return translate(error.trim());
  return fallback;
}

function translate(message: string): string {
  if (/row-level security|permission denied|not authorized|insufficient privilege/i.test(message)) {
    return 'Du saknar behörighet för den åtgärden.';
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return 'Uppgiften finns redan.';
  }
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Kopplingen till servern misslyckades. Kontrollera din anslutning.';
  }
  if (/JWT|session|token/i.test(message)) {
    return 'Din session har gått ut. Logga in igen.';
  }
  return message;
}
