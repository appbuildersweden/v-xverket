// Växverket — ai-chat
// Skyddad AI-funktion. Anropandens session och roll verifieras serversidigt,
// och OpenRouter-nyckeln läses ur Supabase Secrets (aldra aldrig i klienten).
//
// Deploy:  supabase functions deploy ai-chat
// Hemlighet: supabase secrets set OPENROUTER_API_KEY=...   (redan gjord)

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Modellen kan ändras i Supabase utan ny deploy:
//   supabase secrets set OPENROUTER_MODEL=openai/gpt-4o-mini
// Standarden nedan är en fri modell som fungerar utan köpta krediter på
// OpenRouter. Byt till en betalmodell genom att sätta samma hemlighet.
const DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

// Bara fria modeller används — appen ska kunna hjälpa elever utan köpta
// krediter. Om en modell är långsam, upptagen eller ger fel Provas nästa
// automatiskt, så att användaren sällan ser ett fel.
const FREE_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-26b-a4b-it:free',
  'liquid/lfm-2.5-2.6b:free',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ett fel som användaren kan förstå och agera på.
 *
 * Skillnaden mellan "tjänsten har mycket att göra" och "gratiskvoten är slut"
 * spelar roll: det första går över av sig självt, det andra gör att appen
 * fortsätter att misslyckas tills kvoten fylls på. Därför får svaret både en
 * läsbar text och en maskinläsbar kod, så att gränssnittet kan säga som det är
 * i stället för ett allmänt fel. Koden avslöjar inga nycklar eller kontouppgifter.
 */
type AiErrorCode =
  | 'ai-kvot-slut'
  | 'ai-krediter-saknas'
  | 'ai-modell-saknas'
  | 'ai-otillganglig'
  | 'ai-avvisad'
  | 'ai-svar-saknas';

interface AiError {
  code: AiErrorCode;
  message: string;
  /** HTTP-status till klienten. */
  status: number;
}

function aiError(status: number): AiError {
  if (status === 401 || status === 403) {
    return {
      code: 'ai-avvisad',
      message: 'AI-tjänsten avvisade anropet. Kontakta administratören.',
      status: 502,
    };
  }
  if (status === 402) {
    return {
      code: 'ai-krediter-saknas',
      message:
        'AI-hjälpen fungerar inte just nu: AI-tjänsten saknar krediter. Kontakta administratören i stället för att försöka igen.',
      status: 503,
    };
  }
  if (status === 404) {
    return {
      code: 'ai-modell-saknas',
      message:
        'AI-modellen är inte tillgänglig just nu. Det påverkar alla inloggade, så försök gärna igen senare.',
      status: 503,
    };
  }
  if (status === 429) {
    return {
      code: 'ai-kvot-slut',
      message:
        'AI-hjälpen kan inte svara just nu: gratiskvoten för AI-tjänsten är slut. Det går över när kvoten fylls på — du behöver inte skriva om din fråga, utan kan försöka igen senare.',
      status: 503,
    };
  }
  if (status >= 500 || status === 0) {
    return {
      code: 'ai-otillganglig',
      message: 'AI-tjänsten är tillfälligt inte tillgänglig. Försök igen om en stund.',
      status: 502,
    };
  }
  return {
    code: 'ai-svar-saknas',
    message: 'AI-tjänsten kunde inte svara. Försök igen.',
    status: 502,
  };
}

/** Skickar ett AI-fel till klienten med både text och kod. */
function aiErrorResponse(error: AiError): Response {
  return json({ error: error.message, code: error.code }, error.status);
}

// Storleksgränser — skyddar mot onödigt stora förfrågningar.
const MAX_INPUT_CHARS = 8000;
const MAX_HISTORY = 20;

// Missbruksskydd per ANVÄNDARE (aldrig per IP — flera elever kan dela samma
// skol-IP och skulle då slå ut varandra). Generöst så att en normal elev
// aldrig ska träffa gränsen.
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 60;
const hits = new Map<string, { count: number; reset: number }>();

function allow(key: string): boolean {
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now > e.reset) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (e.count >= MAX_REQUESTS) return false;
  e.count += 1;
  return true;
}

// ----------------------------------------------------------------
// Rollspecifika instruktioner
// ----------------------------------------------------------------

const COMMON = [
  'Du är Eldas AI-assistent.',
  'Svara alltid på svenska om användaren skriver svenska, och på användarens språk i övrigt.',
  'Använd enkel, tydlig text. Använd markdown med rubriker (##), punktlistor och fetstil där det hjälper läsbarheten.',
  'Skriv kod i kodblock som börjar och slutar med tre tillbakatecken när kod behövs.',
  'Svara aldrig med uppdiktade fakta. Om du är osäker, säg det.',
].join('\n');

const ROLE_PROMPTS: Record<string, string> = {
  elev: `
Du är AI-studiehjälpen för en elev i svensk skola.
Din uppgift är att HJÄLPA ELEVEN ATT FÖRSTÅ — inte att skriva läxor åt henom.

Arbetssätt:
- Förklara skolämnen STEG FÖR STEG med korta, logiska steg.
- Anpassa språk och djup efter elevens årskurs och kunskapsnivå om eleven
  anger den (t.ex. "jag går i årskurs 7"). Är nivån okänd, håll språket
  enkelt och fråga vid behov.
- Ge LEDTRÅDAR och ställ frågor som leder eleven till svaret i stället för
  att ge det färdiga läxsvaret direkt.
- Om eleven uttryckligen ber om ett färdigt svar, eller om det är uppenbart att
  hen behöver mer konkret hjälp, ge ett tydligt och komplett svar.
- Förklara vad eleven gjort fel när hen begär hjälp med ett fel svar, och visa
  ett liknande exempel hur man löser det.
- Hjälp med provträning, repetition och övningsfrågor: ställ gärna egna
  övningsfrågor och rätta eleven konstruktivt.
- Behåll samtalets sammanhang så att eleven enkelt kan ställa följdfrågor.
- Om eleven ber om ett dokument — till exempel en sammanfattning, ett
  övningsblad eller en egen studieplan — skapar du innehållet enligt
  dokumentschemat nedan. Skriv dokument som hjälper eleven att lära sig.

Skriv inte längre svar än vad frågan kräver.
`,
  lärare: `
Du är AI-assistenten för en lärare i svensk skola.
Du hjälper med det pedagogiska arbetet i klassrummet.

Du hjälper till med:
- Lektionsplanering, upplägg och tidsdisposition.
- Uppgifter, arbetsblad och övningar med facit där det passar.
- Anpassning av material efter elevers olika kunskapsnivåer.
- Bedömningsstöd och förslag på återkoppling till elever.
- Sammanfattning och omarbetning av material som läraren själv tar fram.
- Föräldrainformation och korta texter till klassen.

När du skapar dokument: leverera INNEHÅLLET som giltig JSON enligt schema nedan.
Använd realistiska, praktiska förslag för svensk skola.
`,
  speciallärare: `
Du är AI-assistenten för en svensk speciallärare.
Du hjälper med det pedagogiska arbetet.

Du hjälper till med:
- Arbetsplanering och att-göra-listor.
- Lektionsplanering och kreativa pedagogiska idéer.
- Arbetsblad, övningar och undervisningsmaterial.
- Anpassning av material efter elevers olika kunskapsnivåer och behov.
- Sammanfattning och omarbetning av material som specialläraren själv tar fram.
- Förslag på uppföljning av undervisning och arbetsuppgifter.

När du skapar dokument: leverera INNEHÅLLET som giltig JSON enligt schema nedan.
Använd realistiska, praktiska och direkt användbara förslag för svensk skola.
`,
  admin: `
Du är AI-assistenten för en administratör på svensk skola.

Du hjälper till med:
- Administrativ planering och organisation.
- Skapa informationsmaterial, instruktioner och meddelanden.
- Sammanställa och strukturera texter.
- Förklara hur Elda fungerar (roller: elev, speciallärare, admin).
- Administrativa uppgifter utifrån information administratören har tillgång till.

VIKTIGT: Du får ALDRIG utföra eller simulera ändringar av konton, roller eller
behörigheter. Om administratören ber dig att ändra något sådant, förklara att
det görs via appens befintliga skyddade funktioner under Användare och Roller.

När du skapar dokument: leverera INNEHÅLLET som giltig JSON enligt schema nedan.
`,
};

// Dokumentformaten appen kan skapa. Klienten skickar docKind; saknas den
// används Word (samma beteende som den äldre klienten som bara skickade wantDoc).
const DOC_KINDS = ['word', 'excel', 'powerpoint'] as const;
type DocKind = (typeof DOC_KINDS)[number];

function normalizeDocKind(value: unknown): DocKind {
  return typeof value === 'string' && (DOC_KINDS as readonly string[]).includes(value)
    ? (value as DocKind)
    : 'word';
}

const DOC_SCHEMAS: Record<DocKind, string> = {
  word: `
När användaren ber dig skapa ett Word-dokument svarar du INTE med fritext utan
endast med ett giltigt JSON-objekt (utan kodblock, utan annan text) i detta schema:

{
  "title": "Dokumentets rubrik",
  "subtitle": "Kort underrubrik eller datumrad (valfritt)",
  "sections": [
    {
      "heading": "Rubrik",
      "paragraphs": ["Stycke 1", "Stycke 2"],
      "bullets": ["Punkt 1", "Punkt 2"]
    }
  ]
}

Regler:
- Använd 2–6 sektioner. Lämna arrayer tomma om de inte behövs.
- Skriv allt innehåll på svenska.
- Texten ska vara färdig att använda, inte platshållare.
`,
  excel: `
När användaren ber dig skapa en Excel-arbetsbok svarar du INTE med fritext utan
endast med ett giltigt JSON-objekt (utan kodblock, utan annan text) i detta schema:

{
  "title": "Arbetsbokens namn",
  "sheets": [
    {
      "name": "Bladets namn (max 31 tecken)",
      "columns": ["Kolumnrubrik 1", "Kolumnrubrik 2"],
      "rows": [["Text", 12], ["Text", 34]]
    }
  ]
}

Regler:
- Använd 1–5 blad. Varje blad har 1–20 kolumner och högst 200 rader.
- Varje rad måste ha exakt lika många värden som "columns".
- Tal skrivs som JSON-nummer (12), inte som text ("12").
- Kolumnrubriker och innehåll skrivs på svenska och ska vara färdiga att använda.
`,
  powerpoint: `
När användaren ber dig skapa en PowerPoint-presentation svarar du INTE med
fritext utan endast med ett giltigt JSON-objekt (utan kodblock, utan annan text)
i detta schema:

{
  "title": "Presentationens titel",
  "subtitle": "Underrubrik på titelbladet (valfritt)",
  "slides": [
    {
      "title": "Rubrik på bilden",
      "bullets": ["Punkt 1", "Punkt 2"],
      "notes": "Anteckning till talaren (valfritt)"
    }
  ]
}

Regler:
- Använd 3–12 bilder. Högst 8 punkter per bild och högst 200 tecken per punkt.
- Skriv korta punkter, inte hela stycken.
- Skriv allt innehåll på svenska och gör det färdigt att använda direkt.
`,
};

// Skickas som sista användarmeddelandet när ett dokument bestäms. Modellen
// måste hållas till JSON-schemat — annan kan den återge konversationstext
// som JSON utan obligatoriska delar, och dokumentet blir ogiltigt.
const DOC_REMINDERS: Record<DocKind, string> = {
  word: [
    'Skapa dokumentet nu.',
    'Svara ENDAST med ett JSON-objekt utan kodblock och utan annan text.',
    'Objektet måste ha exakt nycklarna "title" (string), "subtitle" (string) och "sections" (array).',
    '"sections" är obligatorisk och ska innehålla 2–6 objekt med "heading", "paragraphs" och "bullets".',
    'Skriv allt innehåll på svenska och gör det färdigt att använda direkt.',
  ].join('\n'),
  excel: [
    'Skapa arbetsboken nu.',
    'Svara ENDAST med ett JSON-objekt utan kodblock och utan annan text.',
    'Objektet måste ha exakt nycklarna "title" (string) och "sheets" (array).',
    '"sheets" ska innehålla 1–5 objekt med "name", "columns" och "rows"; varje rad har lika många värden som "columns".',
    'Skriv allt innehåll på svenska och gör det färdigt att använda direkt.',
  ].join('\n'),
  powerpoint: [
    'Skapa presentationen nu.',
    'Svara ENDAST med ett JSON-objekt utan kodblock och utan annan text.',
    'Objektet måste ha exakt nycklarna "title" (string), "subtitle" (string) och "slides" (array).',
    '"slides" ska innehålla 3–12 objekt med "title", "bullets" och "notes".',
    'Skriv allt innehåll på svenska och gör det färdigt att använda direkt.',
  ].join('\n'),
};

// ----------------------------------------------------------------
// Huvudfunktion
// ----------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Metod tillåts inte.' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_KEY =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    '';
  const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
  const MODEL = Deno.env.get('OPENROUTER_MODEL') || DEFAULT_MODEL;

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return json({ error: 'Servern är inte konfigurerad.' }, 500);
  }

  // Verifiera sessionen på serversidan.
  const token =
    req.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      .trim() ?? '';
  if (!token) {
    return json({ error: 'Inloggning krävs.' }, 401);
  }
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller, error: callerErr } = await anon.auth.getUser(token);
  if (callerErr || !caller?.user) {
    return json({ error: 'Din session är ogiltig eller utgången.' }, 401);
  }

  // Inaktiverade konton får inte använda AI.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: prof } = await admin
    .from('profiles')
    .select('active, must_change_password')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (prof && prof.active === false) {
    return json({ error: 'Kontot är inaktiverat.' }, 403);
  }
  // Tvingat lösenordsbyte genomdrivs även här på serversidan, så att steget
  // inte kan hoppas över genom att anropa AI-tjänsten direkt.
  if (prof?.must_change_password === true) {
    return json(
      { error: 'Du måste skapa ett nytt lösenord innan du kan använda AI-hjälpen.' },
      403,
    );
  }

  // Bara appens personal- och elevroller får använda AI:n. Läraren har samma
  // assistent som specialläraren (menyn erbjuder den), och adminrollen får
  // aldrig något annat än den administrativa assistenten — ingen roll kan
  // skickas in från klienten.
  const role = caller.user.app_metadata?.role;
  const allowed = ['elev', 'lärare', 'speciallärare', 'admin'];
  if (typeof role !== 'string' || !allowed.includes(role)) {
    return json({ error: 'Din roll får inte använda AI-funktionen.' }, 403);
  }

  // Missbruksskydd per användare — först efter att sessionen är verifierad,
  // så att flera elever med samma IP aldrig stänger ute varandra.
  if (!allow(caller.user.id)) {
    return json(
      { error: 'För många förfrågningar just nu. Vänta en minut och försök igen.' },
      429,
    );
  }

  if (!OPENROUTER_KEY) {
    return json(
      {
        error:
          'AI-tjänsten är inte konfigurerad. OPENROUTER_API_KEY saknas som hemlighet.',
      },
      503,
    );
  }

  let body: {
    messages?: Array<{ role?: string; content?: string }>;
    wantDoc?: boolean;
    docKind?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  // wantDoc finns kvar för den äldre klienten. docKind talar om vilket format
  // användaren valde; den räknas också som en dokumentbegäran.
  const docKind = normalizeDocKind(body.docKind);
  const wantDoc = body.wantDoc === true || body.docKind !== undefined;

  const messages = raw
    .filter((m) => m && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: (m.content as string).slice(0, MAX_INPUT_CHARS),
    }))
    .filter((m) => m.content.trim().length > 0);

  if (messages.length === 0) {
    return json({ error: 'Skriv en fråga först.' }, 400);
  }

  if (wantDoc) {
    messages.push({ role: 'user', content: DOC_REMINDERS[docKind] });
  }

  const system = `${COMMON}\n\n${ROLE_PROMPTS[role]}${
    wantDoc ? `\n\n${DOC_SCHEMAS[docKind]}` : ''
  }`;

  // Ordning: den valda modellen först, därefter fria reservmodeller.
  const candidates = [...new Set([MODEL, ...FREE_MODELS])].slice(0, 4);
  let lastStatus = 0;

  try {
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          // OpenRouter ber om dessa för att visa appen i deras lista.
          'HTTP-Referer': SUPABASE_URL,
          'X-Title': 'Elda',
        },
        body: JSON.stringify({
          model,
          // När dokument begärs måste svaret vara ren JSON.
          temperature: wantDoc ? 0.4 : 0.7,
          response_format: wantDoc ? { type: 'json_object' } : undefined,
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content: string = data?.choices?.[0]?.message?.content ?? '';
        if (content.trim()) {
          return json(wantDoc ? { content, model, docKind } : { content, model });
        }
        lastStatus = 502;
      } else {
        lastStatus = res.status;
        const detail = await res.text().catch(() => '');
        console.error('OpenRouter-fel', res.status, model, detail.slice(0, 300));
        // Endast autentiseringsfel är omöjligt att lösa med en annan modell.
        // Okänt modell-ID svaras med 400 av OpenRouter — det måste alltid
        // falla tillbaka till nästa fria modell, annars dör anropet.
        if (res.status === 401 || res.status === 403) {
          return aiErrorResponse(aiError(res.status));
        }
      }

      // Nästa modell om denna var långsam, upptagen eller upptagen.
      if (i < candidates.length - 1) await sleep(250);
    }

    return aiErrorResponse(aiError(lastStatus));
  } catch (err) {
    console.error('AI-anrop misslyckades', err);
    return json(
      { error: 'Kunde inte nå AI-tjänsten. Kontrollera anslutningen.' },
      502,
    );
  }
});
