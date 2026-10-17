import {
  AccountType,
  AccountsResult,
  AuthAccount,
  AuthServiceBackend,
  AuthSession,
  CreateAccountResult,
  LoginResult,
  OperationResult,
  ResetPasswordResult,
  Role,
  SuggestUsernameResult,
  VäxverketUser,
} from './auth-types';
import { createSupabaseAuthBackend } from './auth-supabase';

export type {
  AccountsResult,
  AuthAccount,
  AuthServiceBackend,
  AuthSession,
  CreateAccountResult,
  LoginResult,
  OperationResult,
  ResetPasswordResult,
  Role,
  SuggestUsernameResult,
  VäxverketUser,
};

/**
 * Skapar Supabase-backenden. Om initieringen kastar (t.ex. saknad
 * konfiguration) returneras en reservbackend som ger tydliga felmeddelanden i
 * stället för att krascha appen eller fastna i laddningstillstånd.
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
      async suggestUsername(): Promise<SuggestUsernameResult> {
        return { ok: false, error: message };
      },
      async createAccountWithUsername(_data: {
        username: string;
        password?: string;
        role: Role;
      }): Promise<CreateAccountResult> {
        return { ok: false, error: message };
      },
      async createAccount(_data: {
        firstName: string;
        lastName: string;
        role: Role;
        password?: string;
      }): Promise<CreateAccountResult> {
        return { ok: false, error: message };
      },
      async completePasswordChange(): Promise<OperationResult> {
        return { ok: false, error: message };
      },
      async listAccounts(): Promise<AccountsResult> {
        return { ok: false, error: message };
      },
      async setAccountActive(
        _userId: string,
        _active: boolean,
      ): Promise<OperationResult> {
        return { ok: false, error: message };
      },
      async updateAccountProfile(
        _userId: string,
        _name: { firstName: string; lastName: string },
      ): Promise<OperationResult> {
        return { ok: false, error: message };
      },
      async setAccountRole(_userId: string, _role: Role): Promise<OperationResult> {
        return { ok: false, error: message };
      },
      async setAccountType(
        _userId: string,
        _accountType: AccountType,
      ): Promise<OperationResult> {
        return { ok: false, error: message };
      },
      async resetAccountPassword(
        _userId: string,
      ): Promise<ResetPasswordResult> {
        return { ok: false, error: message };
      },
      async changePassword(
        _oldPassword: string,
        _newPassword: string,
      ): Promise<LoginResult> {
        return { ok: false, error: message };
      },
    };
  }
}
