import { describe, expect, it } from 'vitest';
import {
  categoryCounts,
  filterProducts,
  newPurchaseKey,
  purchaseBlocker,
  RARITY_META,
  sortProducts,
  type ShopProduct,
} from './shop';

const product = (overrides: Partial<ShopProduct>): ShopProduct => ({
  id: 'p1',
  slug: 'figur-pumpan',
  name: 'Pumpan',
  description: 'En liten pumpa.',
  category: 'figur',
  equip_kind: 'figur',
  rarity: 'vanlig',
  price_xp: 60,
  min_level: 1,
  season_id: null,
  season_only: false,
  asset_key: 'ikon-pumpalykta',
  theme_key: null,
  ornament_key: null,
  published: true,
  position: 20,
  ...overrides,
});

describe('purchaseBlocker', () => {
  const base = { owned: false, totalXp: 500, level: 5, activeSeasons: ['halloween'] };

  it('tillåter ett köp när allt stämmer', () => {
    expect(purchaseBlocker({ product: product({}), ...base })).toBeNull();
  });

  it('förklarar att föremålet redan ägs', () => {
    expect(purchaseBlocker({ product: product({}), ...base, owned: true })).toMatch(/äger redan/);
  });

  it('räknar ut hur mycket XP som saknas', () => {
    expect(purchaseBlocker({ product: product({ price_xp: 120 }), ...base, totalXp: 100 })).toBe(
      'Du saknar 20 XP.',
    );
  });

  it('kräver rätt nivå innan priset kontrolleras', () => {
    expect(
      purchaseBlocker({ product: product({ min_level: 4, price_xp: 10 }), ...base, level: 2 }),
    ).toBe('Kräver nivå 4.');
  });

  it('stänger säsongsföremål när säsongen inte är aktiv', () => {
    expect(
      purchaseBlocker({
        product: product({ season_only: true, season_id: 'halloween' }),
        ...base,
        activeSeasons: [],
      }),
    ).toBe('Säsongen är inte aktiv just nu.');
  });
});

describe('filterProducts och sortProducts', () => {
  const rows = [
    product({ id: 'a', name: 'Pumpan', category: 'figur', rarity: 'vanlig', price_xp: 60 }),
    product({ id: 'b', name: 'Spökkungen', category: 'figur', rarity: 'episk', price_xp: 320 }),
    product({ id: 'c', name: 'Månljusramen', category: 'profilram', rarity: 'sallsynt', price_xp: 200 }),
  ];

  it('filtrerar på kategori', () => {
    expect(filterProducts(rows, { category: 'profilram' }).map((row) => row.id)).toEqual(['c']);
  });

  it('söker i namn och beskrivning utan hänsyn till skiftläge', () => {
    expect(filterProducts(rows, { query: 'SPÖK' }).map((row) => row.id)).toEqual(['b']);
  });

  it('kan visa bara det eleven har råd med', () => {
    expect(filterProducts(rows, { onlyAffordable: true, totalXp: 250 }).map((row) => row.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('sorterar sällsyntast först och sedan på position', () => {
    expect(sortProducts(rows).map((row) => row.id)).toEqual(['b', 'c', 'a']);
    expect(RARITY_META.legendarisk.order).toBeGreaterThan(RARITY_META.episk.order);
  });

  it('räknar föremål per kategori', () => {
    const counts = categoryCounts(rows);
    expect(counts.figur).toBe(2);
    expect(counts.profilram).toBe(1);
    expect(counts.tema).toBe(0);
  });
});

describe('newPurchaseKey', () => {
  it('ger en nyckel som servern accepterar och som är olika varje gång', () => {
    const first = newPurchaseKey();
    const second = newPurchaseKey();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first.startsWith('butik-')).toBe(true);
  });
});
