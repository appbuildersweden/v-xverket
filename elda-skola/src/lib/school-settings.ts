import { getSchoolSettings } from './api';
import { isConfigured } from './supabase';
import type { SchoolSettings } from './types';

/**
 * Skolans inställningar delas av hela appen.
 *
 * De hämtas en gång per inloggning och hålls i en liten modulcache, så att
 * sidopanelen och profilsidan visar samma namn utan att varje komponent gör
 * ett eget anrop. När adminpanelen sparar nya värden uppdateras cachen och
 * alla lyssnare ritar om direkt – ingen omladdning behövs.
 */

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  school_name: 'Elda Skola',
  contact_email: null,
  updated_at: null,
};

/** Samma regel som databasen använder, så att felet syns direkt i formuläret. */
const EPOST = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface SchoolSettingsInput {
  schoolName: string;
  contactEmail: string;
}

export interface SchoolSettingsErrors {
  schoolName?: string;
  contactEmail?: string;
}

let cache: SchoolSettings = DEFAULT_SCHOOL_SETTINGS;
const listeners = new Set<(settings: SchoolSettings) => void>();

export function cachedSchoolSettings(): SchoolSettings {
  return cache;
}

export function applySchoolSettings(next: SchoolSettings): void {
  cache = next;
  for (const listener of listeners) listener(cache);
}

export function subscribeSchoolSettings(listener: (settings: SchoolSettings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Hämtar inställningarna från servern. Ett misslyckat anrop får aldrig slå ut
 * gränssnittet – då behålls det som redan är känt (eller standardvärdet).
 */
export async function loadSchoolSettings(): Promise<SchoolSettings> {
  // Utan serverkonfiguration (t.ex. i tester) finns inget att hämta.
  if (!isConfigured) return cache;
  try {
    const next = await getSchoolSettings();
    applySchoolSettings(next);
    return next;
  } catch {
    return cache;
  }
}

export function validateSchoolSettings(input: SchoolSettingsInput): {
  ok: boolean;
  errors: SchoolSettingsErrors;
} {
  const errors: SchoolSettingsErrors = {};
  const name = input.schoolName.trim();
  const email = input.contactEmail.trim();

  if (name.length < 2 || name.length > 80) {
    errors.schoolName = 'Skolans namn måste vara 2–80 tecken.';
  }
  if (email && !EPOST.test(email)) {
    errors.contactEmail = 'Ange en giltig e-postadress, t.ex. skolan@exempel.se.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
