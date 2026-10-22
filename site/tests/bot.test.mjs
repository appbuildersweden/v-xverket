/**
 * Tester för registreringsbotens klient (site/bot.js).
 *
 * Körs med `npm test` i site/ (node --test). Servern mockas efter samma
 * kontrakt som `supabase/functions/register` — det som prövas är att klienten
 * skickar rätt saker, visar serverns fel och att den inte kan skicka något som
 * ger behörighet (roll, godkännandestatus, kontotyp vid inskickandet).
 *
 * Det här ersätter inte ett test mot den riktiga serverfunktionen: registrering
 * kräver en deployad funktion i Supabase och körs därför separat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GREETINGS,
  KINDS,
  MIN_PASSWORD_LENGTH,
  answerValueFor,
  createBotClient,
  firstNameFrom,
  greetingReply,
  helpReply,
  looksLikeAccountRequest,
  looksLikeQuestion,
  newIdempotencyKey,
  parseChatAnswer,
  parseKind,
  questionFor,
  readConfig,
  validateNewPassword,
} from '../bot.js';

/** Liten låtsad server som svarar som `register` gör. */
function fakeServer(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const handler = handlers[body.action];
    const result = handler
      ? handler(body)
      : { status: 400, json: { error: 'Okänd åtgärd.' } };
    return new Response(JSON.stringify(result.json ?? {}), {
      status: result.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}

function client(handlers) {
  const server = fakeServer(handlers);
  const bot = createBotClient({
    supabaseUrl: 'https://projekt.supabase.co/',
    anonKey: 'publik-anon-nyckel',
    fetchImpl: server.fetchImpl,
  });
  return { bot, ...server };
}

const FIELDS = [
  { id: 'firstName', label: 'Förnamn', type: 'text', question: 'Vad heter du i förnamn?' },
  { id: 'lastName', label: 'Efternamn', type: 'text', question: 'Och i efternamn?' },
];

test('lösenordskontrollen följer samma regler som servern', () => {
  assert.match(validateNewPassword('', '', 'ejentu01'), /Välj ett lösenord/);
  assert.match(validateNewPassword('kort', 'kort'), new RegExp(String(MIN_PASSWORD_LENGTH)));
  assert.match(validateNewPassword('hemligt123', 'annat123'), /stämmer inte/);
  assert.match(validateNewPassword('student123', 'student123'), /för vanligt/);
  assert.match(validateNewPassword('ejentu01', 'ejentu01', 'ejentu01'), /användarnamn/);
  assert.equal(validateNewPassword('mittEget123', 'mittEget123', 'ejentu01'), null);
});

test('råvärden tolkas efter fältets typ', () => {
  assert.deepEqual(answerValueFor({ type: 'text' }, '  Anna  '), { ok: true, value: 'Anna' });
  assert.deepEqual(answerValueFor({ type: 'number' }, '24'), { ok: true, value: 24 });
  assert.deepEqual(answerValueFor({ type: 'number' }, ''), { ok: true, value: null });
  assert.equal(answerValueFor({ type: 'number' }, 'många').ok, false);
  assert.deepEqual(answerValueFor({ type: 'boolean' }, 'ja'), { ok: true, value: true });
  assert.deepEqual(answerValueFor({ type: 'boolean' }, 'nej'), { ok: true, value: false });
  assert.equal(answerValueFor({ type: 'boolean' }, '').ok, false);
  assert.deepEqual(answerValueFor({ type: 'choice' }, ['Klasschatt']), {
    ok: true,
    value: ['Klasschatt'],
  });
  assert.equal(answerValueFor({ type: 'choice' }, []).ok, false);
});

test('idempotensnyckeln är lång nog och olika varje gång', () => {
  const a = newIdempotencyKey();
  const b = newIdempotencyKey();
  assert.ok(a.length >= 8);
  assert.notEqual(a, b);
});

test('frågan har alltid ett begripligt reservformulär', () => {
  assert.equal(questionFor({ label: 'Förnamn' }, 'Vad heter du?'), 'Vad heter du?');
  assert.match(questionFor({ label: 'Förnamn' }, ''), /förnamn/);
});

test('konfigurationen måste finnas — annars vägrar klienten', () => {
  assert.equal(readConfig(null), null);
  assert.equal(readConfig({ supabaseUrl: '', supabaseAnonKey: 'x' }), null);
  assert.deepEqual(readConfig({ supabaseUrl: ' https://a.b ', supabaseAnonKey: 'k' }), {
    supabaseUrl: 'https://a.b',
    anonKey: 'k',
  });
  assert.throws(() => createBotClient({ supabaseUrl: '', anonKey: '' }), /inte konfigurerad/);
});

test('anropen skickar rätt kropp och publik nyckel', async () => {
  const { bot, calls } = client({
    questions: () => ({ json: { kind: 'skolelev', fields: FIELDS, ai: false } }),
  });

  const res = await bot.questions('skolelev');

  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/functions\/v1\/register$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, 'publik-anon-nyckel');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer publik-anon-nyckel');
  assert.deepEqual(calls[0].body, { action: 'questions', kind: 'skolelev' });
});

test('en ny användare kan gå hela flödet: starta, svara och skicka in', async () => {
  const answers = {};
  const { bot, calls } = client({
    start: () => ({
      json: {
        trackingCode: 'ELDA-ABC123',
        kind: 'skolelev',
        fields: FIELDS,
        firstQuestion: 'Vad heter du i förnamn?',
        ai: false,
      },
    }),
    answer: ({ field, value }) => {
      answers[field] = value;
      const next = FIELDS.find((f) => answers[f.id] === undefined) ?? null;
      return {
        json: {
          ok: true,
          answers,
          nextField: next,
          question: next?.question ?? '',
          complete: next === null,
          missingRequired: [],
          riskFlags: [],
          ai: false,
        },
      };
    },
    submit: () => ({
      json: {
        status: 'skapad',
        trackingCode: 'ELDA-ABC123',
        username: 'eannaad01',
        role: 'elev',
        review: 'auto',
        message: 'Klart! Logga in med ditt användarnamn och lösenordet du valde.',
      },
    }),
  });

  const started = await bot.start('skolelev', 'nyckel-12345678');
  assert.equal(started.ok, true);
  assert.equal(started.data.trackingCode, 'ELDA-ABC123');

  const first = await bot.answerStep('ELDA-ABC123', 'firstName', 'Anna');
  assert.equal(first.data.complete, false);
  assert.equal(first.data.nextField.id, 'lastName');

  const last = await bot.answerStep('ELDA-ABC123', 'lastName', 'Andersson');
  assert.equal(last.data.complete, true);

  const submitted = await bot.submit('ELDA-ABC123', 'mittEget123');
  assert.equal(submitted.ok, true);
  assert.equal(submitted.data.status, 'skapad');
  assert.equal(submitted.data.username, 'eannaad01');

  // Insättandet får bara innehålla spårningskoden och lösenordet.
  const submitBody = calls.at(-1).body;
  assert.deepEqual(Object.keys(submitBody).sort(), ['action', 'password', 'trackingCode']);
  assert.ok(!('role' in submitBody));
  assert.ok(!('kind' in submitBody));
  assert.ok(!('limited' in submitBody));
});

test('läraransökan skapar kontot direkt — inget godkännande behövs', async () => {
  const { bot } = client({
    submit: () => ({
      json: {
        status: 'skapad',
        trackingCode: 'ELDA-TEACH1',
        username: 'elara01',
        role: 'lärare',
        review: 'auto',
        riskFlags: [],
        message: 'Klart! Logga in med ditt användarnamn och lösenordet du valde.',
      },
    }),
  });

  const res = await bot.submit('ELDA-TEACH1', 'mittEget123');
  assert.equal(res.ok, true);
  assert.equal(res.data.status, 'skapad');
  assert.equal(res.data.review, 'auto');
  assert.match(res.data.message, /Logga in/);
});

test('fältfel från servern når fram även när svaret saknar meddelande', async () => {
  const { bot } = client({
    submit: () => ({
      status: 400,
      json: { ok: false, problems: { password: 'Lösenordet måste vara minst 8 tecken.' } },
    }),
  });

  const res = await bot.submit('ELDA-ABC123', 'kort');
  assert.equal(res.ok, false);
  assert.equal(res.problems.password, 'Lösenordet måste vara minst 8 tecken.');
  assert.match(res.error, /markerats/);
});

test('en ofullständig ansökan visar vilka fält som återstår', async () => {
  const { bot } = client({
    submit: () => ({
      status: 400,
      json: {
        status: 'ofullstandig',
        problems: ['Efternamn saknas', 'Organisation saknas'],
        message: 'Ansökan är inte komplett ännu. Svara på det som saknas och försök igen.',
      },
    }),
  });

  const res = await bot.submit('ELDA-ABC123', 'mittEget123');
  assert.equal(res.ok, false);
  assert.match(res.error, /inte komplett/);
  assert.deepEqual(res.problemsList, ['Efternamn saknas', 'Organisation saknas']);
});

test('serverns egna fel och fältfel skickas vidare oförändrade', async () => {
  const { bot } = client({
    start: () => ({ status: 400, json: { error: 'Ogiltig förfrågan.' } }),
    answer: () => ({
      status: 400,
      json: {
        ok: false,
        error: 'Svaret underkändes.',
        problems: { firstName: 'Förnamn får inte innehålla siffror.' },
      },
    }),
    submit: () => ({
      status: 400,
      json: {
        status: 'ofullstandig',
        problems: ['Efternamn'],
        message: 'Ansökan är inte komplett ännu.',
      },
    }),
  });


  const bad = await bot.start('fel_typ', 'nyckel-12345678');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'Ogiltig förfrågan.');

  const problem = await bot.answerStep('ELDA-ABC123', 'firstName', 'Anna1');
  assert.equal(problem.ok, false);
  assert.equal(problem.problems.firstName, 'Förnamn får inte innehålla siffror.');

  const incomplete = await bot.submit('ELDA-ABC123', 'mittEget123');
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.error, 'Ansökan är inte komplett ännu.');
});

test('rate limit, nätverksfel och okänd åtgärd ger begripliga meddelanden', async () => {
  const throttled = client({ status: () => ({ status: 429, json: {} }) });
  const t = await throttled.bot.status('ELDA-ABC123');
  assert.equal(t.ok, false);
  assert.match(t.error, /För många försök/);

  const down = createBotClient({
    supabaseUrl: 'https://projekt.supabase.co',
    anonKey: 'nyckel',
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  const d = await down.questions('skolelev');
  assert.equal(d.ok, false);
  assert.match(d.error, /anslutning/);

  const unknown = client({});
  const u = await unknown.bot.status('ELDA-ABC123');
  assert.equal(u.ok, false);
  assert.equal(u.error, 'Okänd åtgärd.');
});

test('kontotyperna är de tre som servern känner igen — ingen administratör', () => {
  assert.deepEqual(KINDS, ['skolelev', 'privat_elev', 'larare']);
});

/**
 * Regressionstest för blockeraren: ett frivilligt fält som lämnas tomt fick
 * frågan att komma tillbaka i all evighet, så ansökan blev aldrig klar och
 * kunde därför aldrig skickas in.
 *
 * Den här låtsade servern följer serverns kontrakt: ett tomt frivilligt svar
 * markeras som överhoppat och frågas aldrig igen.
 */
test('frivilliga frågor kan hoppas över — flödet fastnar inte och går att skicka in', async () => {
  const FIELDS = [
    { id: 'firstName', label: 'Förnamn', type: 'text', required: true, question: 'Förnamn?' },
    { id: 'lastName', label: 'Efternamn', type: 'text', required: true, question: 'Efternamn?' },
    { id: 'email', label: 'E-post', type: 'email', required: false, question: 'E-post?' },
    { id: 'schoolName', label: 'Skola', type: 'text', required: false, question: 'Skola?' },
  ];

  const answers = {};
  const skipped = new Set();
  const nextField = () =>
    FIELDS.find((f) => !skipped.has(f.id) && !answers[f.id]) ?? null;

  const { bot, calls } = client({
    start: () => ({ json: { trackingCode: 'ELDA-SKIP1', kind: 'skolelev', fields: FIELDS, firstQuestion: FIELDS[0].question, ai: false } }),
    answer: ({ field, value }) => {
      const def = FIELDS.find((f) => f.id === field);
      if (value === null || value === '') {
        if (!def.required) skipped.add(field);
        else return { json: { ok: false, problems: { [field]: `${def.label} behövs.` } } };
      } else {
        answers[field] = value;
      }
      const next = nextField();
      return { json: { ok: true, answers, nextField: next, question: next?.question ?? '', complete: next === null, missingRequired: [], riskFlags: [], ai: false } };
    },
    submit: () => ({ json: { status: 'skapad', trackingCode: 'ELDA-SKIP1', username: 'eannaad01', role: 'elev', review: 'auto', message: 'Klart!' } }),
  });

  await bot.start('skolelev', 'nyckel-12345678');
  await bot.answerStep('ELDA-SKIP1', 'firstName', 'Anna');
  const last = await bot.answerStep('ELDA-SKIP1', 'lastName', 'Andersson');
  assert.equal(last.data.nextField.id, 'email');
  assert.equal(last.data.complete, false);

  // Ett tomt svar på ett frivilligt textfält skickas som en tom sträng (precis
  // som webbläsaren gör) och hoppar över frågan i stället för att komma tillbaka.
  const skippedEmail = await bot.answerStep('ELDA-SKIP1', 'email', '');
  assert.equal(calls.at(-1).body.value, '');
  assert.notEqual(skippedEmail.data.nextField?.id, 'email', 'samma fråga får inte komma tillbaka');
  assert.equal(skippedEmail.data.nextField.id, 'schoolName');

  const skippedSchool = await bot.answerStep('ELDA-SKIP1', 'schoolName', '');
  assert.equal(skippedSchool.data.complete, true, 'ansökan ska vara klar när de frivilliga frågorna hoppats över');
  assert.equal(skippedSchool.data.nextField, null);

  // När flödet är klart går ansökan att skicka in.
  const submitted = await bot.submit('ELDA-SKIP1', 'mittEget123');
  assert.equal(submitted.ok, true);
  assert.equal(submitted.data.status, 'skapad');
});

test('ett tomt svar skickas vidare som tomt och avgörs av servern', () => {
  // Tom text skickas som tom sträng — det är så ett överhoppat frivilligt fält
  // når servern, som då hoppar över frågan i stället för att ställa den igen.
  assert.deepEqual(answerValueFor({ type: 'text', required: false }, ''), { ok: true, value: '' });
  assert.deepEqual(answerValueFor({ type: 'longtext', required: false }, '   '), { ok: true, value: '' });
  assert.deepEqual(answerValueFor({ type: 'email', required: false }, ''), { ok: true, value: '' });
  // Siffror blir null när de lämnas tomma.
  assert.deepEqual(answerValueFor({ type: 'number', required: false }, ''), { ok: true, value: null });
  // Ett tomt obligatoriskt textfält skickas också vidare — det är servern som
  // avgör att det behövs och svarar med fältets felmeddelande.
  assert.deepEqual(answerValueFor({ type: 'text', required: true }, ''), { ok: true, value: '' });
  // Ja/nej och val måste besvaras innan något skickas.
  assert.equal(answerValueFor({ type: 'boolean', required: false }, '').ok, false);
  assert.equal(answerValueFor({ type: 'choice', required: false }, []).ok, false);
});

test('chattens svar tolkas som folk skriver dem', () => {
  const yesNo = { id: 'hasClass', label: 'Har du en klass?', type: 'boolean', required: true };
  assert.deepEqual(parseChatAnswer(yesNo, 'japp'), { ok: true, value: true });
  assert.deepEqual(parseChatAnswer(yesNo, 'Nej tack'), { ok: true, value: false });
  assert.equal(parseChatAnswer(yesNo, 'kanske').ok, false);

  const size = { id: 'classSize', label: 'Antal elever', type: 'number', required: true };
  assert.deepEqual(parseChatAnswer(size, '24 elever'), { ok: true, value: 24 });
  assert.equal(parseChatAnswer(size, '99').ok, false);
  assert.equal(parseChatAnswer(size, 'många').ok, false);

  const mail = { id: 'email', label: 'E-post', type: 'email', required: false };
  assert.deepEqual(parseChatAnswer(mail, 'anna@skola.se'), { ok: true, value: 'anna@skola.se' });
  assert.equal(parseChatAnswer(mail, 'anna.skola.se').ok, false);

  const role = {
    id: 'staffRole',
    label: 'Roll',
    type: 'choice',
    required: true,
    options: ['Lärare', 'Speciallärare'],
  };
  assert.deepEqual(parseChatAnswer(role, 'speciallärare'), { ok: true, value: ['Speciallärare'] });
  assert.deepEqual(parseChatAnswer(role, '2'), { ok: true, value: ['Speciallärare'] });
  assert.equal(parseChatAnswer(role, 'båda').ok, false);

  const subjects = {
    id: 'subjects',
    label: 'Ämnen',
    type: 'choice',
    required: false,
    options: ['Matematik', 'Svenska', 'Engelska'],
  };
  assert.deepEqual(parseChatAnswer(subjects, 'svenska och engelska'), {
    ok: true,
    value: ['Svenska', 'Engelska'],
  });
  assert.deepEqual(parseChatAnswer(subjects, 'alla'), {
    ok: true,
    value: ['Matematik', 'Svenska', 'Engelska'],
  });

  // Ett kort svar ska räcka när det bara kan betyda ett alternativ.
  const features = {
    id: 'features',
    label: 'Funktioner',
    type: 'choice',
    required: true,
    options: ['Planering och att göra', 'Uppgifter och uppföljning', 'Klasschatt'],
  };
  assert.deepEqual(parseChatAnswer(features, 'planering'), {
    ok: true,
    value: ['Planering och att göra'],
  });
  assert.deepEqual(parseChatAnswer(features, 'uppgifter'), {
    ok: true,
    value: ['Uppgifter och uppföljning'],
  });

  // Två alternativ som börjar lika får inte gissas.
  const ambiguous = {
    id: 'x',
    label: 'X',
    type: 'choice',
    required: true,
    options: ['Planering', 'Planering och att göra'],
  };
  assert.match(parseChatAnswer(ambiguous, 'plane').error, /Vilket av alternativen/);
});

test('frivilliga frågor kan hoppas över med /hoppa — obligatoriska kan inte', () => {
  const optional = { id: 'email', label: 'E-post', type: 'email', required: false };
  const required = { id: 'firstName', label: 'Förnamn', type: 'text', required: true };

  assert.deepEqual(parseChatAnswer(optional, '/hoppa'), { ok: true, value: '', skipped: true });
  assert.deepEqual(parseChatAnswer(optional, 'hoppa över'), { ok: true, value: '', skipped: true });
  assert.deepEqual(parseChatAnswer(optional, ''), { ok: true, value: '', skipped: true });
  assert.match(parseChatAnswer(required, '').error, /behövs/);
  assert.match(parseChatAnswer(required, '/hoppa').error, /behövs/);
});

test('kontotypen kan skrivas i chatten i stället för att klickas', () => {
  assert.equal(parseKind('skolelev'), 'skolelev');
  assert.equal(parseKind('Jag är elev och går i nian'), 'skolelev');
  assert.equal(parseKind('privat elev'), 'privat_elev');
  assert.equal(parseKind('jag pluggar själv hemma'), null);
  assert.equal(parseKind('lärare'), 'larare');
  assert.equal(parseKind('jag undervisar på en skola'), 'larare');
  assert.equal(parseKind('hej'), null);
});

test('en fråga känns igen som fråga — ett vanligt svar gör det inte', () => {
  assert.equal(looksLikeQuestion('Vad kostar det?'), true);
  assert.equal(looksLikeQuestion('hur får jag en klasskod'), true);
  assert.equal(looksLikeQuestion('kan jag få skapa konto'), true);
  assert.equal(looksLikeQuestion('/hjälp'), true);
  assert.equal(looksLikeQuestion('Klass 9A'), false);
  assert.equal(looksLikeQuestion('Anna'), false);
  assert.equal(looksLikeQuestion('ja'), false);
});

test('boten hittar förnamnet i de sparade svaren', () => {
  assert.equal(firstNameFrom({ firstName: '  Anna ' }), 'Anna');
  assert.equal(firstNameFrom({ firstName: '' }), '');
  assert.equal(firstNameFrom({}), '');
  assert.equal(firstNameFrom(null), '');
  assert.equal(firstNameFrom({ firstName: ['Anna'] }), '');
});

test('hälsningen varierar och utgår inte från att kontot ska skapas', () => {
  assert.ok(GREETINGS.length >= 3);
  for (const text of GREETINGS) {
    assert.match(text, /^(Hej|Hallå)/);
    assert.doesNotMatch(text, /Vad kul att du vill skapa/);
  }

  // Samma hälsning ska aldrig komma två gånger i rad.
  let previous = -1;
  for (let i = 0; i < 20; i += 1) {
    const reply = greetingReply(previous);
    assert.ok(reply.index >= 0 && reply.index < GREETINGS.length);
    assert.equal(reply.text, GREETINGS[reply.index]);
    assert.notEqual(reply.index, previous);
    previous = reply.index;
  }
});

test('en begäran om konto känns igen även när den är en fråga', () => {
  assert.equal(looksLikeAccountRequest('kan jag få skapa konto?'), true);
  assert.equal(looksLikeAccountRequest('jag vill skapa ett konto som lärare'), true);
  assert.equal(looksLikeAccountRequest('hur registrerar jag ett konto?'), true);
  assert.equal(looksLikeAccountRequest('var hittar jag mitt konto?'), false);
  assert.equal(looksLikeAccountRequest('hur skapar jag en klass?'), false);
  assert.equal(looksLikeAccountRequest('vad kostar det?'), false);
  assert.equal(looksLikeAccountRequest(''), false);
});

test('boten svarar på frågor om konto, pris och lösenord', () => {
  assert.match(helpReply('vad kostar Elda?'), /gratis/i);
  assert.match(helpReply('hur skapar jag ett konto?'), /chatten/i);
  assert.match(helpReply('hur lång tid tar det?'), /minut/i);
  assert.match(helpReply('kan jag ändra namn senare?'), /Profil/i);
  assert.match(helpReply('fungerar det på mobilen?'), /webbläsare/i);
  assert.match(helpReply('är det säkert?'), /sparas/i);
  assert.match(helpReply('vilket lösenord ska jag välja?'), /8 tecken/i);
  assert.match(helpReply('vilken typ ska jag välja?'), /Privat elev/i);
  assert.match(helpReply('var hittar jag klasskoden?'), /lärare/i);
  assert.equal(helpReply('Anna'), null);
  // "skapar" om något annat än ett konto ska inte bli kontosvaret.
  assert.equal(helpReply('hur skapar jag en klass?'), null);
});

test('en tidsgräns ger ett begripligt fel i stället för att hänga', async () => {
  const bot = createBotClient({
    supabaseUrl: 'https://projekt.supabase.co',
    anonKey: 'publik-anon-nyckel',
    fetchImpl: async () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    },
  });

  const res = await bot.answerStep('kod', 'firstName', 'Anna');
  assert.equal(res.ok, false);
  assert.match(res.error, /svarade inte i tid/);
  assert.equal(res.retryable, true);
});
