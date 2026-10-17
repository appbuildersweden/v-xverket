import { describe, expect, it } from 'vitest';
import {
  ScheduleEntry,
  filterScheduleEntries,
  formatClock,
  groupByWeekday,
  isoWeekday,
  sortScheduleEntries,
  timeRange,
  upcomingEntries,
  validateScheduleEntry,
  weekdayLabel,
  weekdayShort,
} from './schedule';

const entry = (over: Partial<ScheduleEntry>): ScheduleEntry => ({
  id: '1',
  title: 'Matematik',
  subject: null,
  room: null,
  weekday: 1,
  start_time: '08:00:00',
  end_time: '09:00:00',
  class_id: 'c1',
  user_id: null,
  note: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('veckodagar', () => {
  it('namnger veckodagarna 1–7', () => {
    expect(weekdayLabel(1)).toBe('Måndag');
    expect(weekdayLabel(7)).toBe('Söndag');
    expect(weekdayShort(3)).toBe('Ons');
  });

  it('hanterar okända veckodagar utan att gissa', () => {
    expect(weekdayLabel(0)).toBe('Okänd dag');
    expect(weekdayLabel(9)).toBe('Okänd dag');
    expect(weekdayShort(9)).toBe('—');
  });

  it('räknar ISO-veckodag med söndag som 7', () => {
    expect(isoWeekday(new Date(2026, 9, 12))).toBe(1); // måndag
    expect(isoWeekday(new Date(2026, 9, 18))).toBe(7); // söndag
  });
});

describe('formatering', () => {
  it('kortar tiden till timmar och minuter', () => {
    expect(formatClock('08:00:00')).toBe('08:00');
    expect(formatClock('13:45')).toBe('13:45');
    expect(formatClock(null)).toBe('');
  });

  it('visar ett tidsintervall', () => {
    expect(timeRange(entry({ start_time: '08:15:00', end_time: '09:30:00' }))).toBe(
      '08:15–09:30',
    );
  });
});

describe('validateScheduleEntry', () => {
  const base = {
    title: 'Matematik',
    weekday: 1,
    start_time: '08:00',
    end_time: '09:00',
    subject: '',
    room: '',
    note: '',
    class_id: 'c1',
    user_id: null,
  };

  it('kräver en rubrik', () => {
    expect(validateScheduleEntry({ ...base, title: '' })).toMatch(/rubrik/i);
    expect(validateScheduleEntry({ ...base, title: 'a' })).toMatch(/rubrik/i);
  });

  it('kräver en giltig veckodag', () => {
    expect(validateScheduleEntry({ ...base, weekday: 0 })).toMatch(/veckodag/i);
    expect(validateScheduleEntry({ ...base, weekday: 8 })).toMatch(/veckodag/i);
  });

  it('kräver att sluttiden ligger efter starttiden', () => {
    expect(
      validateScheduleEntry({ ...base, start_time: '09:00', end_time: '08:00' }),
    ).toMatch(/senare/i);
    expect(
      validateScheduleEntry({ ...base, start_time: '09:00', end_time: '09:00' }),
    ).toMatch(/senare/i);
  });

  it('kräver exakt ett mål — klass eller person', () => {
    expect(validateScheduleEntry({ ...base, class_id: null })).toMatch(/klass eller en person/i);
    expect(validateScheduleEntry({ ...base, user_id: 'u1' })).toMatch(/antingen/i);
    expect(validateScheduleEntry({ ...base, class_id: null, user_id: 'u1' })).toBeNull();
  });
});

describe('sortering och gruppering', () => {
  const entries = [
    entry({ id: 'a', weekday: 3, start_time: '10:00:00' }),
    entry({ id: 'b', weekday: 1, start_time: '09:00:00' }),
    entry({ id: 'c', weekday: 1, start_time: '08:00:00' }),
  ];

  it('sorterar i veckans ordning och på starttid', () => {
    expect(sortScheduleEntries(entries).map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(entries.map((e) => e.id)).toEqual(['a', 'b', 'c']); // indata orörd
  });

  it('grupperar per veckodag med svenska dagar', () => {
    const groups = groupByWeekday(entries);
    expect(groups.map((g) => g.label)).toEqual(['Måndag', 'Onsdag']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['c', 'b']);
  });
});

describe('kommande poster', () => {
  const entries = [
    entry({ id: 'mon', weekday: 1 }),
    entry({ id: 'wed', weekday: 3 }),
    entry({ id: 'fri', weekday: 5 }),
  ];

  it('börjar på dagens veckodag och fortsätter veckan ut', () => {
    const onsdag = new Date(2026, 9, 14);
    expect(upcomingEntries(entries, onsdag).map((e) => e.id)).toEqual(['wed', 'fri', 'mon']);
  });

  it('lägger hela veckan efter söndag', () => {
    const söndag = new Date(2026, 9, 18);
    expect(upcomingEntries(entries, söndag).map((e) => e.id)).toEqual(['mon', 'wed', 'fri']);
  });
});

describe('filterScheduleEntries', () => {
  const entries = [
    entry({ id: 'a', title: 'Matematik', subject: 'Matte', room: 'Sal 12', weekday: 1 }),
    entry({ id: 'b', title: 'Svenska', weekday: 2 }),
  ];

  it('filtrerar på fritext i rubrik, ämne och sal', () => {
    expect(filterScheduleEntries(entries, { query: 'matte' }).map((e) => e.id)).toEqual(['a']);
    expect(filterScheduleEntries(entries, { query: 'sal 12' }).map((e) => e.id)).toEqual(['a']);
    expect(filterScheduleEntries(entries, { query: 'svenska' }).map((e) => e.id)).toEqual(['b']);
  });

  it('filtrerar på veckodag', () => {
    expect(filterScheduleEntries(entries, { weekday: 2 }).map((e) => e.id)).toEqual(['b']);
    expect(filterScheduleEntries(entries, { weekday: 'alla' })).toHaveLength(2);
  });
});
