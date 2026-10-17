import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { AuditRow, RegistrationApplicationRow } from '../lib/registration';

/**
 * Adminpanelens nya delar: registreringsansökningar och granskningsloggen.
 *
 * Anropen går mot databasens skyddade funktioner (security definer) — i testet är
 * de mockade på datalagret. Den verkliga behörigheten ligger i funktionerna, som
 * nekar alla utom administratörer.
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
  listRegistrationApplications: vi.fn(),
  decideRegistrationApplication: vi.fn(),
  listAuditLog: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => mocks.backend,
}));

vi.mock('../lib/registration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/registration')>();
  return {
    ...actual,
    listRegistrationApplications: mocks.listRegistrationApplications,
    decideRegistrationApplication: mocks.decideRegistrationApplication,
    listAuditLog: mocks.listAuditLog,
  };
});

const APPLICATIONS: RegistrationApplicationRow[] = [
  {
    id: 'app-1',
    kind: 'larare',
    status: 'vantar',
    full_name: 'Elda Lärare',
    summary: 'Lärare i matematik i Ronneby',
    risk_flags: ['kort-motivering'],
    bot_decision: 'granskas',
    created_at: '2026-10-16T09:00:00Z',
    decided_at: null,
    review_note: null,
    created_username: 'eelda01',
    created_class_code: null,
  },
  {
    id: 'app-2',
    kind: 'privat_elev',
    status: 'skapad',
    full_name: 'Elda Elev',
    summary: 'Privat elev',
    risk_flags: [],
    bot_decision: 'auto_godkand',
    created_at: '2026-10-16T08:00:00Z',
    decided_at: '2026-10-16T08:00:01Z',
    review_note: null,
    created_username: 'eelda02',
    created_class_code: null,
  },
];

const LOG: AuditRow[] = [
  {
    id: 'log-1',
    actor_username: 'ejentu01',
    actor_role: 'admin',
    action: 'account.role_changed',
    subject_type: 'user',
    subject_id: 'u-9',
    details: { from: 'elev', to: 'lärare' },
    created_at: '2026-10-16T09:30:00Z',
  },
  {
    id: 'log-2',
    actor_username: null,
    actor_role: 'registreringsbot',
    action: 'application.auto_approved',
    subject_type: 'application',
    subject_id: 'app-2',
    details: {},
    created_at: '2026-10-16T08:00:01Z',
  },
];

function admin(): VäxverketUser {
  return {
    id: 'u-admin',
    username: 'ejentu01',
    role: 'admin',
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
  // Servern filtrerar på status — mocken gör samma sak så att urvalet testas.
  mocks.listRegistrationApplications.mockImplementation(async (status: string | null) => ({
    ok: true,
    data: status ? APPLICATIONS.filter((row) => row.status === status) : APPLICATIONS,
  }));
  mocks.decideRegistrationApplication.mockResolvedValue({ ok: true, data: true });
  mocks.listAuditLog.mockResolvedValue({ ok: true, data: LOG });
});

afterEach(() => {
  cleanup();
  mocks.backend = null;
  vi.clearAllMocks();
});

describe('registreringsansökningar', () => {
  it('visar adminmenyn med ansökningar och granskningslogg', async () => {
    makeBackend({ exists: true, user: admin() });
    await renderApp();

    const nav = await screen.findByLabelText('Huvudmeny');
    expect(await within(nav).findByText('Användare')).toBeTruthy();
    fireEvent.click(within(nav).getByRole('button', { name: /^Användare$/ }));
    expect(await within(nav).findByText('Registreringsansökningar')).toBeTruthy();
  });

  it('listar ansökningar med kontotyp, varningssignaler och botens beslut', async () => {
    makeBackend({ exists: true, user: admin() });
    await renderApp('#/admin/ansokningar');

    expect(await screen.findByTestId('page-admin-ansokningar')).toBeTruthy();
    expect(await screen.findByText(/Elda Lärare/)).toBeTruthy();
    expect(screen.getByText('Lärare')).toBeTruthy();
    expect(screen.getByText(/kort-motivering/)).toBeTruthy();
    expect(screen.getByText(/granskas/)).toBeTruthy();
    // Urvalet är väntande ansökningar — boten har filtrerat på servern.
    expect(mocks.listRegistrationApplications).toHaveBeenCalledWith('vantar');
  });

  it('begränsar ett konto genom den skyddade serverfunktionen', async () => {
    makeBackend({ exists: true, user: admin() });
    await renderApp('#/admin/ansokningar');

    await screen.findByText(/Elda Lärare/);
    fireEvent.change(screen.getByLabelText(/Anteckning till loggen/), {
      target: { value: 'Behöver bekräftas av skolan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Begränsa/ }));

    await waitFor(() =>
      expect(mocks.decideRegistrationApplication).toHaveBeenCalledWith(
        'app-1',
        'begransad',
        'Behöver bekräftas av skolan',
      ),
    );
    await waitFor(() =>
      expect(mocks.listRegistrationApplications.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it('kräver en bekräftelse innan en ansökan avslås', async () => {
    makeBackend({ exists: true, user: admin() });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderApp('#/admin/ansokningar');

    await screen.findByText(/Elda Lärare/);
    fireEvent.click(screen.getByRole('button', { name: /Avslå/ }));

    expect(confirm).toHaveBeenCalled();
    expect(mocks.decideRegistrationApplication).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Avslå/ }));
    await waitFor(() =>
      expect(mocks.decideRegistrationApplication).toHaveBeenCalledWith('app-1', 'nekad', ''),
    );
    confirm.mockRestore();
  });

  it('visar ett tydligt fel i stället för påhittade siffror om hämtningen misslyckas', async () => {
    makeBackend({ exists: true, user: admin() });
    mocks.listRegistrationApplications.mockResolvedValue({
      ok: false,
      error: 'Endast administratörer får granska ansökningar.',
    });
    await renderApp('#/admin/ansokningar');

    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(screen.queryByText(/Elda Lärare/)).toBeNull();
  });
});

describe('granskningsloggen', () => {
  it('visar händelser i klartext utan känsliga uppgifter', async () => {
    makeBackend({ exists: true, user: admin() });
    await renderApp('#/admin/granskningslogg');

    expect(await screen.findByTestId('page-admin-granskningslogg')).toBeTruthy();
    expect(await screen.findByText(/Roll ändrad/)).toBeTruthy();
    expect(screen.getByText(/Ansökan godkändes automatiskt/)).toBeTruthy();
    expect(screen.getByText(/Registreringsboten/)).toBeTruthy();
    expect(screen.getByText(/ejentu01/)).toBeTruthy();
  });

  it('visar ett tomt läge när loggen inte har några händelser', async () => {
    makeBackend({ exists: true, user: admin() });
    mocks.listAuditLog.mockResolvedValue({ ok: true, data: [] });
    await renderApp('#/admin/granskningslogg');

    expect(await screen.findByText(/Loggen är tom/)).toBeTruthy();
  });
});
