/**
 * Tester för adressen till Elda-skola (site/skola-url.mjs).
 *
 * Det som prövas är det som annars bara märks i produktion: att en lokal
 * testadress eller en osäker http-adress aldrig kan publiceras som länk till
 * skolplattformen, och att en giltig adress normaliseras så att den fungerar i
 * både meny och knapp.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteConfig, normalizeSkolaUrl } from '../skola-url.mjs';

test('giltig https-adress används och får inget avslutande snedstreck', () => {
  assert.equal(normalizeSkolaUrl('https://elda-skola.pages.dev/'), 'https://elda-skola.pages.dev');
  assert.equal(
    normalizeSkolaUrl('  https://skola.elda.se/inloggning  '),
    'https://skola.elda.se/inloggning',
  );
});

test('tom adress ger ingen länk', () => {
  assert.equal(normalizeSkolaUrl(''), '');
  assert.equal(normalizeSkolaUrl(undefined), '');
  assert.equal(normalizeSkolaUrl('   '), '');
});

test('http avvisas i skarpt bygge – sessionen kräver https', () => {
  assert.equal(normalizeSkolaUrl('http://skola.elda.se'), '');
});

test('lokal testadress får bara användas när bygget är lokalt', () => {
  assert.equal(normalizeSkolaUrl('http://127.0.0.1:8789'), '');
  assert.equal(
    normalizeSkolaUrl('http://127.0.0.1:8789/', { allowLocal: true }),
    'http://127.0.0.1:8789',
  );
  assert.equal(
    normalizeSkolaUrl('http://localhost:8789', { allowLocal: true }),
    'http://localhost:8789',
  );
});

test('adresser med inloggning, fråga eller ankare avvisas', () => {
  assert.equal(normalizeSkolaUrl('https://user:pass@skola.elda.se'), '');
  assert.equal(normalizeSkolaUrl('https://skola.elda.se/?redirect=annat'), '');
  assert.equal(normalizeSkolaUrl('https://skola.elda.se/#topp'), '');
});

test('andra protokoll och skräp avvisas', () => {
  assert.equal(normalizeSkolaUrl('javascript:alert(1)'), '');
  assert.equal(normalizeSkolaUrl('/skola'), '');
  assert.equal(normalizeSkolaUrl('skola.elda.se'), '');
});

test('konfigurationen tar bara med adressen när den är godkänd', () => {
  const utan = buildSiteConfig({ skolaUrl: 'http://skola.elda.se' });
  assert.equal('skolaUrl' in utan, false);

  const med = buildSiteConfig({ skolaUrl: 'https://elda-skola.pages.dev/' });
  assert.deepEqual(med, { skolaUrl: 'https://elda-skola.pages.dev' });
});

test('registreringens serveradress kräver både url och nyckel', () => {
  assert.deepEqual(buildSiteConfig({ supabaseUrl: 'https://x.supabase.co' }), {});
  assert.deepEqual(
    buildSiteConfig({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'publik' }),
    { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'publik' },
  );
});
