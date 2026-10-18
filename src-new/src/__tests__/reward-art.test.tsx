import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RewardArt } from '../components/halloween/RewardArt';

afterEach(cleanup);

/**
 * Belöningarna visar två sorters grafik: ritad SVG för de tio första föremålen
 * och en egen ikonbild för varje ikon från ikonarket. Ingen av dem får tappa
 * sin bild, och en låst ikon ska dämpas precis som den ritade grafiken.
 */
describe('Belöningsgrafiken', () => {
  it('visar en ikonbelöning som sin egen bild', () => {
    const { container } = render(
      <RewardArt artKey="ikon-katt" size={96} title="Katt med gula ögon" />,
    );

    const image = container.querySelector('img');
    expect(image).toBeTruthy();
    expect(image?.getAttribute('src')).toContain('ikon-katt');
    expect(image?.getAttribute('alt')).toBe('Katt med gula ögon');
    expect(image?.className).toContain('hh-art-img');
    // Ikonen ritas inte som SVG också.
    expect(container.querySelector('svg')).toBeNull();
  });

  it('visar de ritade föremålen som SVG, även via äldre alias', () => {
    const { container } = render(<RewardArt artKey="katt" size={96} />);

    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('dämpar en låst ikon med samma klass som den ritade grafiken', () => {
    const { container } = render(<RewardArt artKey="ikon-katt" locked />);

    expect(container.querySelector('img')?.className).toContain('hh-art-locked');
  });

  it('visar en neutral ornament när nyckeln är okänd', () => {
    const { container } = render(<RewardArt artKey="finns-inte" />);

    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });
});
