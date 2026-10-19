const MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function isoWeek(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + 1) / 7);
}

export function longDate(value: string | Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00`) : value;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return 'Ingen deadline';
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00`) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()} kl. ${String(
    date.getHours(),
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function timeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const now = new Date(todayIso());
  const target = new Date(`${date}T12:00:00`);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function deadlineLabel(date: string | null): string {
  const days = daysUntil(date);
  if (days === null) return 'Ingen deadline';
  if (days < 0) return `${Math.abs(days)} dagar försenad`;
  if (days === 0) return 'Idag';
  if (days === 1) return 'Imorgon';
  return `Om ${days} dagar`;
}

export function displayName(
  profile: { first_name?: string | null; last_name?: string | null; username?: string } | null,
): string {
  if (!profile) return 'Okänd';
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  return full || profile.username || 'Okänd';
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export const STATUS_LABEL: Record<string, string> = {
  ej_paborjad: 'Ej påbörjad',
  pagar: 'Pågående',
  klar: 'Klar',
};

export const KIND_LABEL: Record<string, string> = {
  uppgift: 'Uppgift',
  diskussion: 'Diskussion',
  reflektion: 'Reflektion',
  grupparbete: 'Grupparbete',
  quiz: 'Quiz',
  ovning: 'Övning',
};

export function truncate(text: string | null | undefined, length = 140): string {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}

export function sortByDate<T>(rows: T[], key: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((a, b) => {
    const av = key(a) ?? '9999-12-31';
    const bv = key(b) ?? '9999-12-31';
    return av.localeCompare(bv);
  });
}
