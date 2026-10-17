import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import { REGISTRATION_URL } from '../pages/Login';
import type {
  AuthServiceBackend,
  AuthSession,
  LoginResult,
  VäxverketUser,
} from '../lib/auth-types';

/**
 * Auth-backenden mockas så att testerna beskriver hela flödet i gränssnittet:
 * inloggning → roll → rätt panel, fel lösenord → generiskt fel, obehörig panel
 * → omdirigering, utloggning → inloggningssidan. Ingen nätverkstrafik behövs.
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

function makeUser(
  role: VäxverketUser['role'],
  overrides: Partial<VäxverketUser> = {},
): VäxverketUser {
  return {
    id: 'u-1',
    username: 'ejentu01',
    role,
    active: true,
    mustChangePassword: false,
    ...overrides,
  };
}

interface BackendOptions {
  /** Sessionen innan någon har loggat in (t.ex. efter omladdning). */
  session?: AuthSession;
  /**
   * Svaret på nästa inloggningsförsök. En lista besvaras i tur och ordning,
   * så att ett tvingat lösenordsbyte kan prövas i två steg.
   */
  loginResult?: LoginResult | LoginResult[];
}

function makeBackend(options: BackendOptions = {}) {
  // Sessionen lever i mocken, precis som i Supabase: lyckad inloggning gör att
  // nästa getSession returnerar en inloggad användare.
  const state: { session: AuthSession } = {
    session: options.session ?? { exists: false },
  };
  const results: LoginResult[] = options.loginResult
    ? Array.isArray(options.loginResult)
      ? [...options.loginResult]
      : [options.loginResult]
    : [];

  const backend = {
    login: vi.fn(async () => {
      const result: LoginResult =
        results.length > 1
          ? (results.shift() as LoginResult)
          : (results[0] ?? { ok: false as const, error: 'Fel' });
      if (result.ok) state.session = { exists: true, user: result.user };
      return result;
    }),
    logout: vi.fn(async () => {
      state.session = { exists: false };
    }),
    getSession: vi.fn(async () => state.session),
    getCurrentUser: vi.fn(async () => state.session.user ?? null),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => ({ ok: true as const, accounts: [] })),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
  } as unknown as AuthServiceBackend & {
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
  };

  hoisted.backend = backend;
  return backend;
}

function setHash(hash: string) {
  window.history.replaceState(null, '', hash || '#');
}

/**
 * Skriver in en adress som en besökare gör och levererar hashchange-händelsen
 * direkt. jsdom köar annars händelsen, och när två prov byter adress tätt inpå
 * varandra kan den tappas — då blir provet slumpmässigt i stället för att pröva
 * appens hantering av adressen.
 */
function typeAddress(hash: string) {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function renderApp() {
  // ThemeProvider ligger ovanför App i main.tsx — samma uppsättning här.
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  // Vänta in sessionsåterställningen så att rätt vy har ritats.
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

async function logIn(username: string, password: string) {
  fireEvent.change(screen.getByLabelText('Användarnamn'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Lösenord'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Logga in' }));
}

beforeEach(() => {
  setHash('');
});

afterEach(() => {
  cleanup();
  hoisted.backend = null;
});

describe('inloggningsformuläret', () => {
  it('innehåller bara användarnamn och lösenord — ingen e-post eller social inloggning', async () => {
    makeBackend({ session: { exists: false } });
    await renderApp();

    expect(screen.getByLabelText('Användarnamn')).toBeTruthy();
    expect(screen.getByLabelText('Lösenord')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Logga in' })).toBeTruthy();
    expect(screen.queryByLabelText(/e-post/i)).toBeNull();
    expect(document.querySelector('input[type="email"]')).toBeNull();
  });

  it('innehåller ingen registrering och ingen rollväljare', async () => {
    makeBackend({ session: { exists: false } });
    await renderApp();

    // Konton skapas av registreringsboten på hemsidan — inte i appen.
    expect(screen.queryByRole('button', { name: /skapa konto/i })).toBeNull();
    expect(screen.queryByText(/hur vill du använda elda/i)).toBeNull();
    expect(screen.queryByText(/registrering ·/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^skolelev$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^lärare$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^privat elev$/i })).toBeNull();
    // Ingen självbetjäning för konton alls: enda knappen är inloggning.
    const buttons = screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');
    expect(buttons.filter((t) => /konto/i.test(t))).toEqual([]);
  });

  it('hänvisar diskret till hemsidans registrering', async () => {
    makeBackend({ session: { exists: false } });
    await renderApp();

    expect(
      screen.getByText(/Behöver du ett konto\? Besök Elda-hemsidan och använd registreringsboten\./),
    ).toBeTruthy();

    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Öppna registreringen' }));
    expect(open).toHaveBeenCalledWith(REGISTRATION_URL, '_blank', 'noopener,noreferrer');
    // Appen får aldrig navigera bort till registreringen i sitt eget fönster.
    expect(window.location.hash).not.toMatch(/registrera/);
  });

  it('visar ingen registrering ens om en gammal registreringsadress öppnas', async () => {
    setHash('#/registrera');
    makeBackend({ session: { exists: false } });
    await renderApp();

    expect(screen.getByLabelText('Användarnamn')).toBeTruthy();
    expect(screen.queryByText(/hur vill du använda elda/i)).toBeNull();
    expect(screen.queryByTestId('register-start')).toBeNull();
    expect(screen.queryByTestId('register-bot')).toBeNull();
  });

  it('visar ett tydligt fel och ringer inte backend när fält saknas', async () => {
    const backend = makeBackend({ session: { exists: false } });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Logga in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/både användarnamn och lösenord/i);
    expect(backend.login).not.toHaveBeenCalled();
  });

  it('visar serverns generiska fel vid fel lösenord och stannar på inloggningen', async () => {
    const backend = makeBackend({
      session: { exists: false },
      loginResult: { ok: false, error: 'Fel användarnamn eller lösenord.' },
    });
    await renderApp();

    await logIn('ejentu01', 'fel12345');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Fel användarnamn eller lösenord.');
    // Ingen panel och ingen antydan om att kontot finns.
    expect(screen.queryByTestId('app-shell')).toBeNull();
    expect(backend.login).toHaveBeenCalledWith('ejentu01', 'fel12345');
  });
});

describe('rollstyrning efter inloggning', () => {
  it('skickar admin till adminpanelen', async () => {
    makeBackend({
      session: { exists: false },
      loginResult: { ok: true, user: makeUser('admin') },
    });
    await renderApp();

    await logIn('ejentu01', 'hemligt123');

    expect(await screen.findByTestId('panel-admin')).toBeTruthy();
    // Adressfältet speglas i en effekt — vänta in den i stället för att tajma.
    await waitFor(() => expect(window.location.hash).toBe('#/admin/start'));
  });

  it('skickar specialläraren till speciallärarpanelen', async () => {
    makeBackend({
      session: { exists: false },
      loginResult: { ok: true, user: makeUser('speciallärare') },
    });
    await renderApp();

    await logIn('ejentu01', 'hemligt123');

    expect(await screen.findByTestId('panel-speciallarar')).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/speciallarar/hem'));
  });

  it('skickar eleven till elevpanelen utan att visa adminpanelen', async () => {
    makeBackend({
      session: { exists: false },
      loginResult: { ok: true, user: makeUser('elev') },
    });
    await renderApp();

    await logIn('ejentu01', 'hemligt123');

    expect(await screen.findByTestId('panel-elev')).toBeTruthy();
    expect(screen.queryByTestId('panel-admin')).toBeNull();
    await waitFor(() => expect(window.location.hash).toBe('#/elev/start'));
  });

  it('visar lösenordssidan när kontot har ett tillfälligt lösenord', async () => {
    makeBackend({
      session: { exists: true, user: makeUser('elev', { mustChangePassword: true }) },
    });

    await renderApp();
    expect(await screen.findByText('Skapa nytt lösenord')).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });
});

describe('tvingat lösenordsbyte vid inloggning', () => {
  const required = 'Ditt konto har ett tillfälligt lösenord. Välj ett eget för att fortsätta.';

  it('stannar kvar på inloggningen och loggar in med det nya lösenordet', async () => {
    const backend = makeBackend({
      session: { exists: false },
      loginResult: [
        { ok: false, error: required, mustSetNewPassword: true },
        { ok: true, user: makeUser('elev') },
      ],
    });
    await renderApp();

    await logIn('ejentu01', 'tillfalligt1');

    // Servern lämnade ingen session: appen ber om ett eget lösenord i stället
    // för att släppa in användaren.
    expect(await screen.findByLabelText('Nytt lösenord')).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
    expect(screen.queryByTestId('panel-elev')).toBeNull();

    fireEvent.change(screen.getByLabelText('Nytt lösenord'), {
      target: { value: 'mittEget123' },
    });
    fireEvent.change(screen.getByLabelText('Bekräfta nytt lösenord'), {
      target: { value: 'mittEget123' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Spara lösenordet och logga in' }),
    );

    expect(await screen.findByTestId('panel-elev')).toBeTruthy();
    expect(backend.login).toHaveBeenLastCalledWith('ejentu01', 'tillfalligt1', 'mittEget123');
  });

  it('avvisar ojämna lösenord utan att fråga servern igen', async () => {
    const backend = makeBackend({
      session: { exists: false },
      loginResult: { ok: false, error: required, mustSetNewPassword: true },
    });
    await renderApp();

    await logIn('ejentu01', 'tillfalligt1');
    expect(await screen.findByLabelText('Nytt lösenord')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Nytt lösenord'), {
      target: { value: 'mittEget123' },
    });
    fireEvent.change(screen.getByLabelText('Bekräfta nytt lösenord'), {
      target: { value: 'annat12345' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Spara lösenordet och logga in' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/stämmer inte överens/i);
    expect(backend.login).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });
});

describe('skyddade rutter', () => {
  it('släpper inte in en utloggad användare i en privat panel via adressen', async () => {
    setHash('#/admin/roller');
    makeBackend({ session: { exists: false } });

    await renderApp();
    expect(screen.getByRole('button', { name: 'Logga in' })).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
    expect(screen.queryByTestId('panel-admin')).toBeNull();
  });

  it('skickar eleven till elevpanelen när adminadressen skrivs in', async () => {
    makeBackend({ session: { exists: true, user: makeUser('elev') } });

    await renderApp();
    expect(await screen.findByTestId('panel-elev')).toBeTruthy();

    // Simulerar att adressen #/admin/roller skrivs in manuellt.
    typeAddress('#/admin/roller');

    await waitFor(() => expect(screen.getByTestId('route-notice')).toBeTruthy());
    expect(screen.getByTestId('panel-elev')).toBeTruthy();
    expect(screen.queryByTestId('panel-admin')).toBeNull();
    expect(screen.getByTestId('route-notice').textContent).toMatch(/behörighet/i);
  });

  it('skickar specialläraren till sin egen panel när adminpanelen begärs', async () => {
    makeBackend({ session: { exists: true, user: makeUser('speciallärare') } });

    await renderApp();
    await screen.findByTestId('panel-speciallarar');

    typeAddress('#/admin/anvandare');

    await waitFor(() => expect(screen.getByTestId('route-notice')).toBeTruthy());
    expect(screen.queryByTestId('panel-admin')).toBeNull();
  });

  it('öppnar en skyddad djup länk direkt när rollen tillåter den', async () => {
    setHash('#/admin/roller');
    makeBackend({ session: { exists: true, user: makeUser('admin') } });

    await renderApp();

    // Adressen respekteras från första renderingen — ingen omdirigering.
    expect(await screen.findByTestId('panel-admin')).toBeTruthy();
    expect(window.location.hash).toBe('#/admin/roller');
    expect(screen.queryByTestId('route-notice')).toBeNull();
  });

  it('nekar åtkomst för ett konto utan giltig roll', async () => {
    makeBackend({ session: { exists: true, user: makeUser('okand') } });

    await renderApp();
    expect(await screen.findByTestId('access-denied')).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });
});

describe('skal, meny och tema', () => {
  it('visar bara elevens egna menyval — inga administratörslänkar', async () => {
    makeBackend({ session: { exists: true, user: makeUser('elev') } });
    await renderApp();

    const nav = await screen.findByLabelText('Huvudmeny');
    // Menyn ritas först när rollen är känd — vänta in den i stället för att tajma.
    expect(await within(nav).findByText('Skolarbete')).toBeTruthy();
    expect(within(nav).queryByText('Roller och behörigheter')).toBeNull();
    expect(within(nav).queryByText('Skapa konto')).toBeNull();
    expect(within(nav).queryByText('Konton')).toBeNull();
  });

  it('visar administratörens menyval för en administratör', async () => {
    makeBackend({ session: { exists: true, user: makeUser('admin') } });
    await renderApp();

    const nav = await screen.findByLabelText('Huvudmeny');
    expect(await within(nav).findByText('Användare')).toBeTruthy();

    // Grupperna är kollapsade tills man öppnar dem.
    fireEvent.click(within(nav).getByRole('button', { name: /^Användare$/ }));
    expect(await within(nav).findByText('Skapa konto')).toBeTruthy();
    expect(within(nav).getByText('Roller och behörigheter')).toBeTruthy();
  });

  it('öppnar och stänger menyn på små skärmar', async () => {
    makeBackend({ session: { exists: true, user: makeUser('elev') } });
    await renderApp();

    const sidebar = await screen.findByLabelText('Huvudmeny');
    expect(sidebar.classList.contains('sidebar-open')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Öppna menyn' }));
    expect(sidebar.classList.contains('sidebar-open')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Stäng menyn' }));
    expect(sidebar.classList.contains('sidebar-open')).toBe(false);
  });

  it('filtrerar menyn medan man skriver och rensar filtret vid navigering', async () => {
    makeBackend({ session: { exists: true, user: makeUser('elev') } });
    await renderApp();

    const nav = await screen.findByLabelText('Huvudmeny');
    const filter = screen.getByLabelText('Filtrera menyn');

    fireEvent.change(filter, { target: { value: 'flashcards' } });
    expect(within(nav).getByText('Flashcards och repetition')).toBeTruthy();
    expect(within(nav).queryByText('Skolarbete')).toBeNull();

    // En träff går att öppna direkt, och då visas menyn ofiltrerad igen.
    fireEvent.click(within(nav).getByText('Flashcards och repetition'));
    expect(await screen.findByTestId('page-elev-flashcards')).toBeTruthy();
    await waitFor(() => expect(within(nav).getByText('Skolarbete')).toBeTruthy());

    // Utan träff visas en tydlig förklaring i stället för en tom meny.
    fireEvent.change(screen.getByLabelText('Filtrera menyn'), {
      target: { value: 'finns-inte' },
    });
    expect(within(nav).getByText(/ingen meny matchar/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rensa menyfiltret' }));
    expect(within(nav).getByText('Skolarbete')).toBeTruthy();
  });

  it('växlar mellan ljust och mörkt läge och sparar valet', async () => {
    makeBackend({ session: { exists: true, user: makeUser('elev') } });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Växla till mörkt tema' }));

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark'),
    );
    expect(window.localStorage.getItem('vaxverket-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Växla till ljust tema' }));
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('light'),
    );
  });
});

describe('session och utloggning', () => {
  it('återställer sessionen vid start (efter omladdning)', async () => {
    makeBackend({ session: { exists: true, user: makeUser('elev') } });

    await renderApp();
    expect(await screen.findByTestId('panel-elev')).toBeTruthy();
  });

  it('loggar ut på riktigt och visar inloggningen igen', async () => {
    const backend = makeBackend({
      session: { exists: true, user: makeUser('elev') },
    });

    await renderApp();
    await screen.findByTestId('panel-elev');

    // Kontomenyn i toppraden: öppna den och logga ut därifrån.
    fireEvent.click(screen.getByRole('button', { name: 'Konto och profil' }));
    const logoutButton = await screen.findByRole('menuitem', { name: /logga ut/i });
    fireEvent.click(logoutButton);

    await waitFor(() => expect(backend.logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Logga in' })).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });
});
