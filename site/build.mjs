#!/usr/bin/env node
/**
 * Bygger Elda-hemsidan till ./dist med riktiga releaseuppgifter.
 *
 * - Hämta releaser från GitHub (GITHUB_TOKEN om repo:n är privat).
 * - Skriver releases.json som appen läser i webbläsaren (inga hemligheter
 *   någonsin i klienten).
 * - Kopierar statiska filer till dist/, som är det enda som publiceras.
 */
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUpdateManifest,
  findUpdaterArtifact,
} from './update-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, 'dist');
const REPO = process.env.ELDA_REPO || 'appbuildersweden/v-xverket';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;

/** Appens version står i Tauri-konfigurationen och är den som byggs in. */
async function appVersion() {
  const raw = await readFile(join(HERE, '..', 'src-tauri', 'tauri.conf.json'), 'utf8');
  const version = JSON.parse(raw)?.version;
  if (!version) throw new Error('Version saknas i src-tauri/tauri.conf.json');
  return version;
}

/** Delar upp release-anteckningar i rubrik + punktlistor. */
function parseNotes(body) {
  const sections = [];
  let current = null;
  let summary = '';

  for (const rawLine of String(body || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading) {
      current = { heading: heading[1].replace(/[:：]\s*$/, ''), items: [] };
      sections.push(current);
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!current) { current = { heading: 'Ändringar', items: [] }; sections.push(current); }
      current.items.push(bullet[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, ''));
      continue;
    }
    if (!current && !summary) {
      summary = line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
    }
  }
  return { summary, sections: sections.filter((s) => s.items.length) };
}

async function fetchReleases() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'elda-site' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API, { headers });
  if (!res.ok) {
    throw new Error(`GitHub svarade ${res.status} vid hämtning av releaser`);
  }
  const rows = await res.json();

  return rows.map((r) => {
    const { summary, sections } = parseNotes(r.body);
    return {
      tag: r.tag_name,
      name: r.name || r.tag_name,
      url: r.html_url,
      publishedAt: r.published_at,
      prerelease: Boolean(r.prerelease),
      draft: Boolean(r.draft),
      summary,
      sections,
      // Endast metadata om filerna publiceras. Själva nedladdningen går genom
      // den skyddade funktionen, så ingen publik filadress hamnar i sidan.
      assets: (r.assets || [])
        .filter((a) => !a.name.endsWith('.json'))
        .map((a) => ({
          name: a.name,
          size: a.size,
          os: a.name.includes('x64') || a.name.includes('setup') ? 'Windows' : '',
        })),
    };
  });
}

/**
 * Den publika Supabase-konfigurationen för registreringssidan.
 *
 * Anon-nyckeln är publik och ligger redan i den byggda appen — den ger ingen
 * behörighet i sig (RLS och serverfunktionerna avgör). Service role-nyckeln
 * får aldrig hamna här, och inga värden skrivs ut i loggen.
 *
 * Värdena tas från byggmiljön (samma Actions-variabler som appbygget använder)
 * eller från repots .env, så att inga nycklar behöver kopieras till en ny fil.
 */
async function supabaseConfig() {
  const url = (process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (url && key) return { supabaseUrl: url, supabaseAnonKey: key };

  let raw = '';
  try {
    raw = await readFile(join(HERE, '..', '.env'), 'utf8');
  } catch {
    return { supabaseUrl: url, supabaseAnonKey: key };
  }

  const pick = (name) => {
    const line = raw
      .split(/\r?\n/)
      .find((row) => row.trim().startsWith(`${name}=`));
    if (!line) return '';
    return line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  };

  return {
    supabaseUrl: url || pick('VITE_SUPABASE_URL'),
    supabaseAnonKey: key || pick('VITE_SUPABASE_ANON_KEY'),
  };
}

/**
 * Publicera det signerade uppdateringspaketet och skriv update.json.
 *
 * Tauri hämtar manifestet från en fast adress (se plugins.updater.endpoints i
 * tauri.conf.json) och laddar sedan ner filen från den adress manifestet
 * anger. Därför måste både manifestet och filen vara publika – annars kan den
 * installerade appen aldrig upptäcka en ny version. Signaturen i manifestet
 * är samma .sig som releasen skapade, så innehållet kan inte bytas ut.
 */
async function writeUpdaterArtifacts(version, releases) {
  const downloads = join(HERE, 'downloads');
  const updatesDir = join(DIST, 'updates');
  await rm(updatesDir, { recursive: true, force: true });

  let names = [];
  try {
    names = await readdir(downloads);
  } catch {
    names = [];
  }

  const artifact = findUpdaterArtifact(names, version);
  if (!artifact) {
    console.warn(
      `! hittade inget uppdateringspaket för ${version} i site/downloads – update.json publiceras inte`,
    );
    return false;
  }
  if (!artifact.hasSignature) {
    throw new Error(`Signatur saknas för ${artifact.file} – vägrar publicera osignerad uppdatering.`);
  }

  const source = join(downloads, artifact.file);
  const bytes = (await stat(source)).size;
  const signature = await readFile(join(downloads, artifact.signatureFile), 'utf8');
  const release = releases.find(
    (r) => r.tag === `v${version}` || r.tag === version,
  );

  const manifest = buildUpdateManifest({
    version,
    notes:
      process.env.ELDA_UPDATE_NOTES ||
      release?.summary ||
      `Elda ${version}`,
    signature,
    fileName: artifact.file,
    baseUrl: process.env.ELDA_UPDATER_BASE,
    pubDate: release?.publishedAt,
  });

  await mkdir(updatesDir, { recursive: true });
  await copyFile(source, join(updatesDir, artifact.file));
  await writeFile(join(DIST, 'update.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `✓ update.json för ${version} – ${artifact.file} (${bytes} B) och signatur publiceras`,
  );
  return true;
}

async function main() {
  // Skriv över i stället för att radera mappen – mappen kan vara låst av en
  // förhandsgranskning eller av OneDrive, och filuppsättningen är fast.
  await mkdir(DIST, { recursive: true });

  let releases = [];
  let fetchedAt = new Date().toISOString();
  try {
    releases = await fetchReleases();
    console.log(`✓ ${releases.length} release(s) hämtade från GitHub`);
  } catch (err) {
    // Webbplatsen ska fungera även utan tillgång till GitHub – då visas
    // "nedladdning ännu inte tillgänglig" i stället för fel eller påhittade siffror.
    fetchedAt = new Date().toISOString();
    console.warn(`! kunde inte hämta releaser: ${err.message}`);
    releases = [];
  }

  // Uppdateringsmanifestet måste alltid finnas på den adress appen frågar
  // efter. Det byggs från samma signerade fil som releasen publicerade, så
  // version, adress och signatur hör ihop. Saknas filerna (t.ex. vid ett
  // lokalt sidbygge) publiceras inget manifest – men ett gammalt manifest får
  // aldrig ligga kvar och peka på en fil som inte finns.
  await rm(join(DIST, 'update.json'), { force: true });
  const updaterPublished = await writeUpdaterArtifacts(
    await appVersion(),
    releases.filter((r) => !r.draft),
  );

  const payload = {
    repo: `https://github.com/${REPO}`,
    source: `https://github.com/${REPO}/releases`,
    fetchedAt,
    // Automatiska uppdateringar kräver att update.json och det signerade
    // uppdateringspaketet är publika. Signaturen verifieras av Tauri med den
    // publika nyckeln i appen; själva nedladdningsknappen på sidan går
    // fortfarande genom den inloggade nedladdningsfunktionen.
    updater: updaterPublished,
    releases,
  };
  await writeFile(join(DIST, 'releases.json'), JSON.stringify(payload, null, 2) + '\n');

  for (const file of [
    'index.html',
    'styles.css',
    'app.js',
    // Gamla direktlänkar till installationsfiler ska aldrig servera en fil.
    '_redirects',
    // Registreringssidan (boten) — hemsidans enda publika väg till ett konto.
    'registrera.html',
    'registrera.css',
    'registrera.js',
    'bot.js',
  ]) {
    await copyFile(join(HERE, file), join(DIST, file));
  }
  await cp(join(HERE, 'assets'), join(DIST, 'assets'), { recursive: true });

  // Registreringssidan behöver veta var servern finns. Saknas konfigurationen
  // publiceras sidan ändå — nedladdningen och uppdateringarna ska aldrig
  // blockeras av registreringen — men registreringssidan visar då ett tydligt
  // besked i stället för att låtsas att den fungerar.
  const configFile = join(DIST, 'config.json');
  const config = await supabaseConfig();
  if (config.supabaseUrl && config.supabaseAnonKey) {
    await writeFile(configFile, JSON.stringify(config, null, 2) + '\n');
    console.log('✓ config.json skriven – registreringen kan nå servern');
  } else {
    await rm(configFile, { force: true });
    console.warn(
      '! VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY saknas – registreringssidan publiceras utan serveradress och visar "inte tillgänglig".',
    );
  }

  // Installationsfilerna publiceras aldrig med sidan. De ligger i den privata
  // Storage-bucketen och nås bara via den skyddade nedladdningsfunktionen.
  // En gammal kopia i dist/ skulle vara en publik genväg förbi skyddet.
  await rm(join(DIST, 'downloads'), { recursive: true, force: true });

  console.log(`✓ byggd till dist/ (updater=${payload.updater})`);
}

main().catch((err) => {
  console.error('Byggfel:', err.message);
  process.exitCode = 1;
});
