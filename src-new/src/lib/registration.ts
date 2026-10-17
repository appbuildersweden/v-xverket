/**
 * Registreringsansökningarna — adminsidan.
 *
 * Själva registreringen sker inte längre i appen. Registreringsboten ligger på
 * Eldas hemsida (`site/registrera.html`) och är den enda publika vägen till ett
 * konto; den pratar direkt med den skyddade serverfunktionen `register`, som
 * äger frågorna, valideringen, beslutet och kontoskapandet.
 *
 * Den här modulen är därför bara adminsidan: listan över inkomna ansökningar,
 * besluten och granskningsloggen. Ingenting här kan skapa ett konto eller
 * påverka en roll — det sker serversidigt i `register` respektive `admin-users`
 * och kräver en administratörssession.
 */
import { Result, withClient } from './db';

// ---------------------------------------------------------------- Typer

export type RegistrationKind = 'skolelev' | 'privat_elev' | 'larare';

/** En kontoansöknings status i flödet. */
export type ApplicationStatus =
  | 'utkast'
  | 'vantar'
  | 'godkand'
  | 'nekad'
  | 'skapad'
  | 'misslyckad'
  // Kontot skapades men har tagits bort av användaren. Raden finns kvar som
  // spår i granskningsloggen och får aldrig sakna en etikett i gränssnittet.
  | 'borttagen';

export const KIND_LABELS: Readonly<Record<RegistrationKind, string>> = {
  skolelev: 'Skolelev',
  privat_elev: 'Privat elev',
  larare: 'Lärare',
};

export const STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  utkast: 'Påbörjad',
  vantar: 'Väntar på granskning',
  godkand: 'Godkänd',
  nekad: 'Avslagen',
  skapad: 'Konto skapat',
  misslyckad: 'Misslyckad',
  borttagen: 'Borttagen av användaren',
};

export interface RegistrationApplicationRow {
  id: string;
  kind: RegistrationKind;
  status: ApplicationStatus;
  full_name: string | null;
  summary: string | null;
  risk_flags: string[] | null;
  bot_decision: string | null;
  created_at: string;
  decided_at: string | null;
  review_note: string | null;
  created_username: string | null;
  created_class_code: string | null;
}

export interface AuditRow {
  id: string;
  actor_username: string | null;
  actor_role: string | null;
  action: string;
  subject_type: string | null;
  subject_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type ApplicationDecision = 'godkand' | 'begransad' | 'nekad';

// ---------------------------------------------------------------- Admin

/** Registreringsansökningar (endast admin — servern nekar alla andra). */
export async function listRegistrationApplications(
  status: ApplicationStatus | null = null,
): Promise<Result<RegistrationApplicationRow[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_registration_applications', {
      p_status: status,
    });
    if (error) throw error;
    return (data ?? []) as RegistrationApplicationRow[];
  });
}

/**
 * Admins beslut om en ansökan. Ett godkännande slår av begränsningen, ett avslag
 * stänger av kontot — allt serversidigt och loggat.
 */
export async function decideRegistrationApplication(
  applicationId: string,
  decision: ApplicationDecision,
  note = '',
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('decide_registration_application', {
      p_application: applicationId,
      p_decision: decision,
      p_note: note.trim() || null,
    });
    if (error) throw error;
    return true as const;
  });
}

/** Granskningsloggen (endast admin). Innehåller aldrig lösenord eller nycklar. */
export async function listAuditLog(limit = 100): Promise<Result<AuditRow[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_audit_log', { p_limit: limit });
    if (error) throw error;
    return (data ?? []) as AuditRow[];
  });
}

/**
 * Sant om ansökan behöver granskas av en människa: den väntar på beslut eller
 * bär varningssignaler. Ren funktion, används för räknare och markeringar.
 */
export function needsReview(row: RegistrationApplicationRow): boolean {
  return row.status === 'vantar' || (row.risk_flags?.length ?? 0) > 0;
}

/** Räknar ansökningar per status. Ren funktion. */
export function countApplications(
  rows: readonly RegistrationApplicationRow[],
): { total: number; pending: number; withFlags: number; created: number } {
  let pending = 0;
  let withFlags = 0;
  let created = 0;
  for (const row of rows) {
    if (row.status === 'vantar') pending += 1;
    if ((row.risk_flags?.length ?? 0) > 0) withFlags += 1;
    if (row.status === 'skapad' || row.status === 'godkand') created += 1;
  }
  return { total: rows.length, pending, withFlags, created };
}
