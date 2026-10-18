import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HalloweenGarden } from '../components/halloween/HalloweenGarden';
import { Collectible, SeasonConfig } from '../lib/season';

/**
 * Bakgrunden byter mellan video och stillbild. Videon ska vara tyst, loopande
 * och inline (annars startar den inte i mobilwebbläsare), och den som har
 * reducerad rörelse ska alltid få stillbilden.
 */
vi.mock('../lib/season-media', () => ({
  halloweenBackdropVideo: () => '/assets/halloween-video.mp4',
  halloweenAmbience: () => '/assets/halloween-ambience.mp3',
  halloweenAmbienceCover: () => '/assets/halloween-cover.webp',
  HALLOWEN_AMBIENCE_CREDIT: '',
  HALLOWEEN_AMBIENCE_CREDIT: 'Ljudlandskap: test',
}));

const season: SeasonConfig = {
  id: 'halloween',
  theme: 'halloween',
  label: 'Halloween',
  tagline: 'En levande trädgård',
  intro: 'Test',
};

function item(
  name: string,
  key: string,
  artKey: Collectible['artKey'],
  unlocked = true,
): Collectible {
  return {
    id: `id-${key}`,
    name,
    description: `${name} beskrivning`,
    theme: 'halloween',
    rarity: 'vanlig',
    xpRequired: 20,
    attachedXp: 0,
    unlocked,
    unlockedAt: unlocked ? '2026-10-01T10:00:00Z' : null,
    unlockedBy: null,
    artKey,
    placementKey: key,
    isFinal: false,
  };
}

const PUMPA = item('Glödande pumpa', 'pumpa-glod', 'pumpa-glod');
const KATT = item('Svart katt', 'katt', 'katt');

function renderGarden(options: {
  items?: Collectible[];
  placements?: Array<{ item_key: string; slot: number; updated_at: string }>;
  onPlace?: (itemKey: string, slot?: number) => void;
  onMove?: (itemKey: string, slot: number) => void;
} = {}) {
  return render(
    <HalloweenGarden
      season={season}
      items={options.items ?? []}
      placements={options.placements ?? []}
      effects={[]}
      totalXp={40}
      placementError={null}
      busyKey={null}
      onPlace={options.onPlace}
      onMove={options.onMove}
      onRemove={() => undefined}
      onRetryPlacements={() => undefined}
    />,
  );
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  // Återställ till "ingen information", samma läge som jsdom har som standard.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('Halloween-trädgårdens bakgrund', () => {
  it('spelar videon tyst, loopande och inline när en video finns', () => {
    mockReducedMotion(false);
    renderGarden();

    const video = screen.getByTestId('halloween-scene').querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src')).toBe('/assets/halloween-video.mp4');
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.autoplay).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(screen.getByTestId('halloween-scene').querySelector('img')).toBeNull();
  });

  it('visar stillbilden i stället när reducerad rörelse är påslagen', () => {
    mockReducedMotion(true);
    renderGarden();

    const scene = screen.getByTestId('halloween-scene');
    expect(scene.querySelector('video')).toBeNull();
    expect(scene.querySelector('img')).toBeTruthy();
  });
});

describe('Trädgårdens platser', () => {
  it('låter eleven välja plats för ett föremål', () => {
    const onPlace = vi.fn();
    renderGarden({ items: [PUMPA], onPlace });

    fireEvent.click(screen.getByTestId('garden-slot-empty-3'));

    const tray = screen.getByTestId('garden-tray');
    expect(within(tray).getByText('På trappan')).toBeTruthy();
    fireEvent.click(within(tray).getByRole('button', { name: /Glödande pumpa/i }));

    expect(onPlace).toHaveBeenCalledWith('pumpa-glod', 3);
    expect(screen.queryByTestId('garden-tray')).toBeNull();
  });

  it('ställer ett föremål på en ledig plats när det släpps där', () => {
    const onPlace = vi.fn();
    renderGarden({
      items: [PUMPA],
      placements: [{ item_key: 'pumpa-glod', slot: 0, updated_at: '2026-10-01T10:00:00Z' }],
      onPlace,
    });

    const filled = screen.getByTestId('garden-slot-0');
    fireEvent.dragStart(filled);
    fireEvent.drop(screen.getByTestId('garden-slot-empty-5'));

    expect(onPlace).toHaveBeenCalledWith('pumpa-glod', 5);
  });

  it('byter plats med föremålet som redan står där', () => {
    const onMove = vi.fn();
    renderGarden({
      items: [PUMPA, KATT],
      placements: [
        { item_key: 'pumpa-glod', slot: 0, updated_at: '2026-10-01T10:00:00Z' },
        { item_key: 'katt', slot: 4, updated_at: '2026-10-01T10:00:00Z' },
      ],
      onMove,
    });

    fireEvent.dragStart(screen.getByTestId('garden-slot-0'));
    fireEvent.drop(screen.getByTestId('garden-slot-4'));

    expect(onMove).toHaveBeenCalledWith('pumpa-glod', 4);
  });

  it('kan flytta ett placerat föremål via detaljrutan', () => {
    const onMove = vi.fn();
    renderGarden({
      items: [PUMPA, KATT],
      placements: [
        { item_key: 'pumpa-glod', slot: 0, updated_at: '2026-10-01T10:00:00Z' },
        { item_key: 'katt', slot: 4, updated_at: '2026-10-01T10:00:00Z' },
      ],
      onMove,
    });

    fireEvent.click(screen.getByTestId('garden-slot-0'));
    fireEvent.click(screen.getByRole('button', { name: /Flytta till annan plats/i }));

    const list = screen.getByTestId('garden-move-list');
    fireEvent.click(within(list).getByRole('button', { name: /Bredvid häxan/i }));

    expect(onMove).toHaveBeenCalledWith('pumpa-glod', 4);
  });
});

describe('Trädgårdens ljud', () => {
  it('spelar ljudlandskapet först när eleven slår på det', () => {
    renderGarden();

    const audio = screen.getByTestId('garden-ambience') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('/assets/halloween-ambience.mp3');
    expect(audio.loop).toBe(true);

    const toggle = screen.getByTestId('garden-sound-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Ljudlandskap: test/)).toBeTruthy();
  });
});
