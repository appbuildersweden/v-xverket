import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Halloween } from './Halloween';
import type { HalloweenApi } from '../../lib/halloween-context';
import { DEFAULT_PLATFORM_FEATURES, applyPlatformFeatures } from '../../lib/features';
import type { HalloweenPart, HalloweenProduct } from '../../lib/halloween';

/**
 * Renderar hela Halloween-området med ett fejkat, men komplett, API.
 *
 * Testet rör inte Supabase: det prövar att vyn faktiskt går att använda – att
 * shopen visar riktiga priser, att ett köp går genom API:t och ger kvitto, att
 * ett för dyrt föremål inte går att köpa, och att avataren sparas via servern.
 */

const product: HalloweenProduct = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'tema-pumpa',
  name: 'Pumpatema',
  description: 'Varma orange accenter.',
  category: 'tema',
  equip_kind: 'tema',
  rarity: 'ovanlig',
  price_xp: 300,
  min_level: 1,
  season_id: 'halloween',
  season_only: true,
  asset_key: 'ikon-pumpalykta',
  theme_key: 'pumpa',
  ornament_key: null,
  published: true,
  position: 10,
};

const parts: HalloweenPart[] = [
  {
    slug: 'ton-3',
    slot: 'hudton',
    name: 'Mellan',
    description: 'Mellanton.',
    kind: 'farg',
    color: '#d6a37e',
    rarity: 'vanlig',
    price_xp: 0,
    min_level: 1,
    free: true,
    position: 50,
  },
  {
    slug: 'har-kort',
    slot: 'frisyr',
    name: 'Kort',
    description: 'Kort och rakt.',
    kind: 'del',
    color: null,
    rarity: 'vanlig',
    price_xp: 0,
    min_level: 1,
    free: true,
    position: 80,
  },
  {
    slug: 'har-bob',
    slot: 'frisyr',
    name: 'Bob',
    description: 'Kort bob.',
    kind: 'del',
    color: null,
    rarity: 'ovanlig',
    price_xp: 0,
    min_level: 1,
    free: true,
    position: 81,
  },
  {
    slug: 'hatt-hax',
    slot: 'huvudbonad',
    name: 'Häxhatten',
    description: 'Spetsig hatt.',
    kind: 'del',
    color: null,
    rarity: 'sallsynt',
    price_xp: 100,
    min_level: 1,
    free: false,
    position: 102,
  },
];

const baseApi = (overrides: Partial<HalloweenApi> = {}): HalloweenApi => ({
  ready: true,
  loading: false,
  error: null,
  reload: vi.fn(async () => {}),
  products: [product],
  seasons: [
    {
      id: 'halloween',
      name: 'Halloween',
      description: null,
      starts_at: '2020-01-01T00:00:00Z',
      ends_at: '2030-01-01T00:00:00Z',
      active: true,
    },
  ],
  purchases: [],
  parts,
  unlocks: [{ part_slug: 'hatt-hax', price_xp: 100, unlocked_at: '2026-10-12T10:00:00.000Z' }],
  room: [],
  look: {
    hudton: 'ton-3',
    frisyr: 'har-kort',
    klader: 'har-kort',
    bakgrund: 'bg-maneskog',
    effekt: 'fx-glod',
    husdjur: 'pet-katt',
  },
  equipped: {},
  wallet: {
    total_xp: 150,
    level: 2,
    xp_per_level: 100,
    level_start_xp: 100,
    next_level_xp: 200,
  },
  collection: [],
  ownedParts: new Set(['ton-3', 'har-kort', 'har-bob', 'hatt-hax']),
  themeKey: 'halloween',
  freeTheme: true,
  setFreeTheme: vi.fn(),
  activateTheme: vi.fn(async () => {}),
  purchaseProduct: vi.fn(async () => ({
    ok: true,
    already: false,
    slug: 'tema-pumpa',
    name: 'Pumpatema',
    price_xp: 300,
    total_xp: 0,
    level: 1,
  })),
  purchasePart: vi.fn(async () => ({
    ok: true,
    already: false,
    slug: 'hatt-hax',
    price_xp: 100,
    total_xp: 50,
    level: 1,
  })),
  equip: vi.fn(async () => {}),
  equipKind: vi.fn(async () => {}),
  unequip: vi.fn(async () => {}),
  saveLook: vi.fn(async () => ({})),
  placeRoom: vi.fn(async () => {}),
  removeRoom: vi.fn(async () => {}),
  ...overrides,
});

let api = baseApi();

vi.mock('../../lib/halloween-context', () => ({
  useHalloween: () => api,
}));

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    profile: { first_name: 'Alva', last_name: 'Nilsson', username: 'ealva' },
    identity: { id: 'elev-1', username: 'ealva' },
  }),
}));

describe('Halloween-området', () => {
  beforeEach(() => {
    api = baseApi();
  });

  it('visar saldo, avatar och säsongsstatus', () => {
    render(<Halloween />);
    expect(screen.getByRole('heading', { name: /Halloween i Elda/i })).toBeTruthy();
    expect(screen.getAllByText('150 XP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nivå 2').length).toBeGreaterThan(0);
    expect(screen.getByText('Säsongen är öppen')).toBeTruthy();
    expect(screen.getByLabelText(/Alva Nilssons Halloween-avatar/i)).toBeTruthy();
  });

  it('visar föremål med pris och status i shopen', () => {
    render(<Halloween />);
    expect(screen.getByRole('heading', { name: 'Pumpatema' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Häxhatten' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Kort' }).length).toBeGreaterThan(0);
    // 300 XP kostar mer än saldot på 150.
    expect(screen.getAllByText('Saknar 150 XP').length).toBeGreaterThan(0);
  });

  it('stänger av köp när saldot inte räcker', () => {
    render(<Halloween />);
    fireEvent.click(screen.getByRole('button', { name: /Visa Pumpatema/i }));
    const dialog = screen.getByRole('dialog');
    expect(
      (within(dialog).getByRole('button', { name: /Köp för 300 XP/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(api.purchaseProduct).not.toHaveBeenCalled();
  });

  it('låter eleven köpa ett föremål som saldot räcker till', async () => {
    api = baseApi({
      wallet: { ...baseApi().wallet, total_xp: 400, level: 5 },
    });
    render(<Halloween />);
    fireEvent.click(screen.getByRole('button', { name: /Visa Pumpatema/i }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Köp för 300 XP/i }),
    );
    await waitFor(() => expect(api.purchaseProduct).toHaveBeenCalledWith(product.id));
    expect(await screen.findByText(/300 XP drogs, du har 0 XP kvar/i)).toBeTruthy();
  });

  it('byter till avatarstudion och sparar via servern', async () => {
    api = baseApi();
    render(<Halloween />);
    fireEvent.click(screen.getByRole('tab', { name: /Avatar/i }));
    expect(screen.getByLabelText('Förhandsvisning av din Halloween-avatar')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Frisyr' }));
    fireEvent.click(screen.getByRole('button', { name: /Bob/i }));
    const save = screen.getByRole('button', { name: /Spara avatar/i });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.saveLook).toHaveBeenCalled());
    expect(api.saveLook).toHaveBeenCalledWith(
      expect.objectContaining({ frisyr: 'har-bob' }),
    );
  });

  it('visar ett tomt läge i samlingen i stället för ett fel', () => {
    render(<Halloween />);
    fireEvent.click(screen.getByRole('tab', { name: /Samling/i }));
    expect(screen.getByText(/Din samling är tom ännu/i)).toBeTruthy();
  });

  it('visar rummets sex platser', () => {
    render(<Halloween />);
    fireEvent.click(screen.getByRole('tab', { name: /Rummet/i }));
    expect(screen.getByRole('group', { name: /Ditt Halloween-rum/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /plats|Vänster|Mitten|Höger/i })).toHaveLength(6);
  });

  it('visar ett stängt område när skolan har stängt av Halloween', () => {
    applyPlatformFeatures({ ...DEFAULT_PLATFORM_FEATURES, halloween: false });
    const view = render(<Halloween />);
    expect(screen.getByRole('heading', { name: 'Halloween är avstängt' })).toBeTruthy();
    expect(screen.getByText(/Elda Skola visas i sin vanliga design/i)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Shop/i })).toBeNull();
    view.unmount();
    applyPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
  });

  it('döljer avatarfliken när avatarer är avstängda', () => {
    applyPlatformFeatures({ ...DEFAULT_PLATFORM_FEATURES, avatars: false });
    const view = render(<Halloween />);
    expect(screen.queryByRole('tab', { name: /Avatar/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /Shop/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Samling/i })).toBeTruthy();
    view.unmount();
    applyPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
  });

  it('gömmer avatar-delar i shopen när avatarer är avstängda', () => {
    applyPlatformFeatures({ ...DEFAULT_PLATFORM_FEATURES, avatars: false });
    const view = render(<Halloween />);
    expect(screen.getByRole('tab', { name: /Shop/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Häxhatten' })).toBeNull();
    view.unmount();
    applyPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
  });

  it('döljer shopfliken och shoppens ingångar när XP-shoppen är avstängd', () => {
    applyPlatformFeatures({ ...DEFAULT_PLATFORM_FEATURES, shop: false });
    const view = render(<Halloween />);
    expect(screen.queryByRole('tab', { name: /Shop/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bygg din avatar/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /Avatar/i })).toBeTruthy();
    view.unmount();
    applyPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
  });
});
