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
  AdminOverviewResult,
  RegistrationApplicationsResult,
  RegistrationApplication,
  RegistrationDecision,
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
const ALLOWED_ROLES = ['admin', 'lärare', 'speciallärare', 'elev'] as const;

function toRole(value: unknown): VäxverketUser['role'] {
  return value === 'admin' || value === 'lärare' || value === 'speciallärare' || value === 'elev'
    ? value
    : 'elev';
}

/** Funktionsvalen kommer alltid från servern (app_metadata/profilen). */
function toFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function toAccountType(value: unknown): 'skola' | 'privat' {
  return value === 'privat' ? 'privat' : 'skola';
}

/**
 * Fel från PostgREST (RPC). Databasfunktionerna kastar svenska felmeddelanden
 * som är avsedda för administratören; de visas bara när anroparen är admin.
 */
function mapPostgrestError(error: unknown): Failure {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  if (/jwt|session|token/i.test(message)) {
    return { ok: false, error: 'Din session är ogiltig eller utgången. Logga in igen.' };
  }
  return {
    ok: false,
    error: message || 'Något gick fel. Försök igen.',
  };
}

// ----------------------------------------------------------------
// Typkonvertering
// ----------------------------------------------------------------

/** Bygg en VäxverketUser från en Supabase-user. Rollen hämtas från
 * app_metadata, som endast kan skrivas av serversidan. */
function mapUser(user: User | null): VäxverketUser | null {
  if (!user) return null;
  const role = toRole(user.app_metadata?.role);
  const active = user.app_metadata?.active !== false;
  // Flaggan sätts serversidigt. Finns den inte i metadata är kontot färdigt.
  const mustChangePassword = user.app_metadata?.must_change_password === true;
  return {
    id: user.id,
    username: user.app_metadata?.username ?? user.email ?? user.id,
    role,
    active,
    mustChangePassword,
    features: toFeatures(user.app_metadata?.features),
    limited: user.app_metadata?.limited === true,
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

        // Serverns svar är auktoritativt för roll, begränsning och val —
        // app_metadata i sessionen kan släpa efter ett administratörsbeslut.
        const serverUser = (
          data as
            | {
                user?: {
                  role?: string;
                  limited?: boolean;
                  features?: string[];
                };
              }
            | null
        )?.user;
        if (serverUser) {
          user = {
            ...user,
            role: toRole(serverUser.role),
            limited: serverUser.limited === true,
            features: toFeatures(serverUser.features),
          };
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
            firstName: typeof a.firstName === 'string' ? a.firstName : null,
            lastName: typeof a.lastName === 'string' ? a.lastName : null,
            accountType: toAccountType(a.accountType),
            limited: a.limited === true,
            mustChangePassword: a.mustChangePassword === true,
            features: toFeatures(a.features),
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
      firstName: string,
      lastName: string,
    ): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: { action: 'update-profile', userId, firstName, lastName },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async setAccountRole(
      userId: string,
      role: VäxverketUser['role'],
    ): Promise<OperationResult> {
      try {
        if (!ALLOWED_ROLES.includes(role)) {
          return { ok: false, error: 'Ogiltig roll.' };
        }
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

    async setAccountLimited(
      userId: string,
      limited: boolean,
    ): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: { action: 'set-limited', userId, limited },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async deleteAccount(userId: string): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.functions.invoke('admin-users', {
          body: { action: 'delete', userId },
        });
        if (error) return await mapFunctionsError(error);
        return { ok: true };
      } catch (err) {
        return await mapFunctionsError(err);
      }
    },

    async getAdminOverview(): Promise<AdminOverviewResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { data, error } = await sup.functions.invoke('admin-users', {
          body: { action: 'overview' },
        });
        if (error) {
          const f = await mapFunctionsError(error);
          return { ok: false, error: f.error };
        }
        const counts = (data as { counts?: Record<string, unknown> } | null)?.counts;
        if (!counts) {
          return { ok: false, error: 'Översikten saknar räkningsdata.' };
        }
        const n = (value: unknown) => {
          const parsed = typeof value === 'number' ? value : Number(value ?? 0);
          return Number.isFinite(parsed) ? parsed : 0;
        };
        return {
          ok: true,
          overview: {
            counts: {
              accounts: n(counts.accounts),
              active: n(counts.active),
              inactive: n(counts.inactive),
              students: n(counts.students),
              teachers: n(counts.teachers),
              specialTeachers: n(counts.specialTeachers),
              admins: n(counts.admins),
              limited: n(counts.limited),
              pendingApplications: n(counts.pendingApplications),
            },
          },
        };
      } catch (err) {
        const f = await mapFunctionsError(err);
        return { ok: false, error: f.error };
      }
    },

    async listRegistrationApplications(): Promise<RegistrationApplicationsResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { data, error } = await sup.rpc('list_registration_applications', {
          p_status: null,
        });
        if (error) {
          const f = mapPostgrestError(error);
          return { ok: false, error: f.error };
        }

        const rows = Array.isArray(data) ? data : [];
        const applications: RegistrationApplication[] = rows
          .filter(
            (row): row is Record<string, unknown> =>
              typeof row === 'object' && row !== null,
          )
          .map((row) => ({
            id: String(row.id ?? ''),
            kind: String(row.kind ?? 'skolelev') as RegistrationApplication['kind'],
            status: String(row.status ?? 'vantar') as RegistrationApplication['status'],
            fullName: typeof row.full_name === 'string' ? row.full_name : null,
            summary: typeof row.summary === 'string' ? row.summary : null,
            riskFlags: Array.isArray(row.risk_flags)
              ? row.risk_flags.map((flag) => String(flag)).filter(Boolean)
              : [],
            botDecision: typeof row.bot_decision === 'string' ? row.bot_decision : null,
            createdAt: typeof row.created_at === 'string' ? row.created_at : null,
            decidedAt: typeof row.decided_at === 'string' ? row.decided_at : null,
            reviewNote: typeof row.review_note === 'string' ? row.review_note : null,
            createdUsername:
              typeof row.created_username === 'string' ? row.created_username : null,
            createdClassCode:
              typeof row.created_class_code === 'string' ? row.created_class_code : null,
          }))
          .filter((row) => row.id);

        return { ok: true, applications };
      } catch (err) {
        const f = mapPostgrestError(err);
        return { ok: false, error: f.error };
      }
    },

    async decideRegistrationApplication(
      applicationId: string,
      decision: RegistrationDecision,
      note?: string,
    ): Promise<OperationResult> {
      try {
        const sup = getOrCreateSupabaseClient();
        const { error } = await sup.rpc('decide_registration_application', {
          p_application: applicationId,
          p_decision: decision,
          p_note: note?.trim() ? note.trim() : null,
        });
        if (error) {
          const f = mapPostgrestError(error);
          return { ok: false, error: f.error };
        }
        return { ok: true };
      } catch (err) {
        const f = mapPostgrestError(err);
        return { ok: false, error: f.error };
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

    async updateFeatures(features: string[]) {
      try {
        const sup = getOrCreateSupabaseClient();
        const { data, error } = await sup.functions.invoke('account', {
          body: { action: 'update-features', features },
        });
        if (error) {
          const f = await mapFunctionsError(error);
          return { ok: false as const, error: f.error };
        }

        const saved = (data as { features?: unknown } | null)?.features;
        if (!Array.isArray(saved)) {
          return { ok: false as const, error: 'Valen kunde inte sparas. Försök igen.' };
        }

        // app_metadata uppdateras serversidigt; hämta en färsk session så att
        // menyn och nästa inloggning ser samma val.
        try {
          await sup.auth.refreshSession();
        } catch {
          /* menyn uppdateras ändå i det här fönstret */
        }

        return { ok: true as const, features: saved.map((v) => String(v)) };
      } catch (err) {
        const f = await mapFunctionsError(err);
        return { ok: false as const, error: f.error };
      }
    },
  };
}
