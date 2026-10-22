import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ADMIN_NAV,
  AppShell,
  ELEV_NAV,
  LARARE_NAV,
  SPECIAL_NAV,
  groupNav,
  navFor,
} from './AppShell';
import type { Identity, Profile } from '../lib/types';
import { DEFAULT_PLATFORM_FEATURES, applyPlatformFeatures } from '../lib/features';

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
  it('har elva elevkategorier i rätt ordning', () => {
    expect(ELEV_NAV.map((row) => row.id)).toEqual([
      'hem',
      'uppgifter',
      'amnen',
      'kalender',
      'klass',
      'meddelanden',
      'information',
      'butik',
      'framsteg',
      'halloween',
      'profil',
    ]);
  });

  it('ger eleven butiken och administratören XP- och butiksverktygen', () => {
    expect(navFor('elev').map((row) => row.id)).toContain('butik');
    expect(ADMIN_NAV.map((row) => row.id)).toEqual(
      expect.arrayContaining(['xp', 'butik']),
    );
    // Lärar- och speciallärarmenyn ska inte få butiken.
    expect(LARARE_NAV.map((row) => row.id)).not.toContain('butik');
    expect(SPECIAL_NAV.map((row) => row.id)).not.toContain('butik');
  });

  it('har elva lärarkategorier i rätt ordning', () => {
    expect(LARARE_NAV.map((row) => row.id)).toEqual([
      'oversikt',
      'klasser',
      'uppgifter',
      'kalender',
      'inlamningar',
      'material',
      'aktiviteter',
      'anpassningar',
      'meddelanden',
      'information',
      'profil',
    ]);
  });

  it('grupperar lärarmenyn i logiska avsnitt', () => {
    expect(groupNav(LARARE_NAV).map((group) => group.title)).toEqual([
      'Start',
      'Klasser och elever',
      'Uppgifter och planering',
      'Inlämningar och bedömning',
      'Läromaterial och aktiviteter',
      'Elevstöd',
      'Kommunikation',
      'Konto',
    ]);
  });

  it('ger varje roll sin egen meny', () => {
    expect(navFor('elev')).toBe(ELEV_NAV);
    expect(navFor('larare')).toBe(LARARE_NAV);
    expect(navFor('admin')).toBe(ADMIN_NAV);
    expect(navFor('speciallarare')).toBe(SPECIAL_NAV);
    expect(ADMIN_NAV.map((row) => row.id)).toContain('larare');
    expect(ADMIN_NAV.map((row) => row.id)).toContain('klasser');
    expect(ELEV_NAV.map((row) => row.id)).not.toContain('anpassningar');
  });

  it('har en egen speciallärarmeny utan administrativa sidor', () => {
    expect(SPECIAL_NAV.map((row) => row.id)).toEqual([
      'hem',
      'elever',
      'meddelanden',
      'information',
      'profil',
    ]);
    expect(SPECIAL_NAV.map((row) => row.id)).not.toContain('anvandare');
    expect(SPECIAL_NAV.map((row) => row.id)).not.toContain('organisationer');
  });

  it('ger systemadministratören skolor, publiceringar och systemutskick', () => {
    const ids = ADMIN_NAV.map((row) => row.id);
    expect(ids).toContain('organisationer');
    expect(ids).toContain('publiceringar');
    expect(ids).toContain('meddelanden');
    expect(ids).toContain('information');
  });

  it('har information som egen kategori skild från meddelanden', () => {
    for (const nav of [ELEV_NAV, LARARE_NAV, SPECIAL_NAV]) {
      const ids = nav.map((row) => row.id);
      expect(ids).toContain('information');
      expect(ids.indexOf('information')).toBeGreaterThan(ids.indexOf('meddelanden'));
    }
    // Admin har båda under Kommunikation, som två tydligt skilda poster.
    const adminInfo = ADMIN_NAV.find((row) => row.id === 'information');
    const adminSystem = ADMIN_NAV.find((row) => row.id === 'meddelanden');
    expect(adminInfo?.group).toBe('Kommunikation');
    expect(adminSystem?.group).toBe('Kommunikation');
    expect(adminInfo?.label).not.toBe(adminSystem?.label);
    expect(LARARE_NAV.find((row) => row.id === 'meddelanden')?.label).toBe('Meddelanden');
    expect(LARARE_NAV.find((row) => row.id === 'information')?.label).toBe('Information');
  });

  it('grupperar adminmenyn i tydliga avsnitt utan dubblerade poster', () => {
    expect(groupNav(ADMIN_NAV).map((group) => group.title)).toEqual([
      'Översikt',
      'Organisation',
      'Användare och behörigheter',
      'Kommunikation',
      'Skolverksamhet',
      'Belöningar',
      'System och säkerhet',
      'Konto',
    ]);
    // Startsidan är en enda post, inte både ”Översikt” och ”Startsida”.
    expect(ADMIN_NAV[0].label).toBe('Startsida');
    expect(ADMIN_NAV.filter((row) => row.id === 'oversikt')).toHaveLength(1);
    const labels = ADMIN_NAV.map((row) => row.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('fäller ihop och expanderar grupperna i adminmenyn', () => {
    window.localStorage.clear();
    render(
      <AppShell
        panel="admin"
        activePage="oversikt"
        onNavigate={vi.fn()}
        identity={identity}
        profile={profile}
        onLogout={vi.fn()}
      >
        <p>Innehåll</p>
      </AppShell>,
    );

    const toggle = screen.getByRole('button', { name: 'Organisation' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Skolor och medlemskap/ })).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /Skolor och medlemskap/ })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Skolor och medlemskap/ })).toBeTruthy();
    window.localStorage.clear();
  });

  it('fäller bara ihop grupper i adminmenyn', () => {
    renderShell('larare');
    expect(screen.queryByRole('button', { name: 'Klasser och elever' })).toBeNull();
    expect(screen.getByText('Klasser och elever')).toBeTruthy();
  });

  it('visar inte skoladministration för lärare eller elev', () => {
    expect(LARARE_NAV.map((row) => row.id)).not.toContain('organisationer');
    expect(ELEV_NAV.map((row) => row.id)).not.toContain('publiceringar');
  });

  it('visar grupprubriker i menyn', () => {
    renderShell('larare');
    expect(screen.getByText('Klasser och elever')).toBeTruthy();
    expect(screen.getByText('Inlämningar och bedömning')).toBeTruthy();
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
    const toggle = screen.getByLabelText('Fäll ihop sidopanelen');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(shell?.className).toContain('shell-collapsed');
    const expand = screen.getByLabelText('Fäll ut sidopanelen');
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expand);
    expect(shell?.className).not.toContain('shell-collapsed');
  });

  it('kommer ihåg ihopfällt läge mellan sidladdningar', () => {
    window.localStorage.clear();
    const first = renderShell('elev');
    fireEvent.click(screen.getByLabelText('Fäll ihop sidopanelen'));
    expect(window.localStorage.getItem('elda-skola-sidebar')).toBe('collapsed');
    first.unmount();
    renderShell('elev');
    expect(document.querySelector('.shell')?.className).toContain('shell-collapsed');
    window.localStorage.clear();
  });

  it('visar sidans namn i toppfältet', () => {
    renderShell('larare');
    expect(document.querySelector('.topbar-title')?.textContent).toContain('Översikt');
  });

  it('döljer butiken och Halloween när skolan har stängt av dem', () => {
    applyPlatformFeatures({ ...DEFAULT_PLATFORM_FEATURES, shop: false, halloween: false });
    const shell = renderShell('elev');
    expect(screen.queryByText('Butiken')).toBeNull();
    expect(screen.queryByText('Halloween')).toBeNull();
    expect(screen.getAllByText('Hem').length).toBeGreaterThan(0);
    shell.unmount();
    applyPlatformFeatures(DEFAULT_PLATFORM_FEATURES);
  });

  it('filtrerar elevmenyn med funktionsväxlarna', () => {
    const noHalloween = { ...DEFAULT_PLATFORM_FEATURES, halloween: false };
    expect(navFor('elev', noHalloween).map((row) => row.id)).not.toContain('halloween');
    expect(navFor('elev', noHalloween).map((row) => row.id)).toContain('butik');
    expect(
      navFor('elev', { ...noHalloween, shop: false }).map((row) => row.id),
    ).not.toContain('butik');
    // Lärar- och adminmenyn påverkas inte av elevfunktionerna.
    expect(navFor('larare', noHalloween)).toEqual(navFor('larare'));
    expect(navFor('admin', noHalloween)).toEqual(navFor('admin'));
  });
});
