import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlatformFeatures } from '../../lib/types';

const features: PlatformFeatures = {
  shop: true,
  avatars: true,
  halloween: false,
  updated_at: '2026-10-21T10:00:00Z',
};

const refreshPlatformFeatures = vi.fn();
const savePlatformFeatureFlags = vi.fn();

vi.mock('../../lib/features', () => ({
  cachedPlatformFeatures: () => features,
  refreshPlatformFeatures: (...args: unknown[]) => refreshPlatformFeatures(...args),
  savePlatformFeatureFlags: (...args: unknown[]) => savePlatformFeatureFlags(...args),
}));

import { AdminFeatures } from './AdminFeatures';

describe('Funktionshantering', () => {
  beforeEach(() => {
    refreshPlatformFeatures.mockReset();
    refreshPlatformFeatures.mockResolvedValue(features);
    savePlatformFeatureFlags.mockReset();
  });

  it('visar alla tre funktionerna med status', async () => {
    render(<AdminFeatures />);

    expect(screen.getByRole('heading', { name: 'Funktionshantering' })).toBeTruthy();
    expect(screen.getByText('2 av 3 aktiva')).toBeTruthy();
    expect(await screen.findByRole('switch', { name: /XP-shoppen/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Avatarer och figurer/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Halloween-temat/ })).toBeTruthy();
    expect(screen.getAllByText('Aktiverad', { selector: '.badge' })).toHaveLength(2);
    expect(screen.getByText('Avstängd', { selector: '.badge' })).toBeTruthy();
    // Avstängningen förklarar att data ligger kvar.
    expect(screen.getByText(/Samling, rum och temaval sparas till nästa gång/)).toBeTruthy();
  });

  it('slår på Halloween och sparar alla tre lägena', async () => {
    savePlatformFeatureFlags.mockResolvedValue({ ...features, halloween: true });
    render(<AdminFeatures />);

    fireEvent.click(await screen.findByRole('switch', { name: /Halloween-temat/ }));

    await waitFor(() =>
      expect(savePlatformFeatureFlags).toHaveBeenCalledWith({
        shop: true,
        avatars: true,
        halloween: true,
      }),
    );
    expect(
      await screen.findByText('Halloween-temat är nu aktiverad för alla elever.'),
    ).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Halloween-temat: aktiverad/ })).toBeTruthy();
    expect(screen.getByText('3 av 3 aktiva')).toBeTruthy();
  });

  it('stänger av XP-shoppen', async () => {
    savePlatformFeatureFlags.mockResolvedValue({ ...features, shop: false });
    render(<AdminFeatures />);

    fireEvent.click(await screen.findByRole('switch', { name: /XP-shoppen/ }));

    await waitFor(() =>
      expect(savePlatformFeatureFlags).toHaveBeenCalledWith({
        shop: false,
        avatars: true,
        halloween: false,
      }),
    );
    expect(screen.getByText('XP-shoppen är nu avstängd för alla elever.')).toBeTruthy();
    expect(screen.getByRole('switch', { name: /XP-shoppen: avstängd/ })).toBeTruthy();
  });

  it('visar serverns fel och behåller läget', async () => {
    savePlatformFeatureFlags.mockRejectedValue(new Error('Endast administratörer får ändra.'));
    render(<AdminFeatures />);

    fireEvent.click(await screen.findByRole('switch', { name: /Halloween-temat/ }));

    expect(await screen.findByText('Endast administratörer får ändra.')).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Halloween-temat: avstängd/ })).toBeTruthy();
  });

  it('varnar när läget inte kunde läsas från servern', async () => {
    refreshPlatformFeatures.mockRejectedValue(new Error('nätverk'));
    render(<AdminFeatures />);

    expect(await screen.findByText(/Kunde inte läsa funktionsläget från servern/i)).toBeTruthy();
  });
});
