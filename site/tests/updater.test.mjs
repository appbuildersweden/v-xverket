/**
 * Tester för uppdateringsmanifestet (site/update-manifest.mjs).
 *
 * Det som prövas är det som annars bara märks i en installerad app: att
 * manifestet pekar på rätt version och fil, att signaturen följer med och att
 * ett osignerat eller felaktigt paket aldrig publiceras.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPDATER_BASE_FALLBACK,
  buildUpdateManifest,
  findUpdaterArtifact,
  normalizeBaseUrl,
} from '../update-manifest.mjs';

const fineFiles = [
  'Elda_0.2.2_x64-setup.exe',
  'Elda_0.2.2_x64-setup.exe.sig',
  'Elda_0.2.2_x64_en-US.msi',
  'Elda_0.2.1_x64-setup.exe',
  'Elda_0.2.1_x64-setup.exe.sig',
];

test('väljer rätt version och kräver signatur', () => {
  const artifact = findUpdaterArtifact(fineFiles, '0.2.2');
  assert.deepEqual(artifact, {
    file: 'Elda_0.2.2_x64-setup.exe',
    signatureFile: 'Elda_0.2.2_x64-setup.exe.sig',
    hasSignature: true,
  });
});

test('en äldre version publiceras inte av misstag', () => {
  const artifact = findUpdaterArtifact(fineFiles, '0.3.0');
  assert.equal(artifact, null);
});

test('saknad .sig upptäcks innan publicering', () => {
  const artifact = findUpdaterArtifact(
    ['Elda_0.2.2_x64-setup.exe'],
    '0.2.2',
  );
  assert.equal(artifact.hasSignature, false);
});

test('manifestet pekar på signerad fil under /updates', () => {
  const manifest = buildUpdateManifest({
    version: '0.2.2',
    notes: 'Automatisk uppdatering',
    signature: 'dHJ1c3RlZCBjb21tZW50OiBzaWduYXR1cmUK',
    fileName: 'Elda_0.2.2_x64-setup.exe',
    baseUrl: 'https://elda-6a9.pages.dev/',
    pubDate: '2026-10-17T12:00:00Z',
  });

  assert.equal(manifest.version, '0.2.2');
  assert.equal(manifest.notes, 'Automatisk uppdatering');
  assert.equal(manifest.pub_date, '2026-10-17T12:00:00.000Z');
  assert.equal(
    manifest.platforms['windows-x86_64'].url,
    'https://elda-6a9.pages.dev/updates/Elda_0.2.2_x64-setup.exe',
  );
  assert.equal(
    manifest.platforms['windows-x86_64'].signature,
    'dHJ1c3RlZCBjb21tZW50OiBzaWduYXR1cmUK',
  );
});

test('utan basadress används den adress appen redan frågar efter', () => {
  assert.equal(normalizeBaseUrl(''), UPDATER_BASE_FALLBACK);
  assert.equal(
    normalizeBaseUrl('https://elda-6a9.pages.dev///'),
    'https://elda-6a9.pages.dev',
  );
});

test('osäker eller ogiltig adress avvisas', () => {
  assert.throws(() => normalizeBaseUrl('http://elda.example'), /https/);
  assert.throws(() => normalizeBaseUrl('inte en adress'), /Ogiltig/);
});

test('osignerat paket kan inte bli ett manifest', () => {
  assert.throws(
    () =>
      buildUpdateManifest({
        version: '0.2.2',
        signature: '   ',
        fileName: 'Elda_0.2.2_x64-setup.exe',
        baseUrl: 'https://elda-6a9.pages.dev',
      }),
    /Signatur saknas/,
  );
});

test('filnamn med sökväg avvisas', () => {
  assert.throws(
    () =>
      buildUpdateManifest({
        version: '0.2.2',
        signature: 'abc',
        fileName: '../Elda_0.2.2_x64-setup.exe',
        baseUrl: 'https://elda-6a9.pages.dev',
      }),
    /filnamn/,
  );
});
