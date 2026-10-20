import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ShopProduct, ShopPurchase } from '../../lib/shop';

// Vitest lyfter vi.mock ovanför importerna, så mockarna får bara läsa sådant
// som skapats med vi.hoisted. Fixtures fylls på i beforeEach.
const fixtures = vi.hoisted(() => ({
  products: [] as unknown[],
  purchases: [] as unknown[],
}));

const buyProduct = vi.fn();

const makePurchase = (row: ShopProduct): ShopPurchase => ({
  id: `buy-${row.id}`,
  product_id: row.id,
  product_slug: row.slug,
  name: row.name,
  category: row.category,
  equip_kind: row.equip_kind,
  rarity: row.rarity,
  price_xp: row.price_xp,
  purchased_at: '2026-10-20T10:00:00Z',
});

const pumpkin: ShopProduct = {
  id: 'p1',
  slug: 'figur-pumpan',
  name: 'Pumpan',
  description: 'En liten pumpa med lyktansikte.',
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
};

const midnight: ShopProduct = {
  id: 'p2',
  slug: 'tema-midnight',
  name: 'Midnight Halloween',
  description: 'Midnatt i neon.',
  category: 'tema',
  equip_kind: 'tema',
  rarity: 'legendarisk',
  price_xp: 600,
  min_level: 1,
  season_id: 'halloween',
  season_only: true,
  asset_key: 'ikon-mane',
  theme_key: 'midnight',
  ornament_key: null,
  published: true,
  position: 14,
};

vi.mock('../../lib/shop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/shop')>();
  return {
    ...actual,
    listShopProducts: () => Promise.resolve(fixtures.products),
    listMyPurchases: () => Promise.resolve(fixtures.purchases),
    listMyEquipped: () => Promise.resolve([]),
    listSeasons: () =>
      Promise.resolve([
        {
          id: 'halloween',
          name: 'Halloween',
          description: null,
          starts_at: '2026-10-01T00:00:00Z',
          ends_at: '2026-11-02T00:00:00Z',
          active: true,
        },
      ]),
    loadXp: () => Promise.resolve({ total_xp: 100, level: 2 }),
    buyProduct: (...args: unknown[]) => buyProduct(...args),
    equipProduct: vi.fn(),
    unequipKind: vi.fn(),
  };
});

import { ElevButik } from './ElevButik';

describe('ElevButik', () => {
  beforeEach(() => {
    fixtures.products = [pumpkin, midnight];
    fixtures.purchases = [];
    buyProduct.mockReset();
  });

  it('visar saldo och föremål från butiken', async () => {
    render(<ElevButik />);
    expect(await screen.findByRole('heading', { name: 'Pumpan' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Midnight Halloween' })).toBeTruthy();
    expect(screen.getAllByText('100 XP').length).toBeGreaterThan(0);
  });

  it('förklarar varför ett för dyrt föremål inte går att köpa', async () => {
    render(<ElevButik />);
    await screen.findByText('Midnight Halloween');
    expect(screen.getByText('Du saknar 500 XP.')).toBeTruthy();
    const button = screen.getByRole('button', { name: /Köp för 600 XP/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('köper ett föremål efter bekräftelse och visar det nya saldot', async () => {
    buyProduct.mockResolvedValue({
      ok: true,
      already: false,
      name: 'Pumpan',
      price_xp: 60,
      total_xp: 40,
      level: 1,
    });
    render(<ElevButik />);
    await screen.findByRole('heading', { name: 'Pumpan' });

    fireEvent.click(screen.getByRole('button', { name: /Köp för 60 XP/ }));
    expect(await screen.findByText('Bekräfta köp')).toBeTruthy();

    const confirmButtons = screen.getAllByRole('button', { name: /Köp för 60 XP/ });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(buyProduct).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Pumpan är ditt/)).toBeTruthy();
    });
    expect(screen.getByText(/40 XP kvar \(nivå 1\)/)).toBeTruthy();
  });

  it('visar ett tydligt fel när köpet nekas av servern', async () => {
    buyProduct.mockRejectedValue(new Error('Du äger redan det här föremålet.'));
    render(<ElevButik />);
    await screen.findByRole('heading', { name: 'Pumpan' });

    fireEvent.click(screen.getByRole('button', { name: /Köp för 60 XP/ }));
    const confirmButtons = screen.getAllByRole('button', { name: /Köp för 60 XP/ });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Du äger redan det här föremålet.')).toBeTruthy();
    });
  });

  it('visar ägda föremål som användbara i stället för köpknapp', async () => {
    fixtures.purchases = [makePurchase(pumpkin)];
    render(<ElevButik />);
    await screen.findByRole('heading', { name: 'Pumpan' });
    expect(screen.getAllByRole('button', { name: 'Använd' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Köp för 60 XP/ })).toBeNull();
  });
});
