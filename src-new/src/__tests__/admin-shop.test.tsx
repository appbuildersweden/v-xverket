import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminShopPage } from '../pages/admin/AdminShopPage';
import type { ShopProduct, ShopSeason } from '../lib/shop';

/**
 * Adminpanelens shop.
 *
 * Sidan är bara gränssnittet: varje åtgärd går till en databasfunktion som
 * själv kontrollerar adminrollen. Testet beskriver därför det som kan avgöras
 * här — att produkter och säsonger visas, att ett prisbyte kräver ett tydligt
 * ja, och att avpublicering frågar innan den genomförs.
 */

const mocks = vi.hoisted(() => ({
  listAllProducts: vi.fn(),
  listSeasons: vi.fn(),
  saveProduct: vi.fn(),
  setProductPublished: vi.fn(),
  saveSeason: vi.fn(),
}));

vi.mock('../lib/shop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/shop')>();
  return {
    ...actual,
    listAllProducts: mocks.listAllProducts,
    listSeasons: mocks.listSeasons,
    saveProduct: mocks.saveProduct,
    setProductPublished: mocks.setProductPublished,
    saveSeason: mocks.saveSeason,
  };
});

const PRODUCT: ShopProduct = {
  id: 'p-1',
  slug: 'tema-pumpa',
  name: 'Pumpatema',
  description: 'Hela appen i pumpafältets färger.',
  category: 'tema',
  equip_kind: 'tema',
  rarity: 'ovanlig',
  price_xp: 300,
  min_level: 2,
  season_id: 'halloween',
  season_only: true,
  asset_key: 'ikon-pumpalykta',
  theme_key: 'pumpa',
  ornament_key: null,
  published: true,
  position: 10,
};

const SEASON: ShopSeason = {
  id: 'halloween',
  name: 'Halloween',
  description: 'Pumpor och spöken.',
  starts_at: '2026-10-01T00:00:00Z',
  ends_at: '2026-11-02T00:00:00Z',
  active: true,
};

function setup() {
  mocks.listAllProducts.mockResolvedValue({ ok: true, data: [PRODUCT] });
  mocks.listSeasons.mockResolvedValue({ ok: true, data: [SEASON] });
  mocks.saveProduct.mockResolvedValue({ ok: true, data: PRODUCT });
  mocks.setProductPublished.mockResolvedValue({ ok: true, data: { ...PRODUCT, published: false } });
  mocks.saveSeason.mockResolvedValue({ ok: true, data: SEASON });
}

async function renderAdminShop() {
  render(<AdminShopPage />);
  await waitFor(() => expect(screen.getByText('Pumpatema')).toBeTruthy());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('shophanteringen i adminpanelen', () => {
  it('visar produkter och säsonger med pris, sällsynthet och status', async () => {
    setup();
    await renderAdminShop();

    const row = screen.getByTestId('admin-produkt-tema-pumpa');
    expect(row.textContent).toContain('300 XP');
    expect(row.textContent).toContain('Ovanlig');
    expect(row.textContent).toContain('Publicerad');
    expect(screen.getByTestId('admin-sasong-halloween')).toBeTruthy();
  });

  it('frågar innan ett pris ändras och sparar först efter ett ja', async () => {
    setup();
    await renderAdminShop();

    fireEvent.click(screen.getAllByRole('button', { name: /Redigera/ })[0]);

    const price = await screen.findByLabelText('XP-pris');
    fireEvent.change(price, { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara produkten/ }));

    expect(mocks.saveProduct).not.toHaveBeenCalled();
    const confirm = await screen.findByTestId('admin-shop-bekraftelse');
    expect(confirm.textContent).toContain('350 XP');
    // Köpet som redan gjorts behåller sitt pris — det står i bekräftelsen.
    expect(confirm.textContent).toContain('ursprungliga pris');

    fireEvent.click(screen.getByRole('button', { name: 'Ja, fortsätt' }));

    await waitFor(() => expect(mocks.saveProduct).toHaveBeenCalledTimes(1));
    const draft = mocks.saveProduct.mock.calls[0][0] as { id: string; price_xp: number };
    expect(draft.id).toBe('p-1');
    expect(draft.price_xp).toBe(350);
    // Listan hämtas om efter sparningen.
    expect(mocks.listAllProducts).toHaveBeenCalledTimes(2);
  });

  it('avpublicerar först efter bekräftelse och påminner om att ägandet består', async () => {
    setup();
    await renderAdminShop();

    fireEvent.click(screen.getByRole('button', { name: /Avpublicera/ }));

    const confirm = await screen.findByTestId('admin-shop-bekraftelse');
    expect(confirm.textContent).toContain('behåller den i sin samling');
    expect(mocks.setProductPublished).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ja, fortsätt' }));

    await waitFor(() =>
      expect(mocks.setProductPublished).toHaveBeenCalledWith('p-1', false),
    );
  });

  it('sparar en säsong utan att röra elevernas ägande', async () => {
    setup();
    await renderAdminShop();

    fireEvent.click(screen.getAllByRole('button', { name: /Redigera/ })[1]);
    const name = await screen.findByLabelText('Namn');
    fireEvent.change(name, { target: { value: 'Halloween 2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara säsongen/ }));

    await waitFor(() => expect(mocks.saveSeason).toHaveBeenCalledTimes(1));
    const draft = mocks.saveSeason.mock.calls[0][0] as { id: string; name: string };
    expect(draft).toMatchObject({ id: 'halloween', name: 'Halloween 2026' });
  });
});
