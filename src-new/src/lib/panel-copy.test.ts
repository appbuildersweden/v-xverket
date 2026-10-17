import { describe, expect, it } from 'vitest';
import { studentCopy, studentPageTestId } from './panel-copy';

// Skolelevens texter är desamma som förut — panelen får inte tappa sin lärare
// och sin klass bara för att privateleven fick en egen panel.
const SKOLELEV_STICKPROV: Array<[keyof ReturnType<typeof studentCopy>, string]> = [
  ['tasksSubtitle', 'Uppgifter som din lärare har gett dig'],
  ['tasksEmptyTitle', 'Inga uppgifter ännu'],
  ['planningAssignedTitle', 'Från din lärare'],
  ['documentsSubtitle', 'Material från din lärare och dina egna filer'],
  ['subjectsEmpty', 'Ämnena visas när din lärare har gett dig en uppgift eller delat material med dig.'],
];

describe('paneltexter', () => {
  it('skoleleven behåller texterna om sin lärare och sin klass', () => {
    const copy = studentCopy('elev');
    expect(copy.privat).toBe(false);
    for (const [key, text] of SKOLELEV_STICKPROV) {
      expect(copy[key]).toBe(text);
    }
  });

  it('privatelevens texter talar om egna studier — aldrig om en lärare eller en klass', () => {
    const copy = studentCopy('privat');
    expect(copy.privat).toBe(true);

    for (const [key, value] of Object.entries(copy)) {
      if (typeof value !== 'string') continue;
      expect(value, key).not.toMatch(/lärare/i);
      expect(value, key).not.toMatch(/klass/i);
    }
  });

  it('skiljer panelernas test-id:n så att proven träffar rätt panel', () => {
    expect(studentPageTestId('elev', 'uppgifter')).toBe('page-elev-uppgifter');
    expect(studentPageTestId('privat', 'uppgifter')).toBe('page-privat-uppgifter');
  });

  it('studentsidorna har en text för varje fält i båda panelerna', () => {
    const elev = studentCopy('elev');
    const privat = studentCopy('privat');
    expect(Object.keys(elev).sort()).toEqual(Object.keys(privat).sort());
    for (const key of Object.keys(elev)) {
      if (key === 'privat') continue;
      expect(String(elev[key as keyof typeof elev])).not.toBe('');
      expect(String(privat[key as keyof typeof privat])).not.toBe('');
    }
  });
});
