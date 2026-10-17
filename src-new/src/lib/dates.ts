/**
 * Datumhjälpare för panelerna. Rena funktioner utan sidoeffekter så att de kan
 * testas direkt, och så att dagens datum alltid kan skickas in i testet.
 *
 * Datum utan klockslag (t.ex. förfallodatum) hanteras som lokala datum — aldrig
 * som UTC — annars skulle en uppgift kunna visas på fel dag beroende på tidszon.
 */

const MONTHS_SV = [
  'jan', 'feb', 'mars', 'apr', 'maj', 'juni',
  'juli', 'aug', 'sep', 'okt', 'nov', 'dec',
];

const MONTHS_LONG_SV = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

/** 'oktober 2026' — månadsrubrik i kalendern. */
export function monthLabel(year: number, month: number): string {
  const name = MONTHS_LONG_SV[((month % 12) + 12) % 12];
  return `${name} ${year}`;
}

/** Lokalt datum som YYYY-MM-DD (samma format som kolumnen date). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Tolkar YYYY-MM-DD som lokalt datum. Ogiltigt värde ger null. */
export function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Skillnad i hela dygn mellan två lokala datum (b - a). */
export function daysBetween(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** Sant om förfallodatumet ligger före idag. */
export function isOverdue(due: string | null | undefined, now: Date = new Date()): boolean {
  const d = parseISODate(due);
  if (!d) return false;
  return daysBetween(now, d) < 0;
}

/** Antal dagar till förfallodatumet (negativt om det passerat). */
export function daysUntil(due: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseISODate(due);
  if (!d) return null;
  return daysBetween(now, d);
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('sv-SE', { weekday: 'long' });

/** 'onsdag 16 oktober'. */
export function formatLongDate(now: Date = new Date()): string {
  return `${WEEKDAY_FORMAT.format(now)} ${now.getDate()} ${MONTHS_SV[now.getMonth()]} ${now.getFullYear()}`;
}

/** '16 okt 2026'. */
export function formatDate(value: string | null | undefined): string {
  const d = parseISODate(value);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS_SV[d.getMonth()]} ${d.getFullYear()}`;
}

/** '16 okt 2026 kl. 14:05' från en ISO-tidsstämpel. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTHS_SV[d.getMonth()]} ${d.getFullYear()} kl. ${time}`;
}

/** '14:05' från en ISO-tidsstämpel. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'Idag', 'Imorgon', 'Igår', 'Om 3 dagar', 'För 3 dagar sedan' eller datum. */
export function dueLabel(due: string | null | undefined, now: Date = new Date()): string {
  const days = daysUntil(due, now);
  if (days === null) return 'Inget datum';
  if (days === 0) return 'Idag';
  if (days === 1) return 'Imorgon';
  if (days === -1) return 'Igår';
  if (days > 1 && days <= 7) return `Om ${days} dagar`;
  if (days < -1 && days >= -7) return `För ${Math.abs(days)} dagar sedan`;
  return formatDate(due);
}

/** Kort svensk datumetikett för meddelandelistor. */
export function formatShortStamp(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const days = daysBetween(now, d);
  if (days === 0) return formatTime(value);
  if (days === -1) return 'Igår';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
