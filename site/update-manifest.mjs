/**
 * Hjälpfunktioner för Tauris uppdateringsmanifest (update.json).
 *
 * Manifestet måste peka på en fil som går att ladda ner utan inloggning och
 * innehålla exakt den signatur som hör till filen. Tauri verifierar signaturen
 * med den publika nyckeln i tauri.conf.json innan installationen startar.
 */

export const UPDATER_BASE_FALLBACK = 'https://elda-6a9.pages.dev';

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** Normalisera basadressen: https, inget avslutande snedstreck. */
export function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim();
  if (!value) return UPDATER_BASE_FALLBACK;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Ogiltig basadress för uppdateringar: ${value}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error('Uppdateringar måste serveras över https.');
  }
  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/**
 * Hitta updater-paketet för en version bland filnamnen i site/downloads.
 * Endast NSIS-installationsfilen (*-setup.exe) används av Tauri på Windows.
 */
export function findUpdaterArtifact(fileNames, version) {
  if (!VERSION_RE.test(String(version || ''))) {
    throw new Error(`Ogiltigt versionsnummer: ${version}`);
  }
  const candidates = (fileNames || []).filter(
    (name) =>
      name.endsWith('-setup.exe') &&
      name.includes(`_${version}_`) &&
      !name.includes('/') &&
      !name.includes('\\'),
  );
  if (candidates.length === 0) return null;
  // Om flera matchar (t.ex. arm64 och x64) väljer vi x64, som är den kanal
  // appen är byggd för.
  const chosen =
    candidates.find((name) => name.includes('x64')) ?? candidates[0];
  const signatureFile = `${chosen}.sig`;
  return {
    file: chosen,
    signatureFile,
    hasSignature: (fileNames || []).includes(signatureFile),
  };
}

/**
 * Bygg update.json.
 *
 * signature: innehållet i .sig-filen (base64), inte sökvägen.
 */
export function buildUpdateManifest({
  version,
  notes,
  signature,
  fileName,
  baseUrl,
  pubDate,
}) {
  if (!VERSION_RE.test(String(version || ''))) {
    throw new Error(`Ogiltigt versionsnummer: ${version}`);
  }
  const signatureText = String(signature || '').trim();
  if (!signatureText) {
    throw new Error('Signatur saknas – uppdateringspaketet måste signeras.');
  }
  if (!fileName || /[\\/]/.test(fileName)) {
    throw new Error('Ogiltigt filnamn för uppdateringspaketet.');
  }

  const base = normalizeBaseUrl(baseUrl);
  const date = pubDate ? new Date(pubDate) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Ogiltigt datum: ${pubDate}`);
  }

  return {
    version: String(version),
    notes: String(notes || `Elda ${version}`).trim(),
    pub_date: date.toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: signatureText,
        url: `${base}/updates/${encodeURIComponent(fileName)}`,
      },
    },
  };
}
