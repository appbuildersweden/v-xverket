#!/usr/bin/env node
/**
 * Kontrollerar att den publicerade sidan serverar den version som byggdes.
 *
 * En lyckad uppladdning till Cloudflare Pages är inte samma sak som att sidan
 * svarar med den nya versionen. Skriptet jämför det som faktiskt svarar med
 * src-tauri/tauri.conf.json och kontrollerar att skolappen ligger under
 * /skola/ i samma publicering.
 *
 *   node scripts/kontrollera-publikation.mjs [basadress]
 *
 * Basadressen kan också sättas med ELDA_UPDATER_BASE.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || process.env.ELDA_UPDATER_BASE || 'https://elda-6a9.pages.dev').replace(
  /\/$/,
  '',
);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Cloudflare kan behöva några sekunder efter en deploy. */
async function hamta(pathname) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch(`${BASE}${pathname}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch {
      // Nätet kan svara sent direkt efter en publicering – försök igen.
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return null;
}

const conf = JSON.parse(await readFile(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf?.version;
if (!version) fail('version saknas i src-tauri/tauri.conf.json');
const tag = `v${version}`;

const releasesRes = await hamta('/releases.json');
if (!releasesRes) fail(`${BASE}/releases.json svarar inte`);
const releases = await releasesRes.json();
const senaste = (releases.releases ?? []).find((r) => !r.draft && !r.prerelease);
if (!senaste) fail('releases.json saknar en stabil version');
if (senaste.tag !== tag) {
  fail(`sidan visar ${senaste.tag} som senaste stabila version, förväntade ${tag}`);
}

const manifestRes = await hamta('/update.json');
if (!manifestRes) fail(`${BASE}/update.json svarar inte (uppdateringar fungerar då inte)`);
const manifest = await manifestRes.json();
if (manifest.version !== version) {
  fail(`update.json har version ${manifest.version}, förväntade ${version}`);
}

const skolaRes = await hamta('/skola/');
if (!skolaRes) fail(`${BASE}/skola/ svarar inte`);
const html = await skolaRes.text();
if (!/id="root"/.test(html) || !/\/skola\/assets\//.test(html)) {
  fail('/skola/ serverar inte skolappen (index.html ser fel ut)');
}

console.log(`✓ ${tag} ligger ute på ${BASE}`);
console.log(`✓ releases.json, update.json och /skola/ stämmer`);
