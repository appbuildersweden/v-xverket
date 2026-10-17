#!/usr/bin/env node
/**
 * Kontrollerar det publicerade uppdateringsmanifestet.
 *
 * Läser src-tauri/tauri.conf.json för version och endpoint, hämtar manifestet
 * och jämför version, signatur och nedladdningsfil med det lokala
 * uppdateringspaketet. Skriver aldrig ut några hemligheter.
 *
 * Körs efter publicering (t.ex. i releaseflödet) eller manuellt:
 *   node scripts/kontrollera-uppdatering.mjs
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const conf = JSON.parse(
  await readFile(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'),
);
const version = conf?.version;
const endpoint = conf?.plugins?.updater?.endpoints?.[0];
if (!version) fail('version saknas i src-tauri/tauri.conf.json');
if (!endpoint) fail('plugins.updater.endpoints saknas i tauri.conf.json');

console.log(`Manifest: ${endpoint}`);

// Cloudflare kan behöva några sekunder på sig efter en deploy.
let res = null;
for (let attempt = 0; attempt < 5; attempt += 1) {
  res = await fetch(endpoint, { headers: { 'Cache-Control': 'no-cache' } });
  if (res.ok) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!res?.ok) fail(`manifestet svarade HTTP ${res?.status ?? 'inget svar'}`);
const manifest = await res.json();

if (manifest.version !== version) {
  fail(`manifestet har version ${manifest.version}, appen byggs som ${version}`);
}
const platform = manifest.platforms?.['windows-x86_64'];
if (!platform?.url) fail('manifestet saknar windows-x86_64.url');
if (!platform?.signature) fail('manifestet saknar signatur');

const fileName = decodeURIComponent(new URL(platform.url).pathname.split('/').pop());
const localSig = (
  await readFile(join(ROOT, 'site', 'downloads', `${fileName}.sig`), 'utf8')
).trim();
if (localSig !== platform.signature.trim()) {
  fail('signaturen i manifestet matchar inte den lokala .sig-filen');
}

const localSize = (await stat(join(ROOT, 'site', 'downloads', fileName))).size;
const fileRes = await fetch(platform.url, {
  headers: { Range: 'bytes=0-0' },
  redirect: 'follow',
});
if (!fileRes.ok && fileRes.status !== 206) {
  fail(`uppdateringsfilen svarade HTTP ${fileRes.status} (${platform.url})`);
}
const remoteSize = Number(fileRes.headers.get('content-range')?.split('/')[1]);
if (Number.isFinite(remoteSize) && remoteSize !== localSize) {
  fail(`fel filstorlek: ${remoteSize} B publikt, ${localSize} B lokalt`);
}
const type = fileRes.headers.get('content-type') || '';
if (/text\/html/i.test(type)) {
  fail('uppdateringsadressen serverar HTML i stället för ett installationspaket');
}

console.log(`✓ version ${version}`);
console.log(`✓ signatur matchar ${fileName}.sig`);
console.log(`✓ filen är nedladdningsbar (${localSize} B)`);
