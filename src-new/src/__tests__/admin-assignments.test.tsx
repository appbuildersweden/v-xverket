import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthAccount, AuthServiceBackend } from '../lib/auth-types';
import type { AssignedTask } from '../lib/assignments';
import type { ClassInfo } from '../lib/classes';

/**
 * Uppgiftssidan i adminpanelen. Sidan använder samma uppgiftssystem som lärar-
 * och elevpanelerna — här mockas datalagret så att listning, nyckeltal,
 * skapande, redigering och borttagning kan provas utan Supabase.
 */
const hoisted = vi.hoisted(() => ({
  backend: null as AuthServiceBackend | null,
  listAssignedTasks: vi.fn(),
  createAssignedTask: vi.fn(),
  updateAssignedTask: vi.fn(),
  deleteAssignedTask: vi.fn(),
  markFollowUp: vi.fn(),
  listClasses: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => {
    if (!hoisted.backend) throw new Error('backend saknas i testet');
    return hoisted.backend;
  },
}));

vi.mock('../lib/assignments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assignments')>();
  return {
    ...actual,
    listAssignedTasks: hoisted.listAssignedTasks,
    createAssignedTask: hoisted.createAssignedTask,
    updateAssignedTask: hoisted.updateAssignedTask,
    deleteAssignedTask: hoisted.deleteAssignedTask,
    markFollowUp: hoisted.markFollowUp,
  };
});

vi.mock('../lib/classes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/classes')>();
  return { ...actual, listClasses: hoisted.listClasses };
});

// Uppgiftsformuläret och uppgiftsraden visar material som hör till uppgiften.
// Dokumentlistan mockas som tom, så att testet handlar om uppgifterna.
vi.mock('../lib/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documents')>();
  return { ...actual, listDocuments: hoisted.listDocuments };
});

const admin = {
  id: 'admin-1',
  username: 'eadmin01',
  role: 'admin' as const,
  active: true,
  mustChangePassword: false,
};

const CLASSES: ClassInfo[] = [
  {
    id: 'c1',
    name: '9A',
    description: null,
    created_by: 'admin-1',
    created_at: '2026-01-01T00:00:00Z',
    member_role: null,
    memberCount: 12,
  },
];

const ACCOUNTS: AuthAccount[] = [
  { id: 'admin-1', username: 'eadmin01', role: 'admin', active: true, createdAt: null },
  { id: 'elev-1', username: 'ejentu02', role: 'elev', active: true, createdAt: null, firstName: 'Jens', lastName: 'Turesson' },
];

const task = (over: Partial<AssignedTask>): AssignedTask => ({
  id: 't1',
  created_by: 'admin-1',
  student_id: 'elev-1',
  class_id: null,
  title: 'Träna multiplikation',
  description: null,
  instructions: null,
  subject: 'Matematik',
  due_date: '2026-12-01',
  status: 'ej_paborjad',
  submission: null,
  submitted_at: null,
  completed_at: null,
  xp_awarded: false,
  follow_up: false,
  follow_up_note: null,
  followed_up_at: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  student_username: 'ejentu02',
  ...over,
});

const TASKS: AssignedTask[] = [
  task({}),
  task({
    id: 't2',
    student_id: null,
    class_id: 'c1',
    title: 'Läs kapitel 3',
    status: 'klar',
    submitted_at: '2026-11-05T10:00:00Z',
  }),
];

function makeBackend() {
  hoisted.backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({ exists: true, user: admin })),
    getCurrentUser: vi.fn(async () => admin),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => ({ ok: true as const, accounts: ACCOUNTS })),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    updateAccountProfile: vi.fn(async () => ({ ok: true as const })),
    setAccountRole: vi.fn(async () => ({ ok: true as const })),
    resetAccountPassword: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
  } as unknown as AuthServiceBackend;
}

async function renderAssignments() {
  window.history.replaceState(null, '', '#/admin/uppgifter');
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

beforeEach(() => {
  hoisted.listClasses.mockResolvedValue({ ok: true, data: CLASSES });
  hoisted.listAssignedTasks.mockResolvedValue({ ok: true, data: TASKS });
  hoisted.createAssignedTask.mockResolvedValue({ ok: true, data: task({ id: 't9' }) });
  hoisted.updateAssignedTask.mockResolvedValue({ ok: true, data: true });
  hoisted.deleteAssignedTask.mockResolvedValue({ ok: true, data: true });
  hoisted.markFollowUp.mockResolvedValue({ ok: true, data: true });
  hoisted.listDocuments.mockResolvedValue({ ok: true, data: [] });
});

afterEach(() => {
  cleanup();
  hoisted.backend = null;
  vi.clearAllMocks();
});

describe('uppgifter i adminpanelen', () => {
  it('visar uppgifterna med mottagare och status', async () => {
    makeBackend();
    await renderAssignments();

    expect(await screen.findByTestId('page-admin-uppgifter')).toBeTruthy();
    // Sidan renderas innan uppgifterna är hämtade — vänta in den riktiga raden.
    expect(await screen.findByText('Träna multiplikation')).toBeTruthy();
    expect((await screen.findAllByText(/ejentu02/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Klass: 9A/)).length).toBeGreaterThan(0);
  });

  it('räknar nyckeltal ur den hämtade datan', async () => {
    makeBackend();
    await renderAssignments();
    await screen.findByText('Träna multiplikation');

    // Två uppgifter: en öppen och en klar.
    expect(screen.getByText('Totalt')).toBeTruthy();
    expect(screen.getByText('Öppna')).toBeTruthy();
    expect(screen.getByText('Klara')).toBeTruthy();
    expect(screen.getByText('Väntar uppföljning')).toBeTruthy();
  });

  it('visar ett tydligt tomläge när det inte finns uppgifter', async () => {
    hoisted.listAssignedTasks.mockResolvedValue({ ok: true, data: [] });
    makeBackend();
    await renderAssignments();

    expect(await screen.findByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText(/inga uppgifter ännu/i)).toBeTruthy();
  });

  it('visar backendfel i stället för data', async () => {
    hoisted.listAssignedTasks.mockResolvedValue({ ok: false, error: 'Åtkomst nekad.' });
    makeBackend();
    await renderAssignments();

    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(screen.queryByText('Träna multiplikation')).toBeNull();
  });

  it('skapar en uppgift och hämtar listan igen', async () => {
    makeBackend();
    await renderAssignments();
    await screen.findByText('Träna multiplikation');

    fireEvent.click(screen.getByRole('button', { name: /ny uppgift/i }));
    const form = within(screen.getByTestId('assignment-form'));
    fireEvent.change(form.getByLabelText(/^Till$/), { target: { value: 'elev:elev-1' } });
    fireEvent.change(form.getByLabelText(/rubrik/i), { target: { value: 'Ny uppgift' } });
    fireEvent.click(form.getByRole('button', { name: /skapa uppgift/i }));

    await waitFor(() =>
      expect(hoisted.createAssignedTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ny uppgift',
          student_id: 'elev-1',
          class_id: null,
        }),
      ),
    );
    await waitFor(() => expect(hoisted.listAssignedTasks).toHaveBeenCalledTimes(2));
  });

  it('kräver att uppgiften får en mottagare', async () => {
    makeBackend();
    await renderAssignments();
    await screen.findByText('Träna multiplikation');

    fireEvent.click(screen.getByRole('button', { name: /ny uppgift/i }));
    const form = within(screen.getByTestId('assignment-form'));
    fireEvent.change(form.getByLabelText(/rubrik/i), { target: { value: 'Utan mottagare' } });
    fireEvent.click(form.getByRole('button', { name: /skapa uppgift/i }));

    expect((await screen.findByTestId('assignment-error')).textContent).toMatch(
      /elev eller en klass/i,
    );
    expect(hoisted.createAssignedTask).not.toHaveBeenCalled();
  });

  it('filtrerar på mottagare', async () => {
    makeBackend();
    await renderAssignments();
    await screen.findByText('Träna multiplikation');

    fireEvent.change(screen.getByLabelText('Filtrera på mottagare'), {
      target: { value: 'klass:c1' },
    });

    expect(screen.queryByText('Träna multiplikation')).toBeNull();
    expect(screen.getAllByText('Läs kapitel 3').length).toBeGreaterThan(0);
  });

  it('tar bort en uppgift efter bekräftelse', async () => {
    makeBackend();
    await renderAssignments();
    await screen.findByText('Träna multiplikation');

    const row = screen.getByText('Träna multiplikation').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^ta bort$/i }));
    fireEvent.click(within(row).getByRole('button', { name: /^ta bort$/i }));

    await waitFor(() => expect(hoisted.deleteAssignedTask).toHaveBeenCalledWith('t1'));
  });

  it('visar inlämningar som väntar på uppföljning', async () => {
    makeBackend();
    await renderAssignments();
    await screen.findByText('Träna multiplikation');

    expect(screen.getByText(/inlämningar att följa upp/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /följ upp/i }));
    const form = screen.getByTestId('follow-up-form');
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Bra jobbat!' } });
    fireEvent.click(within(form).getByRole('button', { name: /markera uppföljd/i }));

    await waitFor(() =>
      expect(hoisted.markFollowUp).toHaveBeenCalledWith('t2', 'Bra jobbat!'),
    );
  });
});
