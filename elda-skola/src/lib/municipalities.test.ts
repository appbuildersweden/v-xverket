import { describe, expect, it } from 'vitest';
import { isKnownMunicipality, MUNICIPALITIES, searchMunicipalities } from './municipalities';

describe('kommunlistan', () => {
  it('innehåller Sveriges 290 kommuner', () => {
    expect(MUNICIPALITIES).toHaveLength(290);
  });

  it('har unika namn', () => {
    const names = MUNICIPALITIES.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('är sorterad på namn', () => {
    const names = MUNICIPALITIES.map((row) => row.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'sv'))).toEqual(names);
  });

  it('anger län för varje kommun', () => {
    expect(MUNICIPALITIES.every((row) => row.county.endsWith('län'))).toBe(true);
  });
});

describe('searchMunicipalities', () => {
  it('föreslår den kommun som börjar på sökordet först', () => {
    expect(searchMunicipalities('ron')[0].name).toBe('Ronneby');
  });

  it('hittar kommuner mitt i namnet', () => {
    expect(searchMunicipalities('köping').map((row) => row.name)).toContain('Norrköping');
  });

  it('kan söka på län', () => {
    const names = searchMunicipalities('blekinge', 10).map((row) => row.name);
    expect(names).toContain('Ronneby');
    expect(names).toContain('Karlskrona');
  });

  it('respekterar gränsen och hanterar tom sökning', () => {
    expect(searchMunicipalities('', 5)).toHaveLength(5);
    expect(searchMunicipalities('zzzz')).toHaveLength(0);
  });
});

describe('isKnownMunicipality', () => {
  it('känner igen en kommun oavsett skiftläge och mellanslag', () => {
    expect(isKnownMunicipality('  ronneby ')).toBe(true);
    expect(isKnownMunicipality('Ronneby')).toBe(true);
  });

  it('avvisar en påhittad kommun', () => {
    expect(isKnownMunicipality('Ronnedby')).toBe(false);
  });
});
