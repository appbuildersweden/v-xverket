import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend } from '../lib/auth-types';

/**
 * Verifierar att en session som upphör att gälla (Supabase SIGNED_OUT, t.ex.
 * återkallad eller utgången token) skickar tillbaka användaren till
 * inloggningen i stället för att appen låtsas vara inloggad.
 */
const hoisted = vi.hoisted(() => ({
  backend: null as AuthServiceBackend | null,
  listener: null as null | ((event: string, session: unknown) => void),
  unsubscribe: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => {
    if (!hoisted.backend) throw new Error('backend saknas i testet');
    return hoisted.backend;
  },
}));

vi.mock('../lib/auth-supabase', () => ({
  getOrCreateSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        hoisted.listener = cb;
        return { data: { subscription: { unsubscribe: hoisted.unsubscribe } } };
      },
    },
  }),
  mapUser: (user: unknown) => user,
}));

const elev = {
  id: 'u-1',
  username: 'ejentu01',
  role: 'elev' as const,
  active: true,
  mustChangePassword: false,
};

function makeBackend(): AuthServiceBackend {
  const backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({ exists: true, user: elev })),
    getCurrentUser: vi.fn(async () => elev),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(async () => ({ ok: false as const, error: 'nej' })),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'nej' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => ({ ok: true as const, accounts: [] })),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'nej' })),
  } as unknown as AuthServiceBackend;
  hoisted.backend = backend;
  return backend;
}

afterEach(() => {
  cleanup();
  hoisted.backend = null;
  hoisted.listener = null;
});

describe('utgången session', () => {
  it('skickar användaren till inloggningen när sessionen inte längre är giltig', async () => {
    makeBackend();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('panel-elev')).toBeTruthy();

    await act(async () => {
      hoisted.listener?.('SIGNED_OUT', null);
    });

    expect(await screen.findByRole('button', { name: 'Logga in' })).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });

  it('avslutar prenumerationen när appen avmonteras', async () => {
    makeBackend();
    const view = render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());

    view.unmount();
    expect(hoisted.unsubscribe).toHaveBeenCalled();
  });
});
