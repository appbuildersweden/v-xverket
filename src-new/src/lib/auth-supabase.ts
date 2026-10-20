/**
 * Supabase-backend för Elda.
 *
 * Inloggning sker med enbart användarnamn + lösenord. Klienten skickar dem till
 * Edge Functionen `auth-login`, som serversidigt kopplar användarnamnet till
 * rätt autentiseringskonto och låter Supabase Auth verifiera lösenordet.
 * Klienten får tillbaka en färdig session — den interna e-postidentifieraren
 * lämnar aldrig servern och det finns ingen publik uppslagning av användarnamn.
 */
import {
  createClient,
  FunctionsHttpError,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';
import {
  AccountType,
  AccountsResult,
  AuthAccount,
  AuthServiceBackend,
  AuthSession,
  CREATABLE_ROLES,
  CreateAccountResult,
  LoginResult,
  OperationResult,
  ResetPasswordResult,
  Role,
  SuggestUsernameResult,
  VäxverketUser,
  isKnownRole,
  toUserRole,
} from './auth-types';

// ----------------------------------------------------------------
// Konfiguration
// ----------------------------------------------------------------

function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL ?? '';
}

function getSupabaseAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
}

let supabaseClient: SupabaseClient | null = null;

export function getOrCreateSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      'Supabase-miljövariabler saknas. Lägg till VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i .env.',
    );
  }

  supabaseClient = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return supabaseClient;
}

/** Samma regel som serverfunktionerna använder. */
export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;
// Samma lista som serverfunktionen använder för att skapa konton. Adminrollen
// är medvetet utanför: den tilldelas i en separat, loggad åtgärd.
export const ALLOWED_ROLES: readonly Role[] = CREATABLE_ROLES;

// ----------------------------------------------------------------
// Validering
// ----------------------------------------------------------------

/**
 * Validerar inloggningsfälten innan något skickas till servern.
 * Returnerar ett användarvänligt felmeddelande, eller null om indata är ok.
 * Meddelandet avslöjar aldrig om ett konto finns.
 */
export function validateLoginInput(
  username: string,
  password: string,
): string | null {
  const name = (username ?? '').trim().toLowerCase();
  if (!name && !password) return 'Fyll i både användarnamn och lösenord.';
  if (!name) return 'Fyll i ditt användarnamn.';
  if (!password) return 'Fyll i ditt lösenord.';
  if (!USERNAME_RE.test(name)) {
    return 'Användarnamnet är ogiltigt. Använd 3–32 tecken: små bokstäver, siffror, punkt, bindestreck eller understreck.';
  }
  return null;
}

// ----------------------------------------------------------------
// Typkonvertering
// ----------------------------------------------------------------

/**
 * Bygg en VäxverketUser från en Supabase-user. Rollen hämtas från
 * app_metadata, som endast kan skrivas av serversidan. Saknas eller är rollen
 * ogiltig blir den 'okand' — appen nekar då åtkomst i stället för att gissa.
 */
export function mapUser(user: User | null): VäxverketUser | null {
  if (!user) return null;
  const role = toUserRole(user.app_metadata?.role);
  const active = user.app_metadata?.active !== false;
  // Flaggan sätts serversidigt. Finns den inte i metadata är kontot färdigt.
  const mustChangePassword = user.app_metadata?.must_change_password === true;
  const username =
    typeof user.app_metadata?.username === 'string' && user.app_metadata.username
      ? user.app_metadata.username
      : (user.email ?? user.id);
  // Kontotypen sätts serversidigt vid registreringen. Saknas den är kontot en
  // skolelev (samma tolkning som servern gör).
  const accountType = user.app_metadata?.account_type === 'privat' ? 'privat' : 'skola';
  const limited = user.app_metadata?.limited === true;
  return {
    id: user.id,
    username,
    role,
    active,
    mustChangePassword,
    accountType,
    limited,
  };
}

// ----------------------------------------------------------------
// Felhantering för serverfunktioner
// ----------------------------------------------------------------

type Failure = { ok: false; error: string };

/** Generiska felmeddelanden — de avslöjar aldrig om ett konto finns. */
export const GENERIC_LOGIN_ERROR = 'Fel användarnamn eller lösenord.';

/** Serverns svar när kontot fortfarande har sitt tillfälliga lösenord. */
export const PASSWORD_CHANGE_REQUIRED =
  'Ditt konto har ett tillfälligt lösenord. Välj ett eget för att fortsätta.';

/** Svarskroppen från en serverfunktion som svarade med felstatus. */
interface FunctionErrorBody {
  error?: string;
  message?: string;
  /** Sant när servern kräver ett nytt lösenord innan den lämnar ut en session. */
  mustChangePassword?: boolean;
}

async function readFunctionError(error: unknown): Promise<FunctionErrorBody | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  try {
    return (await error.context.clone().json()) as FunctionErrorBody;
  } catch {
    return null;
  }
}

/**
 * Fel från inloggningsfunktionen. Skiljer ut det enda fallet där användaren
 * kan gå vidare själv: kontot har kvar sitt tillfälliga lösenord och servern
 * lämnar därför ingen session förrän ett eget lösenord följer med.
 */
export async function mapLoginError(
  error: unknown,
): Promise<Failure & { mustSetNewPassword?: boolean }> {
  const body = await readFunctionError(error);
  if (body?.mustChangePassword === true) {
    return {
      ok: false,
      error: body.error ?? PASSWORD_CHANGE_REQUIRED,
      mustSetNewPassword: true,
    };
  }
  return await mapFunctionsError(error);
}

export async function mapFunctionsError(error: unknown): Promise<Failure> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    const body = await readFunctionError(error);
    if (status === 401) {
      return { ok: false, error: GENERIC_LOGIN_ERROR };
    }
    if (status === 403) {
      return {
        ok: false,
        error: body?.error ?? 'Du saknar behörighet för åtgärden.',
      };
    }
    if (status === 404) {
      return {
        ok: false,
        error:
          'Autentiseringstjänsten är inte konfigurerad ännu. Kontakta administratören.',
      };
    }
    if (status === 429) {
      return {
        ok: false,
        error: 'För många försök. Vänta en stund och försök igen.',
      };
    }
    return {
      ok: false,
      error: body?.error ?? body?.message ?? 'Något gick fel. Försök igen.',
    };
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/fetch|network|failed/i.test(message)) {
    return {
      ok: false,
      error: 'Kopplingen till servern misslyckades. Kontrollera din anslutning.',
    };
  }
  return { ok: false, error: message || 'Något gick fel. Försök igen.' };
}

function toRole(value: unknown): Role {
  // Rollistan kommer från ROLE_PERMISSIONS, så en ny roll behöver bara läggas
  // till på ett ställe. Okänt värde blir 'elev' — panelerna nekar ändå åtkomst
  // till allt som kräver en annan roll.
  return isKnownRole(value) ? value : 'elev';
}

// ----------------------------------------------------------------
// Auth backend
// ----------------------------------------------------------------

export function createSupabaseAuthBackend(): AuthServiceBackend {
  return {
    async login(
      username: string,
      password: string,
      newPassword?: string,
    ): Promise<LoginResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const name = username.trim().toLowerCase();

        const problem = validateLoginInput(name, password);
        if (problem) {
          // Formatfel är inte samma sak som felaktiga uppgifter, men felet
          // säger inget om huruvida kontot finns.
          return { ok: false, error: problem };
        }

        // Användarnamn → autentiseringsidentifierare sköts serversidigt
        // i skyddad Edge Function. Lösenordet verifieras av Supabase Auth.
        // Följer det nya lösenordet med sparar servern det och lämnar först då
        // ut en session — spärren kan därför inte kringgås i klienten.
        const { data, error } = await sup.functions.invoke('auth-login', {
          body: newPassword
            ? { username: name, password, newPassword }
            : { username: name, password },
        });
        if (error) return await mapLoginError(error);

        const accessToken = (data as { access_token?: string } | null)?.access_token;
        const refreshToken = (data as { refresh_token?: string } | null)?.refresh_token;
        if (!accessToken || !refreshToken) {
          return { ok: false, error: 'Inloggningen kunde inte slutföras.' };
        }

        const { data: sess, error: setErr } = await sup.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErr || !sess.session?.user) {
          return { ok: false, error: 'Inloggningen kunde inte slutföras.' };
        }

        let user = mapUser(sess.session.user);
        if (!user) return { ok: false, error: 'Inloggningen kunde inte slutföras.' };

        // Servern svarar auktoritativt om rollen och om lösenordsbytet är kvar —
        // metadata i sessionen kan släpa efter.
        const serverUser = (data as {
          user?: {
            role?: unknown;
            mustChangePassword?: boolean;
            accountType?: unknown;
            limited?: boolean;
          };
        } | null)?.user;
        if (serverUser?.role !== undefined) {
          user = { ...user, role: toUserRole(serverUser.role) };
        }
        if (serverUser?.accountType !== undefined) {
          user = {
            ...user,
            accountType: serverUser.accountType === 'privat' ? 'privat' : 'skola',
          };
        }
        if (serverUser?.limited !== undefined) {
          user = { ...user, limited: serverUser.limited === true };
        }
        if (serverUser?.mustChangePassword === true) {
          user = { ...user, mustChangePassword: true };
        }
        if (serverUser?.mustChangePassword === false) {
          user = { ...user, mustChangePassword: false };
        }
        if (!user.active) {
          await sup.auth.signOut();
          return {
            ok: false,
            error: 'Kontot är inaktiverat. Kontakta administratören.',
          };
        }
        return { ok: true, user };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async logout(): Promise<void> {
      try {
        const sup = getOrCreateSupabaseClient();
        await sup.auth.signOut({ scope: 'global' });
      } catch {
        // Den lokala sessionen rensas ändå av supabase-js.
      }
    },

    async getSession(): Promise<AuthSession> {
      const sup = getOrCreateSupabaseClient();
      const {
        data: { session },
      } = await sup.auth.getSession();
      if (!session?.user) return { exists: false };

      const user = mapUser(session.user);
      if (!user || !user.active) {
        // Inaktiverat eller ogiltigt konto — rensa sessionen lokalt.
        await sup.auth.signOut();
        return { exists: false };
      }
      return { exists: true, user };
    },

    async getCurrentUser(): Promise<VäxverketUser | null> {
      const sup = getOrCreateSupabaseClient();
      const {
        data: { user },
      } = await sup.auth.getUser();
      return mapUser(user);
    },

    async suggestUsername(
      firstName: string,
      lastName: string,
    ): Promise<SuggestUsernameResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { data, error } = await sup.functions.invoke('admin-users', {
          body: { action: 'suggest-username', firstName, lastName },
        });
        if (error) {
          const f = await mapFunctionsError(error);
          return { ok: false, error: f.error };
        }
        const username = String(
          (data as { username?: string } | null)?.username ?? '',
        ).toLowerCase();
        return { ok: true, username };
      } catch (err) {
        const f = await mapFunctionsError(err);
        return { ok: false, error: f.error };
      }
    },

    async createAccountWithUsername(data: {
      username: string;
      password?: string;
      role: Role;
    }): Promise<CreateAccountResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const username = data.username.trim().toLowerCase();

        // Samma regler som serverfunktionen — men servern är auktoritativ.
        // Ett tomt lösenord betyder att servern skapar ett slumpat tillfälligt
        // lösenord (som bara visas en gång i svaret).
        if (!USERNAME_RE.test(username)) {
          return { ok: false, error: 'Användarnamnet är ogiltigt.' };
        }
        if (data.password && data.password.length < MIN_PASSWORD_LENGTH) {
          return {
            ok: false,
            error: `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`,
          };
        }
        if (!ALLOWED_ROLES.includes(data.role)) {
          return { ok: false, error: 'Ogiltig roll.' };
        }

        // Behörigheten (endast admin) kontrolleras i serverfunktionen mot
        // anroparens JWT. Klienten kan inte välja bort kontrollen.
        const { data: res, error } = await sup.functions.invoke('admin-users', {
          body: {
            action: 'create',
            username,
            // Utelämnas helt när administratören vill ha ett genererat lösenord.
            password: data.password || undefined,
            role: data.role,
          },
        });
        if (error) {
          const f = await mapFunctionsError(error);
          return { ok: false, error: f.error };
        }

        const payload = (res ?? {}) as {
          username?: string;
          initialPassword?: string | null;
        };
        const created = String(payload.username ?? '').toLowerCase();
        if (!created) {
          return {
            ok: false,
            error: 'Kontot skapades men användarnamnet kunde inte läsas.',
          };
        }
        return {
          ok: true,
          username: created,
          role: data.role,
          initialPassword: payload.initialPassword ?? null,
        };
      } catch (err) {
        const f = await mapFunctionsError(err);
        return { ok: false, error: f.error };
      }
    },

    async createAccount(data: {
      firstName: string;
      lastName: string;
      role: Role;
      password?: string;
    }): Promise<CreateAccountResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const firstName = data.firstName.trim();
        const lastName = data.lastName.trim();

        if (!firstName && !lastName) {
          return { ok: false, error: 'Ange förnamn och efternamn.' };
        }
        if (data.password && data.password.length < MIN_PASSWORD_LENGTH) {
          return { ok: false, error: 'Lösenordet måste vara minst 8 tecken.' };
        }
        if (!ALLOWED_ROLES.includes(data.role)) {
          return { ok: false, error: 'Ogiltig roll.' };
        }

        // Användarnamnet genereras och reserveras serversidigt (e+3+2+löpnummer).
        const { data: res, error } = await sup.functions.invoke('admin-users', {
          body: {
            action: 'create',
            firstName,
            lastName,
            role: data.role,
            password: data.password,
          },
        });
        if (error) {
          const f = await mapFunctionsError(error);
          return { ok: false, error: f.error };
        }

        const payload = (res ?? {}) as {
          username?: string;
          initialPassword?: string | null;
        };
        const username = String(payload.username ?? '').toLowerCase();
        if (!username) {
          return {
            ok: false,
            error: 'Kontot skapades men användarnamnet kunde inte läsas.',
          };
        }

        return {
          ok: true,
          username,
          role: data.role,
          initialPassword: payload.initialPassword ?? null,
        };
      } catch (err) {
        const f = await mapFunctionsError(err);
        return { ok: false, error: f.error };
      }
    },

    async completePasswordChange(): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: { action: 'password-changed' },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async listAccounts(): Promise<AccountsResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { data, error } = await sup.functions.invoke('admin-users', {
          body: { action: 'list' },
        });
        if (error) return await mapFunctionsError(error);

        const raw = (data as { accounts?: unknown } | null)?.accounts;
        if (!Array.isArray(raw)) return { ok: true, accounts: [] };

        const accounts: AuthAccount[] = raw
          .filter(
            (a): a is Record<string, unknown> => typeof a === 'object' && a !== null,
          )
          .map((a) => ({
            id: String(a.id ?? ''),
            username: String(a.username ?? ''),
            role: toRole(a.role),
            active: a.active !== false,
            createdAt: typeof a.createdAt === 'string' ? a.createdAt : null,
            firstName: typeof a.firstName === 'string' ? a.firstName : null,
            lastName: typeof a.lastName === 'string' ? a.lastName : null,
            accountType: a.accountType === 'privat' ? ('privat' as const) : ('skola' as const),
            limited: a.limited === true,
            mustChangePassword: a.mustChangePassword === true,
          }))
          .filter((a) => a.id && a.username);

        return { ok: true, accounts };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async setAccountActive(
      userId: string,
      active: boolean,
    ): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: { action: 'set-active', userId, active },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async updateAccountProfile(
      userId: string,
      name: { firstName: string; lastName: string },
    ): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: {
            action: 'update-profile',
            userId,
            firstName: name.firstName.trim(),
            lastName: name.lastName.trim(),
          },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async setAccountRole(userId: string, role: Role): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: { action: 'set-role', userId, role },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async setAccountType(userId: string, accountType: AccountType): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: { action: 'set-account-type', userId, accountType },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async resetAccountPassword(userId: string): Promise<ResetPasswordResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { data, error } = await sup.functions.invoke('admin-users', {
          body: { action: 'reset-password', userId },
        });
        if (error) {
          const f = await mapFunctionsError(error);
          return { ok: false, error: f.error };
        }
        const payload = (data ?? {}) as {
          username?: string;
          initialPassword?: string;
        };
        if (!payload.initialPassword) {
          return {
            ok: false,
            error: 'Lösenordet återställdes men kunde inte läsas. Försök igen.',
          };
        }
        return {
          ok: true,
          username: String(payload.username ?? ''),
          initialPassword: payload.initialPassword,
        };
      } catch (err) {
        const f = await mapFunctionsError(err);
        return { ok: false, error: f.error };
      }
    },

    async changePassword(
      _oldPassword: string,
      newPassword: string,
    ): Promise<LoginResult> {
      try {
        if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
          return {
            ok: false,
            error: `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`,
          };
        }
        const sup = getOrCreateSupabaseClient();
        const { data, error } = await sup.auth.updateUser({
          password: newPassword,
        });
        if (error) {
          return { ok: false, error: 'Lösenordet kunde inte uppdateras.' };
        }
        if (!data.user) {
          return { ok: false, error: 'Lösenordet kunde inte uppdateras.' };
        }
        const mapped = mapUser(data.user);
        if (!mapped) {
          return { ok: false, error: 'Lösenordet kunde inte uppdateras.' };
        }
        return { ok: true, user: mapped };
      } catch {
        return { ok: false, error: 'Lösenordet kunde inte uppdateras.' };
      }
    },
  };
}
