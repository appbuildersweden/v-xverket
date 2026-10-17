/**
 * Schemaposter för skolan.
 *
 * En schemapost beskriver en återkommande aktivitet på en veckodag, kopplad till
 * antingen en klass eller en person. Läsning går direkt mot tabellen
 * `schedule_entries` (Row Level Security avgör vad som syns), medan all
 * skrivning sker genom databasens funktioner — de kontrollerar adminrollen på
 * serversidan och loggar varje ändring. Klienten här ger därför ingen behörighet.
 */
import { Result, withClient } from './db';

export interface ScheduleEntry {
  id: string;
  title: string;
  subject: string | null;
  room: string | null;
  /** 1 = måndag … 7 = söndag. */
  weekday: number;
  /** 'HH:MM:SS' som Postgres time-kolumnen returnerar. */
  start_time: string;
  end_time: string;
  class_id: string | null;
  user_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewScheduleInput {
  title: string;
  weekday: number;
  start_time: string;
  end_time: string;
  subject: string;
  room: string;
  note: string;
  /** Målet: exakt en av class_id och user_id måste vara satt. */
  class_id: string | null;
  user_id: string | null;
}

/** Veckodagarnas namn i den ordning schemat visas. Index 0 = måndag (1). */
export const WEEKDAY_LABELS: readonly string[] = [
  'Måndag',
  'Tisdag',
  'Onsdag',
  'Torsdag',
  'Fredag',
  'Lördag',
  'Söndag',
];

/** Veckodagens namn, eller 'Okänd dag' om värdet ligger utanför 1–7. */
export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday - 1] ?? 'Okänd dag';
}

/** Kort veckodagsnamn, för trånga listor. */
export function weekdayShort(weekday: number): string {
  const label = WEEKDAY_LABELS[weekday - 1];
  return label ? label.slice(0, 3) : '—';
}

/** ISO-veckodag (1 = måndag … 7 = söndag) för ett datum. */
export function isoWeekday(now: Date = new Date()): number {
  const day = now.getDay();
  return day === 0 ? 7 : day;
}

/** 'HH:MM' ur en time-kolumn ('HH:MM:SS' eller 'HH:MM'). */
export function formatClock(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 5);
}

/** '08:00–09:30' för en schemapost. */
export function timeRange(entry: Pick<ScheduleEntry, 'start_time' | 'end_time'>): string {
  return `${formatClock(entry.start_time)}–${formatClock(entry.end_time)}`;
}

/**
 * Validerar en schemapost innan den skickas till servern. Servern validerar
 * exakt samma saker — det här är bara ett tidigt, begripligt filter.
 */
export function validateScheduleEntry(input: NewScheduleInput): string | null {
  const title = input.title.trim();
  if (title.length < 2) return 'Ge schemaposten en rubrik (minst 2 tecken).';
  if (title.length > 120) return 'Rubriken är för lång (max 120 tecken).';
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    return 'Välj en veckodag mellan måndag och söndag.';
  }
  if (!input.start_time || !input.end_time) return 'Ange både start- och sluttid.';
  if (formatClock(input.end_time) <= formatClock(input.start_time)) {
    return 'Sluttiden måste vara senare än starttiden.';
  }
  const hasClass = !!input.class_id;
  const hasUser = !!input.user_id;
  if (hasClass === hasUser) return 'Välj antingen en klass eller en person.';
  return null;
}

/** Sorterar schemat i veckans ordning, därefter på starttid. */
export function sortScheduleEntries(
  entries: readonly ScheduleEntry[],
): ScheduleEntry[] {
  return [...entries].sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    const aTime = formatClock(a.start_time);
    const bTime = formatClock(b.start_time);
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return a.title.localeCompare(b.title, 'sv');
  });
}

/** Grupperar schemat per veckodag, i veckans ordning. Tomma dagar tas bort. */
export function groupByWeekday(
  entries: readonly ScheduleEntry[],
): Array<{ weekday: number; label: string; entries: ScheduleEntry[] }> {
  const sorted = sortScheduleEntries(entries);
  const groups: Array<{ weekday: number; label: string; entries: ScheduleEntry[] }> = [];
  for (const entry of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.weekday === entry.weekday) {
      last.entries.push(entry);
    } else {
      groups.push({
        weekday: entry.weekday,
        label: weekdayLabel(entry.weekday),
        entries: [entry],
      });
    }
  }
  return groups;
}

/**
 * Schemaposter för en vecka framåt, räknat från dagens veckodag. Används på
 * startsidan så att den visar verkliga kommande aktiviteter i stället för en
 * påhittad kalender.
 */
export function upcomingEntries(
  entries: readonly ScheduleEntry[],
  now: Date = new Date(),
): ScheduleEntry[] {
  const today = isoWeekday(now);
  const sorted = sortScheduleEntries(entries);
  const soon = sorted.filter((e) => e.weekday >= today);
  return [...soon, ...sorted.filter((e) => e.weekday < today)];
}

/** Filtrerar schemat på fritext (rubrik, ämne, sal) och veckodag. */
export function filterScheduleEntries(
  entries: readonly ScheduleEntry[],
  options: { query?: string; weekday?: number | 'alla' } = {},
): ScheduleEntry[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const weekday = options.weekday ?? 'alla';
  return entries.filter((entry) => {
    if (weekday !== 'alla' && entry.weekday !== weekday) return false;
    if (!query) return true;
    const haystack = `${entry.title} ${entry.subject ?? ''} ${entry.room ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

interface ScheduleRow extends ScheduleEntry {}

/** Alla schemaposter användaren har rätt att se (RLS avgör urvalet). */
export async function listScheduleEntries(): Promise<Result<ScheduleEntry[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup
      .from('schedule_entries')
      .select('*')
      .order('weekday', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ScheduleRow[];
  });
}

/** Skapar en schemapost. Endast administratörer — servern nekar alla andra. */
export async function createScheduleEntry(
  input: NewScheduleInput,
): Promise<Result<string>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('create_schedule_entry', {
      p_title: input.title.trim(),
      p_weekday: input.weekday,
      p_start_time: formatClock(input.start_time),
      p_end_time: formatClock(input.end_time),
      p_class: input.class_id,
      p_user: input.user_id,
      p_subject: input.subject.trim() || null,
      p_room: input.room.trim() || null,
      p_note: input.note.trim() || null,
    });
    if (error) throw error;
    const id = (data as { id?: string } | null)?.id;
    if (!id) throw new Error('Schemaposten kunde inte skapas.');
    return id;
  });
}

/** Uppdaterar en schemapost. Samma kontroller som vid skapandet. */
export async function updateScheduleEntry(
  id: string,
  input: NewScheduleInput,
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('update_schedule_entry', {
      p_id: id,
      p_title: input.title.trim(),
      p_weekday: input.weekday,
      p_start_time: formatClock(input.start_time),
      p_end_time: formatClock(input.end_time),
      p_class: input.class_id,
      p_user: input.user_id,
      p_subject: input.subject.trim() || null,
      p_room: input.room.trim() || null,
      p_note: input.note.trim() || null,
    });
    if (error) throw error;
    return true as const;
  });
}

/** Tar bort en schemapost. Inga elevsvar eller historik påverkas. */
export async function deleteScheduleEntry(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('delete_schedule_entry', { p_id: id });
    if (error) throw error;
    return true as const;
  });
}
