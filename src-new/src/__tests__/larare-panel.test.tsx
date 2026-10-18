import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { JoinRequest, MyClass, MyStudent } from '../lib/classes';
import type { AssignedTask } from '../lib/assignments';
import { panelPages } from '../lib/nav';

/**
 * Lärarpanelen mot en mockad backend.
 *
 * Mockarna ligger på datalagret, precis som i de andra paneltesterna. Det gör
 * att testerna beskriver hela flödet — vad som visas och vilka anrop som skickas
 * — medan den auktoritativa behörigheten (RLS och funktionernas egna kontroller)
 * kräver en riktig databas och testas där.
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
  listMyClasses: vi.fn(),
  listMyStudents: vi.fn(),
  listClassJoinRequests: vi.fn(),
  decideClassJoinRequest: vi.fn(),
  createClassWithCode: vi.fn(),
  rotateClassCode: vi.fn(),
  removeClassStudent: vi.fn(),
  listAdminAccounts: vi.fn(),
  requestClassJoin: vi.fn(),
  listAssignedTasks: vi.fn(),
  createAssignedTask: vi.fn(),
  deleteAssignedTask: vi.fn(),
  openDirectChannel: vi.fn(),
  listDocuments: vi.fn(),
  storageReady: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => mocks.backend,
}));

vi.mock('../lib/classes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/classes')>();
  return {
    ...actual,
    listMyClasses: mocks.listMyClasses,
    listMyStudents: mocks.listMyStudents,
    listClassJoinRequests: mocks.listClassJoinRequests,
    decideClassJoinRequest: mocks.decideClassJoinRequest,
    createClassWithCode: mocks.createClassWithCode,
    rotateClassCode: mocks.rotateClassCode,
    removeClassStudent: mocks.removeClassStudent,
    listAdminAccounts: mocks.listAdminAccounts,
    requestClassJoin: mocks.requestClassJoin,
  };
});

// Uppgiftsformuläret och undervisningsmaterialet läser dokumentlistan.
vi.mock('../lib/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documents')>();
  return {
    ...actual,
    listDocuments: mocks.listDocuments,
    storageReady: mocks.storageReady,
  };
});

vi.mock('../lib/assignments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assignments')>();
  return {
    ...actual,
    listAssignedTasks: mocks.listAssignedTasks,
    createAssignedTask: mocks.createAssignedTask,
    deleteAssignedTask: mocks.deleteAssignedTask,
  };
});

vi.mock('../lib/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/chat')>();
  return {
    ...actual,
    openDirectChannel: mocks.openDirectChannel,
  };
});

const CLASSES: MyClass[] = [
  {
    id: 'c1',
    name: '8B matematik',
    description: null,
    member_role: 'larare',
    member_count: 3,
    join_code: 'ABC234',
    created_at: '2026-10-16T08:00:00Z',
  },
];

const STUDENTS: MyStudent[] = [
  {
    id: 's1',
    username: 'eannaad01',
    account_type: 'skola',
    class_id: 'c1',
    class_name: '8B matematik',
  },
  {
    id: 's2',
    username: 'ebert01',
    account_type: 'privat',
    class_id: 'c1',
    class_name: '8B matematik',
  },
];

const REQUESTS: JoinRequest[] = [
  {
    id: 'r1',
    class_id: 'c1',
    class_name: '8B matematik',
    student_id: 's9',
    student_username: 'enyna01',
    status: 'vantar',
    requested_at: '2026-10-16T09:00:00Z',
  },
];

const TASKS: AssignedTask[] = [];

function teacher(overrides: Partial<VäxverketUser> = {}): VäxverketUser {
  return {
    id: 'u-teacher',
    username: 'elara01',
    role: 'lärare',
    active: true,
    mustChangePassword: false,
    accountType: 'skola',
    ...overrides,
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

async function renderApp(hash = '') {
  window.history.replaceState(null, '', hash || '#');
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

beforeEach(() => {
  mocks.listMyClasses.mockResolvedValue({ ok: true, data: CLASSES });
  mocks.listMyStudents.mockResolvedValue({ ok: true, data: STUDENTS });
  mocks.listClassJoinRequests.mockResolvedValue({ ok: true, data: REQUESTS });
  mocks.decideClassJoinRequest.mockResolvedValue({ ok: true, data: true });
  mocks.createClassWithCode.mockResolvedValue({
    ok: true,
    data: { id: 'c2', name: '9A fysik', join_code: 'XYZ789' },
  });
  mocks.rotateClassCode.mockResolvedValue({ ok: true, data: 'QWE456' });
  mocks.removeClassStudent.mockResolvedValue({ ok: true, data: true });
  mocks.listAdminAccounts.mockResolvedValue({
    ok: true,
    data: [{ id: 'a1', username: 'ejentu01' }],
  });
  mocks.listDocuments.mockResolvedValue({ ok: true, data: [] });
  mocks.storageReady.mockResolvedValue({ ok: true, data: true });
  mocks.requestClassJoin.mockResolvedValue({
    ok: true,
    data: {
      status: 'vantar',
      class_id: 'c1',
      class_name: '8B matematik',
      message: 'Ansökan är skickad. Din lärare behöver godkänna den.',
    },
  });
  mocks.listAssignedTasks.mockResolvedValue({ ok: true, data: TASKS });
  mocks.createAssignedTask.mockResolvedValue({ ok: true, data: TASKS[0] });
  mocks.deleteAssignedTask.mockResolvedValue({ ok: true, data: true });
  mocks.openDirectChannel.mockResolvedValue({ ok: true, data: 'chan-1' });
});

afterEach(() => {
  cleanup();
  mocks.backend = null;
  vi.clearAllMocks();
});

describe('lärarens panel och rollstyrning', () => {
  it('skickar läraren till lärarpanelen och speglar ruten i adressen', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp();

    expect(await screen.findByTestId('panel-larare')).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/larare/hem'));
    expect(screen.queryByTestId('panel-admin')).toBeNull();
  });

  it('visar lärarens menyval — och inga administratörslänkar', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp();

    const nav = await screen.findByLabelText('Huvudmeny');
    expect(await within(nav).findByText('Klasser')).toBeTruthy();
    fireEvent.click(within(nav).getByRole('button', { name: /^Klasser$/ }));
    expect(within(nav).getByText('Mina klasser')).toBeTruthy();
    expect(within(nav).getByText('Mina elever')).toBeTruthy();
    expect(within(nav).queryByText('Registreringsansökningar')).toBeNull();
    expect(within(nav).queryByText('Roller och behörigheter')).toBeNull();
  });

  it('släpper inte in läraren i adminpanelen via adressen', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/admin/ansokningar');

    expect(await screen.findByTestId('panel-larare')).toBeTruthy();
    expect(screen.queryByTestId('panel-admin')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('route-notice')).toBeTruthy());
  });

  it('visar ett tydligt fel i stället för siffror om hämtningen misslyckas', async () => {
    makeBackend({ exists: true, user: teacher() });
    mocks.listMyClasses.mockResolvedValue({ ok: false, error: 'Servern svarade inte.' });
    await renderApp();

    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(screen.queryByText('8B matematik')).toBeNull();
  });
});

describe('klasser och klassansökningar', () => {
  it('visar klassansökningar och godkänner dem genom serverfunktionen', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/larare/klasser');

    expect(await screen.findByTestId('page-larare-klasser')).toBeTruthy();
    expect(await screen.findByText('enyna01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Godkänn/ }));

    await waitFor(() =>
      expect(mocks.decideClassJoinRequest).toHaveBeenCalledWith('r1', true),
    );
    // Godkännandet hämtar om listan så att ansökan försvinner ur vyn.
    await waitFor(() => expect(mocks.listClassJoinRequests.mock.calls.length).toBeGreaterThan(1));
  });

  it('visar klasskoden och kan byta den', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/larare/klasser');

    expect(await screen.findByText('ABC234')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Ny kod/ }));

    await waitFor(() => expect(mocks.rotateClassCode).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('QWE456')).toBeTruthy();
  });

  it('skapar en klass och visar den nya klasskoden', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/larare/klasser');

    fireEvent.click(await screen.findByRole('button', { name: 'Ny klass' }));
    fireEvent.change(screen.getByLabelText(/Klassens namn/), {
      target: { value: '9A fysik' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skapa klass' }));

    await waitFor(() => expect(mocks.createClassWithCode).toHaveBeenCalled());
    expect(mocks.createClassWithCode.mock.calls[0][0]).toBe('9A fysik');
    expect(await screen.findByTestId('new-class-code')).toBeTruthy();
  });

  it('tvingar fram en bekräftelse innan en elev tas ur klassen', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/larare/klasser');

    expect(await screen.findByText('eannaad01')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ta bort' })[0]);
    // Ingenting händer förrän bekräftelsen är gjord.
    expect(mocks.removeClassStudent).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Bekräfta' })[0]);
    await waitFor(() => expect(mocks.removeClassStudent).toHaveBeenCalledWith('c1', 's1'));
  });
});

describe('lärarens elever', () => {
  it('visar eleverna i lärarens egna klasser och kan starta ett samtal', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/larare/elever');

    expect(await screen.findByTestId('page-larare-elever')).toBeTruthy();
    expect(await screen.findByText('eannaad01')).toBeTruthy();
    expect(screen.getByText('ebert01')).toBeTruthy();
    expect(screen.getByText(/Privat elev/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Skicka meddelande/ })[0]);
    await waitFor(() => expect(mocks.openDirectChannel).toHaveBeenCalledWith('s1'));
  });
});

describe('lärarens uppgifter och kontakt', () => {
  it('visar uppgiftssidan med tomt läge när inget tilldelats', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/larare/uppgifter');

    expect(await screen.findByTestId('page-larare-uppgifter')).toBeTruthy();
    expect(await screen.findByText(/Inga uppgifter ännu/)).toBeTruthy();
    expect(screen.getByText('8B matematik')).toBeTruthy();
  });

  it('kan öppna ett samtal med administratören', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp('#/larare/kontakt-admin');

    expect(await screen.findByTestId('page-larare-kontakt-admin')).toBeTruthy();
    expect(await screen.findByText('ejentu01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Skriv' }));
    await waitFor(() => expect(mocks.openDirectChannel).toHaveBeenCalledWith('a1'));
  });

  it('öppnar varje menyval i lärarpanelen utan att krascha', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp();

    for (const page of panelPages('larare')) {
      // Adressen skrivs in som i adressfältet; händelsen levereras direkt så
      // att provet inte hänger på när jsdom hinner köa den.
      window.history.replaceState(null, '', `#/larare/${page}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await waitFor(() => expect(window.location.hash).toBe(`#/larare/${page}`));
      expect(await screen.findByTestId('panel-larare')).toBeTruthy();
    }
  });
});

describe('uppdateringar i inställningarna', () => {
  it('låter läraren söka efter uppdateringar från profilen', async () => {
    makeBackend({ exists: true, user: teacher() });
    await renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Konto och profil' }));
    const menu = await screen.findByRole('menu', { name: 'Kontomeny' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /profil & inställningar/i }));

    const card = await screen.findByTestId('update-settings');
    expect(within(card).getByText('Uppdateringar')).toBeTruthy();
    expect(within(card).getByTestId('update-check')).toBeTruthy();
    expect(within(card).getByTestId('update-current-version').textContent).toBeTruthy();
  });
});
