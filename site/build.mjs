#!/usr/bin/env node
/**
 * Bygger Elda-hemsidan till ./dist med riktiga releaseuppgifter.
 *
 * - Hämta releaser från GitHub (GITHUB_TOKEN om repo:n är privat).
 * - Skriver releases.json som appen läser i webbläsaren (inga hemligheter
 *   någonsin i klienten).
 * - Kopierar statiska filer till dist/, som är det enda som publiceras.
 */
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, 'dist');
const REPO = process.env.ELDA_REPO || 'appbuildersweden/v-xverket';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;

/**
 * Automatiska uppdateringar räknas som aktiva först när Tauri Updater faktiskt
 * är konfigurerad i appen – då slipper sidan beskriva en funktion som inte finns.
 */
async function updaterEnabled() {
  try {
    const raw = await readFile(join(HERE, '..', 'src-tauri', 'tauri.conf.json'), 'utf8');
    const cfg = JSON.parse(raw);
    const updater = cfg?.plugins?.updater;
    return Boolean(updater && Array.isArray(updater.endpoints) && updater.endpoints.length);
  } catch {
    return false;
  }
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
  const downloadBase = process.env.ELDA_DOWNLOAD_BASE || '';

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
      assets: (r.assets || [])
        .filter((a) => !a.name.endsWith('.json')) // updater-metadata, inte nedladdning
        .map((a) => ({
          name: a.name,
          size: a.size,
          os: a.name.includes('x64') || a.name.includes('setup') ? 'Windows' : '',
          // ELDA_DOWNLOAD_BASE låter dig publicera filerna öppet till exempelvis
          // Cloudflare i stället för det privata repot.
          url: downloadBase
            ? `${downloadBase.replace(/\/$/, '')}/${encodeURIComponent(a.name)}`
            : a.browser_download_url,
        })),
    };
  });
}

/** Väljer ut installern till en release (exe före msi). */
function pickInstallerAsset(assets) {
  return (
    assets.find((a) => /setup|installer/i.test(a.name) && /\.exe$/i.test(a.name)) ||
    assets.find((a) => /\.exe$/i.test(a.name)) ||
    assets.find((a) => /\.msi$/i.test(a.name)) ||
    null
  );
}

/**
 * Skriver updater-manifest i det format som Tauri Updater förväntar sig.
 *
 * Signaturen är innehållet i .sig-filen som publiceras tillsammans med
 * installern. Saknas signaturen publiceras inget manifest alls – appen
 * avvisar ändå en uppdatering som inte går att verifiera mot den inbäddade
 * publika nyckeln.
 */
async function buildUpdateManifest(releases) {
  const stable = releases.find((r) => !r.prerelease && !r.draft);
  if (!stable) return null;

  const exe = pickInstallerAsset(stable.assets || []);
  const sig = (stable.assets || []).find(
    (a) => exe && a.name === `${exe.name}.sig`,
  );
  if (!exe?.url || !sig?.url) return null;

  const res = await fetch(sig.url);
  if (!res.ok) throw new Error(`signaturen kunde inte hämtas (${res.status})`);
  const signature = (await res.text()).trim();
  if (!signature) throw new Error("signaturen var tom");

  return {
    version: String(stable.tag || stable.name).replace(/^v/i, ''),
    notes: stable.summary || stable.name,
    pub_date: stable.publishedAt,
    platforms: {
      "windows-x86_64": { signature, url: exe.url },
    },
  };
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

  const payload = {
    repo: `https://github.com/${REPO}`,
    source: `https://github.com/${REPO}/releases`,
    fetchedAt,
    updater: await updaterEnabled(),
    releases: releases.filter((r) => !r.draft),
  };
  await writeFile(join(DIST, 'releases.json'), JSON.stringify(payload, null, 2) + '\n');

  try {
    const update = await buildUpdateManifest(payload.releases);
    if (update) {
      await writeFile(join(DIST, 'update.json'), JSON.stringify(update, null, 2) + '\n');
      console.log(`✓ update.json skriven för v${update.version}`);
    } else {
      console.warn('! ingen signerad release hittades – update.json hoppades över');
    }
  } catch (err) {
    console.warn(`! kunde inte skriva update.json: ${err.message}`);
  }

  for (const file of ['index.html', 'styles.css', 'app.js']) {
    await copyFile(join(HERE, file), join(DIST, file));
  }
  await cp(join(HERE, 'assets'), join(DIST, 'assets'), { recursive: true });

  console.log(`✓ byggd till dist/ (updater=${payload.updater})`);
}

main().catch((err) => {
  console.error('Byggfel:', err.message);
  process.exitCode = 1;
});
