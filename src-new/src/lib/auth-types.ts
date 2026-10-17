/**
 * Elda – delade autentiserings- och rolltyper.
 *
 * Rollerna är desamma som i databasen (profiles.role och app_metadata.role):
 *   'admin' | 'lärare' | 'speciallärare' | 'elev'
 * Panelerna använder korta id:n: 'admin' | 'larare' | 'speciallarar' | 'elev'.
 *
 * 'lärare' är den nya lärarrollen (egna klasser, egna elever, uppgifter och
 * material). 'speciallärare' är oförändrad och har sin egen panel. En elev har
 * dessutom en kontotyp: 'skola' (skolelev) eller 'privat' (privat elev) — den
 * styr vilka klassfunktioner som erbjuds, men aldrig behörigheten. Klassens
 * innehåll kräver alltid ett *godkänt* klassmedlemskap (class_members).
 *
 * Rollen är alltid serverstyrd. Ingenting i den här filen får användas som
 * auktoritativ källa — den avgör bara vad användaren får se i gränssnittet.
 * Den verkliga behörigheten ligger i Row Level Security och i Edge Functions.
 */

export type Role = 'admin' | 'lärare' | 'speciallärare' | 'elev';

/** Kontotyp för ett elevkonto. Saknas värdet räknas kontot som skolelev. */
export type AccountType = 'skola' | 'privat';

/**
 * Rollen som appen fick från servern. 'okand' betyder att kontot inte har en
 * giltig roll (t.ex. saknad app_metadata.role) och ska nekas åtkomst — aldrig
 * tolkas som elev eller admin.
 */
export type UserRole = Role | 'okand';

/**
 * Panel-id:n (gränssnittets namn på rollernas vyer).
 *
 * 'elev' är skolelevens panel (klass, klasschatt och klassuppgifter) och
 * 'privat' är privatelevens egen panel (samma studieverktyg, men inga
 * klassfunktioner). Vilken av dem en elev får styrs av kontotypen, inte av
 * rollen — båda har rollen 'elev'.
 */
export type Panel = 'elev' | 'privat' | 'larare' | 'speciallarar' | 'admin';

export interface VäxverketUser {
  /** Unik identifierare för användaren (Supabase UID) */
  id: string;
  /** Användarnamn */
  username: string;
  /** Roll: 'admin' | 'speciallärare' | 'elev' — sätts endast serversidigt. */
  role: UserRole;
  /** Om kontot är aktivt */
  active: boolean;
  /**
   * Sant för nya konton som fortfarande har det tillfälliga lösenordet.
   * Sätts serversidigt och försvinner först när lösenordet har bytts.
   */
  mustChangePassword: boolean;
  /**
   * Kontotyp för elever: 'skola' eller 'privat'. Sätts serversidigt utifrån
   * registreringen. Saknas värdet behandlas kontot som skolelev.
   */
  accountType?: AccountType;
  /**
   * Sant när kontot är aktivt men begränsat (t.ex. en ansökan som väntar på
   * granskning). Begränsade konton får läsa men inte skapa klasser eller
   * ansöka om klassmedlemskap — servern nekar, inte gränssnittet.
   */
  limited?: boolean;
}

export interface AuthSession {
  /** Om det finns en inloggad session */
  exists: boolean;
  user?: VäxverketUser;
}

/** Roller som en administratör får skapa direkt i kontohanteringen. */
export const CREATABLE_ROLES: readonly Role[] = ['elev', 'lärare', 'speciallärare'];

/**
 * Roller som får tilldelas i efterhand under Roller och behörigheter.
 * Adminrollen finns bara här — den kan aldrig väljas i skapa-konto-formuläret,
 * och åtgärden kräver att anroparen redan är administratör (servern avgör).
 */
export const ASSIGNABLE_ROLES: readonly Role[] = [
  'admin',
  'lärare',
  'speciallärare',
  'elev',
];

/** Ett konto som administratören kan se i kontohanteringen. */
export interface AuthAccount {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  createdAt: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Skolelev eller privat elev. Utan värde räknas kontot som skolelev. */
  accountType?: AccountType;
  /** Sant när kontot är aktivt men begränsat (väntar på granskning). */
  limited?: boolean;
  /** Sant när användaren måste byta lösenord vid nästa inloggning. */
  mustChangePassword?: boolean;
}

/**
 * Svar på inloggning. Servern lämnar ingen session förrän ett konto med
 * tillfälligt lösenord har fått ett eget — då svarar den med
 * `mustSetNewPassword` i stället, och inloggningen görs om med det nya
 * lösenordet i samma anrop.
 */
export type LoginResult =
  | { ok: true; user: VäxverketUser }
  | { ok: false; error: string; mustSetNewPassword?: boolean };

export type CreateAccountResult =
  | {
      ok: true;
      username: string;
      role: Role;
      /**
       * Ett slumpat tillfälligt lösenord som servern skapade. Det visas en gång
       * för administratören och finns inte kvar i klartext efteråt.
       */
      initialPassword?: string | null;
    }
  | { ok: false; error: string };

/** Svaret när ett nytt tillfälligt lösenord har skapats för ett konto. */
export type ResetPasswordResult =
  | { ok: true; username: string; initialPassword: string }
  | { ok: false; error: string };

export type AccountsResult =
  | { ok: true; accounts: AuthAccount[] }
  | { ok: false; error: string };

export type OperationResult = { ok: true } | { ok: false; error: string };

export type SuggestUsernameResult =
  | { ok: true; username: string }
  | { ok: false; error: string };

/**
 * Autentiseringsbackenden för Elda.
 * Allt privilegierat arbete (kontoskapande, rolltilldelning, inaktivering)
 * sker i skyddade Supabase Edge Functions — aldrig i klienten.
 */
export interface AuthServiceBackend {
  /**
   * Logga in med användarnamn + lösenord. Skickas `newPassword` med byter
   * servern det tvingade lösenordet i samma anrop — annars lämnas ingen
   * session ut för ett konto som fortfarande har sitt tillfälliga lösenord.
   */
  login(username: string, password: string, newPassword?: string): Promise<LoginResult>;

  /** Logga ut och ogiltigförklara den aktuella sessionen. */
  logout(): Promise<void>;

  /** Hämta giltig session (återställs av Supabase om den finns). */
  getSession(): Promise<AuthSession>;

  /** Hämta aktuell användare utan att kontrollera session. */
  getCurrentUser(): Promise<VäxverketUser | null>;

  /**
   * Föreslå ett ledigt användarnamn utifrån förnamn och efternamn.
   * Beräknas och kontrolleras serversidigt (e + 3 + 2 + löpnummer).
   */
  suggestUsername(firstName: string, lastName: string): Promise<SuggestUsernameResult>;

  /**
   * Skapa konto med ett bestämt användarnamn (endast administratörer).
   * Utelämnas lösenordet skapar servern ett slumpat tillfälligt lösenord som
   * returneras en gång i `initialPassword`. Anropet går till den skyddade
   * serverfunktionen `admin-users`, som verifierar anroparens roll.
   */
  createAccountWithUsername(data: {
    username: string;
    password?: string;
    role: Role;
  }): Promise<CreateAccountResult>;

  /** Skapa konto utifrån namn — användarnamnet genereras serversidigt. */
  createAccount(data: {
    firstName: string;
    lastName: string;
    role: Role;
    password?: string;
  }): Promise<CreateAccountResult>;

  /**
   * Markera det tvingade lösenordsbytet som klart. Anropas efter att Supabase
   * Auth har sparat det nya lösenordet — flaggan nollas serversidigt.
   */
  completePasswordChange(): Promise<OperationResult>;

  /** Lista konton (endast administratörer via skyddad serverfunktion). */
  listAccounts(): Promise<AccountsResult>;

  /** Aktivera eller inaktivera ett konto (endast administratörer). */
  setAccountActive(userId: string, active: boolean): Promise<OperationResult>;

  /**
   * Ändra förnamn och efternamn på ett konto. Rollen kan aldrig ändras här —
   * den har sin egen, loggade åtgärd.
   */
  updateAccountProfile(
    userId: string,
    name: { firstName: string; lastName: string },
  ): Promise<OperationResult>;

  /**
   * Byt roll på ett konto. Kräver att anroparen redan är administratör och
   * loggas i granskningsloggen. Ingen kan ändra sin egen roll.
   */
  setAccountRole(userId: string, role: Role): Promise<OperationResult>;

  /**
   * Ändra kontotyp för ett elevkonto: skolelev eller privat elev. Privat elev
   * får ingen klassåtkomst och kräver därför att eleven inte är klassmedlem.
   */
  setAccountType(userId: string, accountType: AccountType): Promise<OperationResult>;

  /**
   * Skapa ett nytt tillfälligt lösenord. Det returneras en gång och kräver byte
   * vid nästa inloggning.
   */
  resetAccountPassword(userId: string): Promise<ResetPasswordResult>;

  /** Byt lösenord för den inloggade användaren. */
  changePassword(oldPassword: string, newPassword: string): Promise<LoginResult>;
}

/** Vilka paneler respektive roll får öppna, och rollens startpanel. */
export const ROLE_PERMISSIONS: Readonly<
  Record<Role, { allowedPanels: readonly Panel[]; defaultPanel: Panel }>
> = {
  admin: {
    // Admin är en uttalad övervakningsroll och når alla paneler.
    allowedPanels: ['elev', 'speciallarar', 'admin'] as const,
    defaultPanel: 'admin',
  },
  lärare: {
    // Läraren har sin egen panel — aldrig adminpanelens funktioner.
    allowedPanels: ['larare'] as const,
    defaultPanel: 'larare',
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

/** Sant bara för de roller som appen känner igen. Okänd roll nekas alltid. */
export function isKnownRole(value: unknown): value is Role {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value)
  );
}

/** Läser en rollsträng från servern och mappar okända värden till 'okand'. */
export function toUserRole(value: unknown): UserRole {
  return isKnownRole(value) ? value : 'okand';
}

export function getDefaultPanelForRole(role: Role): Panel {
  return ROLE_PERMISSIONS[role].defaultPanel;
}

export function canAccessPanel(user: VäxverketUser | null, panel: Panel): boolean {
  if (!user || !isKnownRole(user.role)) return false;
  // Elevrollen har två separata paneler. Kontotypen avgör vilken: en
  // skolelev når aldrig privatelevpanelen och en privatelev når aldrig
  // klasspanelerna, inte ens via en inklistrad adress.
  if (user.role === 'elev') {
    return panel === (isPrivateStudent(user) ? 'privat' : 'elev');
  }
  return ROLE_PERMISSIONS[user.role].allowedPanels.includes(panel);
}

/**
 * Kontot är en privat elev: personliga studieverktyg, ingen klass.
 * Ett konto utan kontotyp räknas som skolelev — samma tolkning som servern.
 */
export function isPrivateStudent(user: VäxverketUser | null): boolean {
  return user?.role === 'elev' && user.accountType === 'privat';
}

