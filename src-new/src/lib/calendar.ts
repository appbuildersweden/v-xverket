/**
 * Kalendern i Min planering. Rena funktioner så att rutnätet kan testas direkt:
 * vilka dagar en månad består av, hur man byter månad och hur många poster som
 * ligger på varje dag.
 *
 * Rutnätet är alltid sex veckor och börjar på måndag, så att höjden inte hoppar
 * när man bläddrar mellan månader.
 */
import { todayISO } from './dates';

export interface CalendarDay {
  /** Lokalt datum som YYYY-MM-DD. */
  iso: string;
  /** Dag i månaden (1–31). */
  day: number;
  /** Sant om dagen hör till månaden som visas (annars är den en utfyllnad). */
  inMonth: boolean;
  /** Sant om dagen är dagens datum. */
  isToday: boolean;
}

export const WEEKDAY_LABELS = ['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'] as const;

const DAYS_IN_WEEK = 7;
const WEEKS_IN_GRID = 6;

/** Lokalt datum som YYYY-MM-DD utan tidszonstrassel. */
export function toISODate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Veckodag med måndag som första dag (0 = måndag … 6 = söndag).
 * Date.getDay() har söndag som 0, så den vrids ett steg.
 */
function mondayFirst(weekday: number): number {
  return (weekday + 6) % DAYS_IN_WEEK;
}

/** Sexveckorsrutnätet för en månad. */
export function monthGrid(
  year: number,
  month: number,
  today: string = todayISO(),
): CalendarDay[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - mondayFirst(first.getDay()));
  const days: CalendarDay[] = [];

  for (let i = 0; i < DAYS_IN_WEEK * WEEKS_IN_GRID; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISODate(date.getFullYear(), date.getMonth(), date.getDate());
    days.push({
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === month && date.getFullYear() === year,
      isToday: iso === today,
    });
  }

  return days;
}

/** Nästa eller föregående månad, med årsskifte hanterat. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export interface DayCounts {
  /** Antal poster per dag (YYYY-MM-DD). Dagar utan poster saknas i kartan. */
  byDay: Map<string, number>;
  /** Antal poster som saknar datum. */
  withoutDate: number;
  total: number;
}

/** Räknar hur många poster som ligger på varje dag. */
export function countByDay(items: readonly { due_date: string | null }[]): DayCounts {
  const byDay = new Map<string, number>();
  let withoutDate = 0;

  for (const item of items) {
    if (!item.due_date) {
      withoutDate += 1;
      continue;
    }
    const day = item.due_date.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return { byDay, withoutDate, total: items.length };
}

/** Läsbar beskrivning av en dag, för skärmläsare och rubriker. */
export function dayAriaLabel(day: CalendarDay, count: number): string {
  const month = new Date(`${day.iso}T00:00:00`).toLocaleDateString('sv-SE', { month: 'long' });
  const date = `${day.day} ${month}`;
  if (count === 0) return `${date}, inget inplanerat`;
  if (count === 1) return `${date}, 1 post`;
  return `${date}, ${count} poster`;
}
