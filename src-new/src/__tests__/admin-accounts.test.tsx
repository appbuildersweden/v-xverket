import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type {
  AccountsResult,
  AuthAccount,
  AuthServiceBackend,
  CreateAccountResult,
  ResetPasswordResult,
} from '../lib/auth-types';

/**
 * Adminpanelens kontohantering mot en mockad backend.
 *
 * Serverns egen behörighetskontroll kan inte köras här (den kräver Supabase),
 * men testerna verifierar listningens alla lägen, filtreringen, åtgärderna
 * (namn, status, roll, lösenord), formulärvalideringen och att anropet som
 * skickas till backend innehåller exakt rätt uppgifter.
 */
const hoisted = vi.hoisted(() => ({
  backend: null as AuthServiceBackend | null,
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => {
    if (!hoisted.backend) throw new Error('backend saknas i testet');
    return hoisted.backend;
  },
}));

const admin = {
  id: '1',
  username: 'eadmin01',
  role: 'admin' as const,
  active: true,
  mustChangePassword: false,
};

const ACCOUNTS: AuthAccount[] = [
  { id: '1', username: 'eadmin01', role: 'admin', active: true, createdAt: '2026-01-01T10:00:00Z' },
  { id: '2', username: 'ejentu02', role: 'elev', active: true, createdAt: '2026-01-02T10:00:00Z', firstName: 'Jens', lastName: 'Turesson', accountType: 'skola' },
  { id: '3', username: 'espec01', role: 'speciallärare', active: false, createdAt: '2026-01-03T10:00:00Z' },
];

interface Options {
  accounts?: AccountsResult;
  createResult?: CreateAccountResult;
  resetResult?: ResetPasswordResult;
  typeResult?: { ok: true } | { ok: false; error: string };
}

type MockBackend = AuthServiceBackend & {
  listAccounts: ReturnType<typeof vi.fn>;
  createAccountWithUsername: ReturnType<typeof vi.fn>;
  setAccountActive: ReturnType<typeof vi.fn>;
  updateAccountProfile: ReturnType<typeof vi.fn>;
  setAccountRole: ReturnType<typeof vi.fn>;
  setAccountType: ReturnType<typeof vi.fn>;
  resetAccountPassword: ReturnType<typeof vi.fn>;
};

function makeBackend(options: Options = {}): MockBackend {
  const backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({ exists: true, user: admin })),
    getCurrentUser: vi.fn(async () => admin),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(
      async () =>
        options.createResult ?? { ok: true as const, username: 'enyuser01', role: 'elev' as const },
    ),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => options.accounts ?? { ok: true as const, accounts: ACCOUNTS }),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    updateAccountProfile: vi.fn(async () => ({ ok: true as const })),
    setAccountRole: vi.fn(async () => ({ ok: true as const })),
    setAccountType: vi.fn(
      async () => options.typeResult ?? { ok: true as const },
    ),
    resetAccountPassword: vi.fn(
      async () =>
        options.resetResult ?? {
          ok: true as const,
          username: 'ejentu02',
          initialPassword: 'Kaffekopp24',
        },
    ),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
  } as unknown as MockBackend;
  hoisted.backend = backend;
  return backend;
}

async function renderAdmin(page = 'anvandare') {
  window.history.replaceState(null, '', `#/admin/${page}`);
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

/** Formuläret för att skapa konto (menyn har också en post med samma namn). */
function createForm() {
  return within(screen.getByTestId('page-admin-create-user'));
}

/** Öppnar kontouppgifterna för ett konto i listan. */
async function openAccount(username: string) {
  const table = await screen.findByRole('table');
  const row = within(table).getByText(username).closest('tr');
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /hantera/i }));
  return within(await screen.findByTestId('account-detail'));
}

afterEach(() => {
  cleanup();
  hoisted.backend = null;
});

describe('kontolistan', () => {
  it('visar konton från backend med användarnamn, roll och status', async () => {
    makeBackend();
    await renderAdmin();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('eadmin01')).toBeTruthy();
    expect(within(table).getByText('ejentu02')).toBeTruthy();
    expect(within(table).getAllByText('elev').length).toBeGreaterThan(0);
    expect(within(table).getByText('Inaktiv')).toBeTruthy();
  });

  it('visar ett tydligt laddningsläge medan kontona hämtas', async () => {
    makeBackend();
    window.history.replaceState(null, '', '#/admin/anvandare');
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    expect(await screen.findByTestId('loading-state')).toBeTruthy();
  });

  it('visar ett begripligt tomläge när det inte finns några konton', async () => {
    makeBackend({ accounts: { ok: true, accounts: [] } });
    await renderAdmin();

    expect(await screen.findByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText(/inga konton hittades/i)).toBeTruthy();
  });

  it('visar felmeddelande och kan försöka igen när hämtningen misslyckas', async () => {
    const backend = makeBackend({
      accounts: { ok: false, error: 'Endast administratörer får göra detta.' },
    });
    await renderAdmin();

    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(screen.getByText(/endast administratörer/i)).toBeTruthy();

    backend.listAccounts.mockResolvedValueOnce({ ok: true, accounts: ACCOUNTS });
    fireEvent.click(screen.getByRole('button', { name: /försök igen/i }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('filtrerar på användarnamn eller namn', async () => {
    makeBackend();
    await renderAdmin();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Sök på användarnamn eller namn'), {
      target: { value: 'espec' },
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('espec01')).toBeTruthy();
    expect(within(table).queryByText('ejentu02')).toBeNull();
  });

  it('söker även på namnet', async () => {
    makeBackend();
    await renderAdmin();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Sök på användarnamn eller namn'), {
      target: { value: 'turesson' },
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('ejentu02')).toBeTruthy();
  });

  it('visar "Inga träffar" när filtret inte matchar något', async () => {
    makeBackend();
    await renderAdmin();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Sök på användarnamn eller namn'), {
      target: { value: 'finnsinte' },
    });

    expect(await screen.findByText(/inga träffar/i)).toBeTruthy();
  });

  it('filtrerar på status', async () => {
    makeBackend();
    await renderAdmin();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Filtrera på status'), {
      target: { value: 'inaktiva' },
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('espec01')).toBeTruthy();
    expect(within(table).queryByText('ejentu02')).toBeNull();
  });

  it('visar ett enskilt konto med uppgifter från backend', async () => {
    makeBackend();
    await renderAdmin();
    const detail = await openAccount('ejentu02');

    expect(detail.getByText(/konto: ejentu02/i)).toBeTruthy();
    expect(detail.getByText('2')).toBeTruthy(); // kontots id
    expect(detail.getByText('elev')).toBeTruthy();
    expect(detail.getByText('Jens Turesson')).toBeTruthy();
    expect(screen.getByRole('button', { name: /stäng kontouppgifterna/i })).toBeTruthy();
  });
});

describe('kontohandlingar', () => {
  it('inaktiverar ett konto efter en bekräftelse', async () => {
    const backend = makeBackend();
    await renderAdmin();
    const detail = await openAccount('ejentu02');

    fireEvent.click(detail.getByRole('button', { name: /inaktivera konto/i }));
    expect(detail.getByText(/inaktivera ejentu02/i)).toBeTruthy();
    fireEvent.click(detail.getByRole('button', { name: /^inaktivera$/i }));

    await waitFor(() => expect(backend.setAccountActive).toHaveBeenCalledWith('2', false));
    expect(backend.listAccounts).toHaveBeenCalledTimes(2);
  });

  it('byter namn via servern', async () => {
    const backend = makeBackend();
    await renderAdmin();
    const detail = await openAccount('ejentu02');

    fireEvent.change(detail.getByLabelText('Förnamn'), { target: { value: 'Jens Olof' } });
    fireEvent.click(detail.getByRole('button', { name: /spara namn/i }));

    await waitFor(() =>
      expect(backend.updateAccountProfile).toHaveBeenCalledWith('2', {
        firstName: 'Jens Olof',
        lastName: 'Turesson',
      }),
    );
  });

  it('visar ett nytt tillfälligt lösenord en gång', async () => {
    const backend = makeBackend();
    await renderAdmin();
    const detail = await openAccount('ejentu02');

    fireEvent.click(detail.getByRole('button', { name: /nytt tillfälligt lösenord/i }));
    fireEvent.click(detail.getByRole('button', { name: /skapa lösenord/i }));

    await waitFor(() => expect(backend.resetAccountPassword).toHaveBeenCalledWith('2'));
    expect((await screen.findByTestId('new-password-value')).textContent).toBe('Kaffekopp24');
  });

  it('byter roll efter en bekräftelse', async () => {
    const backend = makeBackend();
    await renderAdmin();
    const detail = await openAccount('ejentu02');

    fireEvent.change(detail.getByLabelText('Ny roll för ejentu02'), {
      target: { value: 'speciallärare' },
    });
    fireEvent.click(detail.getByRole('button', { name: /^byt roll$/i }));
    fireEvent.click(detail.getByRole('button', { name: /^byt roll$/i }));

    await waitFor(() =>
      expect(backend.setAccountRole).toHaveBeenCalledWith('2', 'speciallärare'),
    );
  });

  it('visar serverns fel och låtsas inte att ändringen lyckades', async () => {
    const backend = makeBackend();
    backend.setAccountActive.mockResolvedValueOnce({
      ok: false,
      error: 'Det måste finnas minst en aktiv administratör.',
    });
    await renderAdmin();
    const detail = await openAccount('espec01');

    fireEvent.click(detail.getByRole('button', { name: /aktivera konto/i }));
    fireEvent.click(detail.getByRole('button', { name: /^aktivera$/i }));

    expect(await detail.findByText(/minst en aktiv administratör/i)).toBeTruthy();
    expect(backend.listAccounts).toHaveBeenCalledTimes(1);
  });
});

describe('eleversidan', () => {
  it('visar bara elevkonton och kan filtrera på elevtyp', async () => {
    makeBackend();
    await renderAdmin('anv-elever');

    const table = await screen.findByRole('table');
    expect(within(table).getByText('ejentu02')).toBeTruthy();
    expect(within(table).queryByText('espec01')).toBeNull();

    fireEvent.change(screen.getByLabelText('Filtrera på elevtyp'), {
      target: { value: 'privat' },
    });
    expect(await screen.findByText(/inga träffar/i)).toBeTruthy();
  });

  it('har en egen knapp för att skapa elevkonto', async () => {
    makeBackend();
    await renderAdmin('anv-elever');
    await screen.findByRole('table');
    expect(screen.getAllByRole('button', { name: /skapa elevkonto/i }).length).toBeGreaterThan(0);
  });
});

describe('roller och behörigheter', () => {
  it('visar rollmatrisen och utesluter det egna kontot från rollbyte', async () => {
    makeBackend();
    await renderAdmin('roller');

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Administratör')).toBeTruthy();
    expect(within(table).getAllByText('Speciallärare').length).toBeGreaterThan(0);

    // Kontolistan hämtas asynkront efter rollmatrisen — vänta in den.
    const select = await screen.findByLabelText('Välj konto');
    expect(within(select).queryByText(/eadmin01/)).toBeNull();
    expect(within(select).getByText(/ejentu02/)).toBeTruthy();
  });

  it('byter roll via den skyddade åtgärden', async () => {
    const backend = makeBackend();
    await renderAdmin('roller');
    await screen.findByRole('table');

    fireEvent.change(await screen.findByLabelText('Välj konto'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Välj ny roll'), {
      target: { value: 'lärare' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Byt roll$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Byt roll$/i }));

    await waitFor(() => expect(backend.setAccountRole).toHaveBeenCalledWith('2', 'lärare'));
  });

  it('gör ett elevkonto till privat elev via den skyddade åtgärden', async () => {
    const backend = makeBackend();
    await renderAdmin('roller');
    await screen.findByRole('table');

    fireEvent.change(await screen.findByLabelText('Välj elevkonto'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Välj kontotyp'), {
      target: { value: 'privat' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Spara kontotyp$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Spara kontotyp$/i }));

    await waitFor(() => expect(backend.setAccountType).toHaveBeenCalledWith('2', 'privat'));
  });

  it('visar serverns vägande när eleven är klassmedlem', async () => {
    const backend = makeBackend({
      typeResult: {
        ok: false,
        error: 'Eleven är med i en klass. Ta bort eleven från klassen först, annars finns klassåtkomsten kvar.',
      },
    });
    await renderAdmin('roller');
    await screen.findByRole('table');

    fireEvent.change(await screen.findByLabelText('Välj elevkonto'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Välj kontotyp'), { target: { value: 'privat' } });
    fireEvent.click(screen.getByRole('button', { name: /^Spara kontotyp$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Spara kontotyp$/i }));

    const error = await screen.findByTestId('account-type-error');
    expect(error.textContent).toMatch(/med i en klass/);
    expect(backend.setAccountType).toHaveBeenCalled();
  });
});

describe('skapa konto', () => {
  it('validerar användarnamnet innan något skickas till backend', async () => {
    const backend = makeBackend();
    await renderAdmin('create-user');

    const form = createForm();
    fireEvent.change(form.getByLabelText('Användarnamn'), {
      target: { value: 'Elda Admin' },
    });
    fireEvent.click(form.getByRole('button', { name: /skapa konto/i }));

    const error = await screen.findByTestId('create-error');
    expect(error.textContent).toMatch(/3–32/);
    expect(backend.createAccountWithUsername).not.toHaveBeenCalled();
  });

  it('upptäcker att lösenorden inte stämmer överens', async () => {
    makeBackend();
    await renderAdmin('create-user');

    const form = createForm();
    fireEvent.change(form.getByLabelText('Användarnamn'), {
      target: { value: 'enyuser01' },
    });
    fireEvent.click(form.getByLabelText(/låt servern skapa/i));
    fireEvent.change(form.getByLabelText(/^Lösenord$/), { target: { value: 'hemligt123' } });
    fireEvent.change(form.getByLabelText(/bekräfta lösenord/i), {
      target: { value: 'hemligt124' },
    });
    fireEvent.click(form.getByRole('button', { name: /^Skapa konto$/i }));

    expect((await screen.findByTestId('create-error')).textContent).toMatch(
      /stämmer inte överens/i,
    );
  });

  it('skapar kontot med normaliserat användarnamn och vald roll', async () => {
    const backend = makeBackend();
    await renderAdmin('create-user');

    const form = createForm();
    fireEvent.change(form.getByLabelText('Användarnamn'), {
      target: { value: '  EnYuser01 ' },
    });
    fireEvent.click(form.getByLabelText(/låt servern skapa/i));
    fireEvent.change(form.getByLabelText(/^Lösenord$/), { target: { value: 'hemligt123' } });
    fireEvent.change(form.getByLabelText(/bekräfta lösenord/i), {
      target: { value: 'hemligt123' },
    });
    fireEvent.click(form.getByRole('radio', { name: /speciallärare/i }));
    fireEvent.click(form.getByRole('button', { name: /^Skapa konto$/i }));

    await waitFor(() =>
      expect(backend.createAccountWithUsername).toHaveBeenCalledWith({
        username: 'enyuser01',
        password: 'hemligt123',
        role: 'speciallärare',
      }),
    );
    expect(await screen.findByTestId('create-success')).toBeTruthy();
  });

  it('kan låta servern skapa ett tillfälligt lösenord och visar det en gång', async () => {
    const backend = makeBackend({
      createResult: {
        ok: true,
        username: 'enyuser01',
        role: 'elev',
        initialPassword: 'ZebraHatt77',
      },
    });
    await renderAdmin('create-user');

    const form = createForm();
    fireEvent.change(form.getByLabelText('Användarnamn'), {
      target: { value: 'enyuser01' },
    });
    fireEvent.click(form.getByRole('button', { name: /^Skapa konto$/i }));

    await waitFor(() =>
      expect(backend.createAccountWithUsername).toHaveBeenCalledWith({
        username: 'enyuser01',
        password: undefined,
        role: 'elev',
      }),
    );
    expect((await screen.findByTestId('create-initial-password')).textContent).toBe(
      'ZebraHatt77',
    );
  });

  it('erbjuder aldrig administratörsrollen i formuläret', async () => {
    makeBackend();
    await renderAdmin('create-user');

    expect(screen.queryByRole('radio', { name: /administratör/i })).toBeNull();
    expect(screen.getByRole('radio', { name: /^Elev/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Lärare/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /speciallärare/i })).toBeTruthy();
  });

  it('visar serverns fel när kontot inte kunde skapas', async () => {
    makeBackend({
      createResult: { ok: false, error: 'Endast administratörer får göra detta.' },
    });
    await renderAdmin('create-user');

    const form = createForm();
    fireEvent.change(form.getByLabelText('Användarnamn'), {
      target: { value: 'enyuser01' },
    });
    fireEvent.click(form.getByRole('button', { name: /^Skapa konto$/i }));

    expect((await screen.findByTestId('create-error')).textContent).toMatch(
      /endast administratörer/i,
    );
    expect(screen.queryByTestId('create-success')).toBeNull();
  });
});

describe('uppdateringar i adminpanelen', () => {
  it('låter administratören söka efter uppdateringar i inställningarna', async () => {
    makeBackend();
    await renderAdmin('installningar');

    expect(await screen.findByTestId('page-admin-installningar')).toBeTruthy();

    const card = await screen.findByTestId('update-settings');
    expect(within(card).getByText('Uppdateringar')).toBeTruthy();
    expect(within(card).getByTestId('update-check')).toBeTruthy();
    expect(within(card).getByTestId('update-current-version').textContent).toBeTruthy();
  });

  it('visar samma ruta på adminens egen uppdateringssida', async () => {
    makeBackend();
    await renderAdmin('uppdateringar');

    expect(await screen.findByTestId('page-admin-uppdateringar')).toBeTruthy();
    expect(await screen.findByTestId('update-check')).toBeTruthy();
  });
});
