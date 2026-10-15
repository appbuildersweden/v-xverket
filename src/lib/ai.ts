// Växverket — AI-klient.
// Anropar den skyddade Edge Functionen ai-chat. Inga API-nycklar finns här —
// OpenRouter-nyckeln finns bara som Supabase-hemlighet på serversidan.

import { getOrCreateSupabaseClient } from './auth-supabase';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Strukturerat dokumentinnehåll som AI:n returnerar för Word-generering. */
export interface DocSection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

export interface DocContent {
  title: string;
  subtitle?: string;
  sections: DocSection[];
}

export type AiResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export type DocResult =
  | { ok: true; doc: DocContent }
  | { ok: false; error: string };

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    // Supabase skickar ibland JSON-fel där funktionens meddelande finns.
    const m = /"error"\s*:\s*"([^"]+)"/.exec(err.message);
    if (m) return m[1];
    if (!/fetch|network|failed|FunctionInvokeError/i.test(err.message)) {
      return err.message;
    }
  }
  return fallback;
}

async function invoke(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const sup = getOrCreateSupabaseClient();

  // Skicka alltid en explicit token. Saknas sessionen får användaren ett
  // tydligt och åtgärdbart fel i stället för en missvisande serverfeltext.
  const { data: sd } = await sup.auth.getSession();
  const token = sd?.session?.access_token;
  if (!token) {
    return {
      ok: false,
      error:
        'Du har blivit utloggad. Logga in igen så fortsätter du där du slutade.',
    };
  }

  const { data, error } = await sup.functions.invoke('ai-chat', {
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (error) {
    const { FunctionsHttpError } = await import('@supabase/supabase-js');
    if (error instanceof FunctionsHttpError) {
      let detail: { error?: string } | null = null;
      try {
        detail = await error.context.clone().json();
      } catch {
        detail = null;
      }
      return {
        ok: false,
        error:
          detail?.error ??
          'AI-tjänsten svarade inte. Försök igen om en stund.',
      };
    }
    return {
      ok: false,
      error: messageFrom(error, 'Kunde inte nå AI-tjänsten.'),
    };
  }
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}

/** Skicka en konversation och få ett svar. */
export async function askAi(history: ChatTurn[]): Promise<AiResult> {
  const r = await invoke({ messages: history });
  if (!r.ok) return { ok: false, error: r.error };
  const content = typeof r.data.content === 'string' ? r.data.content : '';
  if (!content.trim()) {
    return { ok: false, error: 'AI-tjänsten returnerade ett tomt svar.' };
  }
  return { ok: true, content };
}

/**
 * Tolkar AI-ns svar till giltigt dokumentinnehåll. Returnerar null om svaret
 * inte följer schemat — då kan det försökas igen med rättelse.
 */
function parseDoc(raw: string): DocContent | null {
  if (!raw.trim()) return null;
  let parsed: unknown;
  try {
    // Vissa modeller packar in JSON i ett kodblock trots instruktionen.
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const d = parsed as Partial<DocContent>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.sections)) return null;

  const sections: DocSection[] = d.sections
    .filter((s): s is DocSection => !!s && typeof s === 'object')
    .map((s) => ({
      heading: typeof s.heading === 'string' ? s.heading : '',
      paragraphs: Array.isArray(s.paragraphs)
        ? s.paragraphs.filter((p): p is string => typeof p === 'string')
        : [],
      bullets: Array.isArray(s.bullets)
        ? s.bullets.filter((b): b is string => typeof b === 'string')
        : [],
    }))
    .filter((s) => s.heading || s.paragraphs.length > 0 || s.bullets.length > 0);

  if (sections.length === 0) return null;

  return {
    title: typeof d.title === 'string' && d.title.trim() ? d.title : 'Dokument',
    subtitle: typeof d.subtitle === 'string' ? d.subtitle : undefined,
    sections,
  };
}

// Rättelse som skickas om AI:ns svar inte följde JSON-schemat.
const DOC_RETRY: ChatTurn = {
  role: 'user',
  content:
    'Det svaret kunde inte användas som dokument. Försök igen och svar endast med ett JSON-objekt som har nycklarna "title", "subtitle" och "sections" (en array med 2–6 objekt som vardera har "heading", "paragraphs" och "bullets"). Ingen annan text och inget kodblock.',
};

/**
 * Be AI:n skapa dokumentinnehåll. Svaret tolkas som JSON och valideras innan
 * det returneras — trasig eller ofullständig JSON ger ett tydligt fel i
 * stället för en krasch, och ett försök till görs automatiskt en gång.
 */
export async function askAiForDoc(
  history: ChatTurn[],
): Promise<DocResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = attempt === 0 ? history : [...history, DOC_RETRY];
    const r = await invoke({ messages, wantDoc: true });
    if (!r.ok) return { ok: false, error: r.error };

    const doc = parseDoc(typeof r.data.content === 'string' ? r.data.content : '');
    if (doc) return { ok: true, doc };
  }

  return {
    ok: false,
    error:
      'AI:n kunde inte skapa ett giltigt dokument den här gången. Beskriv gärna vad du vill ha i dokumentet lite tydligare och försök igen.',
  };
}
