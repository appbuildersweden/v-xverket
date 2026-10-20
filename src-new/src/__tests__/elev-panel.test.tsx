import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { AssignedTask } from '../lib/assignments';
import type { Flashcard, FlashcardDeck } from '../lib/flashcards';
import type { QuizSet } from '../lib/quiz';
import type { PlannerTask, XpState } from '../lib/planner';
import type { ChatMessage, DirectConversation } from '../lib/chat';
import { panelPages } from '../lib/nav';

/**
 * Elevpanelens funktioner mot en mockad backend.
 *
 * Mockarna ligger på datalagret (samma gränssnitt som vyerna använder), så
 * testerna beskriver hela flödet: vad som visas, vilka anrop som skickas och vad
 * som händer efter en åtgärd. Serverns behörighetskontroll kan inte köras här —
 * den kräver en riktig Supabase-databas.
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
  listMyTasks: vi.fn(),
  setMyTaskStatus: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  fetchXpState: vi.fn(),
  listRewardDefinitions: vi.fn(),
  listUnlocks: vi.fn(),
  listXpHistory: vi.fn(),
  listDecks: vi.fn(),
  listCards: vi.fn(),
  createDeck: vi.fn(),
  addCard: vi.fn(),
  saveCardResult: vi.fn(),
  deleteCard: vi.fn(),
  listQuizSets: vi.fn(),
  getQuizQuestions: vi.fn(),
  submitQuizAttempt: vi.fn(),
  listMyAttempts: vi.fn(),
  listDocuments: vi.fn(),
  storageReady: vi.fn(),
  createDocumentUrl: vi.fn(),
  listDirectConversations: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  listClasses: vi.fn(),
  listClassMembers: vi.fn(),
  getClassChannelId: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => mocks.backend,
}));

vi.mock('../lib/assignments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assignments')>();
  return {
    ...actual,
    listMyTasks: mocks.listMyTasks,
    setMyTaskStatus: mocks.setMyTaskStatus,
  };
});

vi.mock('../lib/planner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/planner')>();
  return {
    ...actual,
    listTasks: mocks.listTasks,
    createTask: mocks.createTask,
    updateTask: mocks.updateTask,
    deleteTask: mocks.deleteTask,
    completeTask: mocks.completeTask,
    reopenTask: mocks.reopenTask,
    fetchXpState: mocks.fetchXpState,
    listRewardDefinitions: mocks.listRewardDefinitions,
    listUnlocks: mocks.listUnlocks,
    listXpHistory: mocks.listXpHistory,
  };
});

vi.mock('../lib/flashcards', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/flashcards')>();
  return {
    ...actual,
    listDecks: mocks.listDecks,
    listCards: mocks.listCards,
    createDeck: mocks.createDeck,
    addCard: mocks.addCard,
    saveCardResult: mocks.saveCardResult,
    deleteCard: mocks.deleteCard,
  };
});

vi.mock('../lib/quiz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/quiz')>();
  return {
    ...actual,
    listQuizSets: mocks.listQuizSets,
    getQuizQuestions: mocks.getQuizQuestions,
    submitQuizAttempt: mocks.submitQuizAttempt,
    listMyAttempts: mocks.listMyAttempts,
  };
});

vi.mock('../lib/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documents')>();
  return {
    ...actual,
    listDocuments: mocks.listDocuments,
    storageReady: mocks.storageReady,
    createDocumentUrl: mocks.createDocumentUrl,
  };
});

vi.mock('../lib/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/chat')>();
  return {
    ...actual,
    listDirectConversations: mocks.listDirectConversations,
    listMessages: mocks.listMessages,
    sendMessage: mocks.sendMessage,
  };
});

vi.mock('../lib/classes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/classes')>();
  return {
    ...actual,
    listClasses: mocks.listClasses,
    listClassMembers: mocks.listClassMembers,
    getClassChannelId: mocks.getClassChannelId,
  };
});

// ---------------------------------------------------------------- testdata

const elev: VäxverketUser = {
  id: 'elev-1',
  username: 'ejentu01',
  role: 'elev',
  active: true,
  mustChangePassword: false,
};

const emptyXp: XpState = {
  totalXp: 0,
  level: 1,
  xpPerLevel: 100,
  intoLevel: 0,
  xpToNext: 100,
};

function makeTask(overrides: Partial<AssignedTask> = {}): AssignedTask {
  return {
    id: 'task-1',
    created_by: 'spec-1',
    student_id: 'elev-1',
    class_id: null,
    title: 'Träna multiplikation',
    description: 'Kapitel 3',
    instructions: 'Gör uppgifterna 1–10.',
    subject: 'Matematik',
    due_date: '2026-10-20',
    status: 'ej_paborjad',
    submission: null,
    submitted_at: null,
    completed_at: null,
    xp_awarded: false,
    follow_up: false,
    follow_up_note: null,
    followed_up_at: null,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    student_username: 'ejentu01',
    ...overrides,
  };
}

function makePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    id: 'plan-1',
    user_id: 'elev-1',
    title: 'Läsa kapitel 4',
    description: null,
    notes: null,
    due_date: '2026-10-16',
    priority: 'medel',
    status: 'ej_paborjad',
    category: 'arbetsomrade',
    completed_at: null,
    xp_awarded: false,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    ...overrides,
  };
}

function makeDeck(overrides: Partial<FlashcardDeck> = {}): FlashcardDeck {
  return {
    id: 'deck-1',
    owner_id: 'elev-1',
    title: 'Glosor engelska',
    subject: 'Engelska',
    is_shared: false,
    created_at: '2026-10-10T10:00:00Z',
    isMine: true,
    cardCount: 2,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: 'card-1',
    deck_id: 'deck-1',
    question: 'Vad heter hus på engelska?',
    answer: 'house',
    position: 0,
    known_count: 0,
    repeat_count: 0,
    last_result: null,
    ...overrides,
  };
}

function makeQuizSet(overrides: Partial<QuizSet> = {}): QuizSet {
  return {
    id: 'quiz-1',
    owner_id: 'spec-1',
    title: 'Provträning: geometri',
    subject: 'Matematik',
    description: 'Grunderna i geometri',
    is_shared: true,
    created_at: '2026-10-10T10:00:00Z',
    isMine: false,
    questionCount: 1,
    ...overrides,
  };
}

function makeBackend() {
  const backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({ exists: true, user: elev })),
    getCurrentUser: vi.fn(async () => elev),
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

function resetData() {
  mocks.listMyTasks.mockResolvedValue({ ok: true, data: [] });
  mocks.setMyTaskStatus.mockResolvedValue({
    ok: true,
    data: { status: 'klar', xpAwarded: 10, totalXp: 10, level: 1, unlocks: [] },
  });
  mocks.listTasks.mockResolvedValue({ ok: true, data: [] });
  mocks.createTask.mockResolvedValue({ ok: true, data: makePlannerTask() });
  mocks.updateTask.mockResolvedValue({ ok: true, data: true });
  mocks.deleteTask.mockResolvedValue({ ok: true, data: true });
  mocks.completeTask.mockResolvedValue({
    ok: true,
    data: { xpAwarded: 0, totalXp: 0, level: 1, unlocks: [] },
  });
  mocks.reopenTask.mockResolvedValue({ ok: true, data: true });
  mocks.fetchXpState.mockResolvedValue({ ok: true, data: emptyXp });
  mocks.listRewardDefinitions.mockResolvedValue({ ok: true, data: [] });
  mocks.listUnlocks.mockResolvedValue({ ok: true, data: new Map() });
  mocks.listXpHistory.mockResolvedValue({ ok: true, data: [] });
  mocks.listDecks.mockResolvedValue({ ok: true, data: [] });
  mocks.listCards.mockResolvedValue({ ok: true, data: [] });
  mocks.createDeck.mockResolvedValue({ ok: true, data: makeDeck() });
  mocks.addCard.mockResolvedValue({ ok: true, data: makeCard() });
  mocks.saveCardResult.mockResolvedValue({ ok: true, data: true });
  mocks.deleteCard.mockResolvedValue({ ok: true, data: true });
  mocks.listQuizSets.mockResolvedValue({ ok: true, data: [] });
  mocks.getQuizQuestions.mockResolvedValue({ ok: true, data: [] });
  mocks.submitQuizAttempt.mockResolvedValue({ ok: true, data: { score: 1, total: 1, results: [] } });
  mocks.listMyAttempts.mockResolvedValue({ ok: true, data: [] });
  mocks.listDocuments.mockResolvedValue({ ok: true, data: [] });
  mocks.storageReady.mockResolvedValue({ ok: true, data: true });
  mocks.createDocumentUrl.mockResolvedValue({ ok: true, data: 'https://example.test/fil' });
  mocks.listDirectConversations.mockResolvedValue({ ok: true, data: [] });
  mocks.listMessages.mockResolvedValue({ ok: true, data: [] });
  mocks.sendMessage.mockResolvedValue({
    ok: true,
    data: {
      id: 'm1',
      sender_id: 'elev-1',
      sender_username: 'ejentu01',
      body: 'Hej!',
      created_at: new Date().toISOString(),
    },
  });
  mocks.listClasses.mockResolvedValue({ ok: true, data: [] });
  mocks.listClassMembers.mockResolvedValue({ ok: true, data: [] });
  mocks.getClassChannelId.mockResolvedValue({ ok: true, data: 'kanal-1' });
}

async function renderElev(page: string) {
  window.history.replaceState(null, '', `#/elev/${page}`);
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

beforeEach(() => {
  resetData();
  makeBackend();
});

afterEach(() => {
  cleanup();
  mocks.backend = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------- tester

describe('elevens meny', () => {
  it('öppnar varje menyval utan att krascha och visar en riktig sida', async () => {
    for (const page of panelPages('elev')) {
      window.history.replaceState(null, '', `#/elev/${page}`);
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>,
      );
      await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());

      expect(screen.getByTestId('panel-elev')).toBeTruthy();
      // Varje sida har ett eget data-testid som börjar med page-elev-.
      expect(document.querySelector('[data-testid^="page-elev-"]')).toBeTruthy();
      cleanup();
    }
  });
});

describe('översikten', () => {
  it('räknar kvarvarande uppgifter och visar dagens planering', async () => {
    mocks.listMyTasks.mockResolvedValue({
      ok: true,
      data: [
        makeTask({ id: 'a', due_date: '2026-10-20' }),
        makeTask({ id: 'b', title: 'Klar uppgift', status: 'klar' }),
      ],
    });
    mocks.listTasks.mockResolvedValue({ ok: true, data: [] });
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 120, level: 2, xpPerLevel: 100, intoLevel: 20, xpToNext: 80 },
    });

    await renderElev('start');

    expect(await screen.findByText(/du har 1 uppgift kvar/i)).toBeTruthy();
    expect(screen.getByText(/nivå 2/i)).toBeTruthy();
    expect(screen.getByText('Kommande uppgifter')).toBeTruthy();
  });

  it('visar ett tydligt tomläge när det inte finns något', async () => {
    await renderElev('start');

    expect(await screen.findByText('Inga uppgifter just nu')).toBeTruthy();
  });

  it('visar att en del inte kunde hämtas i stället för en falsk nolla', async () => {
    mocks.listMyTasks.mockResolvedValue({ ok: true, data: [makeTask()] });
    mocks.fetchXpState.mockResolvedValue({ ok: false, error: 'Servern svarade inte.' });

    await renderElev('start');

    // Uppgiften finns kvar, men poängen visas som saknad — inte som noll.
    expect((await screen.findAllByText('Träna multiplikation')).length).toBeGreaterThan(0);
    const notice = await screen.findByTestId('partial-data');
    expect(notice.textContent).toMatch(/dina poäng/);
  });
});

describe('mina uppgifter', () => {
  it('visar uppgifter med status och ämne', async () => {
    mocks.listMyTasks.mockResolvedValue({ ok: true, data: [makeTask()] });

    await renderElev('uppgifter');

    expect(await screen.findByText('Träna multiplikation')).toBeTruthy();
    expect(screen.getByText(/matematik/i)).toBeTruthy();
    // Läget i flödet: en uppgift som inte påbörjats är Ny.
    expect(screen.getByText('Ny')).toBeTruthy();
  });

  it('öppnar instruktionerna och markerar uppgiften klar med XP som svar', async () => {
    mocks.listMyTasks.mockResolvedValue({ ok: true, data: [makeTask()] });

    await renderElev('uppgifter');
    fireEvent.click(await screen.findByRole('button', { name: 'Öppna' }));

    expect(await screen.findByText('Gör uppgifterna 1–10.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /markera klar/i }));

    await waitFor(() =>
      expect(mocks.setMyTaskStatus).toHaveBeenCalledWith('task-1', 'klar', null),
    );
    expect(await screen.findByTestId('reward-celebration')).toBeTruthy();
    expect(screen.getByText('+10 XP')).toBeTruthy();
  });

  it('lämnar in ett svar utan att ändra lärarens instruktioner', async () => {
    mocks.listMyTasks.mockResolvedValue({ ok: true, data: [makeTask()] });

    await renderElev('uppgifter');
    fireEvent.click(await screen.findByRole('button', { name: 'Öppna' }));

    fireEvent.change(await screen.findByLabelText('Ditt svar'), {
      target: { value: 'Jag har gjort alla uppgifter.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lämna in/i }));

    await waitFor(() =>
      expect(mocks.setMyTaskStatus).toHaveBeenCalledWith(
        'task-1',
        'pagar',
        'Jag har gjort alla uppgifter.',
      ),
    );
    expect(await screen.findByTestId('task-notice')).toBeTruthy();
  });

  it('visar ett begripligt fel när servern nekar åtgärden', async () => {
    mocks.listMyTasks.mockResolvedValue({ ok: true, data: [makeTask()] });
    mocks.setMyTaskStatus.mockResolvedValue({
      ok: false,
      error: 'Uppgiften är inte tilldelad dig.',
    });

    await renderElev('uppgifter');
    fireEvent.click(await screen.findByRole('button', { name: 'Öppna' }));
    fireEvent.click(await screen.findByRole('button', { name: /markera klar/i }));

    expect(await screen.findByText('Uppgiften är inte tilldelad dig.')).toBeTruthy();
  });

  it('visar fel och kan försöka igen när hämtningen misslyckas', async () => {
    mocks.listMyTasks.mockResolvedValue({ ok: false, error: 'Kopplingen till servern misslyckades.' });

    await renderElev('uppgifter');

    expect(await screen.findByTestId('error-state')).toBeTruthy();
    mocks.listMyTasks.mockResolvedValue({ ok: true, data: [makeTask()] });
    fireEvent.click(screen.getByRole('button', { name: /försök igen/i }));
    expect(await screen.findByText('Träna multiplikation')).toBeTruthy();
  });
});

describe('mina ämnen', () => {
  it('grupperar uppgifter per ämne', async () => {
    mocks.listMyTasks.mockResolvedValue({
      ok: true,
      data: [makeTask({ id: 'a', subject: 'Matematik' }), makeTask({ id: 'b', subject: 'Svenska', status: 'klar' })],
    });

    await renderElev('amnen');

    expect(await screen.findByText('Matematik')).toBeTruthy();
    expect(screen.getByText('Svenska')).toBeTruthy();
  });

  it('visar ett tydligt tomläge när inga ämnen finns', async () => {
    await renderElev('amnen');
    expect(await screen.findByText('Inga ämnen ännu')).toBeTruthy();
  });
});

describe('min planering', () => {
  it('skiljer egna poster från det läraren har tilldelat', async () => {
    mocks.listTasks.mockResolvedValue({ ok: true, data: [makePlannerTask()] });
    mocks.listMyTasks.mockResolvedValue({ ok: true, data: [makeTask()] });

    await renderElev('planering');

    // Sektionsrubriken finns även medan datan hämtas — vänta in själva raden.
    expect(await screen.findByText('Träna multiplikation')).toBeTruthy();
    expect(screen.getByText('Från din lärare')).toBeTruthy();
    expect(screen.getByText('Mina egna poster')).toBeTruthy();
    expect(screen.getAllByText('Läsa kapitel 4').length).toBeGreaterThan(0);
  });

  it('sparar en ny egen post', async () => {
    await renderElev('planering');
    fireEvent.click(await screen.findByRole('button', { name: /ny post/i }));

    fireEvent.change(screen.getByLabelText(/rubrik/i), { target: { value: 'Plugga inför provet' } });
    fireEvent.click(screen.getByRole('button', { name: /skapa post/i }));

    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Plugga inför provet' }),
      ),
    );
  });

  it('markerar en egen post som klar och visar de 10 XP servern betalade ut', async () => {
    mocks.listTasks.mockResolvedValue({ ok: true, data: [makePlannerTask()] });
    mocks.completeTask.mockResolvedValue({
      ok: true,
      data: { xpAwarded: 10, totalXp: 20, level: 1, unlocks: [] },
    });

    await renderElev('planering');
    fireEvent.click(await screen.findByRole('button', { name: 'Klar' }));

    await waitFor(() => expect(mocks.completeTask).toHaveBeenCalledWith('plan-1'));
    expect((await screen.findAllByText(/Du fick 10 XP/)).length).toBeGreaterThan(0);
    // Serverns svar avgör siffran — rutan kan aldrig visa fel summa.
    expect(screen.queryByText(/ingen ny XP/)).toBeNull();
  });

  it('visar upplåsningen när XP:n når en belöning', async () => {
    mocks.listTasks.mockResolvedValue({ ok: true, data: [makePlannerTask()] });
    mocks.completeTask.mockResolvedValue({
      ok: true,
      data: {
        xpAwarded: 10,
        totalXp: 20,
        level: 1,
        unlocks: [
          {
            id: 'r1',
            name: 'Lysande pumpalykta',
            description: 'En pumpalykta som brinner hela natten.',
            theme: 'halloween',
            illustration: 'pumpa-glod',
            bonusXp: 0,
            items: ['pumpa-glod'],
          },
        ],
      },
    });

    await renderElev('planering');
    fireEvent.click(await screen.findByRole('button', { name: 'Klar' }));

    expect(await screen.findByTestId('reward-celebration')).toBeTruthy();
    // Rubriken ligger i modalens huvud, innehållet i rutan.
    expect(screen.getAllByText(/Ny belöning: Lysande pumpalykta/).length).toBeGreaterThan(0);
  });

  it('förklarar att en redan avklarad post inte ger ny XP', async () => {
    mocks.listTasks.mockResolvedValue({ ok: true, data: [makePlannerTask()] });
    mocks.completeTask.mockResolvedValue({
      ok: true,
      data: { xpAwarded: 0, totalXp: 10, level: 1, unlocks: [] },
    });

    await renderElev('planering');
    fireEvent.click(await screen.findByRole('button', { name: 'Klar' }));

    expect((await screen.findAllByText(/ingen ny XP/)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
  });
});

describe('flashcards', () => {
  it('övar på ett kort och sparar repetitionsstatus', async () => {
    mocks.listDecks.mockResolvedValue({ ok: true, data: [makeDeck()] });
    mocks.listCards.mockResolvedValue({
      ok: true,
      data: [makeCard(), makeCard({ id: 'card-2', question: 'Vad heter bil?', answer: 'car' })],
    });

    await renderElev('flashcards');
    fireEvent.click(await screen.findByRole('button', { name: 'Öva' }));

    expect((await screen.findAllByText('Vad heter hus på engelska?')).length).toBeGreaterThan(0);

    // Vänd kortet för att se svaret.
    fireEvent.click(screen.getByRole('button', { name: /visa svaret/i }));
    expect((await screen.findAllByText('house')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /jag kunde det/i }));
    await waitFor(() => expect(mocks.saveCardResult).toHaveBeenCalledWith('card-1', true));
  });

  it('skapar ett nytt kort i en egen kortlek', async () => {
    mocks.listDecks.mockResolvedValue({ ok: true, data: [makeDeck()] });
    mocks.listCards.mockResolvedValue({ ok: true, data: [makeCard()] });

    await renderElev('flashcards');
    fireEvent.click(await screen.findByRole('button', { name: 'Öva' }));
    await screen.findAllByText('Vad heter hus på engelska?');

    fireEvent.click(screen.getByRole('button', { name: /nytt kort/i }));
    fireEvent.change(screen.getByLabelText(/^Fråga/), { target: { value: 'Vad heter hund?' } });
    fireEvent.change(screen.getByLabelText(/^Svar/), { target: { value: 'dog' } });
    fireEvent.click(screen.getByRole('button', { name: /spara kort/i }));

    await waitFor(() =>
      expect(mocks.addCard).toHaveBeenCalledWith('deck-1', 'Vad heter hund?', 'dog', 1),
    );
  });
});

describe('provträning', () => {
  it('genomför en övning och visar det serverrättade resultatet', async () => {
    mocks.listQuizSets.mockResolvedValue({ ok: true, data: [makeQuizSet()] });
    mocks.getQuizQuestions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'q1',
          prompt: 'Hur många grader är en rät vinkel?',
          options: ['45', '90'],
          position: 0,
        },
      ],
    });
    mocks.submitQuizAttempt.mockResolvedValue({
      ok: true,
      data: {
        score: 1,
        total: 1,
        results: [
          {
            question_id: 'q1',
            prompt: 'Hur många grader är en rät vinkel?',
            options: ['45', '90'],
            choice: 1,
            correct_index: 1,
            correct: true,
            explanation: 'En rät vinkel är alltid 90 grader.',
          },
        ],
      },
    });

    await renderElev('provtraning');
    fireEvent.click(await screen.findByRole('button', { name: 'Öppna' }));

    expect(await screen.findByText('Hur många grader är en rät vinkel?')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('90'));
    fireEvent.click(screen.getByRole('button', { name: /rätta och visa resultat/i }));

    await waitFor(() =>
      expect(mocks.submitQuizAttempt).toHaveBeenCalledWith('quiz-1', [{ question_id: 'q1', choice: 1 }]),
    );
    expect(await screen.findByText(/alla rätt/i)).toBeTruthy();
    expect(screen.getByText('En rät vinkel är alltid 90 grader.')).toBeTruthy();
  });

  it('visar ett tydligt tomläge när inga övningar finns', async () => {
    await renderElev('provtraning');
    expect(await screen.findByText('Inga övningar ännu')).toBeTruthy();
  });
});

describe('mina dokument', () => {
  it('stänger av uppladdning när lagringen inte är konfigurerad', async () => {
    mocks.storageReady.mockResolvedValue({ ok: true, data: false });

    await renderElev('dokument');

    expect(await screen.findByTestId('storage-missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ladda upp/i })).toHaveProperty('disabled', true);
  });

  it('visar delade dokument med storlek och kan öppna dem', async () => {
    mocks.listDocuments.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'doc-1',
          owner_id: 'spec-1',
          title: 'Arbetsblad bråk',
          description: 'Utskriftsbart',
          subject: 'Matematik',
          storage_path: 'spec-1/fil.pdf',
          mime_type: 'application/pdf',
          size_bytes: 2048,
          student_id: 'elev-1',
          class_id: null,
          created_at: '2026-10-10T10:00:00Z',
        },
      ],
    });

    await renderElev('dokument');

    expect(await screen.findByText('Arbetsblad bråk')).toBeTruthy();
    expect(screen.getByText(/2 kB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Öppna' }));
    await waitFor(() => expect(mocks.createDocumentUrl).toHaveBeenCalled());
  });
});

describe('min klass och klasschatt', () => {
  it('förklarar att eleven inte är med i någon klass', async () => {
    await renderElev('klass');
    expect(await screen.findByText('Du är inte med i någon klass ännu')).toBeTruthy();
  });

  it('visar klasskamrater när eleven är med i en klass', async () => {
    mocks.listClasses.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'klass-1',
          name: '7A',
          description: null,
          created_by: 'spec-1',
          created_at: '2026-10-01T10:00:00Z',
          member_role: 'elev',
          memberCount: 2,
        },
      ],
    });
    mocks.listClassMembers.mockResolvedValue({
      ok: true,
      data: [
        { user_id: 'elev-1', username: 'ejentu01', role: 'elev', member_role: 'elev' },
        { user_id: 'elev-2', username: 'eanna02', role: 'elev', member_role: 'elev' },
        { user_id: 'spec-1', username: 'espec01', role: 'speciallärare', member_role: 'larare' },
      ],
    });

    await renderElev('klass');

    expect((await screen.findAllByText('7A')).length).toBeGreaterThan(0);
    expect(await screen.findByText('eanna02')).toBeTruthy();

    // Eleven själv listas inte som klasskamrat.
    const classmatesCard = screen.getByText('Klasskamrater').closest('section');
    expect(classmatesCard).toBeTruthy();
    expect(within(classmatesCard as HTMLElement).queryByText('ejentu01')).toBeNull();
    expect(await screen.findByText('espec01')).toBeTruthy();
  });

  it('öppnar klasschatten i klassens kanal', async () => {
    mocks.listClasses.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'klass-1',
          name: '7A',
          description: null,
          created_by: 'spec-1',
          created_at: '2026-10-01T10:00:00Z',
          member_role: 'elev',
          memberCount: 2,
        },
      ],
    });
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        sender_id: 'spec-1',
        sender_username: 'espec01',
        body: 'Hej klassen!',
        created_at: new Date().toISOString(),
      },
    ];
    mocks.listMessages.mockResolvedValue({ ok: true, data: messages });

    await renderElev('klasschatt');

    await waitFor(() => expect(mocks.getClassChannelId).toHaveBeenCalledWith('klass-1'));
    expect(await screen.findByText('Hej klassen!')).toBeTruthy();
    expect(screen.getByTestId('message-thread')).toBeTruthy();
  });
});

describe('mina meddelanden', () => {
  const makeConversation = (overrides: Partial<DirectConversation> = {}): DirectConversation => ({
    channelId: 'dm-1',
    otherId: 'spec-1',
    otherUsername: 'espec01',
    lastBody: 'Hur går det med uppgiften?',
    lastAt: '2026-10-16T09:00:00Z',
    ...overrides,
  });

  it('visar ett tydligt tomläge innan någon lärare har skrivit', async () => {
    await renderElev('meddelanden');

    expect(await screen.findByText('Inga meddelanden ännu')).toBeTruthy();
    expect(screen.queryByTestId('message-thread')).toBeNull();
  });

  it('visar samtalet och läser meddelandena från rätt kanal', async () => {
    mocks.listDirectConversations.mockResolvedValue({ ok: true, data: [makeConversation()] });
    mocks.listMessages.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'm1',
          sender_id: 'spec-1',
          sender_username: 'espec01',
          body: 'Hur går det med uppgiften?',
          created_at: new Date().toISOString(),
        },
      ],
    });

    await renderElev('meddelanden');

    expect(await screen.findByText('Samtal med espec01')).toBeTruthy();
    expect(mocks.listMessages).toHaveBeenCalledWith('dm-1');

    // Meddelandet ligger i själva konversationen, inte bara som förhandsvisning.
    // Tråden hämtar meddelandena i ett eget steg — vänta in dem.
    const thread = screen.getByTestId('message-thread');
    expect(await within(thread).findByText('Hur går det med uppgiften?')).toBeTruthy();
    expect(within(thread).getAllByText(/espec01/).length).toBeGreaterThan(0);
  });

  it('svarar i samtalet och hämtar om listan efter sändning', async () => {
    mocks.listDirectConversations.mockResolvedValue({ ok: true, data: [makeConversation()] });
    // Servern returnerar det sparade meddelandet — svaret ska synas direkt.
    mocks.sendMessage.mockImplementation(async (_channelId: string, body: string) => ({
      ok: true as const,
      data: {
        id: 'm2',
        sender_id: 'elev-1',
        sender_username: 'ejentu01',
        body,
        created_at: new Date().toISOString(),
      },
    }));

    await renderElev('meddelanden');
    await screen.findByTestId('message-thread');

    fireEvent.change(screen.getByLabelText('Meddelande'), {
      target: { value: 'Det går bra, jag är nästan klar.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /skicka/i }));

    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith('dm-1', 'Det går bra, jag är nästan klar.'),
    );
    // Svaret syns direkt i konversationen.
    expect(await screen.findByText('Det går bra, jag är nästan klar.')).toBeTruthy();
  });

  it('visar ett begripligt fel när servern nekar åtkomst till kanalen', async () => {
    mocks.listDirectConversations.mockResolvedValue({ ok: true, data: [makeConversation()] });
    mocks.listMessages.mockResolvedValue({
      ok: false,
      error: 'Du har inte tillgång till den konversationen.',
    });

    await renderElev('meddelanden');

    expect(
      await screen.findByText(/du har inte tillgång till den konversationen/i),
    ).toBeTruthy();
  });
});

describe('mina framsteg', () => {
  it('räknar klara uppgifter och visar resultat', async () => {
    mocks.listMyTasks.mockResolvedValue({
      ok: true,
      data: [
        makeTask({ id: 'a', subject: 'Matematik', status: 'klar' }),
        makeTask({ id: 'b', subject: 'Matematik' }),
      ],
    });
    mocks.listMyAttempts.mockResolvedValue({
      ok: true,
      data: [
        { id: 'at1', set_id: 'quiz-1', score: 3, total: 4, completed_at: '2026-10-15T10:00:00Z', set_title: 'Geometri' },
      ],
    });
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 30, level: 1, xpPerLevel: 100, intoLevel: 30, xpToNext: 70 },
    });

    await renderElev('framsteg');

    expect(await screen.findByText('Uppgifter klara')).toBeTruthy();
    expect(screen.getByText('1 av 2 klara')).toBeTruthy();
    expect(screen.getByText(/75 %/)).toBeTruthy();
  });

  it('visar ett tydligt tomläge innan det finns data', async () => {
    await renderElev('framsteg');
    expect(await screen.findByText('Ingen data ännu')).toBeTruthy();
  });

  it('visar nivåring, nästa belöning och vägen till trädgården', async () => {
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 30, level: 1, xpPerLevel: 100, intoLevel: 30, xpToNext: 70 },
    });
    mocks.listRewardDefinitions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'r1',
          name: 'Glödande pumpa',
          description: null,
          theme: 'halloween',
          position: 1,
          xp_required: 20,
          bonus_xp: 0,
          illustration: 'pumpa-glod',
          unlocks_items: ['pumpa-glod'],
          rarity: 'vanlig',
          is_final: false,
          active: true,
        },
        {
          id: 'r2',
          name: 'Månskenslyktan',
          description: 'En lykta som brinner hela natten.',
          theme: 'halloween',
          position: 2,
          xp_required: 60,
          bonus_xp: 0,
          illustration: 'lykta',
          unlocks_items: ['lykta'],
          rarity: 'sallsynt',
          is_final: false,
          active: true,
        },
      ],
    });
    mocks.listUnlocks.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          'r1',
          {
            id: 'u1',
            reward_id: 'r1',
            bonus_xp_awarded: 0,
            unlocked_at: '2026-10-01T10:00:00Z',
            source_task_title: null,
          },
        ],
      ]),
    });

    await renderElev('framsteg');

    const hero = await screen.findByTestId('framsteg-hero');
    expect(within(hero).getByText('Nästa belöning')).toBeTruthy();
    expect(within(hero).getByText('Månskenslyktan')).toBeTruthy();
    expect(within(hero).getByText('30 XP kvar')).toBeTruthy();
    expect(
      within(hero)
        .getByRole('link', { name: /Öppna trädgården/i })
        .getAttribute('href'),
    ).toBe('#/elev/belonningar');
    expect(screen.getByText('Milstolpar')).toBeTruthy();
  });
});

describe('belöningar', () => {
  function beloning(
    id: string,
    name: string,
    xp: number,
    illustration: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      name,
      description: null,
      theme: 'halloween',
      position: 11,
      xp_required: xp,
      bonus_xp: 0,
      illustration,
      unlocks_items: [illustration],
      rarity: 'vanlig',
      is_final: false,
      active: true,
      ...overrides,
    };
  }

  it('visar XP, nivå och upplåsta belöningar från servern', async () => {
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 30, level: 1, xpPerLevel: 100, intoLevel: 30, xpToNext: 70 },
    });
    mocks.listRewardDefinitions.mockResolvedValue({
      ok: true,
      data: [
        beloning('r1', 'Lysande pumpalykta', 20, 'pumpa-glod'),
        beloning('r2', 'Häxkittel', 550, 'kittel', { position: 17, rarity: 'sallsynt' }),
        // Ett avstängt tema får inte synas i gränssnittet längre.
        beloning('r3', 'Blomman', 25, 'blomma', { theme: 'tradgard', active: false }),
      ],
    });
    mocks.listUnlocks.mockResolvedValue({
      ok: true,
      data: new Map([
        ['r1', { id: 'u1', reward_id: 'r1', bonus_xp_awarded: 0, unlocked_at: '2026-10-10T10:00:00Z' }],
      ]),
    });

    await renderElev('belonningar');

    // Den upplåsta belöningen finns både i samlingen och i historiken.
    expect((await screen.findAllByText('Lysande pumpalykta')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Häxkittel').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('hh-item-unlocked')).toHaveLength(1);
    expect(screen.getAllByTestId('hh-item-locked')).toHaveLength(1);
    expect(screen.getByText('Nästa mål')).toBeTruthy();
    // Det avstängda temat visas inte alls.
    expect(screen.queryByText('Blomman')).toBeNull();
  });

  it('visar ett tydligt tomläge när belöningsbiblioteket är tomt', async () => {
    await renderElev('belonningar');
    expect(await screen.findByText('Inga Halloween-föremål i biblioteket ännu')).toBeTruthy();
  });
});

describe('Halloween-trädgården', () => {
  function halloweenReward(
    id: string,
    name: string,
    xp: number,
    position: number,
    illustration: string,
    rarity = 'vanlig',
  ) {
    return {
      id,
      name,
      description: null,
      theme: 'halloween',
      position,
      xp_required: xp,
      bonus_xp: 0,
      illustration,
      unlocks_items: [illustration],
      rarity,
      is_final: false,
    };
  }

  it('visar Halloween som enda trädgård och skiljer låsta från upplåsta föremål', async () => {
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 60, level: 1, xpPerLevel: 100, intoLevel: 60, xpToNext: 40 },
    });
    mocks.listRewardDefinitions.mockResolvedValue({
      ok: true,
      data: [
        halloweenReward('pumpa', 'Glad pumpa', 30, 11, 'pumpa-glod'),
        halloweenReward('kittel', 'Kitteln', 280, 16, 'kittel', 'sallsynt'),
      ],
    });
    mocks.listUnlocks.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          'pumpa',
          {
            id: 'u1',
            reward_id: 'pumpa',
            bonus_xp_awarded: 0,
            unlocked_at: '2026-10-14T10:00:00Z',
            source_task_title: 'Räkna kapitel 3',
            source_kind: 'student',
          },
        ],
      ]),
    });

    await renderElev('belonningar');

    const garden = await screen.findByTestId('halloween-garden');
    expect(within(garden).getByTestId('halloween-scene')).toBeTruthy();
    expect(screen.queryByTestId('reward-garden')).toBeNull();
    expect(screen.queryByText('Din trädgård')).toBeNull();

    // Ett föremål är upplåst och ett är låst — båda syns i samlingen.
    expect(screen.getAllByTestId('hh-item-unlocked')).toHaveLength(1);
    expect(screen.getAllByTestId('hh-item-locked')).toHaveLength(1);
    expect(screen.getByText(/Genom uppgiften ”Räkna kapitel 3”/)).toBeTruthy();
  });

  it('förklarar när inga Halloween-föremål är upplåsta ännu', async () => {
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 20, level: 1, xpPerLevel: 100, intoLevel: 20, xpToNext: 80 },
    });

    await renderElev('belonningar');

    expect(await screen.findByTestId('halloween-garden')).toBeTruthy();
    expect(screen.getByText(/Inga Halloween-föremål är upplåsta ännu/i)).toBeTruthy();
    expect(screen.queryByTestId('reward-garden')).toBeNull();
  });
});

describe('min planering – kalendern', () => {
  it('filtrerar på en dag i kalendern och visar alla dagar igen', async () => {
    mocks.listTasks.mockResolvedValue({
      ok: true,
      data: [makePlannerTask({ id: 'plan-1', title: 'Läsa kapitel 4', due_date: '2026-10-20' })],
    });
    mocks.listMyTasks.mockResolvedValue({
      ok: true,
      data: [makeTask({ id: 'task-1', title: 'Träna multiplikation', due_date: '2026-10-22' })],
    });

    await renderElev('planering');

    expect(await screen.findByTestId('planner-calendar')).toBeTruthy();
    // Dagen med en egen post har en räknare, dagen bredvid har ingen.
    const dayWithPlan = await screen.findByTestId('calendar-day-2026-10-20');
    expect(dayWithPlan.textContent).toContain('1');

    fireEvent.click(dayWithPlan);

    const note = await screen.findByTestId('day-filter');
    expect(note.textContent).toMatch(/20 okt 2026/);
    // Bara poster den dagen visas.
    expect(screen.queryByText('Träna multiplikation')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /visa alla dagar/i }));
    await waitFor(() => expect(screen.queryByTestId('day-filter')).toBeNull());
    expect(await screen.findByText('Träna multiplikation')).toBeTruthy();
  });
});

describe('återkoppling på uppgifter', () => {
  it('visar lärarens återkoppling och att uppgiften är bedömd', async () => {
    mocks.listMyTasks.mockResolvedValue({
      ok: true,
      data: [
        makeTask({
          id: 'task-1',
          title: 'Träna multiplikation',
          status: 'klar',
          submitted_at: '2026-10-15T10:00:00Z',
          submission: 'Klart!',
          followed_up_at: '2026-10-16T10:00:00Z',
          follow_up_note: 'Bra jobbat! Visa uträkningen nästa gång.',
        }),
      ],
    });

    await renderElev('uppgifter');
    fireEvent.click(await screen.findByRole('button', { name: 'Öppna' }));

    const feedback = await screen.findByTestId('teacher-feedback');
    expect(within(feedback).getByText(/bra jobbat/i)).toBeTruthy();
    expect(within(feedback).getByText(/uppföljd 16 okt 2026/i)).toBeTruthy();
    expect(screen.getAllByText('Bedömd').length).toBeGreaterThan(0);
  });

  it('visar ingen återkoppling innan läraren har tittat på uppgiften', async () => {
    mocks.listMyTasks.mockResolvedValue({
      ok: true,
      data: [makeTask({ id: 'task-1', submitted_at: '2026-10-15T10:00:00Z' })],
    });

    await renderElev('uppgifter');

    expect(await screen.findByText('Inlämnad')).toBeTruthy();
    expect(screen.queryByTestId('teacher-feedback')).toBeNull();
  });
});

describe('uppdateringar i inställningarna', () => {
  it('låter eleven söka efter uppdateringar från profilen', async () => {
    await renderElev('start');

    fireEvent.click(await screen.findByRole('button', { name: 'Konto och profil' }));
    const menu = await screen.findByRole('menu', { name: 'Kontomeny' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /profil & inställningar/i }));

    const card = await screen.findByTestId('update-settings');
    expect(within(card).getByText('Uppdateringar')).toBeTruthy();
    expect(within(card).getByTestId('update-check')).toBeTruthy();
    expect(within(card).getByTestId('update-current-version').textContent).toBeTruthy();
  });
});
