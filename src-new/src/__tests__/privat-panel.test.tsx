import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { PlannerTask, XpState } from '../lib/planner';
import { panelPages } from '../lib/nav';

/**
 * Privatelevpanelens gränssnitt mot en mockad backend.
 *
 * Panelen använder samma studieverktyg som skoleleven, men översikten är egen.
 * Testerna kontrollerar att den visar elevens riktiga poster, att den aldrig
 * hittar på siffror när en hämtning misslyckas och att varje menyval går att
 * öppna.
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
  listMyTasks: vi.fn(),
  listTasks: vi.fn(),
  fetchXpState: vi.fn(),
  listRewardDefinitions: vi.fn(),
  listUnlocks: vi.fn(),
  listXpHistory: vi.fn(),
  listDecks: vi.fn(),
  listQuizSets: vi.fn(),
  listMyAttempts: vi.fn(),
  listDocuments: vi.fn(),
  storageReady: vi.fn(),
}));

vi.mock('../lib/auth', () => ({ createAuthBackend: () => mocks.backend }));

vi.mock('../lib/assignments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assignments')>();
  return { ...actual, listMyTasks: mocks.listMyTasks };
});

vi.mock('../lib/planner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/planner')>();
  return {
    ...actual,
    listTasks: mocks.listTasks,
    fetchXpState: mocks.fetchXpState,
    listRewardDefinitions: mocks.listRewardDefinitions,
    listUnlocks: mocks.listUnlocks,
    listXpHistory: mocks.listXpHistory,
  };
});

vi.mock('../lib/flashcards', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/flashcards')>();
  return { ...actual, listDecks: mocks.listDecks };
});

vi.mock('../lib/quiz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/quiz')>();
  return { ...actual, listQuizSets: mocks.listQuizSets, listMyAttempts: mocks.listMyAttempts };
});

vi.mock('../lib/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documents')>();
  return { ...actual, listDocuments: mocks.listDocuments, storageReady: mocks.storageReady };
});

const privatelev: VäxverketUser = {
  id: 'u-elev',
  username: 'elin01',
  role: 'elev',
  active: true,
  mustChangePassword: false,
  accountType: 'privat',
};

function iso(offsetDays: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plan(overrides: Partial<PlannerTask>): PlannerTask {
  return {
    id: 'p',
    user_id: 'u-elev',
    title: 'Post',
    description: null,
    notes: null,
    due_date: null,
    priority: 'medel',
    status: 'ej_paborjad',
    category: 'Studieteknik',
    completed_at: null,
    xp_awarded: false,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    ...overrides,
  };
}

const xp: XpState = { totalXp: 240, level: 3, xpPerLevel: 100, intoLevel: 40, xpToNext: 60 };

function makeBackend() {
  mocks.backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({ exists: true, user: privatelev })),
    getCurrentUser: vi.fn(async () => privatelev),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => ({ ok: true as const, accounts: [] })),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
  } as unknown as AuthServiceBackend;
}

async function renderPanel(page = 'start') {
  window.history.replaceState(null, '', `#/privat/${page}`);
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(document.querySelector('.app-layout')).toBeTruthy());
  await waitFor(() => expect(document.body.textContent).not.toMatch(/Hämtar/));
}

beforeEach(() => {
  makeBackend();
  mocks.listMyTasks.mockResolvedValue({ ok: true, data: [] });
  mocks.listTasks.mockResolvedValue({ ok: true, data: [] });
  mocks.fetchXpState.mockResolvedValue({ ok: true, data: xp });
  mocks.listRewardDefinitions.mockResolvedValue({ ok: true, data: [] });
  mocks.listUnlocks.mockResolvedValue({ ok: true, data: new Map() });
  mocks.listXpHistory.mockResolvedValue({ ok: true, data: [] });
  mocks.listDecks.mockResolvedValue({ ok: true, data: [] });
  mocks.listQuizSets.mockResolvedValue({ ok: true, data: [] });
  mocks.listMyAttempts.mockResolvedValue({ ok: true, data: [] });
  mocks.listDocuments.mockResolvedValue({ ok: true, data: [] });
  mocks.storageReady.mockResolvedValue({ ok: true, data: true });
});

afterEach(() => {
  cleanup();
  mocks.backend = null;
  vi.clearAllMocks();
});

describe('privatelevpanelens översikt', () => {
  it('hälsar eleven välkommen och visar inga klassvyer', async () => {
    await renderPanel();

    expect(await screen.findByTestId('page-privat-start')).toBeTruthy();
    expect(screen.getByText('Hej elin01')).toBeTruthy();
    expect(document.querySelector('[data-panel]')?.getAttribute('data-panel')).toBe('privat');
    // Klass, klasskamrater och klasschatt finns inte i det privata kontots meny.
    expect(screen.queryByText('Klasschatt')).toBeNull();
    expect(screen.queryByText('Min klass')).toBeNull();
  });

  it('visar dagens egen post, det som kommer och veckan ur riktig data', async () => {
    mocks.listTasks.mockResolvedValue({
      ok: true,
      data: [
        plan({ id: 'p1', title: 'Läsa kapitel 4', category: 'Biologi', due_date: iso(0) }),
        plan({ id: 'p2', title: 'Räkna klart uppgifterna', category: 'Matematik', due_date: iso(-3) }),
        plan({ id: 'p3', title: 'Repetera glosor', category: 'Engelska', due_date: iso(2) }),
      ],
    });

    await renderPanel();

    // Idag-listan och ”att göra härnäst” visar samma riktiga poster.
    expect((await screen.findAllByText('Läsa kapitel 4')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Räkna klart uppgifterna').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Repetera glosor').length).toBeGreaterThan(0);
    // Den försenade posten markeras och räknas in i ledtexten.
    expect(screen.getAllByText('Försenad').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 post har passerat sitt datum/)).toBeTruthy();
    // Veckosektionen räknar posterna med datum.
    expect(screen.getByText(/poster med datum de kommande sju dagarna/)).toBeTruthy();
  });

  it('visar poäng och nivå när servern svarar', async () => {
    await renderPanel();

    expect(await screen.findByText('240')).toBeTruthy();
    expect(screen.getByText('XP totalt')).toBeTruthy();
    expect(screen.getByLabelText(/Nivå 3\. 40 av 100 XP/)).toBeTruthy();
  });

  it('hittar inte på poäng när hämtningen misslyckas', async () => {
    mocks.fetchXpState.mockResolvedValue({ ok: false, error: 'Kunde inte nå servern.' });

    await renderPanel();

    expect(await screen.findByTestId('partial-data')).toBeTruthy();
    expect(screen.getByText(/Kunde inte hämta dina poäng/)).toBeTruthy();
    // Ingen påhittad nolla: varken XP-raden eller nivåringen visas.
    expect(screen.queryByText('XP totalt')).toBeNull();
    expect(screen.queryByText(/Nivå 3/)).toBeNull();
    expect(screen.getByText(/Poängen kunde inte hämtas/)).toBeTruthy();
  });
});

describe('privatelevpanelens meny', () => {
  it('öppnar varje menyval utan att krascha', async () => {
    for (const page of panelPages('privat')) {
      cleanup();
      await renderPanel(page);

      expect(screen.getByTestId('panel-privat')).toBeTruthy();
      expect(screen.queryByTestId('access-denied')).toBeNull();
    }
  });
});
