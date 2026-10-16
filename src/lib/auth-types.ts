export interface VäxverketUser {
  /** Unik identifierare för användaren (Supabase UID eller motsvarande) */
  id: string;
  /** Användarnamn */
  username: string;
  /** Roll: 'admin' | 'speciallärare' | 'elev' */
  role: 'admin' | 'speciallärare' | 'elev';
  /** Om kontot är aktivt */
  active: boolean;
  /** Sant tills användaren har bytt sitt tillfälliga lösenord. */
  mustChangePassword?: boolean;
}

export interface AuthSession {
  /** Om det finns en inloggad session */
  exists: boolean;
  user?: VäxverketUser;
}

export type LoginResult =
  | { ok: true; user: VäxverketUser }
  | { ok: false; error: string };

export type ActivateResult =
  | { ok: true }
  | { ok: false; error: string };

export type RegisterResult =
  | { ok: true; activationCode: string; username: string }
  | { ok: false; error: string };

export interface AuthServiceBackend {
  /** Logga in med användarnamn + lösenord. Detta är en server-sidig operation när det görs säkert.
   * Vid Supabase-autentisering kan detta köras antingen i frontend (om Session / Cookie-strategi är vald)
   * eller i en serverdel (rekommenderat för känsliga operationer). */
  login(username: string, password: string): Promise<LoginResult>;

  /** Logga ut och ogiltigförklara den aktuella sessionen */
  logout(): Promise<void>;

  /** Kontrollera om det finns en giltig session och hämta användarinfo.
   * Returnerar AuthSession. Om inget session finns: { exists: false }. */
  getSession(): Promise<AuthSession>;

  /** Hämta aktuell användare (utan att kontrollera session). Används för profilsida. */
  getCurrentUser(): Promise<VäxverketUser | null>;

  /** Skapa en ny användare med användarnamn + roll + aktivering. Endast admins kan anropa detta.
   * Returnerar { ok, activationCode, username } eller { error }. */
  register(data: { username: string; role: VäxverketUser['role']; active?: boolean }): Promise<RegisterResult>;

  /** Aktivera ett konto med en engångskod och ange ett nytt lösenord.
   * Koden hanteras serversidigt och förbrukas efter en lyckad aktivering. */
  activate(code: string, newPassword: string): Promise<ActivateResult>;

  /** Ändra lösenord för inloggad användare (framtida funktion). */
  changePassword(oldPassword: string, newPassword: string): Promise<LoginResult>;
}

/** Typer för roll och panel som stöds i Växverket. */
export type Role = VäxverketUser['role'];
export type Panel = 'elev' | 'speciallarar' | 'admin';

/** Behörighetskontroll: vilka roller som får komma åt olika paneler. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, { allowedPanels: readonly Panel[]; defaultPanel: Panel }>> = {
  admin: {
    allowedPanels: ['elev', 'speciallarar', 'admin'] as const,
    defaultPanel: 'admin',
  },
  speciallärare: {
    allowedPanels: ['speciallarar'] as const,
    defaultPanel: 'speciallarar',
  },
  elev: {
    allowedPanels: ['elev'] as const,
    defaultPanel: 'elev',
  },
} as const;

export function getDefaultPanelForRole(
  role: VäxverketUser['role'],
): 'elev' | 'speciallarar' | 'admin' {
  return ROLE_PERMISSIONS[role].defaultPanel;
}

export function canAccessPanel(
  user: VäxverketUser | null,
  panel: 'elev' | 'speciallarar' | 'admin',
): boolean {
  if (!user) return false;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return ROLE_PERMISSIONS[user.role].allowedPanels.includes(panel);
}

/** Kontrollera om användaren är en administratör */
export function isAdmin(user: VäxverketUser | null): boolean {
  return user?.role === 'admin';
}
