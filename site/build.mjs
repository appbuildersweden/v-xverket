/* Bygger den publika webbplatsen i site/dist.
 *
 * Innehåll:
 *   index.html, registrera.html, feedback.html  – sidorna
 *   app.js, site.css, bot.js, config.json       – logik och konfiguration
 *   assets/                                     – ikon och bilder
 *   skola/                                      – den byggda Elda Skola-appen
 *
 * Ett steg, ingen versionshistorik och inga nedladdningsfiler: webbplatsen
 * beskriver skolplattformen och länkar dit. Adressen till plattformen läses
 * från ELDA_SKOLA_URL (via skola-url.mjs) och bara https godkänns.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSkolaUrl } from './skola-url.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');
const skolaDist = path.join(root, 'elda-skola', 'dist');

/** Kopierar en fil eller mapp om den finns. */
async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
  return true;
}

/** Läser Supabase-adressen ur miljön; samma publika värden som appen använder. */
function supabaseConfig() {
  const url = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const okUrl = /^https:\/\/[^\s]+$/i.test(url);
  return {
    supabaseUrl: okUrl ? url : '',
    supabaseAnonKey: okUrl ? anon : '',
  };
}

/** Skriver config.json som app.js läser i webbläsaren. */
async function writeConfig() {
  const { supabaseUrl, supabaseAnonKey } = supabaseConfig();
  const skolaUrl = normalizeSkolaUrl(process.env.ELDA_SKOLA_URL);
  if (!skolaUrl && (process.env.ELDA_SKOLA_URL || '').trim()) {
    console.warn('ELDA_SKOLA_URL ignoreras: adressen måste vara en https-adress.');
  }
  const config = { supabaseUrl, supabaseAnonKey, skolaUrl };
  await writeFile(path.join(out, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  return config;
}

/** Publicerar den byggda skolappen under /skola/. */
async function buildSkola(copied) {
  if (!copied) {
    console.warn(
      'elda-skola/dist saknas. Kör `ELDA_SKOLA_BUILD=1 npm run build` i elda-skola först – annars publiceras webbplatsen utan plattformen.',
    );
    return;
  }

  // Skolappen måste vara byggd med basen /skola/, annars pekar dess filer på
  // /assets och sidan blir ostylad och tom. Fånga det här i stället för live.
  const html = await readFile(path.join(out, 'skola', 'index.html'), 'utf8').catch(() => '');
  if (!html.includes('/skola/assets/')) {
    throw new Error(
      'elda-skola/dist är byggd utan base /skola/. Bygg om med ELDA_SKOLA_BUILD=1.',
    );
  }
}

/** Tar bort filer som hörde till den nedlagda Windows-appen. */
async function removeStale() {
  const stale = ['elda.html', 'versioner.html', 'skola.html', 'releases-snapshot.json', 'downloads'];
  for (const name of stale) {
    await rm(path.join(out, name), { recursive: true, force: true });
  }
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  await copyIfExists(path.join(here, 'index.html'), path.join(out, 'index.html'));
  await copyIfExists(path.join(here, 'registrera.html'), path.join(out, 'registrera.html'));
  await copyIfExists(path.join(here, 'feedback.html'), path.join(out, 'feedback.html'));
  await copyIfExists(path.join(here, 'registrera.js'), path.join(out, 'registrera.js'));
  await copyIfExists(path.join(here, 'app.js'), path.join(out, 'app.js'));
  await copyIfExists(path.join(here, 'site.css'), path.join(out, 'site.css'));
  // Registreringssidan har egna stilar utöver site.css.
  await copyIfExists(path.join(here, 'styles.css'), path.join(out, 'styles.css'));
  await copyIfExists(path.join(here, 'registrera.css'), path.join(out, 'registrera.css'));
  await copyIfExists(path.join(here, 'bot.js'), path.join(out, 'bot.js'));
  await copyIfExists(path.join(here, '_redirects'), path.join(out, '_redirects'));
  await copyIfExists(path.join(here, 'assets'), path.join(out, 'assets'));

  const config = await writeConfig();
  if (!config.supabaseUrl) {
    console.warn('VITE_SUPABASE_URL saknas: registrering och förslag är avstängda på sidan.');
  }

  const copiedSkola = await copyIfExists(skolaDist, path.join(out, 'skola'));
  await buildSkola(copiedSkola);
  await removeStale();

  // Kontroll: de filer som sidan måste ha.
  const required = ['index.html', 'app.js', 'site.css', 'config.json'];
  for (const name of required) {
    const info = await stat(path.join(out, name)).catch(() => null);
    if (!info) throw new Error(`Publiceringen saknar ${name}`);
  }

  const files = await readdir(out);
  console.log(`✓ site/dist byggd (${files.length} poster): ${files.sort().join(', ')}`);
  if (copiedSkola) console.log('✓ /skola/ innehåller Elda Skola');
  console.log(config.skolaUrl ? `✓ Plattformsadress: ${config.skolaUrl}` : '! Ingen plattformsadress (ELDA_SKOLA_URL)');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
