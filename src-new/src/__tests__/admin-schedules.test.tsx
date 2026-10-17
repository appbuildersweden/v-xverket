import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AuthServiceBackend, AuthAccount } from '../lib/auth-types';
import type { ClassInfo } from '../lib/classes';
import type { ScheduleEntry } from '../lib/schedule';

/**
 * Schemasidan. Sidan läser schemat från `schedule_entries` och skriver genom
 * databasens funktioner. Här mockas datalagret så att alla lägen kan provas:
 * innehåll, tomt läge, fel, skapande och borttagning.
 */
const hoisted = vi.hoisted(() => ({
  backend: null as AuthServiceBackend | null,
  listScheduleEntries: vi.fn(),
  createScheduleEntry: vi.fn(),
  updateScheduleEntry: vi.fn(),
  deleteScheduleEntry: vi.fn(),
  listClasses: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => {
    if (!hoisted.backend) throw new Error('backend saknas i testet');
    return hoisted.backend;
  },
}));

vi.mock('../lib/schedule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/schedule')>();
  return {
    ...actual,
    listScheduleEntries: hoisted.listScheduleEntries,
    createScheduleEntry: hoisted.createScheduleEntry,
    updateScheduleEntry: hoisted.updateScheduleEntry,
    deleteScheduleEntry: hoisted.deleteScheduleEntry,
  };
});

vi.mock('../lib/classes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/classes')>();
  return { ...actual, listClasses: hoisted.listClasses };
});

const admin = {
  id: 'admin-1',
  username: 'eadmin01',
  role: 'admin' as const,
  active: true,
  mustChangePassword: false,
};

const CLASSES: ClassInfo[] = [
  {
    id: 'c1',
    name: '9A',
    description: null,
    created_by: 'admin-1',
    created_at: '2026-01-01T00:00:00Z',
    member_role: null,
    memberCount: 12,
  },
];

const ENTRIES: ScheduleEntry[] = [
  {
    id: 's1',
    title: 'Matematik',
    subject: 'Matte',
    room: 'Sal 12',
    weekday: 1,
    start_time: '08:00:00',
    end_time: '09:00:00',
    class_id: 'c1',
    user_id: null,
    note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 's2',
    title: 'Läxhjälp',
    subject: null,
    room: null,
    weekday: 3,
    start_time: '14:00:00',
    end_time: '15:00:00',
    class_id: null,
    user_id: 'elev-1',
    note: 'Efter skolan',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const ACCOUNTS: AuthAccount[] = [
  { id: 'admin-1', username: 'eadmin01', role: 'admin', active: true, createdAt: null },
  { id: 'elev-1', username: 'ejentu02', role: 'elev', active: true, createdAt: null },
];

function makeBackend() {
  hoisted.backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({ exists: true, user: admin })),
    getCurrentUser: vi.fn(async () => admin),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => ({ ok: true as const, accounts: ACCOUNTS })),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    updateAccountProfile: vi.fn(async () => ({ ok: true as const })),
    setAccountRole: vi.fn(async () => ({ ok: true as const })),
    resetAccountPassword: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'ej' })),
  } as unknown as AuthServiceBackend;
}

async function renderSchedules() {
  window.history.replaceState(null, '', '#/admin/amnen');
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

beforeEach(() => {
  hoisted.listClasses.mockResolvedValue({ ok: true, data: CLASSES });
  hoisted.listScheduleEntries.mockResolvedValue({ ok: true, data: ENTRIES });
  hoisted.createScheduleEntry.mockResolvedValue({ ok: true, data: 's9' });
  hoisted.updateScheduleEntry.mockResolvedValue({ ok: true, data: true });
  hoisted.deleteScheduleEntry.mockResolvedValue({ ok: true, data: true });
});

afterEach(() => {
  cleanup();
  hoisted.backend = null;
  vi.clearAllMocks();
});

describe('scheman', () => {
  it('visar schemaposter grupperade per veckodag', async () => {
    makeBackend();
    await renderSchedules();

    expect(await screen.findByTestId('page-admin-amnen')).toBeTruthy();
    // Schemadatan laddas asynkront: await:ade frågor så att provet inte kapplöper
    // med renderingen (tidigare kunde detta bli grönt eller rött beroende på
    // hur arbetsprocesserna råkade schemaläggas).
    // Veckodagarna finns både som grupprubrik och som val i filtret.
    expect((await screen.findAllByText('Måndag')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Onsdag')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Matematik')).toBeTruthy();
    expect(await screen.findByText('08:00–09:00')).toBeTruthy();
    expect(await screen.findByText('Klass: 9A')).toBeTruthy();
    expect(await screen.findByText('Elev: ejentu02')).toBeTruthy();
  });

  it('visar nyckeltal från den verkliga datan', async () => {
    makeBackend();
    await renderSchedules();
    await screen.findByText('Matematik');

    expect(screen.getByText('Poster i schemat')).toBeTruthy();
    expect(screen.getByText('Klassposter')).toBeTruthy();
    // Två poster totalt: en för klassen och en för eleven.
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);
  });

  it('visar ett tydligt tomläge när schemat är tomt', async () => {
    hoisted.listScheduleEntries.mockResolvedValue({ ok: true, data: [] });
    makeBackend();
    await renderSchedules();

    expect(await screen.findByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText(/schemat är tomt/i)).toBeTruthy();
  });

  it('visar backendfel utan att visa påhittad data', async () => {
    hoisted.listScheduleEntries.mockResolvedValue({
      ok: false,
      error: 'Funktionen är inte aktiverad i databasen ännu.',
    });
    makeBackend();
    await renderSchedules();

    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(screen.getByText(/inte aktiverad i databasen/i)).toBeTruthy();
    expect(screen.queryByText('Matematik')).toBeNull();
  });

  it('skapar en schemapost via databasens funktion', async () => {
    makeBackend();
    await renderSchedules();
    await screen.findByText('Matematik');

    fireEvent.click(screen.getByRole('button', { name: /ny schemapost/i }));
    const form = within(screen.getByTestId('schedule-form'));
    fireEvent.change(form.getByLabelText(/rubrik/i), { target: { value: 'Engelska' } });
    fireEvent.change(form.getByLabelText(/veckodag/i), { target: { value: '2' } });
    fireEvent.change(form.getByLabelText('Starttid'), { target: { value: '10:00' } });
    fireEvent.change(form.getByLabelText('Sluttid'), { target: { value: '11:00' } });
    fireEvent.change(form.getByLabelText('Gäller'), { target: { value: 'klass:c1' } });
    fireEvent.click(form.getByRole('button', { name: /skapa schemapost/i }));

    await waitFor(() =>
      expect(hoisted.createScheduleEntry).toHaveBeenCalledWith({
        title: 'Engelska',
        weekday: 2,
        start_time: '10:00',
        end_time: '11:00',
        subject: '',
        room: '',
        note: '',
        class_id: 'c1',
        user_id: null,
      }),
    );
    // Listan hämtas om efter en lyckad ändring.
    await waitFor(() => expect(hoisted.listScheduleEntries).toHaveBeenCalledTimes(2));
  });

  it('stoppar en schemapost med sluttid före starttid', async () => {
    makeBackend();
    await renderSchedules();
    await screen.findByText('Matematik');

    fireEvent.click(screen.getByRole('button', { name: /ny schemapost/i }));
    const form = within(screen.getByTestId('schedule-form'));
    fireEvent.change(form.getByLabelText(/rubrik/i), { target: { value: 'Engelska' } });
    fireEvent.change(form.getByLabelText('Starttid'), { target: { value: '11:00' } });
    fireEvent.change(form.getByLabelText('Sluttid'), { target: { value: '10:00' } });
    fireEvent.change(form.getByLabelText('Gäller'), { target: { value: 'klass:c1' } });
    fireEvent.click(form.getByRole('button', { name: /skapa schemapost/i }));

    expect((await screen.findByTestId('schedule-error')).textContent).toMatch(/senare/i);
    expect(hoisted.createScheduleEntry).not.toHaveBeenCalled();
  });

  it('tar bort en schemapost efter bekräftelse', async () => {
    makeBackend();
    await renderSchedules();
    await screen.findByText('Matematik');

    const row = screen.getByText('Matematik').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^ta bort$/i }));
    fireEvent.click(within(row).getByRole('button', { name: /^ta bort$/i }));

    await waitFor(() => expect(hoisted.deleteScheduleEntry).toHaveBeenCalledWith('s1'));
  });

  it('visar serverns fel om skapandet misslyckas', async () => {
    hoisted.createScheduleEntry.mockResolvedValue({
      ok: false,
      error: 'Endast administratörer får hantera scheman.',
    });
    makeBackend();
    await renderSchedules();
    await screen.findByText('Matematik');

    fireEvent.click(screen.getByRole('button', { name: /ny schemapost/i }));
    const form = within(screen.getByTestId('schedule-form'));
    fireEvent.change(form.getByLabelText(/rubrik/i), { target: { value: 'Engelska' } });
    fireEvent.change(form.getByLabelText('Gäller'), { target: { value: 'klass:c1' } });
    fireEvent.click(form.getByRole('button', { name: /skapa schemapost/i }));

    expect((await screen.findByTestId('schedule-error')).textContent).toMatch(
      /endast administratörer/i,
    );
  });

  it('filtrerar schemat på veckodag', async () => {
    makeBackend();
    await renderSchedules();
    await screen.findByText('Matematik');

    fireEvent.change(screen.getByLabelText('Filtrera på veckodag'), {
      target: { value: '3' },
    });

    expect(screen.queryByText('Matematik')).toBeNull();
    expect(screen.getByText('Läxhjälp')).toBeTruthy();
  });
});
