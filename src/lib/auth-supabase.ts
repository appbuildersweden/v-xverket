import {
  createClient,
  FunctionsHttpError,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';
import {
  VäxverketUser,
  AuthSession,
  AuthAccount,
  LoginResult,
  CreateAccountResult,
  AccountsResult,
  OperationResult,
  SuggestUsernameResult,
  AuthServiceBackend,
} from './auth';

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
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const ALLOWED_ROLES = ['admin', 'speciallärare', 'elev'] as const;

function toRole(value: unknown): VäxverketUser['role'] {
  return value === 'admin' || value === 'speciallärare' || value === 'elev'
    ? value
    : 'elev';
}

// ----------------------------------------------------------------
// Typkonvertering
// ----------------------------------------------------------------

/** Bygg en VäxverketUser från en Supabase-user. Rollen hämtas från
 * app_metadata, som endast kan skrivas av serversidan. */
function mapUser(user: User | null): VäxverketUser | null {
  if (!user) return null;
  const roleRaw = user.app_metadata?.role;
  const role: VäxverketUser['role'] =
    roleRaw === 'admin' || roleRaw === 'speciallärare' || roleRaw === 'elev'
      ? roleRaw
      : 'elev';
  const active = user.app_metadata?.active !== false;
  // Flaggan sätts serversidigt. Finns den inte i metadata är kontot färdigt.
  const mustChangePassword = user.app_metadata?.must_change_password === true;
  return {
    id: user.id,
    username: user.app_metadata?.username ?? user.email ?? user.id,
    role,
    active,
    mustChangePassword,
  };
}

// ----------------------------------------------------------------
// Felhantering för serverfunktioner
// ----------------------------------------------------------------

type Failure = { ok: false; error: string };

async function mapFunctionsError(error: unknown): Promise<Failure> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    let body: { error?: string; message?: string } | null = null;
    try {
      body = await error.context.clone().json();
    } catch {
      body = null;
    }
    if (status === 401) {
      return { ok: false, error: 'Fel användarnamn eller lösenord.' };
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

// ----------------------------------------------------------------
// Auth backend
// ----------------------------------------------------------------

export function createSupabaseAuthBackend(): AuthServiceBackend {
  return {
    async login(username: string, password: string): Promise<LoginResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const name = username.trim().toLowerCase();

        if (!USERNAME_RE.test(name)) {
          return {
            ok: false,
            error:
              'Användarnamnet är ogiltigt. Använd 3–32 tecken: små bokstäver, siffror, punkt, bindestreck eller understreck.',
          };
        }
        if (!password) {
          return { ok: false, error: 'Fyll i både användarnamn och lösenord.' };
        }

        // Användarnamn → autentiseringsidentifierare sköts serversidigt
        // i skyddad Edge Function. Lösenordet verifieras av Supabase Auth.
        const { data, error } = await sup.functions.invoke('auth-login', {
          body: { username: name, password },
        });
        if (error) return await mapFunctionsError(error);

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
        // Servern svarar auktoritativt om lösenordsbytet är kvar — metadata i
        // sessionen kan släpa efter. Flaggan styr vilken sida som visas.
        const mustChange = (data as { user?: { mustChangePassword?: boolean } } | null)
          ?.user?.mustChangePassword;
        if (mustChange === true) user = { ...user, mustChangePassword: true };
        if (mustChange === false) user = { ...user, mustChangePassword: false };
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
        if (!username) return { ok: true, username: '' };
        return { ok: true, username };
      } catch (err) {
        const f = await mapFunctionsError(err);
        return { ok: false, error: f.error };
      }
    },

    async createAccount(data: {
      firstName: string;
      lastName: string;
      role: VäxverketUser['role'];
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

        const username = String(
          (res as { username?: string } | null)?.username ?? '',
        ).toLowerCase();
        if (!username) {
          return { ok: false, error: 'Kontot skapades men användarnamnet kunde inte läsas.' };
        }

        return { ok: true, username, role: data.role };
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
          .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
          .map((a) => ({
            id: String(a.id ?? ''),
            username: String(a.username ?? ''),
            role: toRole(a.role),
            active: a.active !== false,
            createdAt: typeof a.createdAt === 'string' ? a.createdAt : null,
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

    async changePassword(
      _oldPassword: string,
      newPassword: string,
    ): Promise<LoginResult> {
      try {
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
