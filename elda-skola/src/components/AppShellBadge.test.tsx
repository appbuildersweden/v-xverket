import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';
import type { Identity, Profile } from '../lib/types';

const unread = vi.hoisted(() => ({ value: 0 }));

vi.mock('../lib/unread', () => ({
  useUnreadTotal: () => unread.value,
  useMessageRealtime: vi.fn(),
  refreshUnread: vi.fn().mockResolvedValue(undefined),
}));

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

function renderShell() {
  return render(
    <AppShell
      panel="larare"
      activePage="meddelanden"
      onNavigate={vi.fn()}
      identity={identity}
      profile={profile}
      onLogout={vi.fn()}
    >
      <p>Innehåll</p>
    </AppShell>,
  );
}

describe('AppShell – oläst-badge', () => {
  it('visar antalet olästa vid meddelanden i menyn', () => {
    unread.value = 4;
    renderShell();
    expect(screen.getByLabelText('4 olästa meddelanden').textContent).toBe('4');
  });

  it('döljer badgen när inget är oläst', () => {
    unread.value = 0;
    renderShell();
    expect(screen.queryByLabelText(/olästa meddelanden/)).toBeNull();
  });

  it('kortar stora antal till 99+', () => {
    unread.value = 134;
    renderShell();
    expect(screen.getByLabelText('134 olästa meddelanden').textContent).toBe('99+');
  });
});
