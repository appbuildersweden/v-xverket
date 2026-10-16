#!/usr/bin/env node
/**
 * Testar användarnamnsregeln mot den RIKTIGA källkoden i
 * supabase/functions/admin-users/index.ts (funktionerna läses ur filen och körs
 * här), så att testet inte kan glida isär från implementationen.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync('supabase/functions/admin-users/index.ts', 'utf8');

function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error(`kunde inte hitta ${startMarker}`);
  return src.slice(s, e);
}

// Extrahera de två rena funktionerna ur källtexten. Endast typannoteringarna
// (TypeScript) tas bort — logiken som testas är exakt filens.
const base = slice('const SV: Record<string, string> = {', 'Deno.serve')
  .replace('const SV: Record<string, string>', 'const SV')
  .replace('function letters(value: unknown): string', 'function letters(value)')
  .replace(
    'function usernameBase(first: unknown, last: unknown): string',
    'function usernameBase(first, last)',
  );
const factory = new Function(`${base}\nreturn { letters, usernameBase };`);
const { usernameBase } = factory();

// Regeln är: e + de TRE fÖrsta bokstäverna i fÖrnamnet + de TVÅ fÖrsta i
// efternamnet. Raden för Anna Andersson i uppdragsbeskrivningen ("eannaad01")
// följer inte den regeln ("Andersson" ger "an"). Här testas regeltexten.
const cases = [
  [['Jens', 'Turesson'], 'ejentu'],
  [['Anna', 'Andersson'], 'eannan'],
  [['Lisa', 'Karlsson'], 'eliska'],
  [['Erik', 'Nilsson'], 'eerini'],
  // svenska tecken, mellanslag och bindestreck
  [['Örjan', 'Åberg'], 'eorjab'],
  [['Sven-Göran', 'Ärlig'], 'esvear'],
  [['Åsa', 'Öberg'], 'easaob'],
  // korta namn: aldrig tomt eller ogiltigt
  [['Ali', 'Bo'], 'ealibo'],
  [['A', 'B'], 'eaxxbx'],
  [['', ''], 'eelexx'],
];

let failed = 0;
for (const [[first, last], want] of cases) {
  const got = usernameBase(first, last);
  const withNumber = `${got}01`;
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? '✓' : '✗'} ${first} ${last} -> ${withNumber}${ok ? '' : `  (förväntade ${want}`.concat('01)')}`,
  );
}

// Alla genererade namn måste klara användarnamnsregeln i klient, server och DB.
const RE = /^[a-z0-9._-]{3,32}$/;
const names = [...new Set(cases.flatMap(([[f, l]]) => [1, 2, 3, 9, 10].map((n) => `${usernameBase(f, l)}${String(n).padStart(2, '0')}`)))];
const bad = names.filter((n) => !RE.test(n));
if (bad.length) {
  failed += bad.length;
  console.log('✗ ogiltiga namn:', bad.join(', '));
} else {
  console.log(`✓ alla ${names.length} genererade namn matchar ^[a-z0-9._-]{3,32}$`);
}

console.log(failed === 0 ? '\nAlla användarnamnstester gick igenom.' : `\n${failed} test misslyckades.`);
process.exitCode = failed === 0 ? 0 : 1;
