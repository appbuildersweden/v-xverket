/**
 * Gemensam databasåtkomst för Elda.
 *
 * Alla anrop mot Supabase går genom den här filen så att felhanteringen blir
 * densamma överallt: varje funktion returnerar `Result<T>` i stället för att
 * kasta, och tekniska fel översätts till ett begripligt svenskt meddelande.
 *
 * Modulen är medvetet tunn — den ger ingen behörighet. Vad som får läsas och
 * skrivas avgörs av Row Level Security och av serverfunktionerna i databasen.
 */
import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateSupabaseClient } from './auth-supabase';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const ERR_PERMISSION = 'Du har inte behörighet till den här åtgärden.';
export const ERR_NETWORK =
  'Kopplingen till servern misslyckades. Kontrollera din anslutning och försök igen.';
export const ERR_NOT_READY =
  'Funktionen är inte aktiverad i databasen ännu. En administratör behöver köra den senaste migreringen.';
export const ERR_SESSION = 'Din session har gått ut. Logga in igen.';
export const ERR_UNKNOWN = 'Något gick fel. Försök igen.';

/** Översätter ett fel från Supabase/Postgres till ett meddelande för användaren. */
export function toErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return ERR_UNKNOWN;

  const message = String(
    typeof error === 'string'
      ? error
      : ((error as { message?: unknown }).message ?? error),
  ).trim();

  if (!message) return ERR_UNKNOWN;

  // Serverns egna meddelanden (raise exception i våra funktioner) är redan
  // skrivna för användaren och visas som de är.
  if (/row-level security|permission denied|not authorized/i.test(message)) {
    return ERR_PERMISSION;
  }
  if (/does not exist|could not find the table|could not find the function|schema cache/i.test(message)) {
    return ERR_NOT_READY;
  }
  if (/fetch|network|load failed|timed? ?out|ECONNREFUSED/i.test(message)) {
    return ERR_NETWORK;
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return 'Det finns redan.';
  }
  if (/jwt|token|invalid claim|session/i.test(message)) {
    return ERR_SESSION;
  }
  return message;
}

/** Kör en Supabase-fråga som returnerar rader och paketerar resultatet. */
export async function query<T>(
  fn: (sup: SupabaseClient) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<Result<T[]>> {
  try {
    const { data, error } = await fn(getOrCreateSupabaseClient());
    if (error) return { ok: false, error: toErrorMessage(error) };
    return { ok: true, data: data ?? [] };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/** Kör valfri logik mot klienten (flera frågor, RPC-anrop, uppladdning). */
export async function withClient<T>(
  fn: (sup: SupabaseClient) => Promise<T>,
): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn(getOrCreateSupabaseClient()) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

