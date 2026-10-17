import type { AuthAccount, RegistrationApplication, VäxverketUser } from '../../lib/auth';

export type AccountRole = VäxverketUser['role'];

export const ROLE_LABELS: Record<AccountRole, string> = {
  elev: 'Elev',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  admin: 'Administratör',
};

export const ROLE_OPTIONS: { value: AccountRole; label: string }[] = [
  { value: 'elev', label: 'Elev' },
  { value: 'lärare', label: 'Lärare' },
  { value: 'speciallärare', label: 'Speciallärare' },
  { value: 'admin', label: 'Administratör' },
];

export function fullName(
  account: Pick<AuthAccount, 'firstName' | 'lastName'>,
): string {
  return [account.firstName, account.lastName].filter(Boolean).join(' ').trim();
}

/** Visningsnamn: för- och efternamn om det finns, annars användarnamnet. */
export function displayName(
  account: Pick<AuthAccount, 'firstName' | 'lastName' | 'username'>,
): string {
  return fullName(account) || account.username;
}

export function initials(
  account: Pick<AuthAccount, 'firstName' | 'lastName' | 'username'>,
): string {
  const name = fullName(account);
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
  return account.username.charAt(0).toUpperCase();
}

export type AccountStatusTone = 'active' | 'inactive' | 'limited';

export const ACCOUNT_STATUS_LABELS: Record<AccountStatusTone, string> = {
  active: 'Aktiv',
  inactive: 'Inaktiv',
  limited: 'Begränsad',
};

export function accountStatus(account: AuthAccount): {
  tone: AccountStatusTone;
  label: string;
  detail: string;
} {
  if (!account.active) {
    return {
      tone: 'inactive',
      label: ACCOUNT_STATUS_LABELS.inactive,
      detail: 'Kan inte logga in',
    };
  }
  if (account.limited) {
    return {
      tone: 'limited',
      label: ACCOUNT_STATUS_LABELS.limited,
      detail: 'Begränsad åtkomst — kan inte skapa klasser eller ansöka om klassmedlemskap',
    };
  }
  return {
    tone: 'active',
    label: ACCOUNT_STATUS_LABELS.active,
    detail: 'Full åtkomst enligt rollen',
  };
}

export function formatDate(value: string | null): string {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const APPLICATION_KIND_LABELS: Record<RegistrationApplication['kind'], string> = {
  skolelev: 'Skolelev',
  privat_elev: 'Privat elev',
  larare: 'Lärare',
};

export function applicationName(application: RegistrationApplication): string {
  if (application.fullName) return application.fullName;
  if (application.createdUsername) return application.createdUsername;
  return 'Namnlös ansökan';
}
