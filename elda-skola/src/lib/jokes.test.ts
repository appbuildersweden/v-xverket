import { describe, expect, it } from 'vitest';
import { JOKES, dayNumber, jokeForDay } from './jokes';

describe('JOKES', () => {
  it('innehåller minst 60 unika skämt', () => {
    expect(JOKES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(JOKES.map((joke) => joke.text)).size).toBe(JOKES.length);
    expect(new Set(JOKES.map((joke) => joke.id)).size).toBe(JOKES.length);
  });

  it('har inga tomma skämt', () => {
    for (const joke of JOKES) expect(joke.text.trim().length).toBeGreaterThan(10);
  });
});

describe('jokeForDay', () => {
  it('ger samma skämt under hela kalenderdagen', () => {
    const morning = new Date(2026, 9, 20, 6, 0);
    const night = new Date(2026, 9, 20, 23, 59);
    expect(jokeForDay(morning)).toEqual(jokeForDay(night));
  });

  it('byter skämt när nästa dag börjar', () => {
    const today = jokeForDay(new Date(2026, 9, 20, 12));
    const tomorrow = jokeForDay(new Date(2026, 9, 21, 12));
    expect(tomorrow.id).not.toBe(today.id);
  });

  it('upprepar inte ett skämt inom en cykel', () => {
    const start = new Date(2026, 0, 1);
    const seen = new Set<string>();
    for (let day = 0; day < JOKES.length; day++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
      seen.add(jokeForDay(date).id);
    }
    expect(seen.size).toBe(JOKES.length);
  });

  it('är stabilt över en omladdning och för samma lokala datum', () => {
    const a = jokeForDay(new Date(2026, 4, 3, 9));
    const b = jokeForDay(new Date(2026, 4, 3, 9));
    expect(a).toEqual(b);
  });

  it('klarar datum långt bakåt utan negativt index', () => {
    const joke = jokeForDay(new Date(1960, 0, 1));
    expect(JOKES).toContainEqual(joke);
  });

  it('avvisar en tom lista', () => {
    expect(() => jokeForDay(new Date(), [])).toThrow(RangeError);
  });
});

describe('dayNumber', () => {
  it('ökar med exakt ett per kalenderdag', () => {
    expect(dayNumber(new Date(2026, 9, 21))).toBe(dayNumber(new Date(2026, 9, 20)) + 1);
  });
});
