import { describe, expect, it } from 'vitest';
import { formatHashRoute, parseHashRoute } from './hash-route';

describe('parseHashRoute', () => {
  it('läser en giltig rutt', () => {
    expect(parseHashRoute('#/admin/roller')).toEqual({
      panel: 'admin',
      page: 'roller',
    });
  });

  it('accepterar rutt utan inledande snedstreck', () => {
    expect(parseHashRoute('#elev/start')).toEqual({ panel: 'elev', page: 'start' });
  });

  it('avvisar okänd panel', () => {
    expect(parseHashRoute('#/hack/start')).toBeNull();
  });

  it('avvisar sida som inte finns i panelen', () => {
    expect(parseHashRoute('#/elev/roller')).toBeNull();
  });

  it('avvisar tom eller felformad hash', () => {
    expect(parseHashRoute('')).toBeNull();
    expect(parseHashRoute('#/')).toBeNull();
    expect(parseHashRoute('#/elev')).toBeNull();
    expect(parseHashRoute('#/elev/start/extra')).toBeNull();
  });
});

describe('formatHashRoute', () => {
  it('bygger adressen för en rutt', () => {
    expect(formatHashRoute({ panel: 'speciallarar', page: 'hem' })).toBe(
      '#/speciallarar/hem',
    );
  });
});
