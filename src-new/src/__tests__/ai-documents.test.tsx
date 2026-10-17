import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { ExcelDoc, OfficeDoc, PptxDoc, WordDoc } from '../lib/ai';

/**
 * AI-assistenterna och dokumentflödet i gränssnittet.
 *
 * AI-anropet är mockat (det kräver en riktig serverfunktion), men själva
 * filbygget körs på riktigt: när testet trycker på "Skapa dokument" skapas en
 * verklig .docx/.xlsx/.pptx som granskas i gränssnittet. Att filerna är giltiga
 * Office-filer kontrolleras i `lib/office.test.ts`.
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
  askAi: vi.fn(),
  askAiForDoc: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => mocks.backend,
}));

vi.mock('../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai')>();
  return { ...actual, askAi: mocks.askAi, askAiForDoc: mocks.askAiForDoc };
});

const WORD: WordDoc = {
  kind: 'word',
  title: 'Arbetsblad: Bråk',
  subtitle: 'Matematik åk 7',
  sections: [{ heading: 'Mål', paragraphs: ['Förstå bråk.'], bullets: ['Förkorta'] }],
};

const EXCEL: ExcelDoc = {
  kind: 'excel',
  title: 'Närvaro',
  sheets: [{ name: 'Vecka 42', columns: ['Elev', 'Närvaro'], rows: [['eanna01', 100]] }],
};

const PPTX: PptxDoc = {
  kind: 'powerpoint',
  title: 'Genomgång',
  subtitle: null,
  slides: [{ title: 'Ett', bullets: ['a'], notes: null }],
};

function user(role: VäxverketUser['role']): VäxverketUser {
  return {
    id: `u-${role}`,
    username: 'eelda01',
    role,
    active: true,
    mustChangePassword: false,
  };
}

function makeBackend(session: { exists: boolean; user?: VäxverketUser }) {
  const backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => session),
    getCurrentUser: vi.fn(async () => session.user ?? null),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => ({ ok: true as const, accounts: [] })),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
  } as unknown as AuthServiceBackend;

  mocks.backend = backend;
  return backend;
}

/** Filbygget görs på riktigt och tar en stund — därför en generös väntetid. */
const FILE_TIMEOUT = { timeout: 10_000 };

async function renderApp(hash: string) {
  window.history.replaceState(null, '', hash);
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

/** Skriver en fråga och skickar den, så att chatten har ett samtal. */
async function ask(panel: string, question = 'Vad är ett bråk?') {
  fireEvent.change(screen.getByLabelText('Fråga'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: /^Skicka$/ }));
  await screen.findByTestId(`ai-chat-${panel}`);
}

beforeEach(() => {
  mocks.askAi.mockResolvedValue({ ok: true, data: 'Ett bråk är en del av en helhet.' });
  mocks.askAiForDoc.mockResolvedValue({ ok: true, data: WORD });
});

afterEach(() => {
  cleanup();
  mocks.backend = null;
  vi.clearAllMocks();
});

describe('adminpanelens AI-assistent', () => {
  it('finns i adminmenyn och öppnas från adressfältet', async () => {
    makeBackend({ exists: true, user: user('admin') });
    await renderApp('#/admin/ai-assistent');

    expect(await screen.findByTestId('page-admin-ai-assistent')).toBeTruthy();
    expect(screen.getByTestId('ai-chat-admin')).toBeTruthy();

    const nav = await screen.findByLabelText('Huvudmeny');
    expect(await within(nav).findByText('AI-assistent')).toBeTruthy();
  });

  it('svarar på en fråga och visar serverns fel när AI-tjänsten inte svarar', async () => {
    makeBackend({ exists: true, user: user('admin') });
    await renderApp('#/admin/ai-assistent');

    await ask('admin');
    expect(await screen.findByText('Ett bråk är en del av en helhet.')).toBeTruthy();

    mocks.askAi.mockResolvedValue({
      ok: false,
      error: 'AI-tjänsten är inte konfigurerad. OPENROUTER_API_KEY saknas som hemlighet.',
    });
    fireEvent.change(screen.getByLabelText('Fråga'), { target: { value: 'Igen?' } });
    fireEvent.click(screen.getByRole('button', { name: /^Skicka$/ }));

    const alert = await screen.findByTestId('ai-error');
    expect(alert.textContent).toMatch(/inte konfigurerad/);
    expect(alert.textContent).toMatch(/OPENROUTER_API_KEY/);
  });

  it('märker slut på AI-kvoten som ett tjänsteläge, inte som ett fel eleven gjort', async () => {
    makeBackend({ exists: true, user: user('admin') });
    await renderApp('#/admin/ai-assistent');

    mocks.askAi.mockResolvedValue({
      ok: false,
      error:
        'AI-hjälpen kan inte svara just nu: gratiskvoten för AI-tjänsten är slut. Det går inte att lösa genom att skriva om frågan — försök igen senare, eller fråga din lärare.',
    });

    await ask('admin');

    const alert = await screen.findByTestId('ai-error');
    expect(alert.textContent).toMatch(/AI-hjälpen är tillfälligt otillgänglig/);
    expect(alert.textContent).toMatch(/gratiskvoten för AI-tjänsten är slut/);
    // Tjänsteläget får en annan ruta än ett vanligt fel.
    expect(alert.querySelector('.chat-error-service')).toBeTruthy();
  });
});

describe('dokument av samtalet', () => {
  it('skapar ett riktigt Word-dokument som kan granskas och laddas ner', async () => {
    makeBackend({ exists: true, user: user('elev') });
    await renderApp('#/elev/ai-hjalp');
    await ask('elev');

    fireEvent.click(screen.getByRole('button', { name: /Skapa dokument/ }));

    const card = await screen.findByTestId('ai-doc-file-elev', {}, FILE_TIMEOUT);
    expect(within(card).getByText('Arbetsblad-Brak.docx')).toBeTruthy();
    expect(within(card).getByText(/Word-dokument/)).toBeTruthy();
    expect(within(card).getByText(/1 sektion/)).toBeTruthy();
    expect(mocks.askAiForDoc).toHaveBeenCalledWith(expect.anything(), 'word');

    // Rätt fil laddas ner: samma namn som i granskningen, i rätt format.
    const urls = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:elda');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let download = '';
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        download = this.download;
      });

    fireEvent.click(screen.getByRole('button', { name: /Ladda ner filen/ }));
    expect(download).toBe('Arbetsblad-Brak.docx');
    expect(urls).toHaveBeenCalledTimes(1);

    click.mockRestore();
    urls.mockRestore();
    revoke.mockRestore();
  });

  it('skapar Excel och PowerPoint när de formaten väljs', async () => {
    makeBackend({ exists: true, user: user('speciallärare') });
    await renderApp('#/speciallarar/ai-assistent');
    await ask('speciallarar');

    mocks.askAiForDoc.mockResolvedValue({ ok: true, data: EXCEL });
    fireEvent.click(screen.getByRole('button', { name: /Excel-arbetsbok/ }));
    fireEvent.click(screen.getByRole('button', { name: /Skapa dokument/ }));

    let card = await screen.findByTestId('ai-doc-file-speciallarar', {}, FILE_TIMEOUT);
    expect(within(card).getByText('Narvaro.xlsx')).toBeTruthy();
    expect(mocks.askAiForDoc).toHaveBeenLastCalledWith(expect.anything(), 'excel');

    mocks.askAiForDoc.mockResolvedValue({ ok: true, data: PPTX });
    fireEvent.click(screen.getByRole('button', { name: /PowerPoint-presentation/ }));
    fireEvent.click(screen.getByRole('button', { name: /Skapa dokument/ }));

    card = await screen.findByTestId('ai-doc-file-speciallarar', {}, FILE_TIMEOUT);
    expect(within(card).getByText('Genomgang.pptx')).toBeTruthy();
    expect(mocks.askAiForDoc).toHaveBeenLastCalledWith(expect.anything(), 'powerpoint');
  });

  it('visar ett tydligt fel i stället för en fil när dokumentet inte kan skapas', async () => {
    makeBackend({ exists: true, user: user('elev') });
    await renderApp('#/elev/ai-hjalp');
    await ask('elev');

    mocks.askAiForDoc.mockResolvedValue({
      ok: false,
      error: 'AI:n kunde inte skapa ett användbart dokument den här gången.',
    });
    fireEvent.click(screen.getByRole('button', { name: /Skapa dokument/ }));

    const error = await screen.findByTestId('ai-doc-error-elev');
    expect(error.textContent).toMatch(/kunde inte skapa ett användbart dokument/);
    expect(screen.queryByTestId('ai-doc-file-elev')).toBeNull();
  });

  it('skickar bara en begäran även om knappen trycks flera gånger', async () => {
    makeBackend({ exists: true, user: user('elev') });
    await renderApp('#/elev/ai-hjalp');
    await ask('elev');

    let release: (value: { ok: true; data: OfficeDoc }) => void = () => undefined;
    mocks.askAiForDoc.mockImplementation(
      () => new Promise((resolve) => (release = resolve as typeof release)),
    );

    const button = screen.getByRole('button', { name: /Skapa dokument/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.askAiForDoc).toHaveBeenCalledTimes(1);

    release({ ok: true, data: WORD });
    expect(await screen.findByTestId('ai-doc-file-elev', {}, FILE_TIMEOUT)).toBeTruthy();
  });

  it('kan inte skapa ett dokument innan samtalet har börjat', async () => {
    makeBackend({ exists: true, user: user('elev') });
    await renderApp('#/elev/ai-hjalp');

    const button = screen.getByRole('button', { name: /Skapa dokument/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Ställ en fråga först/)).toBeTruthy();
  });
});
