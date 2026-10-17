#!/usr/bin/env node
/**
 * Kopierar den nya appens bygge (src-new/dist) till rotens dist.
 *
 * Tauri pekar på `../dist`, och releaseflödet kontrollerar att
 * Supabase-adressen hamnat i `dist/assets`. Genom att bygga i src-new och
 * kopiera hit gäller samma sökvägar som förut — oavsett vilken app som
 * paketeras.
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SOURCE = join(ROOT, 'src-new', 'dist');
const TARGET = join(ROOT, 'dist');

await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });
await cp(SOURCE, TARGET, { recursive: true });
console.log('✓ dist/ byggd från src-new/dist');
