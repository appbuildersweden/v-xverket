/**
 * AI-klient.
 *
 * Anropar den skyddade Supabase-funktionen `ai-chat`. Nyckeln till AI-tjänsten
 * finns bara som hemlighet på servern — ingenting här exponerar den, och
 * funktionen verifierar både session och roll innan den svarar.
 *
 * Är tjänsten inte konfigurerad svarar servern med ett tydligt meddelande
 * (503). Det visas för användaren precis som det är — appen hittar aldrig på ett
 * AI-svar.
 *
 * Dokument skapas i två steg: först ber klienten AI:n om strukturerat innehåll
 * enligt ett schema per filformat, sedan tolkas och gränskontrolleras svaret
 * här, och först därefter byggs en riktig .docx-, .xlsx- eller .pptx-fil (se
 * `office.ts`). Trasig eller ofullständig JSON ger ett tydligt felmeddelande i
 * stället för en tom eller påhittad fil.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Result, withClient } from './db';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const MAX_TURNS = 20;
export const MAX_QUESTION_LENGTH = 8000;

export const AI_STARTERS: readonly string[] = [
  'Förklara det här steg för steg',
  'Ge mig ett liknande exempel',
  'Vad har jag gjort fel här?',
];

/** Kort hjälprad per roll, så att chatten känns rätt från början. */
export function aiIntro(
  panel: 'elev' | 'privat' | 'larare' | 'speciallarar' | 'admin',
): string {
  if (panel === 'elev') {
    return 'Jag hjälper dig att förstå skolarbetet — steg för steg, på din nivå. Skriv din fråga så tar vi den tillsammans.';
  }
  if (panel === 'privat') {
    return 'Jag är din studiehjälp — jag förklarar steg för steg och anpassar mig efter din nivå. Skriv vad du vill förstå bättre.';
  }
  if (panel === 'larare') {
    return 'Jag hjälper dig med planering, uppgifter, lektionsidéer och att anpassa material till olika nivåer.';
  }
  if (panel === 'speciallarar') {
    return 'Jag hjälper dig med planering, lektionsidéer, arbetsblad och att anpassa material till olika nivåer.';
  }
  return 'Jag hjälper dig med administration, texter och struktur. Konton och behörigheter ändras i appens skyddade funktioner.';
}

export function validateQuestion(text: string): string | null {
  if (!text.trim()) return 'Skriv en fråga först.';
  if (text.length > MAX_QUESTION_LENGTH) {
    return `Frågan är för lång (max ${MAX_QUESTION_LENGTH} tecken).`;
  }
  return null;
}

// ----------------------------------------------------------------
// Dokumentformat
// ----------------------------------------------------------------

export type DocKind = 'word' | 'excel' | 'powerpoint' | 'text' | 'pdf';

export const DOC_KINDS: readonly DocKind[] = ['word', 'excel', 'powerpoint', 'text', 'pdf'];

/** Namnet användaren ser i gränssnittet. */
export const DOC_KIND_LABELS: Readonly<Record<DocKind, string>> = {
  word: 'Word-dokument',
  excel: 'Excel-arbetsbok',
  powerpoint: 'PowerPoint-presentation',
  text: 'Textfil',
  pdf: 'PDF',
};

/** Filändelsen för respektive format, utan punkt. */
export const DOC_KIND_EXT: Readonly<Record<DocKind, string>> = {
  word: 'docx',
  excel: 'xlsx',
  powerpoint: 'pptx',
  text: 'txt',
  pdf: 'pdf',
};

/** Kort beskrivning av vad AI:n gör i varje format. */
export const DOC_KIND_HINTS: Readonly<Record<DocKind, string>> = {
  word: 'Till exempel en sammanfattning, en instruktion eller ett arbetsblad.',
  excel: 'Till exempel en matris, en närvarolista eller en planeringstabell.',
  powerpoint: 'Till exempel en genomgång med en bild per moment.',
  text: 'Exempelvis elevens egna anteckningar eller en sammanfattning av innehållet.',
  pdf: 'Exempelvis elevens egna anteckningar eller en sammanfattning av innehållet.',
};

export interface WordSection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

export interface ExcelSheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface SlideSpec {
  title: string;
  bullets: string[];
  notes: string | null;
}

export interface WordDoc {
  kind: 'word';
  title: string;
  subtitle: string | null;
  sections: WordSection[];
}

export interface ExcelDoc {
  kind: 'excel';
  title: string;
  sheets: ExcelSheet[];
}

export interface PptxDoc {
  kind: 'powerpoint';
  title: string;
  subtitle: string | null;
  slides: SlideSpec[];
}

export type OfficeDoc = WordDoc | ExcelDoc | PptxDoc;

/**
 * Gränser för vad ett dokument får innehålla. De skyddar mot svar som är för
 * stora för att bli användbara (och mot att en fil blir orimligt tung).
 */
export const DOC_LIMITS = {
  sections: 12,
  paragraphsPerSection: 20,
  bulletsPerSection: 40,
  sheets: 5,
  columnsPerSheet: 20,
  rowsPerSheet: 200,
  slides: 20,
  bulletsPerSlide: 8,
  text: 2000,
  cell: 200,
  title: 120,
  sheetName: 31,
} as const;

function cleanText(value: unknown, max: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanLongText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function stringList(value: unknown, max: number, each: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanText(entry, each))
    .filter((entry) => entry.length > 0)
    .slice(0, max);
}

function titleOf(value: unknown, fallback: string): string {
  return cleanText(value, DOC_LIMITS.title) || fallback;
}

/** Plockar fram JSON-objektet ur svaret, även om modellen la det i ett kodblock. */
function parseObject(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toWordDoc(data: Record<string, unknown>): WordDoc | null {
  if (!Array.isArray(data.sections)) return null;

  const sections: WordSection[] = [];
  for (const raw of data.sections) {
    if (!raw || typeof raw !== 'object') continue;
    const source = raw as Record<string, unknown>;
    const section: WordSection = {
      heading: cleanText(source.heading, DOC_LIMITS.text),
      paragraphs: stringList(
        source.paragraphs,
        DOC_LIMITS.paragraphsPerSection,
        DOC_LIMITS.text,
      ),
      bullets: stringList(source.bullets, DOC_LIMITS.bulletsPerSection, DOC_LIMITS.text),
    };
    if (section.heading || section.paragraphs.length || section.bullets.length) {
      sections.push(section);
    }
    if (sections.length >= DOC_LIMITS.sections) break;
  }

  if (sections.length === 0) return null;

  return {
    kind: 'word',
    title: titleOf(data.title, 'Dokument'),
    subtitle: cleanText(data.subtitle, DOC_LIMITS.text) || null,
    sections,
  };
}

function toExcelDoc(data: Record<string, unknown>): ExcelDoc | null {
  if (!Array.isArray(data.sheets)) return null;

  const sheets: ExcelSheet[] = [];
  for (const raw of data.sheets) {
    if (!raw || typeof raw !== 'object') continue;
    const sheet = raw as Record<string, unknown>;
    const columns = stringList(
      sheet.columns,
      DOC_LIMITS.columnsPerSheet,
      DOC_LIMITS.cell,
    );
    if (columns.length === 0) continue;

    const rows: (string | number)[][] = [];
    if (Array.isArray(sheet.rows)) {
      for (const rawRow of sheet.rows) {
        if (!Array.isArray(rawRow)) continue;
        const row: (string | number)[] = [];
        for (const cell of rawRow.slice(0, columns.length)) {
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            row.push(cell);
          } else {
            row.push(cleanText(cell, DOC_LIMITS.cell));
          }
        }
        // Raden fylls ut så att den alltid matchar kolumnrubrikerna.
        while (row.length < columns.length) row.push('');
        rows.push(row);
        if (rows.length >= DOC_LIMITS.rowsPerSheet) break;
      }
    }

    const name =
      cleanText(sheet.name, DOC_LIMITS.sheetName) || `Blad ${sheets.length + 1}`;
    sheets.push({ name, columns, rows });
    if (sheets.length >= DOC_LIMITS.sheets) break;
  }

  if (sheets.length === 0) return null;

  return { kind: 'excel', title: titleOf(data.title, 'Arbetsbok'), sheets };
}

function toPptxDoc(data: Record<string, unknown>): PptxDoc | null {
  if (!Array.isArray(data.slides)) return null;

  const slides: SlideSpec[] = [];
  for (const raw of data.slides) {
    if (!raw || typeof raw !== 'object') continue;
    const slide = raw as Record<string, unknown>;
    const bullets = stringList(slide.bullets, DOC_LIMITS.bulletsPerSlide, DOC_LIMITS.text);
    const title = cleanText(slide.title, DOC_LIMITS.text);
    if (!title && bullets.length === 0) continue;

    slides.push({
      title: title || `Bild ${slides.length + 1}`,
      bullets,
      notes: cleanLongText(slide.notes, DOC_LIMITS.text) || null,
    });
    if (slides.length >= DOC_LIMITS.slides) break;
  }

  if (slides.length === 0) return null;

  return {
    kind: 'powerpoint',
    title: titleOf(data.title, 'Presentation'),
    subtitle: cleanText(data.subtitle, DOC_LIMITS.text) || null,
    slides,
  };
}

/**
 * Tolkar AI:ns svar till ett dokumentinnehåll. Returnerar null om svaret inte
 * följer schemat — då försöker `askAiForDoc` en gång till.
 */
export function parseOfficeDoc(kind: DocKind, raw: string): OfficeDoc | null {
  const data = parseObject(raw);
  if (!data) return null;
  if (kind === 'word') return toWordDoc(data);
  if (kind === 'excel') return toExcelDoc(data);
  return toPptxDoc(data);
}

/** Instruktionen som skickas om AI:ns första svar inte gick att använda. */
export function docRetryInstruction(kind: DocKind): string {
  if (kind === 'excel') {
    return 'Det svaret kunde inte användas som en arbetsbok. Försök igen och svara endast med ett JSON-objekt med nycklarna "title" och "sheets" (1–5 objekt med "name", "columns" och "rows", där varje rad har lika många värden som "columns"). Ingen annan text och inget kodblock.';
  }
  if (kind === 'powerpoint') {
    return 'Det svaret kunde inte användas som en presentation. Försök igen och svara endast med ett JSON-objekt med nycklarna "title", "subtitle" och "slides" (3–12 objekt med "title", "bullets" och "notes"). Ingen annan text och inget kodblock.';
  }
  return 'Det svaret kunde inte användas som ett dokument. Försök igen och svara endast med ett JSON-objekt med nycklarna "title", "subtitle" och "sections" (2–6 objekt med "heading", "paragraphs" och "bullets"). Ingen annan text och inget kodblock.';
}

// ----------------------------------------------------------------
// Anrop
// ----------------------------------------------------------------

/**
 * Förklaringar till serverns felkoder, när hela AI-tjänsten ligger nere.
 *
 * Skillnaden mellan ett tillfälligt fel och en uttömd kvot avgör vad eleven ska
 * göra: en kvot som är slut går inte att lösa genom att skriva om frågan, och
 * då ska appen säga det i stället för "försök igen".
 */
export const AI_SERVICE_ERRORS: Record<string, string> = {
  'ai-kvot-slut':
    'AI-hjälpen kan inte svara just nu: gratiskvoten för AI-tjänsten är slut. Det går inte att lösa genom att skriva om frågan — försök igen senare, eller fråga din lärare.',
  'ai-krediter-saknas':
    'AI-hjälpen är avstängd tills administratören fyller på AI-tjänstens krediter. Kontakta din lärare eller administratör.',
  'ai-otillganglig':
    'AI-tjänsten är tillfälligt otillgänglig. Försök igen om en liten stund.',
  'ai-modell-saknas':
    'AI-modellen är inte tillgänglig just nu. Försök igen senare.',
};

/** Sant när texten handlar om att hela AI-tjänsten ligger nere (inte om frågan). */
export function isAiServiceError(message: string): boolean {
  return Object.values(AI_SERVICE_ERRORS).includes(message);
}

/** Väljer texten för ett fel från servern: känd kod först, annars serverns text. */
export function aiServiceMessage(body: unknown): string | null {
  const data = body as { error?: unknown; code?: unknown } | null;
  const code = typeof data?.code === 'string' ? data.code : '';
  if (code && AI_SERVICE_ERRORS[code]) return AI_SERVICE_ERRORS[code];
  if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
  return null;
}

/** Läser serverns felmeddelande ur en misslyckad funktionsinbindning. */
async function readError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json();
      const message = aiServiceMessage(body);
      if (message) return message;
    } catch {
      /* fortsätt med standardmeddelandet */
    }
    const status = error.context?.status;
    if (status === 401) return 'Din session är ogiltig eller utgången. Logga in igen.';
    if (status === 403) return 'Din roll får inte använda AI-funktionen.';
    if (status === 429) return 'För många frågor just nu. Vänta en minut och försök igen.';
    return 'AI-tjänsten svarade inte. Försök igen om en stund.';
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/fetch|network|failed to send|load failed/i.test(message)) {
    return 'Kunde inte nå AI-tjänsten. Kontrollera anslutningen.';
  }
  return message || 'AI-tjänsten kunde inte svara. Försök igen.';
}

/** Skickar konversationen till servern och returnerar svarets text. */
async function callAi(
  history: readonly ChatTurn[],
  extra: Record<string, unknown>,
): Promise<Result<string>> {
  return withClient(async (sup) => {
    const trimmed = history
      .slice(-MAX_TURNS)
      .filter((turn) => turn.content.trim().length > 0)
      .map((turn) => ({
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        content: turn.content.slice(0, MAX_QUESTION_LENGTH),
      }));

    if (trimmed.length === 0) throw new Error('Skriv en fråga först.');

    const { data: sessionData } = await sup.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup.functions.invoke('ai-chat', {
      headers: { Authorization: `Bearer ${token}` },
      body: { messages: trimmed, ...extra },
    });

    if (error) throw new Error(await readError(error));

    const content = (data as { content?: unknown } | null)?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('AI-tjänsten returnerade ett tomt svar. Försök igen.');
    }
    return content;
  });
}

/** Skickar konversationen och får ett textsvar. */
export async function askAi(history: readonly ChatTurn[]): Promise<Result<string>> {
  return callAi(history, {});
}

/**
 * Ber AI:n skapa ett dokument och tolkar svaret enligt formatets schema.
 * Ett svar som inte går att använda försöks en gång till; därefter visas ett
 * tydligt fel i stället för en trasig fil.
 */
export async function askAiForDoc(
  history: readonly ChatTurn[],
  kind: DocKind,
): Promise<Result<OfficeDoc>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: ChatTurn[] =
      attempt === 0
        ? [...history]
        : [...history, { role: 'user', content: docRetryInstruction(kind) }];

    const result = await callAi(messages, { docKind: kind });
    if (!result.ok) return result;

    // Text och PDF hanteras som kontext i chatten, inte som dokument att bygga.
    // Returnera ett stringsvar som chatten kan visa som kontext.
    if (kind === 'text' || kind === 'pdf') {
      if (typeof result.data === 'string' && result.data.trim().length > 0) {
        return { ok: true, data: {} as OfficeDoc };
      }
      return { ok: false, error: 'AI:n returnerade tomt svar för text/PDF-kontext.' };
    }

    const doc = parseOfficeDoc(kind, result.data);
    if (doc) return { ok: true, data: doc };
  }

  return {
    ok: false,
    error:
      'AI:n kunde inte skapa ett användbart dokument den här gången. Beskriv lite tydligare vad dokumentet ska innehålla och försök igen.',
  };
}
