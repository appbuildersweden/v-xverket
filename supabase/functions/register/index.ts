// Elda — register
//
// Registreringsbotens skyddade serverfunktion. Den äger hela flödet:
//
//   * frågorna ställs stegvis och svaren valideras här (klienten kan inte hoppa
//     över ett obligatoriskt svar genom att ändra i gränssnittet)
//   * beslutet fattas av en regelbaserad motor; registreringen gör inga
//     AI-anrop, så frågor och kontoskapande fungerar utan extern tjänst
//   * konton skapas här med service role. Rollen kan bara bli 'elev' eller
//     'lärare'. Adminrollen kan aldrig skapas härifrån.
//
// Deploy:  supabase functions deploy register --no-verify-jwt
// (funktionen är publik eftersom en ny användare inte har någon session ännu.
//  Den skyddas av validering, rate limit, idempotens och service role-nyckeln
//  som bara finns på servern.)
//
// Det här är den enda publika vägen till ett konto. Registreringsboten på
// Eldas hemsida (site/registrera.html) är dess enda gränssnitt, och den här
// funktionen äger hela flödet: den skapar ansökan, validerar varje svar och
// skapar kontot så snart underlaget är komplett. Kontot blir alltid aktivt och
// utan begränsning — ingen behöver vänta på att en administratör godkänner det.
// Regelverkets varningsflaggor sparas i stället för att blockera, så
// att en administratör kan granska ansökan i efterhand. Ingen roll,
// godkännandestatus eller kontotyp kan sättas direkt av klienten — `kind` är
// användarens val av kontotyp, och rollen härleds av servern. Administratörens
// kontoskapande ligger i `admin-users`, som kräver en administratörssession.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ================================================================
// Konfiguration
// ================================================================

const TERMS_VERSION = '2026-10-16';

const KINDS = ['skolelev', 'privat_elev', 'larare'] as const;
type Kind = (typeof KINDS)[number];

const MIN_PASSWORD_LENGTH = 8;
const MAX_SHORT_TEXT = 120;
const MAX_LONG_TEXT = 1000;

// Missbruksskydd per IP (bästa skydd per instans).
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS: Record<string, number> = {
  start: 5,
  answer: 80,
  submit: 10,
  status: 120,
  questions: 60,
};
const hits = new Map<string, { count: number; reset: number }>();

function allow(key: string, action: string): boolean {
  const max = LIMITS[action] ?? 30;
  const now = Date.now();
  const id = `${key}:${action}`;
  const entry = hits.get(id);
  if (!entry || now > entry.reset) {
    hits.set(id, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

// ================================================================
// Fält per kontotyp
// ================================================================

type FieldType = 'text' | 'longtext' | 'email' | 'number' | 'boolean' | 'choice';

interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  question: string;
  hint?: string;
  options?: string[];
  /** Endast frågan ställs när dessa svar är satta (t.ex. vill skapa klass). */
  when?: Record<string, string | boolean>;
}

const BASE_FIELDS: FieldDef[] = [
  {
    id: 'firstName',
    label: 'Förnamn',
    type: 'text',
    required: true,
    question: 'Vad heter du i förnamn?',
  },
  {
    id: 'lastName',
    label: 'Efternamn',
    type: 'text',
    required: true,
    question: 'Och i efternamn?',
  },
];

const STUDENT_FIELDS: FieldDef[] = [
  {
    id: 'email',
    label: 'E-post',
    type: 'email',
    required: false,
    question: 'Vill du lämna en e-postadress? Den används bara om skolan behöver nå dig.',
    hint: 'Frivilligt. Kontot och inloggningen sköts med användarnamn.',
  },
];

const SCHOOL_STUDENT_FIELDS: FieldDef[] = [
  {
    id: 'schoolName',
    label: 'Skola',
    type: 'text',
    required: false,
    question: 'Vilken skola går du på?',
    hint: 'Frivilligt — gör det lättare för din lärare att hitta dig.',
  },
  {
    id: 'classCode',
    label: 'Klasskod',
    type: 'text',
    required: false,
    question: 'Har du fått en klasskod av din lärare?',
    hint: 'Frivilligt. Koden skickar en förfrågan — din lärare måste godkänna den innan du ser klassens innehåll.',
  },
];

const PRIVATE_STUDENT_FIELDS: FieldDef[] = [
  {
    id: 'goal',
    label: 'Mål med studierna',
    type: 'longtext',
    required: false,
    question: 'Vad vill du främst använda Elda till?',
    hint: 'Frivilligt. Ett par ord räcker — det gör startsidan lättare att förstå.',
  },
];

const TEACHER_FIELDS: FieldDef[] = [
  {
    id: 'staffRole',
    label: 'Roll',
    type: 'choice',
    required: true,
    question: 'Är du lärare eller speciallärare?',
    hint: 'Speciallärare får en panel med fokus på elever och anpassat material.',
    options: ['Lärare', 'Speciallärare'],
  },
  {
    id: 'email',
    label: 'E-post',
    type: 'email',
    required: true,
    question: 'Vilken e-postadress kan skolan och Elda nå dig på?',
  },
  {
    id: 'organisation',
    label: 'Skola eller organisation',
    type: 'text',
    required: true,
    question: 'Vilken skola eller utbildningsorganisation arbetar du på?',
  },
  {
    id: 'subject',
    label: 'Ämne eller roll',
    type: 'text',
    required: false,
    question: 'Vilket ämne undervisar du i, eller vilken roll har du?',
    hint: 'Frivilligt, t.ex. matematik eller specialpedagog.',
  },
  {
    id: 'intendedUse',
    label: 'Användning',
    type: 'longtext',
    required: true,
    question: 'Hur tänker du använda Elda i undervisningen?',
    hint: 'En kort beskrivning räcker.',
  },
  {
    id: 'wantsClass',
    label: 'Skapa klass',
    type: 'boolean',
    required: false,
    question: 'Vill du skapa en klass direkt?',
    hint: 'Då får du en klasskod att dela med dina elever.',
  },
  {
    id: 'className',
    label: 'Klassens namn',
    type: 'text',
    required: false,
    question: 'Vad ska klassen heta?',
    when: { wantsClass: true },
  },
  {
    id: 'classSize',
    label: 'Ungefärlig klassstorlek',
    type: 'number',
    required: false,
    question: 'Ungefär hur många elever har du?',
    hint: 'Frivilligt. Bara en siffra.',
  },
];

function fieldsFor(kind: Kind): FieldDef[] {
  if (kind === 'larare') return [...BASE_FIELDS, ...TEACHER_FIELDS];
  if (kind === 'skolelev') {
    return [...BASE_FIELDS, ...STUDENT_FIELDS, ...SCHOOL_STUDENT_FIELDS];
  }
  return [...BASE_FIELDS, ...STUDENT_FIELDS, ...PRIVATE_STUDENT_FIELDS];
}

function appliableFields(kind: Kind, answers: Record<string, unknown>): FieldDef[] {
  return fieldsFor(kind).filter((field) => {
    if (!field.when) return true;
    return Object.entries(field.when).every(([key, value]) => answers[key] === value);
  });
}

// ================================================================
// Validering och beslutsmotor
// ================================================================

const NAME_RE = /^[\p{L}][\p{L}\s'.-]{0,59}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const CLASS_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

function clean(value: unknown, max = MAX_SHORT_TEXT): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const LINK_RE = /(https?:\/\/|www\.)/i;

/** Validerar ett enskilt svar. Returnerar felmeddelande eller null. */
function validateField(field: FieldDef, raw: unknown): string | null {
  const empty =
    raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '') ||
    (Array.isArray(raw) && raw.length === 0);

  if (empty) {
    return field.required ? `${field.label} behövs för att gå vidare.` : null;
  }

  switch (field.type) {
    case 'text':
    case 'longtext': {
      const value = clean(raw, field.type === 'longtext' ? MAX_LONG_TEXT : MAX_SHORT_TEXT);
      if (field.id === 'firstName' || field.id === 'lastName') {
        if (!NAME_RE.test(value)) return 'Ange namnet med bokstäver, inga siffror eller symboler.';
      }
      if (field.id === 'classCode' && !CLASS_CODE_RE.test(value.toUpperCase())) {
        return 'Klasskoden är sex tecken, till exempel ABC234.';
      }
      if (field.id === 'className' && value.length < 2) {
        return 'Ge klassen ett namn (minst 2 tecken).';
      }
      return null;
    }
    case 'email':
      return EMAIL_RE.test(String(raw)) ? null : 'Kontrollera e-postadressen, den ser inte komplett ut.';
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 'Ange bara en siffra.';
      if (field.id === 'classSize' && (n < 1 || n > 60)) {
        return 'Ange ett antal mellan 1 och 60.';
      }
      return null;
    }
    case 'boolean':
      return typeof raw === 'boolean' ? null : 'Svara ja eller nej.';
    case 'choice': {
      const list = Array.isArray(raw) ? raw : [raw];
      const allowed = new Set(field.options ?? []);
      return list.every((v) => allowed.has(String(v)))
        ? null
        : 'Välj bland alternativen i listan.';
    }
    default:
      return null;
  }
}

interface Evaluation {
  complete: boolean;
  problems: string[];
  riskFlags: string[];
  /** Sant när ansökan får godkännas automatiskt. */
  autoApprove: boolean;
}

/**
 * Beslutsmotorn. Ren regelräkning — AI:n är aldrig inblandad i beslutet.
 *
 *   * ofullständiga svar  → kan inte godkännas
 *   * varningssignaler    → kontot skapas begränsat och hamnar hos admin
 *   * lärarkonto          → granskas alltid av admin, aldrig automatiskt
 *   * elevkonto komplett utan varningssignaler → automatisk godkännande
 */
export function evaluateApplication(
  kind: Kind,
  answers: Record<string, unknown>,
): Evaluation {
  const problems: string[] = [];
  const riskFlags: string[] = [];

  for (const field of appliableFields(kind, answers)) {
    const problem = validateField(field, answers[field.id]);
    if (problem) problems.push(problem);
  }

  if (problems.length > 0) {
    return { complete: false, problems, riskFlags, autoApprove: false };
  }

  if (kind === 'larare') {
    const use = clean(answers.intendedUse, MAX_LONG_TEXT);
    if (use.length < 40) riskFlags.push('kort-motivering');
    if (LINK_RE.test(use)) riskFlags.push('lank-i-text');
    const size = Number(answers.classSize);
    if (Number.isFinite(size) && size > 40) riskFlags.push('stor-klass');
    const org = clean(answers.organisation);
    if (org.length < 3) riskFlags.push('oklar-organisation');
  }

  if (kind !== 'larare') {
    const goal = clean(answers.goal, MAX_LONG_TEXT);
    if (LINK_RE.test(goal)) riskFlags.push('lank-i-text');
  }

  // Dubbla tecken eller uppenbart skämtnamn är en varning, inte ett stopp.
  const name = `${clean(answers.firstName)} ${clean(answers.lastName)}`.toLowerCase();
  if (/(.)\1{3,}/.test(name) || /\b(test|asdf|abcabc)\b/.test(name)) {
    riskFlags.push('orosakande-namn');
  }

  const uniqueFlags = [...new Set(riskFlags)];
  return {
    complete: true,
    problems: [],
    riskFlags: uniqueFlags,
    // Lärarkonton får aldrig automatiskt godkännande: boten kan inte verifiera
    // en yrkesidentitet eller en skolas tillhörighet. Kontot skapas begränsat och
    // en administratör måste granska ansökan innan klassverktygen öppnas.
    autoApprove: kind !== 'larare' && uniqueFlags.length === 0,
  };
}

/** Kort, begriplig sammanfattning för admin (AI:n får bara skriva om den). */
function buildSummary(kind: Kind, answers: Record<string, unknown>): string {
  const name = `${clean(answers.firstName)} ${clean(answers.lastName)}`.trim();
  if (kind === 'larare') {
    const org = clean(answers.organisation);
    const size = answers.classSize ? `, ca ${clean(answers.classSize)} elever` : '';
    const wantsClass = answers.wantsClass === true ? ', vill skapa klass' : '';
    return `${name} — lärare på ${org}${size}${wantsClass}.`;
  }
  if (kind === 'skolelev') {
    const school = answers.schoolName ? ` på ${clean(answers.schoolName)}` : '';
    const code = answers.classCode ? ' och har angett klasskod' : '';
    return `${name} — skolelev${school}${code}.`;
  }
  const goal = clean(answers.goal, 200);
  return `${name} — privat elev${goal ? `: ${goal}` : '.'}`;
}

// ================================================================
// Hjälpare
// ================================================================

function newTrackingCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface AnswerRow {
  field: string;
  value: unknown;
}

function answersFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const answers = payload?.answers;
  return answers && typeof answers === 'object' ? (answers as Record<string, unknown>) : {};
}

async function logMessage(
  admin: SupabaseClient,
  applicationId: string,
  role: 'bot' | 'user' | 'system',
  body: string,
): Promise<void> {
  const text = body.slice(0, 2000);
  if (!text) return;
  await admin.from('registration_messages').insert({
    application_id: applicationId,
    role,
    body: text,
  });
}

async function audit(
  admin: SupabaseClient,
  action: string,
  subjectType: string,
  subjectId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await admin.from('audit_log').insert({
    actor_id: null,
    actor_role: 'registreringsbot',
    action,
    subject_type: subjectType,
    subject_id: subjectId,
    details,
  });
}

function publicApplication(row: Record<string, unknown>, kind: Kind) {
  const answers = answersFromPayload((row.payload as Record<string, unknown>) ?? {});
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

/**
 * En fråga så som klienten behöver den. Måste innehålla allt som krävs för att
 * rita svarsfältet: `options` för valsvar (annars blir listan tom och frågan går
 * inte att besvara) och `required` för att veta om ett tomt svar hoppar över
 * frågan eller avvisas.
 */
function fieldSummary(field: FieldDef) {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    question: field.question,
    hint: field.hint ?? null,
    options: field.options ?? null,
    when: field.when ?? null,
  };
}

function fieldList(kind: Kind) {
  return fieldsFor(kind).map(fieldSummary);
}

/**
 * Nästa lediga användarnamn hämtas från databasfunktionen `next_username`
 * (samma regel som kontohanteringen använder) i stället för att räknas ut här.
 * Vid kollision frågar vi igen — då har databasen fått en ny rad och ger nästa
 * lediga nummer.
 */
async function nextUsername(
  admin: SupabaseClient,
  first: unknown,
  last: unknown,
): Promise<string | null> {
  const { data, error } = await admin.rpc('next_username', {
    p_first: clean(first),
    p_last: clean(last),
  });
  if (error) return null;
  const username = typeof data === 'string' ? data.trim() : '';
  return /^[a-z0-9._-]{3,32}$/.test(username) ? username : null;
}

// ================================================================
// Servern
// ================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metod tillåts inte.' }, 405);

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'okand';

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_KEY =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'Servern är inte konfigurerad.' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  const action = String(body.action ?? '');
  if (!LIMITS[action] && action !== 'answers') {
    return json({ error: 'Okänd åtgärd.' }, 400);
  }
  if (!allow(ip, action)) {
    return json({ error: 'För många försök. Vänta en stund och försök igen.' }, 429);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---------------------------------------------------------- frågelistan
  if (action === 'questions') {
    const kind = String(body.kind ?? '') as Kind;
    if (!KINDS.includes(kind)) return json({ error: 'Ogiltig kontotyp.' }, 400);
    return json({
      kind,
      fields: fieldsFor(kind).map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: f.required,
        question: f.question,
        hint: f.hint ?? null,
        options: f.options ?? null,
        when: f.when ?? null,
      })),
      termsVersion: TERMS_VERSION,
    });
  }

  // ------------------------------------------------------- starta ansökan
  if (action === 'start') {
    const kind = String(body.kind ?? '') as Kind;
    const idempotencyKey = clean(body.idempotencyKey, 80);
    if (!KINDS.includes(kind)) {
      return json({ error: 'Välj om du registrerar dig som skolelev, privat elev eller lärare.' }, 400);
    }
    if (idempotencyKey.length < 8) {
      return json({ error: 'Ogiltig förfrågan.' }, 400);
    }

    // Idempotens: samma nyckel återanvänder samma ansökan i stället för att
    // skapa en ny. Det gör att ett omladdat formulär inte ger dubbla ansökningar.
    const { data: existing } = await admin
      .from('registration_applications')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      const row = existing as Record<string, unknown>;
      const currentKind = row.kind as Kind;
      return json({
        ...publicApplication(row, currentKind),
        fields: fieldList(currentKind),
        resumed: true,
      });
    }

    const trackingCode = newTrackingCode();
    const { data: created, error: createErr } = await admin
      .from('registration_applications')
      .insert({
        tracking_code: trackingCode,
        idempotency_key: idempotencyKey,
        kind,
        status: 'utkast',
        payload: { answers: {} },
      })
      .select()
      .single();
    if (createErr || !created) {
      return json({ error: 'Kunde inte starta registreringen. Försök igen.' }, 500);
    }

    const firstQuestion = fieldsFor(kind)[0]?.question ?? '';
    await logMessage(admin, created.id, 'bot', firstQuestion);

    return json({
      trackingCode,
      kind,
      status: 'utkast',
      answers: {},
      fields: fieldList(kind),
      firstQuestion,
      termsVersion: TERMS_VERSION,
    });
  }

  // ------------------------------------------------------------- svara
  if (action === 'answer' || action === 'answers') {
    const trackingCode = clean(body.trackingCode, 80);
    if (!trackingCode) return json({ error: 'Ogiltig förfrågan.' }, 400);

    const { data: found } = await admin
      .from('registration_applications')
      .select('*')
      .eq('tracking_code', trackingCode)
      .maybeSingle();
    if (!found) return json({ error: 'Ansökan hittades inte.' }, 404);

    const row = found as Record<string, unknown>;
    const kind = row.kind as Kind;
    if (row.status === 'skapad' || row.status === 'godkand') {
      return json({ ...publicApplication(row, kind), locked: true });
    }

    const payload = (row.payload as Record<string, unknown>) ?? {};
    const answers = { ...answersFromPayload(payload) };
    // Fält som användaren medvetet hoppat över. Utan den här listan skulle ett
    // tomt frivilligt svar tas bort ur `answers`, komma tillbaka som "nästa
    // obesvarade fråga" och aldrig låta ansökan bli klar.
    const skipped = new Set<string>(
      Array.isArray(payload.skipped) ? (payload.skipped as unknown[]).map(String) : [],
    );

    const incoming: AnswerRow[] =
      action === 'answer'
        ? [{ field: String(body.field ?? ''), value: body.value }]
        : Object.entries((body.answers as Record<string, unknown>) ?? {}).map(
            ([field, value]) => ({ field, value }),
          );

    const problems: Record<string, string> = {};
    for (const item of incoming) {
      const field = fieldsFor(kind).find((f) => f.id === item.field);
      if (!field) continue;
      let value = item.value;
      if (field.type === 'text' || field.type === 'longtext') {
        value = clean(value, field.type === 'longtext' ? MAX_LONG_TEXT : MAX_SHORT_TEXT);
      } else if (field.type === 'email') {
        value = clean(value, MAX_SHORT_TEXT).toLowerCase();
      } else if (field.type === 'number') {
        value = value === '' || value === null ? null : Number(value);
      } else if (field.type === 'boolean') {
        value = value === true || value === 'true' || value === 'ja';
      } else if (field.type === 'choice') {
        const list = Array.isArray(value) ? value : [value];
        value = list.map((v) => clean(v, MAX_SHORT_TEXT)).filter(Boolean);
      }

      const problem = validateField(field, value);
      if (problem) {
        problems[field.id] = problem;
        continue;
      }
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        // Tomt svar: ett frivilligt fält är då överhoppat och ett obligatoriskt
        // hade redan stoppats av validateField ovan.
        delete answers[field.id];
        if (!field.required) skipped.add(field.id);
      } else {
        answers[field.id] = value;
        skipped.delete(field.id);
      }
    }

    if (Object.keys(problems).length > 0) {
      return json({ ok: false, problems, answers });
    }

    // Användarens svar loggas tillsammans med uppdateringen nedan, inte före:
    // det är en egen databasskrivning som annars lägger ett extra varv på
    // svarstiden för varje fråga.
    const userLog = incoming
      .map((item) => `${item.field}: ${clean(item.value, 200) || '(tomt)'}`)
      .join(', ');

    // Nästa fråga = första fältet som varken är besvarat eller överhoppat och som
    // är aktuellt just nu. Ett överhoppat frivilligt fält frågas aldrig igen.
    const relevant = appliableFields(kind, answers);
    const nextField =
      relevant.find((f) => {
        if (skipped.has(f.id)) return false;
        const value = answers[f.id];
        return value === undefined || value === null || value === '';
      }) ?? null;

    const evaluation = evaluateApplication(kind, answers);
    const allAnswered = nextField === null;

    // Frågan ställs direkt ur fältdefinitionen — inget modellanrop behövs, så
    // nästa fråga visas så snart svaret är validerat.
    const question = nextField?.question ?? '';
    const summary = buildSummary(kind, answers);

    // Loggpost och uppdatering är oberoende av varandra och körs samtidigt, så
    // svarstiden blir ett varv till databasen i stället för två.
    await Promise.all([
      question ? logMessage(admin, String(row.id), 'bot', question) : Promise.resolve(),
      userLog ? logMessage(admin, String(row.id), 'user', userLog) : Promise.resolve(),
      admin
        .from('registration_applications')
        .update({
          payload: { ...payload, answers, skipped: [...skipped] },
          risk_flags: evaluation.riskFlags,
          summary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id),
    ]);

    return json({
      ok: true,
      // Tydligt tillstånd för klienten i stället för att den gissar ur `complete`.
      state: allAnswered ? 'redo-att-skicka' : 'vantar-pa-svar',
      answers,
      // Hela frågan skickas med — inte bara id/etikett — så att klienten kan
      // rita rätt svarsfält (valsvar behöver sina alternativ).
      nextField: nextField ? fieldSummary(nextField) : null,
      question,
      complete: evaluation.complete && allAnswered,
      missingRequired: relevant
        .filter((f) => f.required && !answers[f.id])
        .map((f) => f.label),
      riskFlags: evaluation.riskFlags,
      summary,
    });
  }

  // ------------------------------------------------------------ skicka in
  if (action === 'submit') {
    const trackingCode = clean(body.trackingCode, 80);
    const password = String(body.password ?? '');
    if (!trackingCode) return json({ error: 'Ogiltig förfrågan.' }, 400);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json(
        { ok: false, problems: { password: `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.` } },
        400,
      );
    }

    const { data: found } = await admin
      .from('registration_applications')
      .select('*')
      .eq('tracking_code', trackingCode)
      .maybeSingle();
    if (!found) return json({ error: 'Ansökan hittades inte.' }, 404);

    const row = found as Record<string, unknown>;
    const kind = row.kind as Kind;
    const answers = answersFromPayload((row.payload as Record<string, unknown>) ?? {});

    // Redan skapad: svara med samma uppgifter i stället för att skapa igen.
    // Gäller även ett konto som väntar på granskning — annars skulle en dubbel
    // inskickning (dubbelklick, omförsök efter timeout) skapa ett andra konto.
    if (row.created_user_id) {
      return json({
        status: row.status,
        trackingCode,
        username: row.created_username,
        classCode: row.created_class_code,
        review: row.status === 'skapad' ? 'klar' : 'granskas',
        alreadyCreated: true,
        message:
          row.status === 'skapad'
            ? 'Kontot är redan skapat. Logga in med ditt användarnamn och lösenordet du valde.'
            : 'Kontot är redan skapat och väntar på granskning. Logga in med ditt användarnamn och lösenordet du valde.',
      });
    }
    if (row.status === 'borttagen') {
      return json(
        {
          status: 'borttagen',
          trackingCode,
          message: 'Ansökan och kontot är borttagna. Registrera dig igen om du vill komma tillbaka.',
        },
        410,
      );
    }
    if (row.status === 'nekad') {
      return json({
        status: 'nekad',
        trackingCode,
        review: 'nekad',
        message: 'Ansökan är avslutad. Kontakta skolan om du tror att det är fel.',
      });
    }

    const evaluation = evaluateApplication(kind, answers);

    // Ofullständig ansökan godkänns aldrig — inget konto skapas.
    if (!evaluation.complete) {
      await admin
        .from('registration_applications')
        .update({
          status: 'vantar',
          summary: buildSummary(kind, answers),
          bot_decision: 'ofullstandig',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      return json(
        {
          status: 'ofullstandig',
          trackingCode,
          problems: evaluation.problems,
          message: 'Ansökan är inte komplett ännu. Svara på det som saknas och försök igen.',
        },
        400,
      );
    }

    // Varningssignaler som redan sparats (från regelmotorn vid svaren).
    const storedFlags = Array.isArray(row.risk_flags) ? (row.risk_flags as string[]) : [];
    const ruleFlags = [...new Set([...evaluation.riskFlags, ...storedFlags])];

    // ---------------------------------------------------------- skapa konto
    // Valsvar sparas som en lista (ett fält kan ha flera val), så rollen läses
    // ur första värdet i stället för att jämföras med listan.
    const staffChoice = Array.isArray(answers.staffRole)
      ? String(answers.staffRole[0] ?? '')
      : String(answers.staffRole ?? '');
    const staffRole: 'lärare' | 'speciallärare' | null =
      kind === 'larare' ? (staffChoice === 'Speciallärare' ? 'speciallärare' : 'lärare') : null;
    const role = staffRole ?? 'elev';
    const accountType = kind === 'privat_elev' ? 'privat' : 'skola';
    // Registreringen frågar inte vilka delar läraren vill ha: menyn följer
    // rollen, så ett nytt konto får hela panelen direkt. Fältet sparas tomt och
    // kan sättas i efterhand av en administratör — bara kända värden kan då
    // hamna där, eftersom servern filtrerar dem.
    const features: string[] = [];

    // Boten skapar kontot direkt för alla kontotyper. Regelverkets och AI:ns
    // varningsflaggor sparas för administratörens efterhandsgranskning, men
    // begränsar aldrig kontot: ingen ska behöva vänta på ett godkännande för
    // att kunna logga in och använda Elda.

    let createdUser: { id: string; username: string } | null = null;

    // Namnet hämtas från databasens egen regel. Vid kollision (någon annan hann
    // före) frågar vi igen och får då nästa lediga nummer.
    for (let attempt = 0; attempt < 5 && !createdUser; attempt++) {
      const username = await nextUsername(admin, answers.firstName, answers.lastName);
      if (!username) break;

      // Intern e-postidentifierare — användaren loggar in med användarnamn.
      const email = `${username}@vaxverket.local`;
      const { data: created, error: userErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          username,
          role,
          active: true,
          must_change_password: false,
          // Kontotypen styr vilka klassfunktioner eleven erbjuds. Kontot
          // skapas alltid utan begränsning.
          account_type: accountType,
          limited: false,
          features,
        },
        user_metadata: {
          username,
          first_name: clean(answers.firstName),
          last_name: clean(answers.lastName),
        },
      });

      if (userErr || !created?.user) {
        const message = String(userErr?.message ?? '');
        if (/already|exists|duplicate|registered/i.test(message)) continue;
        break;
      }

      const { error: profileErr } = await admin.from('profiles').insert({
        id: created.user.id,
        username,
        role,
        active: true,
        must_change_password: false,
        first_name: clean(answers.firstName) || null,
        last_name: clean(answers.lastName) || null,
        account_type: accountType,
        organisation: kind === 'larare' ? clean(answers.organisation) || null : null,
        features,
        limited: false,
        created_by_application: row.id,
      });

      if (profileErr) {
        // Städa upp och prova nästa namn — inget halvskapat konto blir kvar.
        try {
          await admin.auth.admin.deleteUser(created.user.id);
        } catch {
          /* ignorera */
        }
        if (/duplicate|unique/i.test(String(profileErr.message ?? ''))) continue;
        break;
      }

      createdUser = { id: created.user.id, username };
    }

    if (!createdUser) {
      await admin
        .from('registration_applications')
        .update({
          status: 'misslyckad',
          summary: buildSummary(kind, answers),
          bot_decision: 'kunde-inte-skapa-konto',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      await logMessage(
        admin,
        String(row.id),
        'system',
        'Kontot kunde inte skapas. Försök igen eller kontakta skolan.',
      );
      return json(
        { status: 'misslyckad', trackingCode, message: 'Kontot kunde inte skapas. Försök igen om en stund.' },
        500,
      );
    }

    // Varningssignalerna från regelmotorn sparas för efterhandsgranskning. De
    // begränsar aldrig kontot — det är redan skapat och fullt användbart.
    const flags = ruleFlags;

    // Villkor och granskningslogg.
    await admin.from('terms_acceptances').insert({
      user_id: createdUser.id,
      version: String(row.terms_version ?? TERMS_VERSION),
    });

    // Skolelev som angav en klasskod: kontrollera att klassen finns och skapa en
    // förfrågan. Koden ger ingen åtkomst — läraren måste godkänna först.
    let joinMessage: string | null = null;
    const wantedCode = clean(answers.classCode, 12).toUpperCase();
    if (kind === 'skolelev' && wantedCode) {
      const { data: klass } = await admin
        .from('classes')
        .select('id, name')
        .eq('join_code', wantedCode)
        .eq('archived', false)
        .maybeSingle();

      if (!klass) {
        joinMessage =
          'Klasskoden hittades inte. Kontrollera den med din lärare och ansök igen inne i Elda.';
      } else {
        const { error: joinErr } = await admin.from('class_join_requests').insert({
          class_id: klass.id,
          student_id: createdUser.id,
          status: 'vantar',
        });
        joinMessage = joinErr
          ? 'Klassansökan kunde inte skickas. Försök igen inne i Elda.'
          : `Din ansökan om att gå med i ${klass.name} är skickad. Din lärare måste godkänna den.`;
        if (!joinErr) {
          await audit(admin, 'class.join_requested', 'class', String(klass.id), {
            student_id: createdUser.id,
          });
        }
      }
    }
    await audit(admin, 'account.created', 'user', createdUser.id, {
      application: row.id,
      role,
      accountType,
    });

    // Lärare som vill ha en klass får den direkt — kontot är redan aktiverat.
    let classCode: string | null = null;
    let classId: string | null = null;
    let classMessage: string | null = null;

    if (kind === 'larare' && answers.wantsClass === true) {
      const className =
        clean(answers.className) || `Klass ${clean(answers.lastName) || clean(answers.firstName)}`;
      for (let attempt = 0; attempt < 5 && !classCode; attempt++) {
        const { data: codeRow } = await admin.rpc('generate_class_code');
        const code = typeof codeRow === 'string' ? codeRow : '';
        if (!code) continue;
        const { data: classRow, error: classErr } = await admin
          .from('classes')
          .insert({
            name: className.slice(0, 80),
            description: null,
            created_by: createdUser.id,
            join_code: code,
            join_code_rotated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (classErr || !classRow) continue;
        classId = String(classRow.id);
        classCode = code;
        await admin.from('class_members').insert({
          class_id: classId,
          user_id: createdUser.id,
          member_role: 'larare',
          added_by: createdUser.id,
        });
        await audit(admin, 'class.created', 'class', classId, { application: row.id });
      }
      if (!classCode) {
        classMessage = 'Klassen kunde inte skapas nu — skapa den under Mina klasser efter inloggning.';
      }
    }

    const summary = buildSummary(kind, answers);
    await admin
      .from('registration_applications')
      .update({
        status: 'skapad',
        summary,
        risk_flags: flags,
        bot_decision: 'auto_godkand',
        decided_at: new Date().toISOString(),
        created_user_id: createdUser.id,
        created_username: createdUser.username,
        created_class_id: classId,
        created_class_code: classCode,
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    await audit(admin, 'application.auto_approved', 'application', String(row.id), {
      kind,
      flags,
    });
    await logMessage(
      admin,
      String(row.id),
      'system',
      flags.length > 0
        ? 'Kontot skapades. Boten flaggade något i ansökan för efterhandsgranskning.'
        : 'Kontot skapades och godkändes automatiskt av boten.',
    );

    // Kontot är skapat och fullt användbart. Varningsflaggor påverkar inte
    // inloggningen; de finns kvar för admin.
    return json({
      status: 'skapad',
      trackingCode,
      username: createdUser.username,
      role,
      accountType,
      classCode,
      classMessage,
      joinMessage,
      review: 'auto',
      riskFlags: flags,
      reviewReason: null,
      state: 'klart',
      canDownload: true,
      message: 'Klart! Logga in med ditt användarnamn och lösenordet du valde.',
    });
  }

  // --------------------------------------------------------------- status
  if (action === 'status') {
    const trackingCode = clean(body.trackingCode, 80);
    if (!trackingCode) return json({ error: 'Ogiltig förfrågan.' }, 400);

    const { data: found } = await admin
      .from('registration_applications')
      .select('*')
      .eq('tracking_code', trackingCode)
      .maybeSingle();
    if (!found) return json({ error: 'Ansökan hittades inte.' }, 404);

    const row = found as Record<string, unknown>;
    const kind = row.kind as Kind;
    const answers = answersFromPayload((row.payload as Record<string, unknown>) ?? {});
    const status = String(row.status ?? 'utkast');

    const message =
      status === 'skapad'
        ? 'Kontot är skapat. Logga in med ditt användarnamn och lösenordet du valde.'
        : status === 'vantar'
          ? 'Ansökan väntar på granskning. Du får svar av skolan.'
          : status === 'nekad'
            ? 'Ansökan är avslutad. Kontakta skolan om du undrar varför.'
            : status === 'misslyckad'
              ? 'Något gick fel när kontot skulle skapas. Försök igen.'
              : 'Ansökan är påbörjad men inte inskickad.';

    // Nedladdning kräver ett godkänt, aktivt konto — samma regel som
    // nedladdningsfunktionen tillämpar. Statusrutan kan därför visa rätt läge
    // utan att själv gissa.
    let canDownload = false;
    if (row.created_user_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('active, limited, role')
        .eq('id', row.created_user_id)
        .maybeSingle();
      canDownload = Boolean(
        profile && profile.active === true && profile.limited !== true && profile.role !== 'admin',
      );
    }

    return json({
      status,
      trackingCode,
      kind,
      username: row.created_username ?? null,
      classCode: row.created_class_code ?? null,
      riskFlags: row.risk_flags ?? [],
      summary: row.summary ?? buildSummary(kind, answers),
      message,
      canContinue: status === 'utkast',
      canDownload,
    });
  }

  return json({ error: 'Okänd åtgärd.' }, 400);
});
