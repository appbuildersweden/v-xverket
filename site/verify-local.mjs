#!/usr/bin/env node
/**
 * Elda – compact local verifier for the registration bot.
 *
 * Starts a small HTTP server mimicking the Supabase Functions contract for
 * `register`, then exercises the client against it through a real fetch path.
 */

import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(HERE, 'test-run');
const TEST_CONFIG = join(HERE, 'config-test.json');

const BASE_PORT = 7780;
const BASE_HOST = '127.0.0.1';

function fieldsFor(kind) {
  return {
    skolelev: [
      { id: 'firstName', label: 'Förnamn', type: 'text', required: true, question: 'Vad heter du i förnamn?' },
      { id: 'lastName', label: 'Efternamn', type: 'text', required: true, question: 'Och i efternamn?' },
      { id: 'email', label: 'E-post', type: 'email', required: false, question: 'Vill du lämna en e-postadress?' },
      { id: 'schoolName', label: 'Skola', type: 'text', required: false, question: 'Vilken skola går du på?' },
      { id: 'classCode', label: 'Klasskod', type: 'text', required: false, question: 'Har du fått en klasskod av din lärare?' },
    ],
    privat_elev: [
      { id: 'firstName', label: 'Förnamn', type: 'text', required: true, question: 'Vad heter du i förnamn?' },
      { id: 'lastName', label: 'Efternamn', type: 'text', required: true, question: 'Och i efternamn?' },
      { id: 'email', label: 'E-post', type: 'email', required: false, question: 'Vill du lämna en e-postadress?' },
      { id: 'goal', label: 'Mål med studierna', type: 'longtext', required: false, question: 'Vad vill du främst använda Elda till?' },
    ],
    larare: [
      { id: 'firstName', label: 'Förnamn', type: 'text', required: true, question: 'Vad heter du i förnamn?' },
      { id: 'lastName', label: 'Efternamn', type: 'text', required: true, question: 'Och i efternamn?' },
      { id: 'email', label: 'E-post', type: 'email', required: true, question: 'Vilken e-postadress kan skolan och Elda nå dig på?' },
      { id: 'organisation', label: 'Skola eller organisation', type: 'text', required: true, question: 'Vilken skola eller utbildningsorganisation arbetar du på?' },
      { id: 'subject', label: 'Ämne eller roll', type: 'text', required: false, question: 'Vilket ämne undervisar du i, eller vilken roll har du?' },
      { id: 'intendedUse', label: 'Användning', type: 'longtext', required: true, question: 'Hur tänker du använda Elda i undervisningen?' },
      { id: 'wantsClass', label: 'Skapa klass', type: 'boolean', required: false, question: 'Vill du skapa en klass direkt?' },
      { id: 'className', label: 'Klassens namn', type: 'text', required: false, question: 'Vad ska klassen heta?', when: { wantsClass: true } },
      { id: 'classSize', label: 'Ungefärlig klassstorlek', type: 'number', required: false, question: 'Ungefär hur många elever har du?' },
      { id: 'features', label: 'Funktioner', type: 'choice', required: false, question: 'Vilka delar av Elda behöver du först?', options: ['Klass och klasschatt', 'Uppgifter och återkoppling', 'Undervisningsmaterial', 'Provträning och flashcards', 'Planering och att göra', 'Belöningar och nivåer', 'AI-stöd i undervisningen'] },
    ],
  }[kind] ?? null;
}

function clean(value, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function answerValueFor(field, raw) {
  const type = field?.type;
  const text = typeof raw === 'string' ? raw.trim() : raw;

  if (type === 'number') {
    if (text === '' || text === null || text === undefined) return { ok: true, value: null };
    const n = Number(text);
    if (!Number.isFinite(n)) return { ok: false, error: 'Ange bara en siffra.' };
    return { ok: true, value: n };
  }

  if (type === 'boolean') {
    if (text === true || text === 'true' || text === 'ja') return { ok: true, value: true };
    if (text === false || text === 'false' || text === 'nej') return { ok: true, value: false };
    return { ok: false, error: 'Välj ja eller nej.' };
  }

  if (type === 'choice') {
    const list = Array.isArray(text) ? text : text === '' ? [] : [text];
    if (list.length === 0) return { ok: false, error: 'Välj minst ett alternativ.' };
    return { ok: true, value: list };
  }

  return { ok: true, value: typeof text === 'string' ? text : String(text ?? '') };
}

function validateField(field, raw) {
  const empty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '') || (Array.isArray(raw) && raw.length === 0);

  if (empty) {
    return field.required ? `${field.label} behövs för att gå vidare.` : null;
  }

  switch (field.type) {
    case 'text':
    case 'longtext': {
      const value = clean(raw, field.type === 'longtext' ? 1000 : 120);
      if (field.id === 'firstName' || field.id === 'lastName') {
        if (!/^\p{L}[\p{L}\s'.-]{0,59}$/u.test(value)) return 'Ange namnet med bokstäver, inga siffror eller symboler.';
      }
      if (field.id === 'classCode' && !/^[A-HJ-NP-Z2-9]{6}$/.test(value.toUpperCase())) {
        return 'Klasskoden är sex tecken, till exempel ABC234.';
      }
      if (field.id === 'className' && value.length < 2) {
        return 'Ge klassen ett namn (minst 2 tecken).';
      }
      return null;
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(raw)) ? null : 'Kontrollera e-postadressen, den ser inte komplett ut.';
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 'Ange bara en siffra.';
      if (field.id === 'classSize' && (n < 1 || n > 60)) return 'Ange ett antal mellan 1 och 60.';
      return null;
    }
    case 'boolean':
      return typeof raw === 'boolean' ? null : 'Svara ja eller nej.';
    case 'choice': {
      const list = Array.isArray(raw) ? raw : [raw];
      const allowed = new Set(field.options ?? []);
      return list.every((v) => allowed.has(String(v))) ? null : 'Välj bland alternativen i listan.';
    }
    default:
      return null;
  }
}

function buildSummary(kind, a) {    const firstName = String(a?.firstName ?? ''); const lastName = String(a?.lastName ?? ''); const name = `${clean(firstName)} ${clean(lastName)}`.trim();
  if (kind === 'larare') {
    const org = clean(a.organisation);
    const wantsClass = a.wantsClass === true ? ', vill skapa klass' : '';
    return `${name} — lärare på ${org}${wantsClass}.`;
  }
  if (kind === 'skolelev') {
    const school = a.schoolName ? ` på ${clean(a.schoolName)}` : '';
    const code = a.classCode ? ' och har angett klasskod' : '';
    return `${name} — skolelev${school}${code}.`;
  }
  const goal = clean(a.goal, 200);
  return `${name} — privat elev${goal ? `: ${goal}` : '.'}`;
}

function publicApplication(row, kind) {
  const answers = (row.payload?.answers ?? {}) || {};
  return {
    trackingCode: row.tracking_code,
    kind,
    status: row.status,
    answers,
    summary: row.summary ?? buildSummary(kind, answers),
    username: row.created_username ?? null,
    classCode: row.created_class_code ?? null,
    needsReview: row.status === 'vantar',
  };
}

let nextId = 1;
const applications = new Map();
const messages = new Map();

function newTrackingCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function statusMessage(status) {
  return (
    status === 'skapad'
      ? 'Kontot är skapat. Logga in med ditt användarnamn och lösenordet du valde.'
      : status === 'vantar'
        ? 'Ansökan väntar på granskning. Du får svar av skolan.'
        : status === 'nekad'
          ? 'Ansökan är avslutad. Kontakta skolan om du undrar varför.'
          : status === 'misslyckad'
            ? 'Något gick fel när kontot skulle skapas. Försök igen.'
            : 'Ansökan är påbörjad men inte inskickad.'
  );
}

async function responder(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end('{}');
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Metod tillåts inte.' }));
    return;
  }

  let body;
  try {
    body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(JSON.parse(data)));
      req.on('error', reject);
    });
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Ogiltig förfrågan.' }));
    return;
  }

  const action = String(body.action ?? '');
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.headers['cf-connecting-ip'] || 'okand';

  function ok(payload, status = 200) {
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  }

  if (action === 'questions') {
    const kind = String(body.kind ?? '');
    const fields = fieldsFor(kind);
    if (!fields) {
      ok({ error: 'Ogiltig kontotyp.' }, 400);
      return;
    }
    ok({ kind, fields: fields.map(({ id, label, type, required, question, hint, options, when }) => ({ id, label, type, required, question, hint: hint ?? null, options: options ?? null, when: when ?? null })), termsVersion: '2026-10-16', ai: false });
    return;
  }

  if (action === 'start') {
    const kind = String(body.kind ?? '');
    const idempotencyKey = clean(body.idempotencyKey, 80);
    if (!fieldsFor(kind)) {
      ok({ error: 'Välj om du registrerar dig som skolelev, privat elev eller lärare.' }, 400);
      return;
    }    if (idempotencyKey.length < 8) {
      ok({ error: 'Ogiltig förfrågan.' }, 400);
      return;
    }

    if (applications.has(idempotencyKey)) {
      const row = applications.get(idempotencyKey);
      if (!row) { ok({ error: 'Okänd idempotensnyckel.' }, 400); return; }
      const f2 = fieldsFor(row.kind); ok({ ...publicApplication(row, row.kind), fields: f2 ? f2.map(({ id, label, type, required, question, hint, options, when }) => ({ id, label, type, required, question, hint: hint ?? null, options: options ?? null, when: when ?? null })) : [], resumed: true, ai: false });
      return;
    }

    const trackingCode = newTrackingCode();
    const row = {
      id: String(nextId++),
      tracking_code: trackingCode,
      idempotency_key: idempotencyKey,
      kind,
      status: 'utkast',
      payload: { answers: {} },
      summary: '',
      risk_flags: [],
      updated_at: new Date().toISOString(),
    };
    applications.set(idempotencyKey, row);
    messages.set(row.id, []);

    const first = fieldsFor(kind)[0]?.question ?? '';
    messages.get(row.id)?.push({ role: 'bot', body: first });
    ok({
      trackingCode,
      kind,
      status: 'utkast',
      answers: {},
      fields: fieldsFor(kind).map(({ id, label, type, required, question, hint, options, when }) => ({ id, label, type, required, question, hint: hint ?? null, options: options ?? null, when: when ?? null })),
      firstQuestion: first,
      termsVersion: '2026-10-16',
      ai: false,
      aiSource: 'saknas',
    });
    return;
  }

  if (action === 'answer' || action === 'answers') {
    const trackingCode = clean(body.trackingCode, 80);
    if (!trackingCode) {
      ok({ error: 'Ogiltig förfrågan.' }, 400);
      return;
    }
    const existing = [...applications.entries()].find(([, row]) => row.tracking_code === trackingCode);
    if (!existing) {
      ok({ error: 'Ansökan hittades inte.' }, 404);
      return;
    }
    const row = existing[1]; if (!row) { ok({ error: 'Internt fel.' }, 500); return; }
    const kind = row.kind;

    if (row.status === 'skapad' || row.status === 'godkand') {
      ok({ ...publicApplication(row, kind), locked: true });
      return;
    }

    const incoming =
      action === 'answer'
        ? [{ field: String(body.field ?? ''), value: body.value }]
        : Object.entries(body.answers ?? {}).map(([field, value]) => ({ field, value }));

    const answers = { ...((row.payload?.answers ?? {}) || {}) };
    // Överhoppade frivilliga fält. Utan listan skulle ett tomt frivilligt svar
    // komma tillbaka som nästa fråga i all evighet.
    const skipped = new Set(Array.isArray(row.payload?.skipped) ? row.payload.skipped.map(String) : []);
    const problems = {};

    for (const item of incoming) {
      const field = fieldsFor(kind)?.find((f) => f.id === item.field);
      if (!field) continue;

      let value = item.value;
      if (field.type === 'text' || field.type === 'longtext') {
        value = clean(value, field.type === 'longtext' ? 1000 : 120);
      } else if (field.type === 'email') {
        value = clean(value, 120).toLowerCase();
      } else if (field.type === 'number') {
        value = value === '' || value === null ? null : Number(value);
      } else if (field.type === 'boolean') {
        value = value === true || value === 'true' || value === 'ja';
      } else if (field.type === 'choice') {
        const list = Array.isArray(value) ? value : [value];
        value = list.map((v) => clean(v, 120)).filter(Boolean);
      }

      const problem = validateField(field, value);
      if (problem) {
        problems[field.id] = problem;
        continue;
      }
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete answers[field.id];
        if (!field.required) skipped.add(field.id);
      } else {
        answers[field.id] = value;
        skipped.delete(field.id);
      }
    }

    if (Object.keys(problems).length > 0) {
      ok({ ok: false, problems, answers });
      return;
    }

    const relevant = (fieldsFor(kind) || []).filter((f) => {
      if (skipped.has(f.id)) return false;
      if (f.when) {
        const ok2 = Object.entries(f.when).every(([k, v]) => answers[k] === v);
        if (!ok2) return false;
      }
      const val = answers[f.id];
      return val === undefined || val === null || val === '';
    });
    const nextField = relevant[0] || null;
    const allAnswered = nextField === null;

    const question = nextField?.question ?? '';
    if (question) messages.get(row.id)?.push({ role: 'bot', body: question });

    row.payload = { answers, skipped: [...skipped] };
    row.updated_at = new Date().toISOString();

    ok({
      ok: true,
      answers,
      nextField: nextField
        ? {
            id: nextField.id,
            label: nextField.label,
            type: nextField.type,
            required: nextField.required,
            question: nextField.question,
            hint: nextField.hint ?? null,
            options: nextField.options ?? null,
            when: nextField.when ?? null,
          }
        : null,
      question,
      complete: allAnswered,
      missingRequired: relevant.filter((f) => f.required && !answers[f.id]).map((f) => f.label),
      riskFlags: row.risk_flags,
      summary: buildSummary(kind, answers),
      ai: false,
      aiSource: 'saknas',
    });
    return;
  }

  if (action === 'submit') {
    const trackingCode = clean(body.trackingCode, 80);
    const password = String(body.password ?? '');
    if (!trackingCode) {
      ok({ error: 'Ogiltig förfrågan.' }, 400);
      return;
    }
    if (password.length < 8) {
      ok({ ok: false, problems: { password: 'Lösenordet måste vara minst 8 tecken.' } }, 400);
      return;
    }

    const existing = [...applications.entries()].find(([, row]) => row.tracking_code === trackingCode);
    if (!existing) {
      ok({ error: 'Ansökan hittades inte.' }, 404);
      return;
    }
    const row = existing[1]; if (!row) { ok({ error: 'Internt fel.' }, 500); return; }
    const kind = row.kind;
    const answers = (row.payload?.answers ?? {}) || {};

    if (row.status === 'skapad' || row.status === 'godkand') {
      ok({ status: row.status, trackingCode, username: row.created_username, classCode: row.created_class_code, review: 'klar', message: 'Kontot är redan skapat. Logga in med ditt användarnamn och lösenordet du valde.' });
      return;
    }
    if (row.status === 'nekad') {
      ok({ status: 'nekad', trackingCode, review: 'nekad', message: 'Ansökan är avslutad.' });
      return;
    }

    const missing = (fieldsFor(kind) || []).filter((f) => {
      if (f.when) {
        const ok2 = Object.entries(f.when).every(([k, v]) => answers[k] === v);
        if (!ok2) return false;
      }
      return f.required && !answers[f.id];
    });
    if (missing.length > 0) {
      row.status = 'vantar';
      row.updated_at = new Date().toISOString();
      ok({ status: 'ofullstandig', trackingCode, problems: ['Ansökan är inte komplett ännu. Svara på det som saknas och försök igen.'], message: 'Ansökan är inte komplett ännu. Svara på det som saknas och försök igen.' });
      return;
    }

    const username = `test${Date.now().toString(36).slice(-6)}`;
    // Lärarkonton granskas alltid av en administratör — kontot skapas men blir
    // begränsat till dess. Elevkonton utan varningssignaler skapas direkt.
    const autoApprove = kind !== 'larare';
    row.status = autoApprove ? 'skapad' : 'vantar';
    row.created_username = username;
    row.summary = buildSummary(kind, answers);
    row.updated_at = new Date().toISOString();

    ok({
      status: autoApprove ? 'skapad' : 'vantar',
      trackingCode,
      username,
      role: kind === 'larare' ? 'lärare' : 'elev',
      accountType: kind === 'privat_elev' ? 'privat' : 'skola',
      classCode: null,
      classMessage: null,
      joinMessage: null,
      review: autoApprove ? 'auto' : 'granskas',
      message: autoApprove
        ? 'Klart! Logga in med ditt användarnamn och lösenordet du valde.'
        : 'Kontot är skapat men en administratör granskar uppgifterna först.',
    });
    return;
  }

  if (action === 'status') {
    const trackingCode = clean(body.trackingCode, 80);
    if (!trackingCode) {
      ok({ error: 'Ogiltig förfrågan.' }, 400);
      return;
    }
    const existing = [...applications.entries()].find(([, row]) => row.tracking_code === trackingCode);
    if (!existing) {
      ok({ error: 'Ansökan hittades inte.' }, 404);
      return;
    }
    const row = existing[1]; if (!row) { ok({ error: 'Internt fel.' }, 500); return; }
    const kind = row.kind;
    const answers = (row.payload?.answers ?? {}) || {};

    ok({
      status: row.status,
      trackingCode,
      kind,
      username: row.created_username ?? null,
      classCode: row.created_class_code ?? null,
      riskFlags: row.risk_flags ?? [],
      summary: row.summary ?? buildSummary(kind, answers),
      message: statusMessage(row.status),
      canContinue: row.status === 'utkast',
    });
    return;
  }

  ok({ error: 'Okänd åtgärd.' }, 400);
}

async function main() {
  await writeFile(TEST_CONFIG, '{}');
  const server = createServer(responder);
  await new Promise((resolve, reject) => {
    server.listen(BASE_PORT, BASE_HOST, resolve);
    server.on('error', reject);
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const addr = server.address();
  if (!addr?.port) {
    console.error('Kunde inte starta verifieringsserver.');
    process.exitCode = 1;
    server.close();
    return;
  }

  const base = `http://${BASE_HOST}:${addr.port}`;
  // Servern lyssnar på vanlig HTTP. Att skriva om adressen till https här gjorde
  // att klienten försökte TLS-handskaka mot en HTTP-port och hängde sig.
  const supabaseUrl = base;
  const anonKey = 'publik-anon-nyckel-lokal-test';
  await writeFile(TEST_CONFIG, JSON.stringify({ supabaseUrl, supabaseAnonKey: anonKey }, null, 2) + '\n');

  const { createBotClient, newIdempotencyKey } = await import('./bot.js');;
  const bot = createBotClient({ supabaseUrl, anonKey, fetchImpl: fetch });
  const start = await bot.start('skolelev', newIdempotencyKey());
  if (!start.ok) throw new Error(`start: ${start.error}`);
  const trackingCode = String(start.data.trackingCode ?? '');

  const first = await bot.answerStep(trackingCode, 'firstName', 'Anna');
  if (!first.ok) throw new Error(`firstName: ${first.error}`);
  if (first.data.complete) throw new Error('oväntat klart efter firstName');

  const last = await bot.answerStep(trackingCode, 'lastName', 'Andersson');
  if (!last.ok) throw new Error(`lastName: ${last.error}`);

  // De frivilliga fälten (e-post, skola, klasskod) lämnas tomma. Varje tomt svar
  // ska hoppa över frågan och föra flödet vidare — annars kan ansökan aldrig
  // skickas in. Här fastnar en trasig server på samma fråga i all evighet.
  let step = last.data;
  const asked = [];
  const seen = [last.data.nextField].filter(Boolean);
  for (let i = 0; i < 10 && !step.complete; i += 1) {
    const field = step.nextField;
    if (!field) throw new Error('inget nästa fält men inte klart');
    asked.push(field.id);
    seen.push(field);
    const skipped = await bot.answerStep(trackingCode, field.id, '');
    if (!skipped.ok) throw new Error(`hoppa över ${field.id}: ${skipped.error}`);
    if (skipped.data.nextField?.id === field.id) {
      throw new Error(`frågan ${field.id} kom tillbaka efter ett tomt svar (flödet fastnar)`);
    }
    step = skipped.data;
  }
  if (!step.complete) throw new Error(`ansökan blev aldrig klar (frågade: ${asked.join(', ')})`);
  if (!asked.length) throw new Error('inga frivilliga frågor prövades');

  // Varje fråga måste komma med allt som behövs för att rita svarsfältet. Ett
  // val utan alternativ går inte att besvara alls, och ett obligatoriskt fält
  // utan `required` ger fel knapptext.
  for (const field of seen) {
    if (field.type === 'choice' && !(field.options ?? []).length) {
      throw new Error(`valsvaret ${field.id} saknar alternativ`);
    }
    if (typeof field.required !== 'boolean') {
      throw new Error(`frågan ${field.id} saknar required`);
    }
  }

  const submitted = await bot.submit(trackingCode, 'mittEget123');
  if (!submitted.ok) throw new Error(`submit: ${submitted.error}`);
  if (submitted.data.status !== 'skapad') throw new Error(`oväntad status: ${submitted.data.status}`);
  if (!submitted.data.username) throw new Error('username saknas');

  const status = await bot.status(trackingCode);
  if (!status.ok) throw new Error(`status: ${status.error}`);
  if (status.data.status !== 'skapad') throw new Error(`statusstatus: ${status.data.status}`);

  // Lärarflödet innehåller ett val (features). Det måste komma med sina
  // alternativ — annars ritas inga kryssrutor och frågan går inte att besvara.
  const teacher = await bot.start('larare', newIdempotencyKey());
  if (!teacher.ok) throw new Error(`lärare start: ${teacher.error}`);
  const tCode = String(teacher.data.trackingCode ?? '');

  const teacherAnswers = [
    ['firstName', 'Sara'],
    ['lastName', 'Lararprov'],
    ['email', 'sara.lararprov@example.com'],
    ['organisation', 'Provskolan'],
    ['intendedUse', 'Jag planerar och följer upp elevernas arbete i Elda varje vecka.'],
    ['wantsClass', false],
  ];
  let teacherStep = null;
  for (const [field, value] of teacherAnswers) {
    const res = await bot.answerStep(tCode, field, value);
    if (!res.ok) throw new Error(`lärare ${field}: ${res.error}`);
    teacherStep = res.data;
  }

  let choice = null;
  for (let i = 0; i < 10 && !teacherStep.complete; i += 1) {
    const field = teacherStep.nextField;
    if (!field) throw new Error('lärare: inget nästa fält men inte klart');
    if (field.type === 'choice') {
      choice = field;
      break;
    }
    const res = await bot.answerStep(tCode, field.id, '');
    if (!res.ok) throw new Error(`lärare hoppa över ${field.id}: ${res.error}`);
    teacherStep = res.data;
  }
  if (!choice) throw new Error('lärare: valfrågan (features) nåddes aldrig');
  if (!(choice.options ?? []).length) throw new Error('lärare: valfrågan saknar alternativ');
  if (choice.required !== false) throw new Error('lärare: valfrågan har fel required');

  const choiceDone = await bot.answerStep(tCode, choice.id, [choice.options[0]]);
  if (!choiceDone.ok) throw new Error(`lärare val: ${choiceDone.error}`);
  if (choiceDone.data.answers?.[choice.id]?.[0] !== choice.options[0]) {
    throw new Error('lärare: valet sparades inte');
  }

  const teacherSubmit = await bot.submit(tCode, 'mittEget123');
  if (!teacherSubmit.ok) throw new Error(`lärare submit: ${teacherSubmit.error}`);
  if (teacherSubmit.data.status !== 'vantar') throw new Error(`lärare ska granskas, fick ${teacherSubmit.data.status}`);

  server.close();
  console.log('OK');
  console.log('base', base);
  console.log('trackingCode', trackingCode);
  console.log('username', submitted.data.username);
  console.log('överhoppade frågor', asked.join(', '));
  console.log('lärarval', choice.id, '→', choice.options[0]);
  console.log('lärarkonto', teacherSubmit.data.username, teacherSubmit.data.status);
  console.log('config', TEST_CONFIG);
}

main().catch((err) => {
  console.error('Fel i lokal verifiering:', err?.message ?? err);
  process.exitCode = 1;
});
