import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_SERVICE_ERRORS,
  DOC_LIMITS,
  aiServiceMessage,
  askAi,
  askAiForDoc,
  docRetryInstruction,
  isAiServiceError,
  parseOfficeDoc,
  validateQuestion,
} from './ai';

/**
 * AI-klienten och dokumentschemana.
 *
 * Anropet mot Supabase är mockat på klientnivå, så testet ser exakt vad som
 * skickas till serverfunktionen `ai-chat` — att rätt format begärs, att ett
 * oanvändbart svar försöks en gång till och att serverns felmeddelanden når
 * användaren som de är.
 */
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('./auth-supabase', () => ({
  getOrCreateSupabaseClient: () => ({
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  }),
}));

function session(token: string | null) {
  return { data: { session: token ? { access_token: token } : null } };
}

function answer(content: string) {
  return { data: { content, model: 'test' }, error: null };
}

const WORD_JSON = JSON.stringify({
  title: 'Arbetsblad: Bråk',
  subtitle: 'Matematik åk 7',
  sections: [
    { heading: 'Mål', paragraphs: ['Förstå bråk.'], bullets: ['Förkorta', 'Förlänga'] },
  ],
});

beforeEach(() => {
  mocks.getSession.mockResolvedValue(session('token-1'));
  mocks.invoke.mockReset();
});

describe('parseOfficeDoc', () => {
  it('tolkar ett Word-svar och städar texten', () => {
    const doc = parseOfficeDoc(
      'word',
      JSON.stringify({
        title: '  Prov   dokument ',
        subtitle: '',
        sections: [
          { heading: ' Rubrik ', paragraphs: ['  Ett   stycke  '], bullets: [' Punkt '] },
        ],
      }),
    );
    expect(doc).toEqual({
      kind: 'word',
      title: 'Prov dokument',
      subtitle: null,
      sections: [{ heading: 'Rubrik', paragraphs: ['Ett stycke'], bullets: ['Punkt'] }],
    });
  });

  it('plockar fram JSON även om modellen la den i ett kodblock', () => {
    const doc = parseOfficeDoc('word', '```json\n' + WORD_JSON + '\n```');
    expect(doc?.title).toBe('Arbetsblad: Bråk');
  });

  it('ger null för ett svar som inte följer schemat', () => {
    expect(parseOfficeDoc('word', 'Hej! Här är dokumentet.')).toBeNull();
    expect(parseOfficeDoc('word', '{"title":"Tomt"}')).toBeNull();
    expect(parseOfficeDoc('word', '')).toBeNull();
    expect(parseOfficeDoc('excel', '{"sheets":[]}')).toBeNull();
    expect(parseOfficeDoc('powerpoint', '{"slides":[{}]}')).toBeNull();
  });

  it('håller sig inom gränserna för innehållet', () => {
    const sections = Array.from({ length: DOC_LIMITS.sections + 5 }, (_, i) => ({
      heading: `Rubrik ${i}`,
      paragraphs: ['Ett stycke'],
      bullets: [],
    }));
    const doc = parseOfficeDoc('word', JSON.stringify({ title: 'Stor', sections }));
    expect(doc?.kind).toBe('word');
    expect(doc?.kind === 'word' && doc.sections).toHaveLength(DOC_LIMITS.sections);
  });

  it('behåller tal som tal och fyller ut korta rader i en arbetsbok', () => {
    const doc = parseOfficeDoc(
      'excel',
      JSON.stringify({
        title: 'Närvaro',
        sheets: [
          {
            name: 'Vecka 42',
            columns: ['Elev', 'Närvaro', 'Kommentar'],
            rows: [['eanna01', 100], ['ebert01', 'sjuk', 'hemma']],
          },
        ],
      }),
    );
    expect(doc?.kind).toBe('excel');
    if (doc?.kind !== 'excel') return;
    expect(doc.sheets[0].rows[0]).toEqual(['eanna01', 100, '']);
    expect(doc.sheets[0].rows[1]).toEqual(['ebert01', 'sjuk', 'hemma']);
  });

  it('tar bort blad utan kolumnrubriker och kortar för långa bladnamn', () => {
    const doc = parseOfficeDoc(
      'excel',
      JSON.stringify({
        title: 'Arbetsbok',
        sheets: [
          { name: 'x'.repeat(60), columns: ['A'], rows: [] },
          { name: 'Utan kolumner', columns: [], rows: [['tappas']] },
        ],
      }),
    );
    if (doc?.kind !== 'excel') throw new Error('fel format');
    expect(doc.sheets).toHaveLength(1);
    expect(doc.sheets[0].name).toHaveLength(DOC_LIMITS.sheetName);
  });

  it('tolkar en presentation med bilder, punkter och anteckningar', () => {
    const doc = parseOfficeDoc(
      'powerpoint',
      JSON.stringify({
        title: 'Genomgång',
        subtitle: 'Bråk',
        slides: [
          { title: 'Vad är ett bråk?', bullets: ['Täljare', 'Nämnare'], notes: 'Rita.' },
        ],
      }),
    );
    expect(doc).toEqual({
      kind: 'powerpoint',
      title: 'Genomgång',
      subtitle: 'Bråk',
      slides: [
        { title: 'Vad är ett bråk?', bullets: ['Täljare', 'Nämnare'], notes: 'Rita.' },
      ],
    });
  });
});

describe('aiServiceMessage', () => {
  it('förklarar en uttömd gratiskvot i stället för att bara säga "försök igen"', () => {
    const message = aiServiceMessage({
      code: 'ai-kvot-slut',
      error: 'AI-tjänsten har mycket att göra just nu. Försök igen om en stund.',
    });

    expect(message).toBe(AI_SERVICE_ERRORS['ai-kvot-slut']);
    expect(message).toMatch(/gratiskvoten/);
    expect(message).toMatch(/går inte att lösa genom att skriva om frågan/);
    expect(message).not.toMatch(/mycket att göra/);
    expect(isAiServiceError(message ?? '')).toBe(true);
  });

  it('skiljer saknade krediter från en tillfällig kvot', () => {
    const credits = aiServiceMessage({ code: 'ai-krediter-saknas', error: null });
    expect(credits).toMatch(/krediter/);
    expect(credits).not.toBe(AI_SERVICE_ERRORS['ai-kvot-slut']);
  });

  it('använder serverns egen text när koden är okänd', () => {
    expect(aiServiceMessage({ error: 'AI-tjänsten är inte konfigurerad.' })).toBe(
      'AI-tjänsten är inte konfigurerad.',
    );
    expect(aiServiceMessage({ code: 'nagot-annat', error: 'Eget meddelande.' })).toBe(
      'Eget meddelande.',
    );
    expect(aiServiceMessage(null)).toBeNull();
    expect(isAiServiceError('Eget meddelande.')).toBe(false);
  });
});

describe('askAi', () => {
  it('skickar frågan med sessionens token och returnerar svaret', async () => {
    mocks.invoke.mockResolvedValue(answer('Ett svar'));

    const result = await askAi([{ role: 'user', content: 'Vad är ett bråk?' }]);

    expect(result).toEqual({ ok: true, data: 'Ett svar' });
    expect(mocks.invoke).toHaveBeenCalledWith('ai-chat', {
      headers: { Authorization: 'Bearer token-1' },
      body: { messages: [{ role: 'user', content: 'Vad är ett bråk?' }] },
    });
  });

  it('visar serverns felmeddelande när AI-tjänsten inte är konfigurerad', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new Error(
        'AI-tjänsten är inte konfigurerad. OPENROUTER_API_KEY saknas som hemlighet.',
      ),
    });

    const result = await askAi([{ role: 'user', content: 'Hej' }]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/inte konfigurerad/);
    expect(result.ok === false && result.error).toMatch(/OPENROUTER_API_KEY/);
  });

  it('kräver en fråga och en giltig session', async () => {
    const empty = await askAi([{ role: 'user', content: '   ' }]);
    expect(empty.ok).toBe(false);
    expect(empty.ok === false && empty.error).toMatch(/skriv en fråga/i);

    mocks.getSession.mockResolvedValue(session(null));
    const noSession = await askAi([{ role: 'user', content: 'Hej' }]);
    expect(noSession.ok).toBe(false);
    expect(noSession.ok === false && noSession.error).toMatch(/logga in igen/i);
  });

  it('behandlar ett tomt svar som ett fel i stället för ett tomt dokumentsvar', async () => {
    mocks.invoke.mockResolvedValue(answer('   '));
    const result = await askAi([{ role: 'user', content: 'Hej' }]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/tomt svar/i);
  });
});

describe('askAiForDoc', () => {
  it('begär rätt format och tolkar svaret', async () => {
    mocks.invoke.mockResolvedValue(answer(WORD_JSON));

    const result = await askAiForDoc([{ role: 'user', content: 'Gör ett arbetsblad' }], 'word');

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.data.kind).toBe('word');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][1].body.docKind).toBe('word');
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('wantDoc');
  });

  it('försöker en gång till när svaret inte går att använda', async () => {
    mocks.invoke
      .mockResolvedValueOnce(answer('Här är ditt dokument!'))
      .mockResolvedValueOnce(answer(WORD_JSON));

    const result = await askAiForDoc([{ role: 'user', content: 'Gör ett dokument' }], 'word');

    expect(result.ok).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    const second = mocks.invoke.mock.calls[1][1].body.messages;
    expect(second[second.length - 1].content).toBe(docRetryInstruction('word'));
  });

  it('ger ett tydligt fel när AI:n inte kan skapa ett användbart dokument', async () => {
    mocks.invoke.mockResolvedValue(answer('Inte JSON alls'));

    const result = await askAiForDoc([{ role: 'user', content: 'Gör ett dokument' }], 'powerpoint');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/kunde inte skapa ett användbart dokument/i);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('skickar Excel- och PowerPoint-scheman som egna format', async () => {
    mocks.invoke.mockResolvedValue(
      answer(JSON.stringify({ title: 'Bok', sheets: [{ name: 'Blad', columns: ['A'], rows: [['x']] }] })),
    );
    const excel = await askAiForDoc([{ role: 'user', content: 'Tabell' }], 'excel');
    expect(excel.ok === true && excel.data.kind).toBe('excel');
    expect(mocks.invoke.mock.calls[0][1].body.docKind).toBe('excel');

    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(
      answer(JSON.stringify({ title: 'Bilder', slides: [{ title: 'Ett', bullets: ['a'] }] })),
    );
    const pptx = await askAiForDoc([{ role: 'user', content: 'Presentation' }], 'powerpoint');
    expect(pptx.ok === true && pptx.data.kind).toBe('powerpoint');
    expect(mocks.invoke.mock.calls[0][1].body.docKind).toBe('powerpoint');
  });
});

describe('validateQuestion', () => {
  it('kräver text och begränsar längden', () => {
    expect(validateQuestion('')).toMatch(/skriv en fråga/i);
    expect(validateQuestion('x'.repeat(9000))).toMatch(/för lång/i);
    expect(validateQuestion('Vad är ett bråk?')).toBeNull();
  });
});
