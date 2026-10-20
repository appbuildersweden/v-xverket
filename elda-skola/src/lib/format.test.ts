import { describe, expect, it } from 'vitest';
import { deadlineLabel, displayName, initials, isoWeek, longDate, shortDate } from './format';

describe('format', () => {
  it('räknar ISO-vecka', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2026, 9, 19))).toBe(43);
  });

  it('skriver långt datum på svenska', () => {
    expect(longDate('2026-10-19')).toBe('måndag 19 oktober 2026');
  });

  it('visar kort datum och saknad deadline', () => {
    expect(shortDate('2026-03-05')).toBe('5 mar');
    expect(shortDate(null)).toBe('Ingen deadline');
  });

  it('beskriver deadline relativt idag', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    expect(deadlineLabel(iso)).toBe('Idag');
    expect(deadlineLabel(null)).toBe('Ingen deadline');
  });

  it('klarar en fullständig tidsstämpel som deadline', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    expect(deadlineLabel(`${iso}T00:00:00Z`)).toBe('Idag');
    expect(deadlineLabel(`${iso}T12:00:00Z`)).not.toContain('NaN');
    expect(deadlineLabel('inte ett datum')).toBe('Ingen deadline');
  });

  it('använder riktigt namn före användarnamn', () => {
    expect(displayName({ first_name: 'Anna', last_name: 'Andersson', username: 'eannaad01' })).toBe(
      'Anna Andersson',
    );
    expect(displayName({ first_name: null, last_name: null, username: 'eannaad01' })).toBe(
      'eannaad01',
    );
    expect(displayName(null)).toBe('Okänd');
    expect(initials('Anna Andersson')).toBe('AA');
  });
});
