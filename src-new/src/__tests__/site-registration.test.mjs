/**
 * Registreringssidan på hemsidan, körd i jsdom.
 *
 * Testet laddar `site/registrera.html` och kör den riktiga sidkoden
 * (`site/registrera.js` + `site/bot.js`) mot en låtsad server som svarar som
 * serverfunktionen `register` gör. Därför prövas hela registreringsflödet i
 * webbläsarlagret — kontotyp, fråga för fråga, lösenord och resultat — utan att
 * en riktig ansökan skrivs i projektets databas.
 *
 * Filen är vanlig JavaScript (`.mjs`) eftersom den läser hemsidans filer från
 * disk och importerar hemsidans JavaScript, som saknar typdeklarationer.
 *
 * Det som inte kan prövas här är servern själv: den kräver en deployad funktion
 * och en riktig databas. Se `docs/ELDA-CURRENT-STATE.md`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

function sitePath(relative) {
  const candidates = [
    path.resolve(process.cwd(), '..', relative),
    path.resolve(process.cwd(), relative),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Hittade inte ${relative} (letade i ${candidates.join(', ')})`);
  return found;
}

/** Hemsidans sidkod. Sökvägen är relativ till den här filen och måste vara en
 *  litteral sträng, annars kan testköraren inte lösa den utanför sin rot. */
const loadPage = () => import('../../../site/registrera.js');

const HTML = readFileSync(sitePath('site/registrera.html'), 'utf8');
const BODY = /<body[^>]*>([\s\S]*)<\/body>/i.exec(HTML)?.[1] ?? '';

// Samma form som servern skickar: obligatoriska fält märks med `required`, och
// sidan visar då knappen "Skicka svar" (utan tillägget för frivilliga fält).
const FIELDS = [
  { id: 'firstName', label: 'Förnamn', type: 'text', required: true, hint: null, options: null },
  { id: 'lastName', label: 'Efternamn', type: 'text', required: true, hint: null, options: null },
];

function fakeServer(submitResponse) {
  const calls = [];
  const answers = {};

  const respond = (json, status = 200) =>
    new Response(JSON.stringify(json), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const fetchImpl = async (input, init) => {
    const url = String(input);
    if (url.includes('config.json')) {
      return respond({ supabaseUrl: 'https://projekt.supabase.co', supabaseAnonKey: 'nyckel' });
    }
    if (!url.includes('/functions/v1/register')) return respond({ error: 'okänt' }, 404);

    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push(body);

    if (body.action === 'start') {
      return respond({
        trackingCode: 'ELDA-TEST01',
        kind: body.kind,
        fields: FIELDS,
        firstQuestion: 'Vad heter du i förnamn?',
        ai: false,
      });
    }
    if (body.action === 'answer') {
      answers[String(body.field)] = body.value;
      const next = FIELDS.find((f) => answers[f.id] === undefined) ?? null;
      return respond({
        ok: true,
        answers,
        nextField: next,
        question: next ? `Och i ${next.label.toLowerCase()}?` : '',
        complete: next === null,
        missingRequired: [],
        riskFlags: [],
        ai: false,
      });
    }
    if (body.action === 'submit') {
      return respond(
        submitResponse ?? {
          status: 'vantar',
          trackingCode: 'ELDA-TEST01',
          username: 'eannaad01',
          role: 'lärare',
          review: 'granskas',
          riskFlags: [],
          message:
            'Kontot är skapat men en administratör granskar uppgifterna först. Du kan logga in redan nu, men vissa delar är begränsade till dess.',
        },
      );
    }
    return respond({ error: 'okänd åtgärd' }, 400);
  };

  return { fetchImpl, calls };
}

/**
 * Laddar sidan och väntar tills boten är redo (kontotyperna byggs först när
 * konfigurationen har lästs).
 */
async function openPage(submitResponse) {
  vi.resetModules();
  document.documentElement.dataset.theme = 'ljus';
  document.body.innerHTML = BODY;
  const server = fakeServer(submitResponse);
  vi.stubGlobal('fetch', server.fetchImpl);
  await loadPage();
  await waitFor(() => expect(document.querySelectorAll('.kind-option').length).toBe(3));
  return server;
}

/**
 * Svarar på frågorna och väntar tills lösenordssteget faktiskt visas.
 * Lösenordsformuläret finns i sidans HTML från början (dolt), så testet måste
 * vänta på att det blir synligt — annars hinner svaren inte fram.
 */
async function answerAllQuestions(kind, names) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(kind) }));
  await waitFor(() => expect(screen.getByLabelText('Förnamn')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Förnamn'), { target: { value: names[0] } });
  fireEvent.click(screen.getByRole('button', { name: 'Skicka svar' }));
  await waitFor(() => expect(screen.getByLabelText('Efternamn')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Efternamn'), { target: { value: names[1] } });
  fireEvent.click(screen.getByRole('button', { name: 'Skicka svar' }));
  await waitFor(() => expect(document.getElementById('password-form').hidden).toBe(false));
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('registreringsboten på hemsidan', () => {
  it('visar de tre kontotyperna och att rollen sätts av servern', async () => {
    await openPage();

    const labels = [...document.querySelectorAll('.kind-option-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Skolelev', 'Privat elev', 'Lärare']);

    // Radbrytningarna i källkoden normaliseras innan texten prövas.
    const text = (document.body.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/Ingen kan välja sig till administratör här/);
    expect(text).toMatch(/Ett lärarkonto får alltid vänta på en administratörs granskning/);
  });

  it('går att starta och slutföra: kontotyp, frågor, lösenord och resultat', async () => {
    const server = await openPage();
    await answerAllQuestions('Lärare', ['Lena', 'Larsson']);

    fireEvent.change(document.getElementById('reg-password'), {
      target: { value: 'mittEget123' },
    });
    fireEvent.change(document.getElementById('reg-password-2'), {
      target: { value: 'mittEget123' },
    });
    fireEvent.click(document.getElementById('reg-terms'));
    fireEvent.submit(document.getElementById('password-form'));

    await waitFor(() => expect(document.getElementById('step-result').hidden).toBe(false));

    const result = document.getElementById('result-body').textContent ?? '';
    expect(result).toMatch(/Ditt användarnamn: eannaad01/);
    expect(result).toMatch(/spårningskod/);
    // Serverns besked (att ansökan granskas) visas som rubrik i resultatet.
    expect(document.getElementById('result-heading').textContent ?? '').toMatch(
      /granskar uppgifterna/,
    );

    // Anropen innehåller kontotyp, svar och lösenord — aldrig en roll.
    expect(server.calls.map((c) => c.action)).toEqual(['start', 'answer', 'answer', 'submit']);
    const submit = server.calls[server.calls.length - 1];
    expect(Object.keys(submit).sort()).toEqual(['action', 'password', 'trackingCode']);
    expect(submit).not.toHaveProperty('role');
    expect(submit).not.toHaveProperty('kind');
  });

  it('förklarar att AI-kvoten är slut i stället för att bara hänvisa till granskning', async () => {
    const server = await openPage({
      status: 'vantar',
      trackingCode: 'ELDA-TEST01',
      username: 'eannaad01',
      role: 'elev',
      accountType: 'privat',
      review: 'granskas',
      riskFlags: [],
      ai: 'misslyckades',
      aiIssue: 'kvot-slut',
      message:
        'Kontot är skapat. AI-bedömningen kunde inte göras eftersom gratiskvoten för AI-tjänsten är slut just nu. En administratör granskar därför ansökan manuellt. Du kan logga in redan nu, men nedladdningen öppnas först när kontot är godkänt.',
    });
    await answerAllQuestions('Privat elev', ['Sara', 'Svensson']);

    fireEvent.change(document.getElementById('reg-password'), { target: { value: 'mittEget123' } });
    fireEvent.change(document.getElementById('reg-password-2'), {
      target: { value: 'mittEget123' },
    });
    fireEvent.click(document.getElementById('reg-terms'));
    fireEvent.submit(document.getElementById('password-form'));

    await waitFor(() => expect(document.getElementById('step-result').hidden).toBe(false));
    expect(server.calls.some((c) => c.action === 'submit')).toBe(true);

    const warning = document.querySelector('.reg-note-warning');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toMatch(/gratiskvoten för AI-tjänsten är slut/);
    expect(warning.textContent).toMatch(/manuell granskning/);
    expect(warning.textContent).toMatch(/inte avslagen/);
    // Rubriken är serverns besked, inte en allmän feltext.
    expect(document.getElementById('result-heading').textContent ?? '').toMatch(
      /gratiskvoten för AI-tjänsten är slut/,
    );
  });

  it('stoppar ojämna lösenord innan något skickas', async () => {
    const server = await openPage();
    await answerAllQuestions('Skolelev', ['Anna', 'Andersson']);

    fireEvent.change(document.getElementById('reg-password'), { target: { value: 'mittEget123' } });
    fireEvent.change(document.getElementById('reg-password-2'), {
      target: { value: 'annat12345' },
    });
    fireEvent.click(document.getElementById('reg-terms'));
    fireEvent.submit(document.getElementById('password-form'));

    await waitFor(() =>
      expect(document.getElementById('bot-error').textContent ?? '').toMatch(/stämmer inte överens/),
    );
    expect(server.calls.some((c) => c.action === 'submit')).toBe(false);
  });

  it('kräver godkända villkor innan ansökan skickas', async () => {
    const server = await openPage();
    await answerAllQuestions('Privat elev', ['Nils', 'Nilsson']);

    fireEvent.change(document.getElementById('reg-password'), { target: { value: 'mittEget123' } });
    fireEvent.change(document.getElementById('reg-password-2'), {
      target: { value: 'mittEget123' },
    });
    fireEvent.submit(document.getElementById('password-form'));

    await waitFor(() =>
      expect(document.getElementById('bot-error').textContent ?? '').toMatch(/användarvillkoren/),
    );
    expect(server.calls.some((c) => c.action === 'submit')).toBe(false);
  });

  it('visar serverns fältfel i stället för att gå vidare', async () => {
    vi.resetModules();
    document.body.innerHTML = BODY;
    vi.stubGlobal(
      'fetch',
      async (input, init) => {
        const url = String(input);
        if (url.includes('config.json')) {
          return new Response(
            JSON.stringify({ supabaseUrl: 'https://projekt.supabase.co', supabaseAnonKey: 'nyckel' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.action === 'start') {
          return new Response(
            JSON.stringify({
              trackingCode: 'ELDA-TEST01',
              kind: body.kind,
              fields: FIELDS,
              firstQuestion: 'Vad heter du i förnamn?',
              ai: false,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Svaret underkändes.',
            problems: { firstName: 'Förnamn får inte innehålla siffror.' },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );

    await loadPage();
    await waitFor(() => expect(document.querySelectorAll('.kind-option').length).toBe(3));
    fireEvent.click(screen.getByRole('button', { name: /Skolelev/ }));

    await waitFor(() => expect(screen.getByLabelText('Förnamn')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Förnamn'), { target: { value: 'Anna1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Skicka svar' }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Förnamn får inte innehålla siffror/),
    );
  });

  it('visar ett tydligt besked när konfigurationen saknas', async () => {
    vi.resetModules();
    document.body.innerHTML = BODY;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );

    await loadPage();

    await waitFor(() => expect(document.getElementById('reg-config-error').hidden).toBe(false));
    expect(document.getElementById('reg-card').hidden).toBe(true);
  });
});
