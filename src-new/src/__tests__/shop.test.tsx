import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCollection,
  purchaseBlockReason,
  viewProduct,
  ViewContext,
  ShopProduct,
  ShopPurchase,
  ShopSeason,
} from '../lib/shop';
import {
  RARITY_META_SHOP,
  SHOP_CATALOG,
  SHOP_RARITIES,
  THEME_KEYS,
} from '../lib/shop-catalog';
import { safeThemeKey } from '../lib/cosmetics';

/**
 * Shopen: pris, nivå, säsong, ägande, köp och temabyte.
 *
 * Två lager prövas:
 *   * rena funktioner (tillstånd, filter och samlingen) — de avgör vad eleven
 *     ser och varför ett köp är blockerat,
 *   * demoläget, som kör samma köpregler som databasfunktionen `shop_purchase`
 *     (publicerad produkt, aktiv säsong, nivåkrav, XP-saldo, ett ägande per
 *     konto och idempotensnyckel). Serverns riktiga RLS kan inte köras här.
 */

const HALLOWEEN: ShopSeason = {
  id: 'halloween',
  name: 'Halloween',
  description: null,
  starts_at: '2026-10-01T00:00:00Z',
  ends_at: '2026-11-02T00:00:00Z',
  active: true,
};

function product(overrides: Partial<ShopProduct> = {}): ShopProduct {
  return {
    id: 'p-1',
    slug: 'figur-pumpan',
    name: 'Pumpan',
    description: 'En liten pumpa.',
    category: 'figur',
    equip_kind: 'figur',
    rarity: 'vanlig',
    price_xp: 60,
    min_level: 1,
    season_id: 'halloween',
    season_only: true,
    asset_key: 'ikon-pumpalykta',
    theme_key: null,
    ornament_key: null,
    published: true,
    position: 20,
    ...overrides,
  };
}

function context(overrides: Partial<ViewContext> = {}): ViewContext {
  return {
    totalXp: 100,
    xpPerLevel: 100,
    ownedSlugs: new Set<string>(),
    ownedIds: new Set<string>(),
    equippedIds: new Set<string>(),
    seasonById: new Map([[HALLOWEEN.id, HALLOWEEN]]),
    now: new Date('2026-10-18T12:00:00Z'),
    ...overrides,
  };
}


describe('produktens tillstånd', () => {
  it('är tillgänglig när XP, nivå, säsong och publicering räcker', () => {
    const view = viewProduct(product(), context({ totalXp: 200 }));
    expect(view.state).toBe('available');
    expect(view.buyable).toBe(true);
    expect(purchaseBlockReason(view)).toBeNull();
  });

  it('förklarar att XP saknas i stället för att bara stänga av knappen', () => {
    const view = viewProduct(product({ price_xp: 300 }), context({ totalXp: 120 }));
    expect(view.state).toBe('xp');
    expect(view.xpMissing).toBe(180);
    expect(view.buyable).toBe(false);
    expect(purchaseBlockReason(view)).toBe('Du saknar 180 XP för det här köpet.');
  });

  it('visar nivåkravet innan eleven försöker köpa', () => {
    const view = viewProduct(product({ min_level: 4 }), context({ totalXp: 250 }));
    expect(view.state).toBe('level');
    expect(view.level).toBe(3);
    expect(purchaseBlockReason(view)).toContain('kräver nivå 4');
  });

  it('markerar säsongsföremål utanför säsongen som otillgängliga', () => {
    const view = viewProduct(
      product(),
      context({ now: new Date('2026-12-01T00:00:00Z'), totalXp: 500 }),
    );
    expect(view.state).toBe('season');
    expect(purchaseBlockReason(view)).toContain('säsong');
  });

  it('visar ägda och utrustade föremål före allt annat', () => {
    const owned = product();
    const ownedView = viewProduct(
      owned,
      context({ ownedIds: new Set([owned.id]), ownedSlugs: new Set([owned.slug]) }),
    );
    expect(ownedView.state).toBe('owned');
    expect(ownedView.buyable).toBe(false);

    const equippedView = viewProduct(owned, context({ equippedIds: new Set([owned.id]) }));
    expect(equippedView.state).toBe('equipped');
  });

  it('säger att en avpublicerad produkt inte säljs längre men att ägandet består', () => {
    const view = viewProduct(product({ published: false }), context());
    expect(view.state).toBe('unpublished');
    expect(purchaseBlockReason(view)).toContain('säljs inte längre');
  });
});

/** Fröna som fyller katalogen. Fler migreringar läggs till här, inte i koden. */
const SEED_FILES = [
  '../supabase/migrations/20261101000000_shop.sql',
  '../supabase/migrations/20261102000000_shop_utokning.sql',
];

function seedRows(): string[] {
  return SEED_FILES.flatMap((file) =>
    readFileSync(resolve(process.cwd(), file), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith("('"))
      .map((line) => line.slice(1)),
  ); // ta bort inledande parentes
}

describe('katalogen och migreringen', () => {
  it('har samma produkter och priser som fröet i databasen', () => {
    const rows = seedRows();

    expect(rows.length).toBe(SHOP_CATALOG.length);

    for (const entry of SHOP_CATALOG) {
      const row = rows.find((text) => text.startsWith(`'${entry.slug}'`));
      expect(row, `saknar rad för ${entry.slug}`).toBeDefined();
      if (!row) continue;
      // Kolumnordningen i fröet: slug, namn, beskrivning, kategori, plats,
      // sällsynthet, pris, minsta nivå …
      expect(row).toContain(`, '${entry.category}', `);
      expect(row).toContain(`, '${entry.rarity}', ${entry.priceXp}, ${entry.minLevel}, `);
    }

    // Samma produkt får bara fröas en gång, annars kan två migreringar
    // skriva över varandras pris utan att någon märker det.
    const slugs = rows.map((row) => /^'([^']+)'/.exec(row)?.[1]);
    expect(new Set(slugs).size).toBe(rows.length);
    expect(slugs).toContain('tema-candy-crypt');
  });

  it('använder de fem sällsynthetsgraderna som en fast klassificering', () => {
    expect(SHOP_RARITIES.map((meta) => meta.id)).toEqual([
      'vanlig',
      'ovanlig',
      'sallsynt',
      'episk',
      'legendarisk',
    ]);
    for (const meta of SHOP_RARITIES) expect(meta.label.length).toBeGreaterThan(2);
    expect(RARITY_META_SHOP.legendarisk.label).toBe('Legendarisk');
  });

  it('har sju kompletta UI-teman med rätt priser', () => {
    const themes = SHOP_CATALOG.filter((entry) => entry.category === 'tema');
    expect(themes).toHaveLength(7);
    expect(themes.map((entry) => [entry.themeKey, entry.priceXp])).toEqual([
      ['pumpa', 300],
      ['spokhus', 400],
      ['haxkonst', 450],
      ['haunted-forest', 500],
      ['midnight', 600],
      ['ghostly-moonlight', 550],
      ['candy-crypt', 350],
    ]);
  });

  it('har en temafil för varje temanyckel som katalogen säljer', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/teman.css'), 'utf8');
    for (const key of THEME_KEYS) {
      expect(css, `teman.css saknar block för ${key}`).toContain(
        `[data-ui-tema='${key}']`,
      );
    }
  });

  it('säljer bara föremål som har en bild i projektet', () => {
    const icons = new Set(
      readdirSync(resolve(process.cwd(), 'src/assets/halloween-ikoner')),
    );
    for (const entry of SHOP_CATALOG) {
      expect(icons.has(`${entry.assetKey}.png`), `bilden saknas för ${entry.slug}`).toBe(
        true,
      );
    }
  });
});

describe('temanycklar', () => {
  it('faller tillbaka på standardtemat för en okänd nyckel', () => {
    expect(safeThemeKey('pumpa')).toBe('pumpa');
    expect(safeThemeKey('finns-inte')).toBeNull();
    expect(safeThemeKey(null)).toBeNull();
  });
});

describe('samlingen', () => {
  const purchase: ShopPurchase = {
    id: 'k-1',
    product_id: 'p-1',
    product_slug: 'tema-pumpa',
    name: 'Pumpatema',
    category: 'tema',
    equip_kind: 'tema',
    rarity: 'ovanlig',
    theme_key: 'pumpa',
    asset_key: 'ikon-pumpalykta',
    ornament_key: null,
    price_xp: 300,
    purchased_at: '2026-10-10T10:00:00Z',
  };

  it('behåller ägandet även när produkten avpublicerats', () => {
    const collection = buildCollection([purchase], [product({ id: 'p-1', published: false })], {});
    expect(collection).toHaveLength(1);
    expect(collection[0].stillForSale).toBe(false);
    expect(collection[0].name).toBe('Pumpatema');
    expect(collection[0].priceXp).toBe(300);
  });

  it('visar vilket tema som används just nu', () => {
    const collection = buildCollection([purchase], [], { tema: 'p-1' });
    expect(collection[0].equipped).toBe(true);

    const other = buildCollection([purchase], [], { tema: 'annat-id' });
    expect(other[0].equipped).toBe(false);
  });
});
