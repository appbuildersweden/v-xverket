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
  SuggestUsernameResult,
  AdminOverviewResult,
  RegistrationApplicationsResult,
  RegistrationDecision,
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
  /** Föreslå ledigt användarnamn utifrån namn (endast administratörer) */
  suggestUsername: (firstName: string, lastName: string) => Promise<SuggestUsernameResult>;
  /** Skapa konto (endast administratörer) */
  createAccount: (data: {
    firstName: string;
    lastName: string;
    role: VäxverketUser['role'];
    password?: string;
  }) => Promise<CreateAccountResult>;
  /** Lista konton (endast administratörer) */
  listAccounts: () => Promise<AccountsResult>;
  /** Aktivera/inaktivera konto (endast administratörer) */
  setAccountActive: (userId: string, active: boolean) => Promise<OperationResult>;
  /** Uppdatera förnamn och efternamn (endast administratörer) */
  updateAccountProfile: (
    userId: string,
    firstName: string,
    lastName: string,
  ) => Promise<OperationResult>;
  /** Byt roll (endast administratörer, aldrig sitt eget konto) */
  setAccountRole: (
    userId: string,
    role: VäxverketUser['role'],
  ) => Promise<OperationResult>;
  /** Begränsa eller häv begränsning av ett konto */
  setAccountLimited: (userId: string, limited: boolean) => Promise<OperationResult>;
  /** Radera konto (endast administratörer) */
  deleteAccount: (userId: string) => Promise<OperationResult>;
  /** Verkliga räkningar till översikten */
  getAdminOverview: () => Promise<AdminOverviewResult>;
  /** Registreringsansökningar för granskning */
  listRegistrationApplications: () => Promise<RegistrationApplicationsResult>;
  /** Godkänn, begränsa eller avslå en ansökan */
  decideRegistrationApplication: (
    applicationId: string,
    decision: RegistrationDecision,
    note?: string,
  ) => Promise<OperationResult>;
  /** Byt lösenord för den inloggade användaren (via autentiseringssystemet) */
  changePassword: (newPassword: string) => Promise<LoginResult>;
  /** Ändra lärarens funktionsval (servern kontrollerar rollen) */
  updateFeatures: (
    features: string[],
  ) => Promise<{ ok: true; features: string[] } | { ok: false; error: string }>;
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

  const suggestUsername = useCallback(
    async (firstName: string, lastName: string): Promise<SuggestUsernameResult> => {
      return createAuthBackend().suggestUsername(firstName, lastName);
    },
    [],
  );

  const createAccount = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      role: VäxverketUser['role'];
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
      firstName: string,
      lastName: string,
    ): Promise<OperationResult> => {
      return createAuthBackend().updateAccountProfile(userId, firstName, lastName);
    },
    [],
  );

  const setAccountRole = useCallback(
    async (
      userId: string,
      role: VäxverketUser['role'],
    ): Promise<OperationResult> => {
      return createAuthBackend().setAccountRole(userId, role);
    },
    [],
  );

  const setAccountLimited = useCallback(
    async (userId: string, limited: boolean): Promise<OperationResult> => {
      return createAuthBackend().setAccountLimited(userId, limited);
    },
    [],
  );

  const deleteAccount = useCallback(
    async (userId: string): Promise<OperationResult> => {
      return createAuthBackend().deleteAccount(userId);
    },
    [],
  );

  const getAdminOverview = useCallback(async (): Promise<AdminOverviewResult> => {
    return createAuthBackend().getAdminOverview();
  }, []);

  const listRegistrationApplications =
    useCallback(async (): Promise<RegistrationApplicationsResult> => {
      return createAuthBackend().listRegistrationApplications();
    }, []);

  const decideRegistrationApplication = useCallback(
    async (
      applicationId: string,
      decision: RegistrationDecision,
      note?: string,
    ): Promise<OperationResult> => {
      return createAuthBackend().decideRegistrationApplication(
        applicationId,
        decision,
        note,
      );
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
        setSession(s);
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

  const updateFeatures = useCallback(
    async (
      features: string[],
    ): Promise<{ ok: true; features: string[] } | { ok: false; error: string }> => {
      const result = await createAuthBackend().updateFeatures(features);
      if (!result.ok) return result;
      setSession((prev) =>
        prev?.user ? { ...prev, user: { ...prev.user, features: result.features } } : prev,
      );
      return result;
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
      createAccount,
      listAccounts,
      setAccountActive,
      updateAccountProfile,
      setAccountRole,
      setAccountLimited,
      deleteAccount,
      getAdminOverview,
      listRegistrationApplications,
      decideRegistrationApplication,
      changePassword,
      updateFeatures,
    }),
    [
      loading,
      session,
      login,
      logout,
      suggestUsername,
      createAccount,
      listAccounts,
      setAccountActive,
      updateAccountProfile,
      setAccountRole,
      setAccountLimited,
      deleteAccount,
      getAdminOverview,
      listRegistrationApplications,
      decideRegistrationApplication,
      changePassword,
      updateFeatures,
    ],
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
