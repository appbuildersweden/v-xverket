import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { AssignedTask } from '../lib/assignments';
import type { DirectConversation } from '../lib/chat';
import type { DocumentRow } from '../lib/documents';
import type { XpState } from '../lib/planner';
import { panelPages } from '../lib/nav';

/**
 * Speciallärarpanelens funktioner mot en mockad backend.
 *
 * Mockarna ligger på datalagret (samma gränssnitt som vyerna använder), så
 * testerna beskriver hela flödet: vad som visas, vilka anrop som skickas och vad
 * som händer efter en åtgärd. Serverns behörighetskontroll (RLS och
 * security definer-funktionerna) kan inte köras här — den kräver en riktig
 * Supabase-databas.
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
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
  listMyStudents: vi.fn(),
  listLinkableStudents: vi.fn(),
  linkStudent: vi.fn(),
  unlinkStudent: vi.fn(),
  listStaffAccounts: vi.fn(),
  listAssignedTasks: vi.fn(),
  createAssignedTask: vi.fn(),
  updateAssignedTask: vi.fn(),
  deleteAssignedTask: vi.fn(),
  markFollowUp: vi.fn(),
  getGlobalChannelId: vi.fn(),
  listDirectConversations: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  openDirectChannel: vi.fn(),
  listDocuments: vi.fn(),
  storageReady: vi.fn(),
  uploadDocument: vi.fn(),
  createDocumentUrl: vi.fn(),
  deleteDocument: vi.fn(),
  listClasses: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => mocks.backend,
}));

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

vi.mock('../lib/students', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/students')>();
  return {
    ...actual,
    listMyStudents: mocks.listMyStudents,
    listLinkableStudents: mocks.listLinkableStudents,
    linkStudent: mocks.linkStudent,
    unlinkStudent: mocks.unlinkStudent,
    listStaffAccounts: mocks.listStaffAccounts,
  };
});

vi.mock('../lib/assignments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assignments')>();
  return {
    ...actual,
    listAssignedTasks: mocks.listAssignedTasks,
    createAssignedTask: mocks.createAssignedTask,
    updateAssignedTask: mocks.updateAssignedTask,
    deleteAssignedTask: mocks.deleteAssignedTask,
    markFollowUp: mocks.markFollowUp,
  };
});

vi.mock('../lib/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/chat')>();
  return {
    ...actual,
    getGlobalChannelId: mocks.getGlobalChannelId,
    listDirectConversations: mocks.listDirectConversations,
    listMessages: mocks.listMessages,
    sendMessage: mocks.sendMessage,
    openDirectChannel: mocks.openDirectChannel,
  };
});

vi.mock('../lib/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documents')>();
  return {
    ...actual,
    listDocuments: mocks.listDocuments,
    storageReady: mocks.storageReady,
    uploadDocument: mocks.uploadDocument,
    createDocumentUrl: mocks.createDocumentUrl,
    deleteDocument: mocks.deleteDocument,
  };
});

vi.mock('../lib/classes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/classes')>();
  return {
    ...actual,
    listClasses: mocks.listClasses,
  };
});

// ---------------------------------------------------------------- testdata

const speciallarare: VäxverketUser = {
  id: 'spec-1',
  username: 'espec01',
  role: 'speciallärare',
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

function makeStudent(overrides: Partial<import('../lib/students').StudentSummary> = {}) {
  return {
    id: 'elev-1',
    username: 'eanna02',
    linkedAt: '2026-10-01T10:00:00Z',
    totalTasks: 2,
    openTasks: 1,
    doneTasks: 1,
    overdueTasks: 0,
    lastActivityAt: '2026-10-15T10:00:00Z',
    ...overrides,
  };
}

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
    status: 'pagar',
    submission: null,
    submitted_at: null,
    completed_at: null,
    xp_awarded: false,
    follow_up: false,
    follow_up_note: null,
    followed_up_at: null,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    student_username: 'eanna02',
    ...overrides,
  };
}

function makeDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    owner_id: 'spec-1',
    title: 'Arbetsblad bråk',
    description: null,
    subject: 'Matematik',
    storage_path: 'spec-1/arbetsblad.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    student_id: 'elev-1',
    class_id: null,
    task_id: null,
    created_at: '2026-10-12T10:00:00Z',
    ...overrides,
  };
}

function makeConversation(overrides: Partial<DirectConversation> = {}): DirectConversation {
  return {
    channelId: 'dm-1',
    otherId: 'elev-1',
    otherUsername: 'eanna02',
    lastBody: 'Hej, jag behöver hjälp med bråk.',
    lastAt: '2026-10-15T09:00:00Z',
    ...overrides,
  };
}

function makeBackend() {
  const backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({ exists: true, user: speciallarare })),
    getCurrentUser: vi.fn(async () => speciallarare),
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
  mocks.listTasks.mockResolvedValue({ ok: true, data: [] });
  mocks.createTask.mockResolvedValue({ ok: true, data: null });
  mocks.updateTask.mockResolvedValue({ ok: true, data: true });
  mocks.deleteTask.mockResolvedValue({ ok: true, data: true });
  mocks.completeTask.mockResolvedValue({
    ok: true,
    data: { xpAwarded: 10, totalXp: 10, level: 1, unlocks: [] },
  });
  mocks.reopenTask.mockResolvedValue({ ok: true, data: true });
  mocks.fetchXpState.mockResolvedValue({ ok: true, data: emptyXp });
  mocks.listRewardDefinitions.mockResolvedValue({ ok: true, data: [] });
  mocks.listUnlocks.mockResolvedValue({ ok: true, data: new Map() });
  mocks.listXpHistory.mockResolvedValue({ ok: true, data: [] });

  mocks.listMyStudents.mockResolvedValue({ ok: true, data: [] });
  mocks.listLinkableStudents.mockResolvedValue({ ok: true, data: [] });
  mocks.linkStudent.mockResolvedValue({ ok: true, data: true });
  mocks.unlinkStudent.mockResolvedValue({ ok: true, data: true });
  mocks.listStaffAccounts.mockResolvedValue({ ok: true, data: [] });

  mocks.listAssignedTasks.mockResolvedValue({ ok: true, data: [] });
  mocks.createAssignedTask.mockResolvedValue({ ok: true, data: makeTask() });
  mocks.updateAssignedTask.mockResolvedValue({ ok: true, data: true });
  mocks.deleteAssignedTask.mockResolvedValue({ ok: true, data: true });
  mocks.markFollowUp.mockResolvedValue({ ok: true, data: true });

  mocks.getGlobalChannelId.mockResolvedValue({ ok: true, data: 'global-1' });
  mocks.listDirectConversations.mockResolvedValue({ ok: true, data: [] });
  mocks.listMessages.mockResolvedValue({ ok: true, data: [] });
  mocks.openDirectChannel.mockResolvedValue({ ok: true, data: 'dm-1' });
  mocks.sendMessage.mockResolvedValue({
    ok: true,
    data: {
      id: 'm1',
      sender_id: 'spec-1',
      sender_username: 'espec01',
      body: 'Hej!',
      created_at: new Date().toISOString(),
    },
  });

  mocks.listDocuments.mockResolvedValue({ ok: true, data: [] });
  mocks.storageReady.mockResolvedValue({ ok: true, data: true });
  mocks.uploadDocument.mockResolvedValue({ ok: true, data: makeDocument() });
  mocks.createDocumentUrl.mockResolvedValue({ ok: true, data: 'https://example.test/fil' });
  mocks.deleteDocument.mockResolvedValue({ ok: true, data: true });

  mocks.listClasses.mockResolvedValue({ ok: true, data: [] });
}

async function renderPanel(page: string) {
  window.history.replaceState(null, '', `#/speciallarar/${page}`);
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

describe('speciallärarens meny', () => {
  it('öppnar varje menyval utan att krascha och visar en riktig sida', async () => {
    for (const page of panelPages('speciallarar')) {
      window.history.replaceState(null, '', `#/speciallarar/${page}`);
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>,
      );
      await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());

      expect(screen.getByTestId('panel-speciallarar')).toBeTruthy();
      expect(document.querySelector('[data-testid^="page-speciallarar-"]')).toBeTruthy();
      cleanup();
    }
  });
});

describe('hem', () => {
  it('räknar statistiken från riktiga data och listar eleverna', async () => {
    mocks.listMyStudents.mockResolvedValue({ ok: true, data: [makeStudent()] });
    mocks.listTasks.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'p1',
          user_id: 'spec-1',
          title: 'Planera veckan',
          description: null,
          notes: null,
          due_date: new Date().toISOString().slice(0, 10),
          priority: 'medel' as const,
          status: 'ej_paborjad' as const,
          category: 'arbetsomrade',
          completed_at: null,
          xp_awarded: false,
          created_at: '2026-10-10T10:00:00Z',
          updated_at: '2026-10-10T10:00:00Z',
        },
      ],
    });
    mocks.listAssignedTasks.mockResolvedValue({
      ok: true,
      data: [
        makeTask({ id: 'a', submitted_at: '2026-10-15T10:00:00Z' }),
        makeTask({ id: 'b', status: 'klar' }),
      ],
    });

    await renderPanel('hem');

    expect((await screen.findAllByText('Mina elever')).length).toBeGreaterThan(0);
    // Planeringen fylls på när panelens data har kommit in, så vänta in den.
    expect(await screen.findByText('Dagens planering')).toBeTruthy();
    expect(screen.getByText('Planera veckan')).toBeTruthy();
    expect(screen.getByText('eanna02')).toBeTruthy();
    // En uppgift väntar på uppföljning — inlämnad men inte uppföljd.
    expect(screen.getByText('Inlämningar som väntar på dig')).toBeTruthy();
    expect(screen.getByText('Träna multiplikation')).toBeTruthy();
  });

  it('visar ett tydligt tomläge när inga elever är kopplade', async () => {
    await renderPanel('hem');

    expect(await screen.findByText('Inga elever kopplade ännu')).toBeTruthy();
    expect(screen.getByText('Inget inplanerat idag')).toBeTruthy();
  });

  it('redovisar när en del av översikten inte kunde hämtas', async () => {
    mocks.listMyStudents.mockResolvedValue({
      ok: false,
      error: 'Du har inte behörighet till det här.',
    });

    await renderPanel('hem');

    expect(await screen.findByText(/en del av översikten kunde inte hämtas/i)).toBeTruthy();
    expect(screen.getByText(/du har inte behörighet/i)).toBeTruthy();
  });
});

describe('mina elever', () => {
  it('visar kopplade elever och filtrerar på användarnamn', async () => {
    mocks.listMyStudents.mockResolvedValue({
      ok: true,
      data: [makeStudent(), makeStudent({ id: 'elev-2', username: 'ebengt03' })],
    });

    await renderPanel('elever');

    expect(await screen.findByText('eanna02')).toBeTruthy();
    expect(screen.getByText('ebengt03')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Sök elev'), { target: { value: 'bengt' } });
    expect(screen.queryByText('eanna02')).toBeNull();
    expect(screen.getByText('ebengt03')).toBeTruthy();
  });

  it('öppnar elevprofilen, visar uppgifterna och går tillbaka utan att tappa listan', async () => {
    mocks.listMyStudents.mockResolvedValue({ ok: true, data: [makeStudent()] });
    mocks.listAssignedTasks.mockResolvedValue({ ok: true, data: [makeTask()] });

    await renderPanel('elever');
    fireEvent.click(await screen.findByRole('button', { name: 'Öppna' }));

    await waitFor(() => expect(mocks.listAssignedTasks).toHaveBeenCalledWith({ studentId: 'elev-1' }));
    expect(screen.getByTestId('student-detail')).toBeTruthy();
    const detail = screen.getByTestId('student-detail');
    expect(await within(detail).findByText('Träna multiplikation')).toBeTruthy();
    expect(within(detail).getAllByText('Pågående').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /tillbaka till elevlistan/i }));
    expect(screen.queryByTestId('student-detail')).toBeNull();
    expect(screen.getByText('eanna02')).toBeTruthy();
  });

  it('kopplar en elev från listan över lediga konton', async () => {
    mocks.listMyStudents.mockResolvedValue({ ok: true, data: [] });
    mocks.listLinkableStudents.mockResolvedValue({
      ok: true,
      data: [{ id: 'elev-9', username: 'efilip09' }],
    });

    await renderPanel('elever');
    fireEvent.click(await screen.findByRole('button', { name: /koppla din första elev/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'Koppla' }));

    await waitFor(() => expect(mocks.linkStudent).toHaveBeenCalledWith('elev-9'));
  });
});

describe('uppgifter och uppföljning', () => {
  it('skapar en uppgift till en elev och hämtar om listan', async () => {
    mocks.listMyStudents.mockResolvedValue({ ok: true, data: [makeStudent()] });

    await renderPanel('uppfoljning');
    fireEvent.click(await screen.findByRole('button', { name: /ny uppgift/i }));

    fireEvent.change(await screen.findByLabelText('Till'), { target: { value: 'elev:elev-1' } });
    fireEvent.change(screen.getByLabelText(/^Rubrik/), {
      target: { value: 'Träna division' },
    });
    fireEvent.change(screen.getByLabelText('Ämne'), { target: { value: 'Matematik' } });
    fireEvent.click(screen.getByRole('button', { name: /skapa uppgift/i }));

    await waitFor(() =>
      expect(mocks.createAssignedTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Träna division',
          subject: 'Matematik',
          student_id: 'elev-1',
          class_id: null,
        }),
      ),
    );
  });

  it('visar begripligt fel när uppgiften saknar mottagare', async () => {
    mocks.listMyStudents.mockResolvedValue({ ok: true, data: [makeStudent()] });

    await renderPanel('uppfoljning');
    fireEvent.click(await screen.findByRole('button', { name: /ny uppgift/i }));

    fireEvent.change(await screen.findByLabelText(/^Rubrik/), { target: { value: 'Utan mål' } });
    fireEvent.click(screen.getByRole('button', { name: /skapa uppgift/i }));

    expect(await screen.findByTestId('assignment-error')).toBeTruthy();
    expect(mocks.createAssignedTask).not.toHaveBeenCalled();
  });

  it('markerar en inlämning som uppföljd', async () => {
    mocks.listAssignedTasks.mockResolvedValue({
      ok: true,
      data: [makeTask({ submitted_at: '2026-10-15T10:00:00Z', submission: 'Klart!' })],
    });

    await renderPanel('uppfoljning');
    fireEvent.click(await screen.findByRole('button', { name: 'Följ upp' }));

    // Läraren kan skriva återkoppling som eleven sedan ser.
    fireEvent.change(screen.getByLabelText(/återkoppling till eleven/i), {
      target: { value: 'Bra jobbat!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Markera uppföljd' }));

    await waitFor(() => expect(mocks.markFollowUp).toHaveBeenCalledWith('task-1', 'Bra jobbat!'));
    expect(screen.getByText('Elevens svar: Klart!')).toBeTruthy();
  });

  it('visar serverns fel när en ändring nekas', async () => {
    mocks.listAssignedTasks.mockResolvedValue({
      ok: true,
      data: [makeTask({ submitted_at: '2026-10-15T10:00:00Z' })],
    });
    mocks.markFollowUp.mockResolvedValue({
      ok: false,
      error: 'Du har inte behörighet att ändra den här uppgiften.',
    });

    await renderPanel('uppfoljning');
    fireEvent.click(await screen.findByRole('button', { name: 'Följ upp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markera uppföljd' }));

    expect(await screen.findByText(/du har inte behörighet att ändra/i)).toBeTruthy();
  });
});

describe('min planering och att göra', () => {
  it('sparar en ny post och visar XP när posten markeras klar', async () => {
    await renderPanel('planering');

    fireEvent.click(await screen.findByRole('button', { name: /ny post/i }));
    fireEvent.change(screen.getByLabelText(/^Rubrik/), { target: { value: 'Rätta prov' } });
    fireEvent.click(screen.getByRole('button', { name: /skapa post/i }));

    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rätta prov' })),
    );

    // Efter omladdning finns posten kvar och kan markeras klar (ger XP).
    mocks.listTasks.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'p1',
          user_id: 'spec-1',
          title: 'Rätta prov',
          description: null,
          notes: null,
          due_date: null,
          priority: 'medel' as const,
          status: 'ej_paborjad' as const,
          category: 'arbetsomrade',
          completed_at: null,
          xp_awarded: false,
          created_at: '2026-10-16T10:00:00Z',
          updated_at: '2026-10-16T10:00:00Z',
        },
      ],
    });
    cleanup();
    await renderPanel('planering');

    fireEvent.click(await screen.findByRole('button', { name: /markera klar/i }));
    await waitFor(() => expect(mocks.completeTask).toHaveBeenCalledWith('p1'));
  });
});

describe('meddelande-elever', () => {
  it('öppnar ett privat samtal och skickar ett meddelande', async () => {
    mocks.listMyStudents.mockResolvedValue({ ok: true, data: [makeStudent()] });
    mocks.listDirectConversations.mockResolvedValue({ ok: true, data: [makeConversation()] });
    mocks.sendMessage.mockImplementation(async (_channelId: string, body: string) => ({
      ok: true as const,
      data: {
        id: 'm2',
        sender_id: 'spec-1',
        sender_username: 'espec01',
        body,
        created_at: new Date().toISOString(),
      },
    }));

    await renderPanel('meddelande-elever');
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv' }));

    await waitFor(() => expect(mocks.openDirectChannel).toHaveBeenCalledWith('elev-1'));
    expect(await screen.findByText(/konversation med eanna02/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Meddelande'), { target: { value: 'Hej!' } });
    fireEvent.click(screen.getByRole('button', { name: /skicka/i }));

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith('dm-1', 'Hej!'));
    expect(await screen.findByText('Hej!')).toBeTruthy();
  });

  it('visar serverns fel när samtalet inte får öppnas', async () => {
    mocks.listMyStudents.mockResolvedValue({ ok: true, data: [makeStudent()] });
    mocks.openDirectChannel.mockResolvedValue({
      ok: false,
      error: 'Kontakta en lärare — elever kan inte starta privata samtal.',
    });

    await renderPanel('meddelande-elever');
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv' }));

    expect(
      await screen.findByText(/elever kan inte starta privata samtal/i),
    ).toBeTruthy();
  });
});

describe('global chatt och privata chattar', () => {
  it('öppnar den globala kanalen som servern skapat', async () => {
    mocks.listMessages.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'g1',
          sender_id: 'elev-1',
          sender_username: 'eanna02',
          body: 'Hej allihopa!',
          created_at: new Date().toISOString(),
        },
      ],
    });

    await renderPanel('global-chatt');

    await waitFor(() => expect(mocks.getGlobalChannelId).toHaveBeenCalled());
    expect(await screen.findByText('Hej allihopa!')).toBeTruthy();
  });

  it('förklarar att chatten inte är skapad i databasen i stället för att krascha', async () => {
    mocks.getGlobalChannelId.mockResolvedValue({
      ok: false,
      error: 'Den globala chatten är inte skapad i databasen ännu.',
    });

    await renderPanel('global-chatt');

    expect(await screen.findByText(/inte skapad i databasen ännu/i)).toBeTruthy();
  });
});

describe('undervisningsmaterial', () => {
  it('stänger av uppladdning när fillagringen inte är konfigurerad', async () => {
    mocks.storageReady.mockResolvedValue({ ok: true, data: false });

    await renderPanel('material');

    await waitFor(() => expect(mocks.storageReady).toHaveBeenCalled());
    expect(await screen.findByTestId('storage-missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ladda upp/i }).hasAttribute('disabled')).toBe(true);
  });

  it('visar dokument och öppnar dem via en tidsbegränsad länk', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    mocks.listDocuments.mockResolvedValue({ ok: true, data: [makeDocument()] });

    await renderPanel('material');
    const row = (await screen.findByText('Arbetsblad bråk')).closest('li');
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /öppna/i }));

    await waitFor(() =>
      expect(mocks.createDocumentUrl).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc-1' }),
        { download: false },
      ),
    );
    expect(open).toHaveBeenCalledWith('https://example.test/fil', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('visar ett tydligt tomläge när inget material finns', async () => {
    await renderPanel('material');

    expect(await screen.findByText('Inget material ännu')).toBeTruthy();
  });
});

describe('belöningar och upplåsningar', () => {
  it('visar XP, nivå och nästa mål från servern', async () => {
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 30, level: 1, xpPerLevel: 100, intoLevel: 30, xpToNext: 70 },
    });
    mocks.listRewardDefinitions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'r1',
          name: 'Lysande pumpalykta',
          description: null,
          theme: 'halloween',
          position: 101,
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
          name: 'Häxkittel',
          description: null,
          theme: 'halloween',
          position: 107,
          xp_required: 550,
          bonus_xp: 0,
          illustration: 'kittel',
          unlocks_items: ['kittel'],
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
          { id: 'u1', reward_id: 'r1', bonus_xp_awarded: 0, unlocked_at: '2026-10-14T10:00:00Z' },
        ],
      ]),
    });

    await renderPanel('belonningar');

    // Den upplåsta belöningen finns både i samlingen och i historiken.
    expect((await screen.findAllByText('Lysande pumpalykta')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Häxkittel').length).toBeGreaterThan(0);
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getAllByText(/nästa mål/i).length).toBeGreaterThan(0);
  });

  it('visar bara Halloween-trädgården som aktiv trädgård', async () => {
    mocks.fetchXpState.mockResolvedValue({
      ok: true,
      data: { totalXp: 30, level: 1, xpPerLevel: 100, intoLevel: 30, xpToNext: 70 },
    });
    // Den gamla växtträdgården får inte visas som aktiv säsong längre.
    mocks.listRewardDefinitions.mockResolvedValue({
      ok: true,
      data: [
        { id: 'blomma', name: 'Blomma', description: null, theme: 'tradgard', position: 24, xp_required: 25, bonus_xp: 0, illustration: '🌸', unlocks_items: ['blomma'], is_final: false },
        { id: 'sol', name: 'Sol', description: null, theme: 'tradgard', position: 25, xp_required: 50, bonus_xp: 0, illustration: '☀️', unlocks_items: ['sol'], is_final: false },
      ],
    });
    mocks.listUnlocks.mockResolvedValue({
      ok: true,
      data: new Map([
        ['blomma', { id: 'u1', reward_id: 'blomma', bonus_xp_awarded: 0, unlocked_at: '2026-10-14T10:00:00Z' }],
      ]),
    });

    await renderPanel('belonningar');

    const garden = await screen.findByTestId('halloween-garden');
    expect(within(garden).getByTestId('halloween-scene')).toBeTruthy();
    expect(screen.queryByTestId('reward-garden')).toBeNull();
    expect(screen.queryByText('Din trädgård')).toBeNull();
  });
});

describe('profil och inställningar', () => {
  it('visar inloggat konto och roll i profilen', async () => {
    await renderPanel('hem');

    fireEvent.click(await screen.findByRole('button', { name: 'Konto och profil' }));

    const menu = await screen.findByRole('menu', { name: 'Kontomeny' });
    expect(within(menu).getByText('espec01')).toBeTruthy();
    expect(within(menu).getByText(/speciallärare/i)).toBeTruthy();
  });

  it('låter specialläraren söka efter uppdateringar från profilen', async () => {
    await renderPanel('hem');

    fireEvent.click(await screen.findByRole('button', { name: 'Konto och profil' }));
    const menu = await screen.findByRole('menu', { name: 'Kontomeny' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /profil & inställningar/i }));

    const card = await screen.findByTestId('update-settings');
    expect(within(card).getByText('Uppdateringar')).toBeTruthy();
    expect(within(card).getByTestId('update-check')).toBeTruthy();
    expect(within(card).getByTestId('update-current-version').textContent).toBeTruthy();
  });
});
