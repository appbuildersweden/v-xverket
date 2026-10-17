/**
 * Hjälpfunktioner för kontohanteringen.
 *
 * Ren logik utan sidoeffekter: filtrering, sammanställning och validering.
 * Allt privilegierat (skapa konto, tilldela roll) sker i Edge Functionen
 * `admin-users` — ingenting här ger behörighet.
 */
import {
  ASSIGNABLE_ROLES,
  AuthAccount,
  CREATABLE_ROLES,
  Role,
  isKnownRole,
} from './auth-types';

/** Vilka roller som får skapas i kontohanteringen. Adminrollen är aldrig med. */
export { CREATABLE_ROLES, ASSIGNABLE_ROLES };

/** Rollgrupper för sidorna Elever och Personal. */
export const ELEV_ROLES: readonly Role[] = ['elev'];
export const PERSONAL_ROLES: readonly Role[] = ['lärare', 'speciallärare', 'admin'];

/** Etikett för en roll i listor och filter. */
export function roleLabel(role: Role): string {
  if (role === 'admin') return 'Administratör';
  if (role === 'lärare') return 'Lärare';
  if (role === 'speciallärare') return 'Speciallärare';
  return 'Elev';
}

/** Kontotypen som text, för kontolistor och detaljvyer. */
export function accountTypeLabel(account: AuthAccount): string {
  if (account.role !== 'elev') return '—';
  return account.accountType === 'privat' ? 'Privat elev' : 'Skolelev';
}

/** Fullt namn om kontot har ett, annars null. */
export function displayName(account: AuthAccount): string | null {
  const parts = [account.firstName?.trim(), account.lastName?.trim()].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Sant om rollen får skapas direkt i kontohanteringen. */
export function isCreatableRole(value: unknown): value is Role {
  return isKnownRole(value) && CREATABLE_ROLES.includes(value);
}

export interface AccountCounts {
  total: number;
  active: number;
  inactive: number;
  elev: number;
  larare: number;
  speciallarare: number;
  admin: number;
  /** Konton utan giltig roll — ska normalt vara 0. */
  utanRoll: number;
}

/** Räknar konton per roll. Används på startsidan med hämtade data. */
export function countAccounts(accounts: readonly AuthAccount[]): AccountCounts {
  const counts: AccountCounts = {
    total: accounts.length,
    active: 0,
    inactive: 0,
    elev: 0,
    larare: 0,
    speciallarare: 0,
    admin: 0,
    utanRoll: 0,
  };
  for (const account of accounts) {
    if (account.active) counts.active += 1;
    else counts.inactive += 1;
    if (account.role === 'elev') counts.elev += 1;
    else if (account.role === 'lärare') counts.larare += 1;
    else if (account.role === 'speciallärare') counts.speciallarare += 1;
    else if (account.role === 'admin') counts.admin += 1;
    else counts.utanRoll += 1;
  }
  return counts;
}

/** Filter för kontostatus i listorna. */
export type StatusFilter = 'alla' | 'aktiva' | 'inaktiva';

export const STATUS_FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: 'alla', label: 'Alla statusar' },
  { id: 'aktiva', label: 'Aktiva' },
  { id: 'inaktiva', label: 'Inaktiva' },
];

/** Filter för elevkontots typ. */
export type AccountTypeFilter = 'alla' | 'skola' | 'privat';

export const ACCOUNT_TYPE_FILTERS: ReadonlyArray<{
  id: AccountTypeFilter;
  label: string;
}> = [
  { id: 'alla', label: 'Alla elevtyper' },
  { id: 'skola', label: 'Skolelever' },
  { id: 'privat', label: 'Privata elever' },
];

/** Filtrerar på aktiv/inaktiv status. */
export function filterByStatus(
  accounts: readonly AuthAccount[],
  status: StatusFilter,
): AuthAccount[] {
  if (status === 'alla') return [...accounts];
  const wantActive = status === 'aktiva';
  return accounts.filter((account) => account.active === wantActive);
}

/** Filtrerar elevkonton på kontotyp. Andra roller påverkas inte. */
export function filterByAccountType(
  accounts: readonly AuthAccount[],
  type: AccountTypeFilter,
): AuthAccount[] {
  if (type === 'alla') return [...accounts];
  return accounts.filter(
    (account) => account.role === 'elev' && (account.accountType === 'privat' ? 'privat' : 'skola') === type,
  );
}

/**
 * Fritextsökning i kontolistan. Matchar användarnamn och, när det finns, namn.
 * Skiftlägesokänslig delmatchning — samma sökning i alla kontolistor.
 */
export function searchAccounts(
  accounts: readonly AuthAccount[],
  query: string,
): AuthAccount[] {
  const text = query.trim().toLowerCase();
  if (!text) return [...accounts];
  return accounts.filter((account) => {
    const name = displayName(account)?.toLowerCase() ?? '';
    return account.username.toLowerCase().includes(text) || name.includes(text);
  });
}

/** Sorterar konton på användarnamn (svensk ordning, A–Ö). */
export function sortAccounts(accounts: readonly AuthAccount[]): AuthAccount[] {
  return [...accounts].sort((a, b) =>
    a.username.localeCompare(b.username, 'sv', { sensitivity: 'base' }),
  );
}

/** Konton med någon av rollerna, sorterade. Används av Elever och Personal. */
export function accountsWithRoles(
  accounts: readonly AuthAccount[],
  roles: readonly Role[],
): AuthAccount[] {
  return sortAccounts(accounts.filter((a) => roles.includes(a.role)));
}

/**
 * Vad en åtgärd gör med kontot, som text i bekräftelsen. Ren funktion, så att
 * knapparnas innebörd kan testas utan gränssnitt.
 */
export function activationQuestion(account: AuthAccount): string {
  return account.active
    ? `Inaktivera ${account.username}? Kontot kan inte logga in förrän det aktiveras igen. Inget innehåll raderas.`
    : `Aktivera ${account.username}? Kontot kan logga in igen med samma uppgifter som förut.`;
}

/** Sant om kontot är den inloggade användarens eget konto. */
function isSelf(account: AuthAccount, meId: string | null | undefined): boolean {
  return !!meId && account.id === meId;
}

/**
 * Roller som den inloggade administratören får välja för ett konto. Det egna
 * kontot kan aldrig ändras (då kan en admin låsa ute sig själv eller höja sig
 * själv), och servern nekar dessutom samma sak.
 */
export function assignableRolesFor(
  account: AuthAccount,
  meId: string | null | undefined,
): Role[] {
  if (isSelf(account, meId)) return [account.role];
  return [...ASSIGNABLE_ROLES];
}

// ----------------------------------------------------------------
// Validering av nya konton
// ----------------------------------------------------------------

/** Samma regel som serverfunktionerna använder. */
export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;

/** Vanliga tillfälliga lösenord som inte ska kunna väljas som eget. */
export const FORBIDDEN_PASSWORDS: readonly string[] = ['student123', 'losenord', 'password'];

export interface CreateAccountInput {
  username: string;
  password: string;
  confirmation: string;
  role: string;
  /**
   * Låt servern skapa ett slumpat tillfälligt lösenord i stället. Det visas en
   * gång för administratören och kräver byte vid första inloggningen.
   */
  generatePassword?: boolean;
}

/**
 * Validerar formuläret för att skapa konto. Returnerar ett tydligt
 * användarmeddelande, eller null om allt är ok. Servern validerar samma saker —
 * klienten är bara ett tidigt och begripligt filter.
 */
export function validateCreateAccount(input: CreateAccountInput): string | null {
  const username = input.username.trim().toLowerCase();

  if (!username) return 'Fyll i ett användarnamn.';
  if (!USERNAME_RE.test(username)) {
    return 'Användarnamnet måste vara 3–32 tecken och får bara innehålla små bokstäver, siffror, punkt, bindestreck eller understreck.';
  }
  // Ett eget lösenord valideras bara när administratören väljer att ange ett.
  if (!input.generatePassword) {
    if (!input.password) return 'Fyll i ett lösenord.';
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`;
    }
    if (input.password !== input.confirmation) return 'Lösenorden stämmer inte överens.';
    if (FORBIDDEN_PASSWORDS.includes(input.password.toLowerCase())) {
      return 'Det lösenordet är för vanligt. Välj ett eget.';
    }
    if (input.password.toLowerCase() === username) {
      return 'Lösenordet får inte vara samma som användarnamnet.';
    }
  }
  if (!isCreatableRole(input.role)) return 'Välj en roll.';
  return null;
}

/** Normaliserar indata innan den skickas till servern. */
export function normalizeCreateAccount(input: CreateAccountInput): {
  username: string;
  password?: string;
  role: Role;
} {
  return {
    username: input.username.trim().toLowerCase(),
    // Utan eget lösenord skickas inget alls — servern skapar ett tillfälligt.
    password: input.generatePassword ? undefined : input.password,
    role: input.role as Role,
  };
}
