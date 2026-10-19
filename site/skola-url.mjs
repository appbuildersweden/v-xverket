/**
 * Adressen till Elda-skola, skolplattformen som hemsidan länkar vidare till.
 *
 * Adressen sätts vid bygget (ELDA_SKOLA_URL) i stället för att skrivas in i
 * HTML:en, så att hemsidan kan publiceras innan plattformen har en adress och
 * så att en lokal testadress aldrig råkar följa med till produktion.
 *
 * Reglerna är medvetet strikta:
 *  - Bara https i skarpa byggen. En http-adress skulle tappa sessionscookien
 *    (Secure) och ge ett trasigt inloggningsflöde.
 *  - Bara en absolut adress utan användarnamn, lösenord eller fragment.
 *  - localhost/127.0.0.1 tillåts bara när bygget uttryckligen är lokalt, så att
 *    en testadress inte kan publiceras av misstag.
 */

/** Standardvärdet som används när ingen adress är satt: ingen länk alls. */
export const SKOLA_URL_EMPTY = '';

const LOKALA_VARDAR = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Läser och normaliserar en adress till skolplattformen.
 *
 * Returnerar en sträng utan avslutande snedstreck, eller tom sträng när
 * adressen saknas eller inte får användas. Bygget publicerar då sidan utan
 * länk och med ett ärligt besked i stället för en knapp som inte fungerar.
 */
export function normalizeSkolaUrl(value, { allowLocal = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return SKOLA_URL_EMPTY;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return SKOLA_URL_EMPTY;
  }

  if (url.username || url.password) return SKOLA_URL_EMPTY;
  if (url.search || url.hash) return SKOLA_URL_EMPTY;

  const lokal = LOKALA_VARDAR.has(url.hostname);
  if (lokal && !allowLocal) return SKOLA_URL_EMPTY;
  if (url.protocol !== 'https:' && !(lokal && url.protocol === 'http:')) {
    return SKOLA_URL_EMPTY;
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * Bygger den konfiguration som app.js läser i webbläsaren.
 *
 * `skolaUrl` är tom när adressen saknas eller inte är godkänd; då visar sidan
 * att plattformen inte går att öppna ännu.
 */
export function buildSiteConfig({ supabaseUrl = '', supabaseAnonKey = '', skolaUrl = '' } = {}) {
  const config = {};
  if (supabaseUrl && supabaseAnonKey) {
    config.supabaseUrl = supabaseUrl;
    config.supabaseAnonKey = supabaseAnonKey;
  }
  const rensad = normalizeSkolaUrl(skolaUrl, {
    allowLocal: process.env.ELDA_ALLOW_LOCAL_SKOLA === '1',
  });
  if (rensad) config.skolaUrl = rensad;
  return config;
}
