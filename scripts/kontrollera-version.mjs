#!/usr/bin/env node
/**
 * Kontrollerar att appens version är densamma överallt.
 *
 * Versionen står i tre filer och används dessutom som taggnamn. Glider de isär
 * byggs en app vars filer heter något annat än releasen, och uppdaterings-
 * manifestet pekar på fel paket. Kontrollen körs i releaseflödet före bygget
 * och kan köras manuellt:
 *
 *   node scripts/kontrollera-version.mjs
 *
 * Vid en taggkörning (GITHUB_REF_NAME=v0.2.14) måste taggen också stämma.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function readJson(relative) {
  return JSON.parse(await readFile(join(ROOT, relative), 'utf8'));
}

/** Läser versionen ur [package]-sektionen i Cargo.toml (inte beroendenas). */
function cargoVersion(raw) {
  const section = raw.split(/^\[/m).find((part) => part.startsWith('package]'));
  const version = section && /^\s*version\s*=\s*"([^"]+)"/m.exec(section);
  return version?.[1] ?? '';
}

const pkg = (await readJson('package.json')).version;
const tauri = (await readJson('src-tauri/tauri.conf.json')).version;
const cargo = cargoVersion(await readFile(join(ROOT, 'src-tauri', 'Cargo.toml'), 'utf8'));

const rows = [
  ['package.json', pkg],
  ['src-tauri/tauri.conf.json', tauri],
  ['src-tauri/Cargo.toml', cargo],
];

for (const [file, version] of rows) {
  if (!version) fail(`version saknas i ${file}`);
}

const versions = new Set(rows.map(([, version]) => version));
if (versions.size !== 1) {
  for (const [file, version] of rows) console.error(`  ${file}: ${version}`);
  fail('filerna anger olika versioner – bumpa alla tre i samma commit');
}

const version = rows[0][1];
console.log(`✓ version ${version} i package.json, tauri.conf.json och Cargo.toml`);

// En taggkörning publicerar det som taggen pekar på. Stämmer inte siffrorna
// blir releasen märkt med en version som appen inte har. En manuell körning
// från en gren (workflow_dispatch) har grennamnet som ref och ska inte
// jämföras med versionen.
const ref = process.env.GITHUB_REF_NAME || '';
const isTag = process.env.GITHUB_REF_TYPE === 'tag';
if (isTag) {
  if (!/^v\d+\.\d+\.\d+$/.test(ref)) {
    fail(`taggen "${ref}" ser inte ut som v<major>.<minor>.<patch>`);
  }
  if (ref !== `v${version}`) {
    fail(`taggen ${ref} matchar inte versionen ${version}`);
  }
  console.log(`✓ taggen ${ref} matchar versionen`);
}
