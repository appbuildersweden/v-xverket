import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
} from 'react';
import {
  VäxverketUser,
  AuthSession,
  LoginResult,
  CreateAccountResult,
  AccountsResult,
  OperationResult,
} from './auth';
import { createAuthBackend } from './auth';
import { getOrCreateSupabaseClient } from './auth-supabase';

export interface AuthContextValue {
  /** Om appen har hämtat session */
  loading: boolean;
  /** Aktuell session */
  session: AuthSession | null;
  /** Aktuell användare */
  user: VäxverketUser | null;
  /** Logga in med användarnamn + lösenord */
  login: (username: string, password: string) => Promise<LoginResult>;
  /** Logga ut och rensa sessionen */
  logout: () => Promise<void>;
  /** Skapa konto (endast administratörer) */
  createAccount: (data: {
    username: string;
    password: string;
    role: VäxverketUser['role'];
  }) => Promise<CreateAccountResult>;
  /** Lista konton (endast administratörer) */
  listAccounts: () => Promise<AccountsResult>;
  /** Aktivera/inaktivera konto (endast administratörer) */
  setAccountActive: (userId: string, active: boolean) => Promise<OperationResult>;
  /** Byt lösenord för den inloggade användaren (via autentiseringssystemet) */
  changePassword: (newPassword: string) => Promise<LoginResult>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthCtx);
  if (!ctx) {
    throw new Error('useAuth måste användas inom AuthProvider');
  }
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  // Återställ session vid montering. finally säkrar att loading alltid
  // avslutas — appen kan aldrig fastna permanent på "Laddar…" här.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const backend = createAuthBackend();
        const s = await backend.getSession();
        if (!cancelled) setSession(s);
      } catch (err) {
        if (!cancelled) {
          setSession({ exists: false });
          const message =
            err instanceof Error && err.message
              ? err.message
              : 'Kunde inte läsa sessionen. Försök igen.';
          setStartupError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Håll React-tillståndet i synk med den riktiga Supabase-sessionen. Om
  // sessionen försvinner (t.ex. misslyckad uppdatering) loggas användaren ut
  // på riktigt i stället för att appen låtsas vara inloggad och AI:n sedan
  // svarar "Inloggning krävs".
  useEffect(() => {
    let sup;
    try {
      sup = getOrCreateSupabaseClient();
    } catch {
      return; // Miljövariabler saknas — startup-fel hanteras ovan.
    }
    const { data: sub } = sup.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSession({ exists: false });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const backend = createAuthBackend();
      const result = await backend.login(username, password);
      if (result.ok) {
        try {
          const s = await backend.getSession();
          setSession(s);
        } catch {
          setSession({ exists: true, user: result.user });
        }
      } else {
        setSession({ exists: false });
      }
      return result;
    },
    [],
  );

  const logout = useCallback(async () => {
    const backend = createAuthBackend();
    try {
      await backend.logout();
    } finally {
      // Användaren loggas ut lokalt även om nätverksanropet misslyckas.
      setSession({ exists: false });
    }
  }, []);

  const createAccount = useCallback(
    async (data: {
      username: string;
      password: string;
      role: VäxverketUser['role'];
    }): Promise<CreateAccountResult> => {
      return createAuthBackend().createAccount(data);
    },
    [],
  );

  const listAccounts = useCallback(async (): Promise<AccountsResult> => {
    return createAuthBackend().listAccounts();
  }, []);

  const setAccountActive = useCallback(
    async (userId: string, active: boolean): Promise<OperationResult> => {
      return createAuthBackend().setAccountActive(userId, active);
    },
    [],
  );

  const changePassword = useCallback(
    async (newPassword: string): Promise<LoginResult> => {
      return createAuthBackend().changePassword('', newPassword);
    },
    [],
  );

  const value: AuthContextValue = useMemo(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      login,
      logout,
      createAccount,
      listAccounts,
      setAccountActive,
      changePassword,
    }),
    [loading, session, login, logout, createAccount, listAccounts, setAccountActive, changePassword],
  );

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--text-3)',
          fontSize: 13,
        }}
      >
        Laddar…
      </div>
    );
  }

  // Om sessionen inte kunde läsas (t.ex. saknad konfiguration) visas ett
  // tydligt felmeddelande i stället för inloggningssidan — aldrig oändlig laddning.
  if (startupError && !session?.exists) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 10,
          color: 'var(--text-2)',
          fontSize: 13,
          textAlign: 'center',
          padding: 24,
        }}
      >
        <div>{startupError}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: 'var(--btn-bg)',
            color: 'var(--btn-fg)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Försök igen
        </button>
      </div>
    );
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};
