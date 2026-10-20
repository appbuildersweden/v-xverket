import { describe, expect, it } from 'vitest';
import { greetingFor, greetingPeriod } from './greeting';

describe('greetingPeriod', () => {
  it('byter hälsning vid rätt timmar', () => {
    expect(greetingPeriod(4)).toBe('night');
    expect(greetingPeriod(5)).toBe('morning');
    expect(greetingPeriod(9)).toBe('morning');
    expect(greetingPeriod(10)).toBe('forenoon');
    expect(greetingPeriod(11)).toBe('forenoon');
    expect(greetingPeriod(12)).toBe('afternoon');
    expect(greetingPeriod(17)).toBe('afternoon');
    expect(greetingPeriod(18)).toBe('evening');
    expect(greetingPeriod(22)).toBe('evening');
    expect(greetingPeriod(23)).toBe('night');
    expect(greetingPeriod(0)).toBe('night');
  });

  it('avvisar ogiltiga timmar', () => {
    expect(() => greetingPeriod(24)).toThrow(RangeError);
    expect(() => greetingPeriod(-1)).toThrow(RangeError);
    expect(() => greetingPeriod(1.5)).toThrow(RangeError);
  });
});

describe('greetingFor', () => {
  const at = (hour: number) => new Date(2026, 9, 20, hour, 30);

  it('använder lokal tid för varje intervall', () => {
    expect(greetingFor(at(7))).toBe('God morgon!');
    expect(greetingFor(at(10))).toBe('God förmiddag!');
    expect(greetingFor(at(14))).toBe('God eftermiddag!');
    expect(greetingFor(at(20))).toBe('God kväll!');
    expect(greetingFor(at(2))).toBe('God natt!');
  });

  it('visar bara förnamnet', () => {
    expect(greetingFor(at(14), 'Anna Svensson')).toBe('God eftermiddag, Anna!');
    expect(greetingFor(at(14), '  Erik  ')).toBe('God eftermiddag, Erik!');
  });

  it('utelämnar namnet när det saknas eller är tomt', () => {
    expect(greetingFor(at(9), null)).toBe('God morgon!');
    expect(greetingFor(at(9), '   ')).toBe('God morgon!');
  });
});
