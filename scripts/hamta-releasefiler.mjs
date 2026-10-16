#!/usr/bin/env node
/**
 * Hämtar de publicerade releasefilerna från GitHub till site/downloads, så att
 * webbplatsen serverar exakt samma filer som GitHub-releasen. Token läses från
 * git:s credential-helper och skrivs aldrig ut.
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { join } from 'node:path';

const REPO = 'appbuildersweden/v-xverket';
const TAG = process.argv[2] || 'v0.2.0';
const OUT = join(process.cwd(), 'site', 'downloads');

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      timeout: 20000,
    });
    return (/^password=(.+)$/m.exec(out)?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

const t = token();
if (!t) {
  console.error('Ingen GitHub-token tillgänglig.');
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${t}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'elda-fetch',
};

const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, { headers });
if (!res.ok) {
  console.error(`Kunde inte läsa releasen ${TAG} (HTTP ${res.status}).`);
  process.exit(1);
}
const release = await res.json();
const wanted = (release.assets ?? []).filter(
  (a) => /\.(exe|msi)$/i.test(a.name) || /\.(exe|msi)\.sig$/i.test(a.name),
);
if (wanted.length === 0) {
  console.error('Releasen innehåller inga installerfiler.');
  process.exit(1);
}

// Töm mappen så att endast den här versionens filer publiceras.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const a of wanted) {
  const dl = await fetch(a.url, {
    headers: { ...headers, Accept: 'application/octet-stream' },
  });
  if (!dl.ok) {
    console.error(`Kunde inte hämta ${a.name} (HTTP ${dl.status}).`);
    process.exit(1);
  }
  const file = createWriteStream(join(OUT, a.name));
  await finished(Readable.fromWeb(dl.body).pipe(file));
  console.log(`✓ ${a.name} (${a.size} B)`);
}
