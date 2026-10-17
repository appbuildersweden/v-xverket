import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  date: string | null;
  body: string | null;
  error: string | null;
}

export interface ProgressEvent {
  event: 'Started' | 'Progress' | 'Finished';
  data?: { chunkLength?: number; contentLength?: number };
}

/** Hur många gånger en misslyckad kontroll görs om innan felet rapporteras. */
const CHECK_ATTEMPTS = 3;

export interface PublishedUpdate {
  version: string;
  notes: string | null;
  date: string | null;
  url: string | null;
}

/** Den adress appen frågar efter uppdateringar på (från tauri.conf.json). */
export function updateEndpoint(): string {
  return typeof __ELDA_UPDATE_ENDPOINT__ === 'string' ? __ELDA_UPDATE_ENDPOINT__ : '';
}

/**
 * Läs det publicerade uppdateringsmanifestet direkt.
 *
 * Används av adminpanelen för att visa vilken version som faktiskt ligger
 * ute, även när appen körs i en webbläsare där Tauri-uppdateraren inte finns.
 */
export async function fetchPublishedUpdate(): Promise<{
  info: PublishedUpdate | null;
  error: string | null;
}> {
  const endpoint = updateEndpoint();
  if (!endpoint) {
    return { info: null, error: 'Uppdateringsadressen saknas i det här bygget.' };
  }
  try {
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Servern svarade ${res.status}.`);
    const data = (await res.json()) as {
      version?: string;
      notes?: string;
      pub_date?: string;
      platforms?: Record<string, { url?: string }>;
    };
    if (!data?.version) throw new Error('Manifestet saknar versionsnummer.');
    return {
      info: {
        version: String(data.version),
        notes: data.notes ? String(data.notes) : null,
        date: data.pub_date ? String(data.pub_date) : null,
        url: data.platforms?.['windows-x86_64']?.url ?? null,
      },
      error: null,
    };
  } catch (err) {
    return {
      info: null,
      error:
        err instanceof Error && err.message
          ? err.message
          : 'Kunde inte läsa den publicerade versionen.',
    };
  }
}

let cachedVersion: string | null = null;
let suppressNotificationUntil = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Kör appen inne i Tauri? I en vanlig webbläsare finns ingen updater. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Läser den installerade appens versionsnummer från Tauri.
 *
 * Versionen får inte gissas i gränssnittet: `getVersion()` läser det som
 * faktiskt byggdes in. Resultatet cachas och speglas till
 * `window.__TAURI_APP_VERSION__` så att synkrona komponenter kan visa rätt
 * värde efter första anropet.
 */
export async function loadCurrentVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  if (!isTauri()) return currentBuiltVersion();
  try {
    const version = await getVersion();
    cachedVersion = version;
    (window as unknown as { __TAURI_APP_VERSION__?: string }).__TAURI_APP_VERSION__ =
      version;
    return version;
  } catch {
    return currentBuiltVersion();
  }
}

/**
 * Kontrollera efter en uppdatering, med några få återförsök vid tillfälliga
 * nätverksfel. Returnerar uppdateringsresursen så att anroparen kan ladda ner
 * exakt den version som hittades (ingen andra kontroll behövs).
 */
export async function checkForUpdateResource(): Promise<{
  result: UpdateCheckResult;
  update: Update | null;
}> {
  const currentVersion = await loadCurrentVersion();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < CHECK_ATTEMPTS; attempt += 1) {
    try {
      const update = await check();
      if (!update) {
        return {
          update: null,
          result: {
            available: false,
            currentVersion,
            latestVersion: null,
            date: null,
            body: null,
            error: null,
          },
        };
      }

      return {
        update,
        result: {
          available: update.available,
          currentVersion: update.currentVersion,
          latestVersion: update.version ?? null,
          date: update.date ?? null,
          body: update.body ?? null,
          error: null,
        },
      };
    } catch (err) {
      lastError = err;
      // Tillfälliga fel (nätverk, timeout) löses ofta av ett nytt försök.
      if (attempt < CHECK_ATTEMPTS - 1) {
        await sleep(1000 * 2 ** attempt);
      }
    }
  }

  const message =
    lastError instanceof Error && lastError.message
      ? lastError.message
      : 'Kunde inte kontrollera uppdateringar.';
  return {
    update: null,
    result: {
      available: false,
      currentVersion,
      latestVersion: null,
      date: null,
      body: null,
      error: message,
    },
  };
}

/**
 * Kontrollera efter en uppdatering.
 *
 * Kallas från profilsidan och uppdateringsvyn. Returnerar aldrig ett exception;
 * vid fel returneras ett resultat med error-fältet ifyllt.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return (await checkForUpdateResource()).result;
}

/**
 * Ladda ner uppdateringen och rapportera förlopp via onProgress.
 * Returnerar den nerladdade uppdateringen så att användaren kan installera den.
 */
export async function downloadUpdate(
  update: Update,
  onProgress: (event: ProgressEvent) => void,
): Promise<Update> {
  await update.download((event) => {
    if (!event) return;
    const ev = event as unknown as {
      event: string;
      data?: { chunkLength?: number; contentLength?: number };
    };
    onProgress({
      event: ev.event as ProgressEvent['event'],
      data: ev.data ?? undefined,
    });
  });
  return update;
}

/**
 * Installera den nerladdade uppdateringen och starta om appen.
 *
 * På Windows startar signaturen verifieras av updater-pluginen innan
 * installationsprogrammet körs. Anropet avslutar den här processen när
 * installationen tar över; `relaunch()` används för de plattformar där appen
 * lever kvar efter installationen.
 */
export async function installUpdate(update: Update): Promise<void> {
  await update.install();
  await relaunch();
}

/**
 * Enklare väg: kontrollera, ladda ner med förlopp och installera.
 */
export async function updateNow(
  onProgress: (event: ProgressEvent) => void,
): Promise<void> {
  const { result, update } = await checkForUpdateResource();
  if (result.error) {
    throw new Error(result.error);
  }
  if (!result.available || !result.latestVersion || !update) {
    throw new Error('Ingen ny version tillgänglig.');
  }

  await downloadUpdate(update, onProgress);
  await installUpdate(update);
}

/**
 * Versionsnummer som är inbyggt i appen (fran tauri.conf.json).
 * Fås från Vite/Tauri när appen körs inne i Tauri; annars en
 * reservsträng så att gränssnittet aldrig kraschar.
 */
export function currentBuiltVersion(): string {
  const globalAny = window as unknown as { __TAURI_APP_VERSION__?: string };
  return globalAny.__TAURI_APP_VERSION__ ?? cachedVersion ?? '0.0.0';
}

/**
 * Markera att nästa avisering ska ske om X minuter.
 */
export function remindLater(minutes: number): void {
  suppressNotificationUntil = Date.now() + minutes * 60 * 1000;
}

/** Kan en avisering visas just nu? */
export function canShowNotification(): boolean {
  return Date.now() >= suppressNotificationUntil;
}
