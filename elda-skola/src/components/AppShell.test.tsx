import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppShell, ELEV_NAV, LARARE_NAV } from './AppShell';
import type { Identity, Profile } from '../lib/types';

const identity: Identity = {
  id: 'user-1',
  username: 'eannaad01',
  role: 'lärare',
  accountType: 'skola',
  active: true,
  mustChangePassword: false,
  lastSignInAt: null,
};

const profile: Profile = {
  id: 'user-1',
  username: 'eannaad01',
  role: 'lärare',
  active: true,
  account_type: 'skola',
  first_name: 'Anna',
  last_name: 'Andersson',
  organisation: 'Elda Skola',
  created_at: '2026-10-01T10:00:00Z',
};

function renderShell(panel: 'larare' | 'elev') {
  return render(
    <AppShell
      panel={panel}
      activePage={panel === 'larare' ? 'oversikt' : 'hem'}
      onNavigate={vi.fn()}
      identity={identity}
      profile={profile}
      onLogout={vi.fn()}
    >
      <p>Innehåll</p>
    </AppShell>,
  );
}

describe('AppShell', () => {
  it('har åtta elevkategorier i rätt ordning', () => {
    expect(ELEV_NAV.map((row) => row.id)).toEqual([
      'hem',
      'uppgifter',
      'amnen',
      'kalender',
      'klass',
      'meddelanden',
      'framsteg',
      'profil',
    ]);
  });

  it('har tio lärarkategorier i rätt ordning', () => {
    expect(LARARE_NAV.map((row) => row.id)).toEqual([
      'oversikt',
      'uppgifter',
      'aktiviteter',
      'material',
      'klasser',
      'kalender',
      'meddelanden',
      'inlamningar',
      'anpassningar',
      'profil',
    ]);
  });

  it('visar lärarmenyn och markerar aktiv kategori', () => {
    renderShell('larare');
    expect(screen.getByRole('button', { name: /Mina klasser och elever/ })).toBeTruthy();
    const active = screen.getByRole('button', { name: /Översikt/ });
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('visar elevmenyn utan lärarkategorier', () => {
    renderShell('elev');
    expect(screen.getByRole('button', { name: /Mina framsteg/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Anpassningar/ })).toBeNull();
  });

  it('fäller ihop sidopanelen', () => {
    renderShell('larare');
    const shell = document.querySelector('.shell');
    fireEvent.click(screen.getByLabelText('Fäll ihop sidopanelen'));
    expect(shell?.className).toContain('shell-collapsed');
    fireEvent.click(screen.getByLabelText('Fäll ut sidopanelen'));
    expect(shell?.className).not.toContain('shell-collapsed');
  });
});
