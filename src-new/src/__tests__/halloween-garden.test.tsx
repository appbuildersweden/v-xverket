import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HalloweenGarden } from '../components/halloween/HalloweenGarden';
import { SeasonConfig } from '../lib/season';

/**
 * Bakgrunden byter mellan video och stillbild. Videon ska vara tyst, loopande
 * och inline (annars startar den inte i mobilwebbläsare), och den som har
 * reducerad rörelse ska alltid få stillbilden.
 */
vi.mock('../lib/season-media', () => ({
  halloweenBackdropVideo: () => '/assets/halloween-video.mp4',
}));

const season: SeasonConfig = {
  id: 'halloween',
  theme: 'halloween',
  label: 'Halloween',
  tagline: 'En levande trädgård',
  intro: 'Test',
};

function renderGarden() {
  return render(
    <HalloweenGarden
      season={season}
      items={[]}
      placements={[]}
      effects={[]}
      totalXp={0}
      placementError={null}
      busyKey={null}
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
