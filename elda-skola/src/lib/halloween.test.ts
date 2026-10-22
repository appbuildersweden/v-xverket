import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOK,
  SORT_LABELS,
  THEME_KEYS,
  THEME_META,
  canAfford,
  filterItems,
  itemStatus,
  levelProgress,
  normalizeLook,
  safeThemeKey,
  type Wallet,
} from './halloween-catalog';
import {
  buildCollection,
  isSeasonActive,
  ownedPartSlugs,
  partProgress,
  type HalloweenPart,
  type HalloweenPurchase,
  type HalloweenUnlock,
} from './halloween';
import {
  applyTheme,
  clearLegacyThemePreference,
  describeTheme,
  readThemePreference,
  resolveThemeKey,
  writeThemePreference,
} from './halloween-theme';

/**
 * Halloween-logiken är avsiktligt ren: urval, status, nivå och ägande går att
 * räkna ut utan databas. Testerna här låser de reglerna – särskilt att ett
 * föremål bara räknas som ägt när servern har sagt det, och att ett köpt tema
 * alltid vinner över det fria säsongstemat.
 */

const wallet: Wallet = {
  total_xp: 120,
  level: 2,
  xp_per_level: 100,
  level_start_xp: 100,
  next_level_xp: 200,
};

function part(overrides: Partial<HalloweenPart>): HalloweenPart {
  return {
    slug: 'har-kort',
    slot: 'frisyr',
    name: 'Kort',
    description: null,
    kind: 'del',
    color: null,
    rarity: 'vanlig',
    price_xp: 0,
    min_level: 1,
    free: true,
    position: 80,
    ...overrides,
  };
}

function purchase(overrides: Partial<HalloweenPurchase>): HalloweenPurchase {
  return {
    id: 'p1',
    product_id: '11111111-1111-1111-1111-111111111111',
    product_slug: 'figur-pumpan',
    name: 'Pumpan',
    category: 'figur',
    equip_kind: 'figur',
    rarity: 'vanlig',
    theme_key: null,
    asset_key: 'ikon-pumpalykta',
    ornament_key: null,
    price_xp: 60,
    purchased_at: '2026-10-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeLook', () => {
  it('fyller ut ett tomt utseende med standardvalen', () => {
    expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
    expect(normalizeLook('trasigt')).toEqual(DEFAULT_LOOK);
  });

  it('behåller kända platser och trimmar värdet', () => {
    const look = normalizeLook({ frisyr: '  har-bob  ', klader: 'klad-skelett' });
    expect(look.frisyr).toBe('har-bob');
    expect(look.klader).toBe('klad-skelett');
    expect(look.hudton).toBe(DEFAULT_LOOK.hudton);
  });

  it('ignorerar okända platser, tomma värden och fel typer', () => {
    const look = normalizeLook({
      hatt: 'hatt-hax',
      frisyr: '',
      klader: 42,
    });
    expect(look).not.toHaveProperty('hatt');
    expect(look.frisyr).toBe(DEFAULT_LOOK.frisyr);
    expect(look.klader).toBe(DEFAULT_LOOK.klader);
  });
});

describe('filterItems', () => {
  const items = [
    { name: 'Pumpalyktan', description: 'En lykta', slot: 'huvudbonad', price_xp: 50, owned: false, min_level: 1, rarity: 'ovanlig' },
    { name: 'Häxhatten', description: 'Spetsig hatt', slot: 'huvudbonad', price_xp: 100, owned: true, min_level: 2, rarity: 'sallsynt' },
    { name: 'Nattkatten', description: 'Ett husdjur', slot: 'husdjur', price_xp: 0, owned: true, min_level: 1, rarity: 'vanlig' },
  ];

  it('söker i namn och beskrivning utan hänsyn till skiftläge', () => {
    expect(filterItems(items, { query: 'LYKTA' }).map((row) => row.name)).toEqual(['Pumpalyktan']);
    expect(filterItems(items, { query: 'spetsig' }).map((row) => row.name)).toEqual(['Häxhatten']);
  });

  it('filtrerar på plats och ägande', () => {
    expect(filterItems(items, { group: 'huvudbonad' })).toHaveLength(2);
    expect(filterItems(items, { availability: 'agda' }).map((row) => row.name)).toEqual([
      'Nattkatten',
      'Häxhatten',
    ]);
    expect(filterItems(items, { availability: 'nya' }).map((row) => row.name)).toEqual([
      'Pumpalyktan',
    ]);
  });

  it('sorterar på pris, namn och raritet', () => {
    expect(filterItems(items, { sort: 'pris-upp' }).map((row) => row.price_xp)).toEqual([0, 50, 100]);
    expect(filterItems(items, { sort: 'pris-ner' }).map((row) => row.price_xp)).toEqual([100, 50, 0]);
    expect(filterItems(items, { sort: 'namn' }).map((row) => row.name)).toEqual([
      'Häxhatten',
      'Nattkatten',
      'Pumpalyktan',
    ]);
    expect(filterItems(items, { sort: 'raritet' }).map((row) => row.name)).toEqual([
      'Häxhatten',
      'Pumpalyktan',
      'Nattkatten',
    ]);
  });

  it('rekommenderar det eleven inte äger först', () => {
    expect(filterItems(items).map((row) => row.name)).toEqual([
      'Pumpalyktan',
      'Nattkatten',
      'Häxhatten',
    ]);
  });

  it('har en etikett för varje sortering', () => {
    for (const label of Object.values(SORT_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('itemStatus', () => {
  it('visar ägt före allt annat', () => {
    expect(itemStatus({ owned: true, price_xp: 999, min_level: 9 }, wallet).label).toBe('Ägs');
  });

  it('förklarar nivåkrav, gratis och saknad XP', () => {
    expect(itemStatus({ owned: false, price_xp: 50, min_level: 5 }, wallet)).toEqual({
      label: 'Nivå 5',
      tone: 'blue',
    });
    expect(itemStatus({ owned: false, price_xp: 0, min_level: 1 }, wallet).label).toBe('Gratis');
    expect(itemStatus({ owned: false, price_xp: 200, min_level: 1 }, wallet)).toEqual({
      label: 'Saknar 80 XP',
      tone: 'amber',
    });
    expect(itemStatus({ owned: false, price_xp: 100, min_level: 1 }, wallet)).toEqual({
      label: 'Kan köpas',
      tone: 'neutral',
    });
  });

  it('räknar aldrig med ett negativt saldo', () => {
    expect(itemStatus({ owned: false, price_xp: 50, min_level: 1 }, null).label).toBe('Saknar 50 XP');
  });
});

describe('nivå och saldo', () => {
  it('räknar andel av vägen till nästa nivå', () => {
    expect(levelProgress(wallet)).toBeCloseTo(0.2);
    expect(levelProgress({ ...wallet, total_xp: 100 })).toBe(0);
    expect(levelProgress({ ...wallet, total_xp: 200 })).toBe(1);
    expect(levelProgress(null)).toBe(0);
    expect(levelProgress({ ...wallet, xp_per_level: 0 })).toBe(0);
  });

  it('jämför saldo mot pris', () => {
    expect(canAfford(wallet, 120)).toBe(true);
    expect(canAfford(wallet, 121)).toBe(false);
    expect(canAfford(null, 0)).toBe(false);
  });
});

describe('teman', () => {
  beforeEach(() => {
    localStorage.clear();
    applyTheme(null);
  });

  it('släpper bara igenom kända temanycklar', () => {
    expect(safeThemeKey('halloween')).toBe('halloween');
    expect(safeThemeKey('midnight')).toBe('midnight');
    expect(safeThemeKey('candy-crypt')).toBe('candy-crypt');
    expect(safeThemeKey('ghostly-moonlight')).toBe('ghostly-moonlight');
    expect(safeThemeKey('okant-tema')).toBeNull();
    expect(safeThemeKey(null)).toBeNull();
  });

  it('har ett eget motiv och en egen beskrivning för varje tema', () => {
    for (const key of THEME_KEYS) {
      expect(THEME_META[key]?.label).toBeTruthy();
      expect(THEME_META[key]?.swatches).toHaveLength(3);
    }
    expect(new Set(THEME_KEYS).size).toBe(THEME_KEYS.length);
  });

  it('låter ett köpt tema vinna över det fria', () => {
    expect(resolveThemeKey('spokhus', { freeTheme: true })).toBe('spokhus');
    expect(resolveThemeKey(null, { freeTheme: true })).toBe('halloween');
    expect(resolveThemeKey(null, { freeTheme: false })).toBeNull();
    expect(resolveThemeKey('trasigt', { freeTheme: false })).toBeNull();
  });

  it('sätter och tar bort attributet på dokumentet', () => {
    applyTheme('pumpa');
    expect(document.documentElement.dataset.uiTema).toBe('pumpa');
    applyTheme('okant-tema');
    expect(document.documentElement.dataset.uiTema).toBeUndefined();
  });

  it('har säsongstemat avstängt tills eleven själv slår på det', () => {
    expect(readThemePreference('elev-1')).toEqual({ freeTheme: false });
    writeThemePreference('elev-1', { freeTheme: true });
    expect(readThemePreference('elev-1')).toEqual({ freeTheme: true });
    writeThemePreference('elev-1', { freeTheme: false });
    expect(readThemePreference('elev-1')).toEqual({ freeTheme: false });
    localStorage.setItem('elda-skola-tema-prefs:elev-1', '{trasigt');
    expect(readThemePreference('elev-1')).toEqual({ freeTheme: false });
  });

  it('låter aldrig en elev ärva en annan elevs temaval', () => {
    writeThemePreference('elev-a', { freeTheme: true });
    expect(readThemePreference('elev-a')).toEqual({ freeTheme: true });
    // Samma webbläsare, annat konto: inget tema alls.
    expect(readThemePreference('elev-b')).toEqual({ freeTheme: false });
    expect(readThemePreference(null)).toEqual({ freeTheme: false });
  });

  it('städar bort det gamla globala valet', () => {
    localStorage.setItem('elda-skola-halloween-prefs', JSON.stringify({ freeTheme: true }));
    clearLegacyThemePreference();
    expect(localStorage.getItem('elda-skola-halloween-prefs')).toBeNull();
    // Okänt konto får aldrig ett tema av det gamla värdet.
    expect(readThemePreference('elev-ny')).toEqual({ freeTheme: false });
  });

  it('visar temats namn i statusraden', () => {
    expect(describeTheme(null)).toBe('Standardtema');
    expect(describeTheme('halloween')).toBe('Nattens Elda (fritt säsongstema)');
    expect(describeTheme('candy-crypt')).toBe('Candy Crypt');
  });
});

describe('ägande och samling', () => {
  const parts = [
    part({ slug: 'har-kort', slot: 'frisyr', free: true }),
    part({ slug: 'har-bob', slot: 'frisyr', free: false, price_xp: 30, rarity: 'ovanlig' }),
    part({ slug: 'dekor-pumpalykta', slot: 'dekoration', free: true, position: 130 }),
    part({ slug: 'dekor-kittel', slot: 'dekoration', free: false, price_xp: 90 }),
  ];
  const unlocks: HalloweenUnlock[] = [
    { part_slug: 'har-bob', price_xp: 30, unlocked_at: '2026-10-11T10:00:00.000Z' },
    { part_slug: 'dekor-kittel', price_xp: 90, unlocked_at: '2026-10-09T10:00:00.000Z' },
  ];

  it('räknar gratis delar och upplåsningar som ägda', () => {
    const owned = ownedPartSlugs(parts, unlocks);
    expect(owned.has('har-kort')).toBe(true);
    expect(owned.has('har-bob')).toBe(true);
    expect(owned.has('dekor-kittel')).toBe(true);
    expect(owned.has('har-lockar')).toBe(false);
  });

  it('räknar framsteg utan att räkna dekorationer', () => {
    const owned = ownedPartSlugs(parts, unlocks);
    expect(partProgress(parts, owned)).toEqual({ owned: 2, total: 2 });
  });

  it('bygger samlingen av riktiga köp och upplåsningar', () => {
    const collection = buildCollection(
      [purchase({}), purchase({ id: 'p2', product_id: '22222222-2222-2222-2222-222222222222', product_slug: 'tema-pumpa', name: 'Pumpatema', category: 'tema', equip_kind: 'tema', theme_key: 'pumpa', price_xp: 300, purchased_at: '2026-10-12T10:00:00.000Z' })],
      parts,
      unlocks,
      { tema: '22222222-2222-2222-2222-222222222222' },
      {
        look: { frisyr: 'har-bob' },
        room: [{ slot: 0, part_slug: 'dekor-kittel' }],
      },
    );

    // Två köp och två upplåsningar. Gratis delar ägs av alla och ligger inte i samlingen.
    expect(collection).toHaveLength(4);
    const theme = collection.find((item) => item.slug === 'tema-pumpa');
    expect(theme?.equipped).toBe(true);
    expect(theme?.theme_key).toBe('pumpa');
    expect(collection.find((item) => item.slug === 'figur-pumpan')?.equipped).toBe(false);
    expect(collection.find((item) => item.slug === 'har-bob')?.equipped).toBe(true);
    expect(collection.find((item) => item.slug === 'dekor-kittel')?.equipped).toBe(true);
    // Senast köpta först.
    expect(collection[0].acquired_at).toBe('2026-10-12T10:00:00.000Z');
  });

  it('hoppar över upplåsningar som inte finns i katalogen', () => {
    const collection = buildCollection([], parts, [
      { part_slug: 'borttagen-del', price_xp: 10, unlocked_at: '2026-10-11T10:00:00.000Z' },
    ], {});
    expect(collection).toEqual([]);
  });
});

describe('säsongen', () => {
  const season = {
    id: 'halloween',
    name: 'Halloween',
    description: null,
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-11-02T00:00:00Z',
    active: true,
  };

  it('är öppen mellan start och slut', () => {
    expect(isSeasonActive(season, new Date('2026-10-20T12:00:00Z'))).toBe(true);
    expect(isSeasonActive(season, new Date('2026-09-30T23:59:00Z'))).toBe(false);
    expect(isSeasonActive(season, new Date('2026-11-02T00:00:00Z'))).toBe(false);
  });

  it('är stängd när flaggan är av eller raden saknas', () => {
    expect(isSeasonActive({ ...season, active: false })).toBe(false);
    expect(isSeasonActive(null)).toBe(false);
  });
});
