import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Identity, Profile, SchoolRole } from './types';

const ROLES: readonly SchoolRole[] = ['admin', 'lärare', 'speciallärare', 'elev', 'okand'];

/**
 * Vilken panel kontot får. Systemadministratören är den enda administrativa
 * nivån – det finns ingen skolchefsroll.
 */
export type Access = 'teacher' | 'specialteacher' | 'student' | 'admin' | 'denied';

export interface LoginResult {
  ok: boolean;
  error?: string;
  mustSetNewPassword?: boolean;
}

interface AuthValue {
  loading: boolean;
  identity: Identity | null;
  profile: Profile | null;
  access: Access;
  denialReason: string | null;
  login: (username: string, password: string, newPassword?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<LoginResult>;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthCtx);
  if (!value) throw new Error('useAuth måste användas inom AuthProvider');
  return value;
}

function readRole(value: unknown): SchoolRole {
  return typeof value === 'string' && ROLES.includes(value as SchoolRole)
    ? (value as SchoolRole)
    : 'okand';
}

/** Bygger identiteten från Supabase-användarens serverstyrda metadata. */
export function identityFromUser(user: User | null): Identity | null {
  if (!user) return null;
  const meta = user.app_metadata ?? {};
  return {
    id: user.id,
    username:
      typeof meta.username === 'string' && meta.username
        ? meta.username
        : (user.email ?? user.id),
    role: readRole(meta.role),
    accountType: meta.account_type === 'privat' ? 'privat' : 'skola',
    active: meta.active !== false,
    mustChangePassword: meta.must_change_password === true,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

export function schoolAccess(identity: Identity | null): {
  access: Access;
  reason: string | null;
} {
  if (!identity) return { access: 'denied', reason: null };
  if (!identity.active) {
    return { access: 'denied', reason: 'Kontot är inaktiverat.' };
  }
  if (identity.role === 'lärare') return { access: 'teacher', reason: null };
  if (identity.role === 'speciallärare') return { access: 'specialteacher', reason: null };
  if (identity.role === 'admin') return { access: 'admin', reason: null };
  if (identity.role === 'elev') {
    if (identity.accountType === 'privat') {
      return {
        access: 'denied',
        reason:
          'Det här är ett privat elevkonto i Elda. Elda Skola kräver ett skolkonto som en lärare har kopplat till en klass.',
      };
    }
    return { access: 'student', reason: null };
  }
  return {
    access: 'denied',
    reason: 'Kontot saknar en giltig skolroll. Kontakta skolans administratör.',
  };
}

async function functionError(error: unknown): Promise<{ message: string; mustSet: boolean }> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.clone().json()) as {
        error?: string;
        mustChangePassword?: boolean;
      };
      return {
        message: body.error ?? 'Inloggningen misslyckades.',
        mustSet: body.mustChangePassword === true,
      };
    } catch {
      return { message: 'Inloggningen misslyckades.', mustSet: false };
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/fetch|network|failed/i.test(message)) {
    return {
      message: 'Kopplingen till servern misslyckades. Kontrollera din anslutning.',
      mustSet: false,
    };
  }
  return { message: message || 'Inloggningen misslyckades.', mustSet: false };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, role, active, account_type, first_name, last_name, organisation, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      setProfile(null);
      return;
    }
    setProfile((data as Profile | null) ?? null);
  }, []);

  const applySession = useCallback(
    (session: Session | null) => {
      const mapped = identityFromUser(session?.user ?? null);
      setIdentity(mapped);
      if (mapped) void loadProfile(mapped.id);
      else setProfile(null);
    },
    [loadProfile],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        applySession(data.session);
        if (data.session?.user) {
          // getUser verifierar token mot servern och ger färsk metadata.
          const { data: userData } = await supabase.auth.getUser();
          if (!cancelled && userData.user) {
            const fresh = identityFromUser(userData.user);
            setIdentity(fresh);
            if (fresh) void loadProfile(fresh.id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStartupError(
            err instanceof Error
              ? err.message
              : 'Kunde inte läsa sessionen. Ladda om sidan och försök igen.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [applySession, loadProfile]);

  const login = useCallback(
    async (username: string, password: string, newPassword?: string): Promise<LoginResult> => {
      const name = username.trim().toLowerCase();
      if (!name || !password) {
        return { ok: false, error: 'Fyll i både användarnamn och lösenord.' };
      }
      try {
        const { data, error } = await supabase.functions.invoke('auth-login', {
          body: newPassword ? { username: name, password, newPassword } : { username: name, password },
        });
        if (error) {
          const parsed = await functionError(error);
          return {
            ok: false,
            error: parsed.message,
            mustSetNewPassword: parsed.mustSet,
          };
        }

        const payload = (data ?? {}) as {
          access_token?: string;
          refresh_token?: string;
          user?: {
            role?: unknown;
            accountType?: unknown;
            mustChangePassword?: boolean;
            active?: boolean;
          };
        };
        if (!payload.access_token || !payload.refresh_token) {
          return { ok: false, error: 'Inloggningen kunde inte slutföras.' };
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        });
        if (sessionError || !sessionData.session?.user) {
          return { ok: false, error: 'Inloggningen kunde inte slutföras.' };
        }

        let mapped = identityFromUser(sessionData.session.user);
        if (!mapped) return { ok: false, error: 'Inloggningen kunde inte slutföras.' };

        if (payload.user?.role !== undefined) {
          mapped = { ...mapped, role: readRole(payload.user.role) };
        }
        if (payload.user?.accountType !== undefined) {
          mapped = {
            ...mapped,
            accountType: payload.user.accountType === 'privat' ? 'privat' : 'skola',
          };
        }
        if (payload.user?.mustChangePassword !== undefined) {
          mapped = { ...mapped, mustChangePassword: payload.user.mustChangePassword === true };
        }
        if (payload.user?.active === false) {
          await supabase.auth.signOut();
          return { ok: false, error: 'Kontot är inaktiverat. Kontakta skolan.' };
        }

        setIdentity(mapped);
        await loadProfile(mapped.id);
        return { ok: true };
      } catch (err) {
        const parsed = await functionError(err);
        return { ok: false, error: parsed.message };
      }
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'global' });
    setIdentity(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (identity) await loadProfile(identity.id);
  }, [identity, loadProfile]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<LoginResult> => {
      if (!identity) return { ok: false, error: 'Du är inte inloggad.' };
      if (!currentPassword) return { ok: false, error: 'Ange ditt nuvarande lösenord.' };
      if (newPassword.length < 8) {
        return { ok: false, error: 'Det nya lösenordet måste vara minst 8 tecken.' };
      }

      // Har kontot kvar sitt tillfälliga lösenord lämnar servern ingen session
      // förrän det nya lösenordet följer med. Samma anrop verifierar då det
      // nuvarande lösenordet och byter det – det går inte att kringgå.
      if (identity.mustChangePassword) {
        const { data, error } = await supabase.functions.invoke('auth-login', {
          body: { username: identity.username, password: currentPassword, newPassword },
        });
        if (error) {
          const parsed = await functionError(error);
          return { ok: false, error: parsed.message };
        }
        const payload = (data ?? {}) as { access_token?: string; refresh_token?: string };
        if (!payload.access_token || !payload.refresh_token) {
          return { ok: false, error: 'Lösenordet kunde inte uppdateras.' };
        }
        const { error: setError } = await supabase.auth.setSession({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        });
        if (setError) return { ok: false, error: 'Lösenordet kunde inte uppdateras.' };
        await supabase.auth.refreshSession();
        const { data: userData } = await supabase.auth.getUser();
        const mapped = identityFromUser(userData.user);
        if (mapped) setIdentity({ ...mapped, mustChangePassword: false });
        return { ok: true };
      }

      // Det gamla lösenordet verifieras av samma serverfunktion som vanliga
      // inloggningar använder. Lösenordet lämnar aldrig webbläsaren i klartext
      // till någon egen lagring.
      const { error: verifyError } = await supabase.functions.invoke('auth-login', {
        body: { username: identity.username, password: currentPassword },
      });
      if (verifyError) {
        return { ok: false, error: 'Det nuvarande lösenordet stämmer inte.' };
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        return {
          ok: false,
          error:
            updateError.message.toLowerCase().includes('weak')
              ? 'Lösenordet är för svagt. Välj ett längre lösenord.'
              : 'Lösenordet kunde inte uppdateras. Försök igen.',
        };
      }

      // Nolla den serverstyrda flaggan om kontot hade ett tillfälligt lösenord.
      await supabase.functions.invoke('admin-users', { body: { action: 'password-changed' } });
      await supabase.auth.refreshSession();
      const { data } = await supabase.auth.getUser();
      const mapped = identityFromUser(data.user);
      if (mapped) setIdentity({ ...mapped, mustChangePassword: false });
      return { ok: true };
    },
    [identity],
  );

  const accessInfo = useMemo(() => schoolAccess(identity), [identity]);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      identity,
      profile,
      access: accessInfo.access,
      denialReason:
        startupError ??
        accessInfo.reason ??
        (identity && identity.mustChangePassword
          ? 'Du behöver välja ett eget lösenord innan du fortsätter.'
          : null),
      login,
      logout,
      refreshProfile,
      changePassword,
    }),
    [
      loading,
      identity,
      profile,
      accessInfo,
      startupError,
      login,
      logout,
      refreshProfile,
      changePassword,
    ],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};
