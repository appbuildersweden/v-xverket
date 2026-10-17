import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { ClassInfo } from '../lib/classes';

/**
 * Elevens väg in i en klass: klasskoden skickar en ansökan, och först ett
 * godkänt medlemskap ger klassens innehåll. Privata elever får samma möjlighet
 * utan att skapa ett nytt konto, och ser tydligt vad som gäller tills dess.
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
  listClasses: vi.fn(),
  listClassMembers: vi.fn(),
  requestClassJoin: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => mocks.backend,
}));

vi.mock('../lib/classes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/classes')>();
  return {
    ...actual,
    listClasses: mocks.listClasses,
    listClassMembers: mocks.listClassMembers,
    requestClassJoin: mocks.requestClassJoin,
  };
});

function student(overrides: Partial<VäxverketUser> = {}): VäxverketUser {
  return {
    id: 'u-elev',
    username: 'eannaad01',
    role: 'elev',
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

async function renderKlass() {
  window.history.replaceState(null, '', '#/elev/klass');
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
  return screen.findByTestId('page-elev-klass');
}

beforeEach(() => {
  mocks.listClasses.mockResolvedValue({ ok: true, data: [] as ClassInfo[] });
  mocks.listClassMembers.mockResolvedValue({ ok: true, data: [] });
  mocks.requestClassJoin.mockResolvedValue({
    ok: true,
    data: {
      status: 'vantar',
      class_id: 'c1',
      class_name: '8B matematik',
      message: 'Ansökan är skickad. Din lärare behöver godkänna den innan du ser klassens innehåll.',
    },
  });
});

afterEach(() => {
  cleanup();
  mocks.backend = null;
  vi.clearAllMocks();
});

describe('klassansökan med klasskod', () => {
  it('skickar ansökan och berättar att läraren måste godkänna', async () => {
    makeBackend({ exists: true, user: student() });
    await renderKlass();

    fireEvent.change(await screen.findByLabelText('Klasskod'), {
      target: { value: 'abc234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Skicka ansökan/ }));

    // Koden normaliseras till versaler innan den skickas till servern.
    await waitFor(() => expect(mocks.requestClassJoin).toHaveBeenCalledWith('ABC234'));
    expect(await screen.findByTestId('class-code-message')).toBeTruthy();
    expect(screen.getByText(/lärare behöver godkänna/)).toBeTruthy();
  });

  it('avvisar en klasskod med fel format utan att fråga servern', async () => {
    makeBackend({ exists: true, user: student() });
    await renderKlass();

    fireEvent.change(await screen.findByLabelText('Klasskod'), {
      target: { value: 'ABC' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Skicka ansökan/ }));

    expect(await screen.findByText(/sex tecken/)).toBeTruthy();
    expect(mocks.requestClassJoin).not.toHaveBeenCalled();
  });

  it('visar serverns fel när koden inte finns', async () => {
    makeBackend({ exists: true, user: student() });
    mocks.requestClassJoin.mockResolvedValue({
      ok: false,
      error: 'Klasskoden stämmer inte. Kontrollera med din lärare.',
    });
    await renderKlass();

    fireEvent.change(await screen.findByLabelText('Klasskod'), {
      target: { value: 'ZZZ999' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Skicka ansökan/ }));

    expect(await screen.findByText(/Klasskoden stämmer inte/)).toBeTruthy();
    expect(screen.queryByTestId('class-code-message')).toBeNull();
  });

  it('skickar en privat elev till privatelevpanelen i stället för klassvyn', async () => {
    makeBackend({ exists: true, user: student({ accountType: 'privat' }) });
    window.history.replaceState(null, '', '#/elev/klass');
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());

    // Det privata kontot har sin egen panel. Klassvyn och klasskoden är aldrig
    // åtkomliga — varken via menyn eller via en inklistrad adress.
    const shell = await screen.findByTestId('app-shell');
    expect(shell.getAttribute('data-panel')).toBe('privat');
    expect(screen.queryByTestId('page-elev-klass')).toBeNull();
    expect(screen.queryByTestId('class-code-form')).toBeNull();
  });

  it('erbjuder ingen klassansökan till ett begränsat konto', async () => {
    makeBackend({ exists: true, user: student({ limited: true }) });
    await renderKlass();

    expect(screen.queryByTestId('class-code-form')).toBeNull();
    expect(await screen.findByText(/Du är inte med i någon klass ännu/)).toBeTruthy();
  });

  it('visar klasskamrater för en elev som redan är med i en klass', async () => {
    makeBackend({ exists: true, user: student() });
    mocks.listClasses.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'c1',
          name: '8B matematik',
          description: null,
          created_by: 'u-teacher',
          created_at: '2026-10-16T08:00:00Z',
          member_role: 'elev',
          memberCount: 1,
        } satisfies ClassInfo,
      ],
    });
    mocks.listClassMembers.mockResolvedValue({
      ok: true,
      data: [
        { user_id: 'u-elev', username: 'eannaad01', role: 'elev', member_role: 'elev' },
        { user_id: 'u-2', username: 'ebert01', role: 'elev', member_role: 'elev' },
      ],
    });
    await renderKlass();

    // Klassnamnet visas i både detaljlistan och rubriken för klasskamraterna.
    expect((await screen.findAllByText('8B matematik')).length).toBeGreaterThan(0);
    expect(await screen.findByText('ebert01')).toBeTruthy();
  });
});
