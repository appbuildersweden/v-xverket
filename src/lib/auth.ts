export interface VäxverketUser {
  /** Unik identifierare för användaren (Supabase UID) */
  id: string;
  /** Användarnamn */
  username: string;
  /** Roll: 'admin' | 'speciallärare' | 'elev' — sätts endast serversidigt. */
  role: 'admin' | 'speciallärare' | 'elev';
  /** Om kontot är aktivt */
  active: boolean;
}

export interface AuthSession {
  /** Om det finns en inloggad session */
  exists: boolean;
  user?: VäxverketUser;
}

/** Ett konto som administratören kan se i kontohanteringen. */
export interface AuthAccount {
  id: string;
  username: string;
  role: VäxverketUser['role'];
  active: boolean;
  createdAt: string | null;
}

export type LoginResult =
  | { ok: true; user: VäxverketUser }
  | { ok: false; error: string };

export type CreateAccountResult =
  | { ok: true; username: string; role: VäxverketUser['role'] }
  | { ok: false; error: string };

export type AccountsResult =
  | { ok: true; accounts: AuthAccount[] }
  | { ok: false; error: string };

export type OperationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Autentiseringsbacken för Växverket.
 * Allt privilegierat arbete (kontoskapande, rolltilldelning, inaktivering)
 * sker i skyddade Supabase Edge Functions — aldrig i klienten.
 */
export interface AuthServiceBackend {
  /** Logga in med användarnamn + lösenord. */
  login(username: string, password: string): Promise<LoginResult>;

  /** Logga ut och rensa den aktuella sessionen. */
  logout(): Promise<void>;

  /** Hämta giltig session (återställs av Supabase om den finns). */
  getSession(): Promise<AuthSession>;

  /** Hämta aktuell användare utan att kontrollera session. */
  getCurrentUser(): Promise<VäxverketUser | null>;

  /** Skapa konto (endast administratörer via skyddad serverfunktion). */
  createAccount(data: {
    username: string;
    password: string;
    role: VäxverketUser['role'];
  }): Promise<CreateAccountResult>;

  /** Lista konton (endast administratörer via skyddad serverfunktion). */
  listAccounts(): Promise<AccountsResult>;

  /** Aktivera eller inaktivera ett konto (endast administratörer). */
  setAccountActive(userId: string, active: boolean): Promise<OperationResult>;

  /** Byt lösenord för den inloggade användaren. */
  changePassword(oldPassword: string, newPassword: string): Promise<LoginResult>;
}

import { createSupabaseAuthBackend } from './auth-supabase';

/**
 * Skapar Supabase-backenden. Om initieringen kastar returneras en
 * reservbackend som ger tydliga felmeddelanden i stället för att krascha
 * appen eller fastna i laddningstillstånd.
 */
export function createAuthBackend(): AuthServiceBackend {
  try {
    return createSupabaseAuthBackend();
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Autentiseringsbackenden kunde inte startas.';

    return {
      async login(_username: string, _password: string): Promise<LoginResult> {
        return { ok: false, error: message };
      },
      async logout(): Promise<void> {
        /* inget att rensa */
      },
      async getSession(): Promise<AuthSession> {
        return { exists: false };
      },
      async getCurrentUser(): Promise<VäxverketUser | null> {
        return null;
      },
      async createAccount(_data: {
        username: string;
        password: string;
        role: VäxverketUser['role'];
      }): Promise<CreateAccountResult> {
        return { ok: false, error: message };
      },
      async listAccounts(): Promise<AccountsResult> {
        return { ok: false, error: message };
      },
      async setAccountActive(_userId: string, _active: boolean): Promise<OperationResult> {
        return { ok: false, error: message };
      },
      async changePassword(_oldPassword: string, _newPassword: string): Promise<LoginResult> {
        return { ok: false, error: message };
      },
    };
  }
}

export type { VäxverketUser as User, AuthSession as Session };
