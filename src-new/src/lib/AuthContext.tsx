import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AccountType,
  AccountsResult,
  AuthSession,
  CreateAccountResult,
  LoginResult,
  OperationResult,
  ResetPasswordResult,
  Role,
  SuggestUsernameResult,
  VäxverketUser,
} from './auth-types';
import { createAuthBackend } from './auth';
import { getOrCreateSupabaseClient, mapUser } from './auth-supabase';
import { demoActive } from './demo-mode';

export interface AuthContextValue {
  /** Om appen har hämtat session */
  loading: boolean;
  /** Aktuell session (null endast medan appen startar) */
  session: AuthSession | null;
  /** Aktuell användare */
  user: VäxverketUser | null;
  /**
   * Logga in med användarnamn + lösenord. Skickas ett nytt lösenord med byter
   * servern det tvingade lösenordet i samma anrop.
   */
  login: (
    username: string,
    password: string,
    newPassword?: string,
  ) => Promise<LoginResult>;
  /** Logga ut och avsluta sessionen */
  logout: () => Promise<void>;
  /** Föreslå ledigt användarnamn utifrån namn (endast administratörer) */
  suggestUsername: (
    firstName: string,
    lastName: string,
  ) => Promise<SuggestUsernameResult>;
  /**
   * Skapa konto med bestämt användarnamn (endast administratörer). Utelämnas
   * lösenordet skapar servern ett tillfälligt lösenord som visas en gång.
   */
  createAccountWithUsername: (data: {
    username: string;
    password?: string;
    role: Role;
  }) => Promise<CreateAccountResult>;
  /** Skapa konto utifrån namn — användarnamnet genereras serversidigt */
  createAccount: (data: {
    firstName: string;
    lastName: string;
    role: Role;
    password?: string;
  }) => Promise<CreateAccountResult>;
  /** Lista konton (endast administratörer) */
  listAccounts: () => Promise<AccountsResult>;
  /** Aktivera/inaktivera konto (endast administratörer) */
  setAccountActive: (userId: string, active: boolean) => Promise<OperationResult>;
  /** Ändra förnamn/efternamn på ett konto (endast administratörer) */
  updateAccountProfile: (
    userId: string,
    name: { firstName: string; lastName: string },
  ) => Promise<OperationResult>;
  /** Byt roll på ett konto (endast administratörer, aldrig sitt eget) */
  setAccountRole: (userId: string, role: Role) => Promise<OperationResult>;
  /** Ändra kontotyp för ett elevkonto (endast administratörer) */
  setAccountType: (userId: string, accountType: AccountType) => Promise<OperationResult>;
  /** Nytt tillfälligt lösenord, visas en gång (endast administratörer) */
  resetAccountPassword: (userId: string) => Promise<ResetPasswordResult>;
  /** Byt lösenord för den inloggade användaren */
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

/**
 * Det enda stället som äger sessionen. Supabase-js ansvarar för lagring och
 * förnyelse av token; här hålls bara React-tillståndet i synk med den riktiga
 * sessionen så att appen aldrig tror att en utgången session är giltig.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  // Återställ session vid montering (t.ex. efter omladdning av appen).
  // finally säkrar att loading alltid avslutas — appen kan aldrig fastna
  // permanent på "Laddar…" här.
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

  // Håll tillståndet i synk med Supabase. Utloggning (även från en annan flik
  // eller när tokenförnyelsen misslyckas) rensar sessionen på riktigt, och en
  // förnyad token uppdaterar rollen från app_metadata.
  useEffect(() => {
    let sup;
    try {
      sup = getOrCreateSupabaseClient();
    } catch {
      return; // Miljövariabler saknas — startup-felet hanteras ovan.
    }
    const { data: sub } = sup.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') {
        setSession({ exists: false });
        return;
      }
      if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && s?.user) {
        const user = mapUser(s.user);
        if (user) setSession({ exists: true, user });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
      newPassword?: string,
    ): Promise<LoginResult> => {
      const backend = createAuthBackend();
      // Utan nytt lösenord skickas bara de två fälten — servern svarar då att
      // ett nytt lösenord krävs i stället för att lämna ut en session.
      const result = newPassword
        ? await backend.login(username, password, newPassword)
        : await backend.login(username, password);
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
    // I demoläget finns ingen riktig session att avsluta. Klientens signOut går
    // tillbaka till inloggningssidan, vilket är samma sak som att lämna läget.
    const backend = createAuthBackend();
    try {
      await backend.logout();
    } finally {
      // Användaren loggas ut lokalt även om nätverksanropet misslyckas.
      setSession({ exists: false });
    }
  }, []);

  const suggestUsername = useCallback(
    async (firstName: string, lastName: string): Promise<SuggestUsernameResult> => {
      return createAuthBackend().suggestUsername(firstName, lastName);
    },
    [],
  );

  const createAccountWithUsername = useCallback(
    async (data: {
      username: string;
      password?: string;
      role: Role;
    }): Promise<CreateAccountResult> => {
      return createAuthBackend().createAccountWithUsername(data);
    },
    [],
  );

  const createAccount = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      role: Role;
      password?: string;
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

  const updateAccountProfile = useCallback(
    async (
      userId: string,
      name: { firstName: string; lastName: string },
    ): Promise<OperationResult> => {
      return createAuthBackend().updateAccountProfile(userId, name);
    },
    [],
  );

  const setAccountRole = useCallback(
    async (userId: string, role: Role): Promise<OperationResult> => {
      return createAuthBackend().setAccountRole(userId, role);
    },
    [],
  );

  const setAccountType = useCallback(
    async (userId: string, accountType: AccountType): Promise<OperationResult> => {
      return createAuthBackend().setAccountType(userId, accountType);
    },
    [],
  );

  const resetAccountPassword = useCallback(
    async (userId: string): Promise<ResetPasswordResult> => {
      return createAuthBackend().resetAccountPassword(userId);
    },
    [],
  );

  // Lösenordsbyte i två steg:
  //   1. Supabase Auth sparar det nya lösenordet (krypterat/saltat).
  //   2. Servern nollar must_change_password så att spärren släpper.
  // Först därefter uppdateras sessionen — annars skulle appen tro att bytet
  // är kvar och visa lösenordssidan igen.
  const changePassword = useCallback(
    async (newPassword: string): Promise<LoginResult> => {
      if (import.meta.env.DEV && demoActive()) {
        return {
          ok: false,
          error: 'Demoläget sparar inget. Byt lösenord i den riktiga appen i stället.',
        };
      }

      const backend = createAuthBackend();
      const result = await backend.changePassword('', newPassword);
      if (!result.ok) return result;

      const cleared = await backend.completePasswordChange();
      if (!cleared.ok) return { ok: false, error: cleared.error };

      try {
        const sup = getOrCreateSupabaseClient();
        await sup.auth.refreshSession();
      } catch {
        // Sessionen förnyas automatiskt av supabase-js ändå.
      }

      try {
        const s = await backend.getSession();
        setSession(
          s.exists && s.user
            ? { exists: true, user: { ...s.user, mustChangePassword: false } }
            : s,
        );
      } catch {
        setSession({
          exists: true,
          user: { ...result.user, mustChangePassword: false },
        });
      }

      return { ok: true, user: { ...result.user, mustChangePassword: false } };
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
      suggestUsername,
      createAccountWithUsername,
      createAccount,
      listAccounts,
      setAccountActive,
      updateAccountProfile,
      setAccountRole,
      setAccountType,
      resetAccountPassword,
      changePassword,
    }),
    [
      loading,
      session,
      login,
      logout,
      suggestUsername,
      createAccountWithUsername,
      createAccount,
      listAccounts,
      setAccountActive,
      updateAccountProfile,
      setAccountRole,
      setAccountType,
      resetAccountPassword,
      changePassword,
    ],
  );

  if (loading) {
    return (
      <div className="app-loading" role="status">
        Laddar…
      </div>
    );
  }

  // Om sessionen inte kunde läsas (t.ex. saknad konfiguration) visas ett
  // tydligt felmeddelande i stället för inloggningssidan — aldrig oändlig laddning.
  if (startupError && !session?.exists) {
    return (
      <div className="app-startup-error" role="alert">
        <div>{startupError}</div>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Försök igen
        </button>
      </div>
    );
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};
