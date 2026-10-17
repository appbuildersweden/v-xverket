#!/usr/bin/env node
/**
 * Skarpt integrationstest mot den publicerade Elda-sajten och Supabase.
 *
 * Kör hela kedjan som en riktig besökare: registrering via boten, automatiskt
 * godkännande, inloggning med samma uppgifter, skyddad nedladdning, kontroll av
 * dubbletter, kontoborttagning med spårningskod och lärarflödet med
 * funktionsval. Inga hemligheter behövs — bara den publika anon-nyckeln som
 * redan ligger i sajtens config.json.
 *
 *   node scripts/e2e-registrering.mjs [https://elda-6a9.pages.dev]
 *
 * Testkontona tas bort i slutet. Skriptet skriver ut varje steg och den faktiska
 * svarstiden, så en körning är både test och mätning.
 */

import { randomUUID } from 'node:crypto';

const SITE = (process.argv[2] || 'https://elda-6a9.pages.dev').replace(/\/$/, '');

let failures = 0;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function loadConfig() {
  const res = await fetch(`${SITE}/config.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`config.json svarade ${res.status}`);
  const config = await res.json();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('config.json saknar supabaseUrl/supabaseAnonKey');
  }
  return config;
}

function makeClient({ supabaseUrl, supabaseAnonKey }) {
  const base = supabaseUrl.replace(/\/$/, '');

  async function call(fn, body, token = supabaseAnonKey, timeoutMs = 30000) {
    const started = performance.now();
    const res = await fetch(`${base}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Math.round(performance.now() - started);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data, ms };
  }

  return {
    questions: (kind) => call('register', { action: 'questions', kind }),
    start: (kind, idempotencyKey) => call('register', { action: 'start', kind, idempotencyKey }),
    answer: (trackingCode, field, value) =>
      call('register', { action: 'answer', trackingCode, field, value }),
    answers: (trackingCode, answers) =>
      call('register', { action: 'answers', trackingCode, answers }),
    submit: (trackingCode, password) =>
      call('register', { action: 'submit', trackingCode, password }),
    status: (trackingCode) => call('register', { action: 'status', trackingCode }),
    login: (username, password) => call('auth-login', { username, password }),
    download: (token, format = 'exe') => call('download', { format }, token),
    deleteAccount: (trackingCode, password) =>
      call('account', { action: 'delete', trackingCode, password, confirm: true }),
    updateFeatures: (token, features) =>
      call('account', { action: 'update-features', features }, token),
  };
}

/** Svarar på alla frågor i tur och ordning och mäter varje svar. */
async function runBot(client, kind, answers, { measure = false } = {}) {
  const start = await client.start(kind, randomUUID());
  if (!check(`${kind}: ansökan startar`, start.status === 200 && start.data?.trackingCode)) {
    console.log('  svar:', start.status, start.data);
    return null;
  }

  const code = start.data.trackingCode;
  const timings = [];
  let state = start.data;

  for (const field of start.data.fields ?? []) {
    if (field.when) {
      const applies = Object.entries(field.when).every(
        ([key, value]) => answers[key] === value,
      );
      if (!applies) continue;
    }
    const value = answers[field.id];
    if (value === undefined) continue;
    const res = await client.answer(code, field.id, value);
    timings.push(res.ms);
    if (!check(`${kind}: svar på ${field.id}`, res.status === 200 && res.data?.ok, `${res.ms} ms`)) {
      console.log('  svar:', res.status, res.data);
      return null;
    }
    state = res.data;
  }

  if (measure) {
    const sorted = [...timings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    console.log(`  svarstid: median ${median} ms, max ${Math.max(...timings)} ms (${timings.length} svar)`);
  }

  check(`${kind}: alla frågor besvarade`, state?.complete === true);
  check(`${kind}: sammanfattning finns före inskick`, Boolean(state?.summary));
  return { code, state, timings };
}

async function getDownload(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, size: buffer.length, header: buffer.subarray(0, 2).toString('latin1') };
}

async function elevFlow(client) {
  console.log('\n— Test A: elevkonto, nedladdning och inloggning —');
  const password = `Elev${randomUUID().slice(0, 8)}!`;
  const run = await runBot(
    client,
    'privat_elev',
    {
      firstName: 'Maja',
      lastName: 'Lindqvist',
      email: 'maja.lindqvist@example.com',
      goal: 'Träna inför prov i matematik och hålla koll på läxor.',
    },
    { measure: true },
  );
  if (!run) return null;

  const submit = await client.submit(run.code, password);
  check('elev: kontot skapas och godkänns automatiskt', submit.data?.status === 'skapad',
    `${submit.ms} ms, status ${submit.data?.status}`);
  check('elev: nedladdning tillåts direkt', submit.data?.canDownload === true);
  if (!submit.data?.username) {
    console.log('  svar:', submit.data);
    return null;
  }
  console.log(`  användarnamn: ${submit.data.username}, roll: ${submit.data.role}`);

  const login = await client.login(submit.data.username, password);
  check('elev: inloggning med samma uppgifter', login.status === 200 && Boolean(login.data?.access_token),
    `${login.ms} ms`);
  const token = login.data?.access_token;
  check('elev: rätt roll i sessionen', login.data?.user?.role === 'elev');

  const dl = await client.download(token);
  check('elev: skyddad nedladdningslänk utfärdas', dl.status === 200 && Boolean(dl.data?.url),
    `${dl.ms} ms`);
  if (dl.data?.url) {
    const file = await getDownload(dl.data.url);
    check('elev: filen går att hämta via den signerade länken',
      file.status === 200 && file.size > 1_000_000 && file.header === 'MZ',
      `${file.size} byte`);
  }

  // Direktlänken får inte ge en installationsfil.
  for (const path of [
    '/downloads/Elda_0.2.1_x64-setup.exe',
    '/downloads/Elda_0.2.1_x64_en-US.msi',
  ]) {
    const res = await fetch(`${SITE}${path}`, { redirect: 'manual' });
    const body = Buffer.from(await res.arrayBuffer()).subarray(0, 2).toString('latin1');
    check(`direktlänk ${path} ger ingen fil`, body !== 'MZ',
      `HTTP ${res.status}`);
  }

  const dup = await client.submit(run.code, password);
  check('elev: dubbel inskickning skapar inget nytt konto',
    dup.data?.alreadyCreated === true || dup.data?.status === 'skapad');
  check('elev: samma användarnamn efter dubbletten',
    dup.data?.username === submit.data.username);

  const status = await client.status(run.code);
  check('elev: status visar godkänt konto', status.data?.status === 'skapad');
  check('elev: status säger att nedladdning är öppen', status.data?.canDownload === true);

  return { code: run.code, password, username: submit.data.username, token };
}

async function larareFlow(client, roleLabel, expectedRole) {
  console.log(`\n— Test B: ${roleLabel.toLowerCase()} —`);
  const password = `Larare${randomUUID().slice(0, 8)}!`;
  const features = ['Klass och elevöversikt', 'AI-stöd i undervisningen'];

  const run = await runBot(client, 'larare', {
    firstName: 'Karin',
    lastName: 'Lindqvist',
    staffRole: roleLabel,
    email: 'karin.sjoberg@example.com',
    organisation: 'Eldaskolan',
    subject: 'Matematik',
    intendedUse: 'Jag vill samla klassen, dela material och följa upp uppgifter varje vecka.',
    wantsClass: false,
    classSize: 24,
    features,
  });
  if (!run) return null;

  const submit = await client.submit(run.code, password);
  check(`${roleLabel}: kontot skapas men granskas`, submit.data?.status === 'vantar',
    `${submit.ms} ms`);
  check(`${roleLabel}: ingen nedladdning före godkännande`, submit.data?.canDownload === false);
  check(`${roleLabel}: granskningsorsak anges`,
    submit.data?.reviewReason === 'roll-kraver-granskning', String(submit.data?.reviewReason));

  const login = await client.login(submit.data.username, password);
  check(`${roleLabel}: kan logga in direkt`, login.status === 200);
  check(`${roleLabel}: rätt roll`, login.data?.user?.role === expectedRole,
    String(login.data?.user?.role));
  check(`${roleLabel}: kontot är begränsat`, login.data?.user?.limited === true);
  check(`${roleLabel}: funktionsvalen sparades`,
    JSON.stringify(login.data?.user?.features) === JSON.stringify(features),
    JSON.stringify(login.data?.user?.features));

  const token = login.data?.access_token;
  const dl = await client.download(token);
  check(`${roleLabel}: nedladdning nekas med tydligt besked`,
    dl.status === 403 && dl.data?.pendingReview === true, dl.data?.error ?? '');

  const changed = ['Undervisningsmaterial', 'hacka-admin'];
  const update = await client.updateFeatures(token, changed);
  check(`${roleLabel}: funktionsval kan ändras senare`, update.status === 200,
    JSON.stringify(update.data?.features));
  check(`${roleLabel}: okända värden filtreras bort`,
    Array.isArray(update.data?.features) && !update.data.features.includes('hacka-admin'));

  const after = await client.login(submit.data.username, password);
  check(`${roleLabel}: ändringen syns vid nästa inloggning`,
    JSON.stringify(after.data?.user?.features) === JSON.stringify(['Undervisningsmaterial']));

  return { code: run.code, password, username: submit.data.username, token };
}

async function securityFlow(client, elev) {
  console.log('\n— Test C: säkerhet —');
  if (!elev) {
    check('säkerhet: elevkonto saknas för testet', false);
    return;
  }

  const wrong = await client.deleteAccount(elev.code, 'HeltFelLosenord1');
  check('fel lösenord nekar borttagning', wrong.status === 401, wrong.data?.error ?? '');

  const stillThere = await client.login(elev.username, elev.password);
  check('kontot finns kvar efter nekat försök', stillThere.status === 200);

  const unknownCode = await client.deleteAccount('finns-inte-123456', elev.password);
  check('okänd spårningskod avvisas', unknownCode.status === 404);

  const asStudent = await client.updateFeatures(elev.token, ['AI-stöd i undervisningen']);
  check('elev kan inte ge sig själv lärarbehörighet', asStudent.status === 403,
    asStudent.data?.error ?? '');

  const injected = await client.start('skolelev', randomUUID());
  check('roll kan inte skickas in via start', injected.data?.kind === 'skolelev' &&
    !('role' in (injected.data ?? {})));
}

async function cleanup(client, elev) {
  console.log('\n— Test: kontoborttagning med spårningskod —');
  if (!elev) return;
  const first = await client.deleteAccount(elev.code, elev.password);
  check('borttagning med rätt kod och lösenord', first.status === 200 && first.data?.deleted === true,
    JSON.stringify(first.data));

  const again = await client.deleteAccount(elev.code, elev.password);
  check('borttagningen är idempotent', again.status === 200 && again.data?.alreadyDeleted === true);

  const login = await client.login(elev.username, elev.password);
  check('borttaget konto kan inte logga in', login.status === 401, login.data?.error ?? '');

  const dl = await client.download(elev.token);
  check('borttaget konto får ingen nedladdningslänk', dl.status === 401 || dl.status === 403,
    String(dl.status));
}

async function main() {
  const config = await loadConfig();
  const client = makeClient(config);
  console.log(`Testar ${SITE} mot ${config.supabaseUrl}`);

  const elev = await elevFlow(client);
  await securityFlow(client, elev);
  const larare = await larareFlow(client, 'Lärare', 'lärare');
  const special = await larareFlow(client, 'Speciallärare', 'speciallärare');

  await cleanup(client, elev);
  // Lärarkontona tas också bort, så testkörningen inte lämnar konton efter sig.
  for (const staff of [larare, special]) {
    if (!staff) continue;
    const res = await client.deleteAccount(staff.code, staff.password);
    check(`städning: ${staff.username} togs bort`, res.status === 200, JSON.stringify(res.data));
  }

  console.log(`\n${failures === 0 ? 'Alla kontroller gick igenom.' : `${failures} kontroll(er) misslyckades.`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('Testet kraschade:', err);
  process.exitCode = 1;
});
