import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const invoke = vi.fn();
const rpc = vi.fn();
const listOrganisations = vi.fn();
const listAdminClasses = vi.fn();
const getAdaptationStats = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Något gick fel.'),
}));

vi.mock('../../lib/api', () => ({
  listOrganisations: () => listOrganisations(),
  listAdminClasses: () => listAdminClasses(),
  getAdaptationStats: () => getAdaptationStats(),
}));

import { AdminHome } from './AdminHome';

const counts = {
  accounts: 34,
  active: 30,
  inactive: 4,
  students: 24,
  teachers: 7,
  specialTeachers: 2,
  admins: 1,
  limited: 3,
  pendingApplications: 2,
};

const organisations = [
  { id: 'org-1', name: 'Ronneby Skola', active: true },
  { id: 'org-2', name: 'Karlskrona Gymnasium', active: true },
  { id: 'org-3', name: 'Nedlagd skola', active: false },
];

const classes = [
  { id: 'klass-1', archived: false },
  { id: 'klass-2', archived: false },
  { id: 'klass-3', archived: true },
];

/** Läser siffran som hör till en statistikruta. */
function statValue(label: string): string | undefined {
  const labelNode = screen.getByText(label, { selector: '.stat-label' });
  return labelNode.parentElement?.querySelector('.stat-value')?.textContent ?? undefined;
}

describe('Administratörens startsida', () => {
  beforeEach(() => {
    invoke.mockReset();
    rpc.mockReset();
    listOrganisations.mockReset();
    listAdminClasses.mockReset();
    getAdaptationStats.mockReset();

    invoke.mockResolvedValue({ data: { counts }, error: null });
    listOrganisations.mockResolvedValue(organisations);
    listAdminClasses.mockResolvedValue(classes);
    rpc.mockResolvedValue({
      data: [
        {
          id: 'logg-1',
          action: 'Konto aktiverat',
          actor_username: 'admin01',
          actor_role: 'admin',
          created_at: '2026-10-20T12:00:00Z',
        },
      ],
      error: null,
    });
    getAdaptationStats.mockResolvedValue(null);
  });

  it('visar siffror som räknas fram ur databasen', async () => {
    render(<AdminHome onNavigate={vi.fn()} />);

    await waitFor(() => expect(statValue('Skolorganisationer')).toBe('3'));
    expect(statValue('Klasser')).toBe('3');
    expect(statValue('Elever')).toBe('24');
    expect(statValue('Lärare')).toBe('7');
    expect(statValue('Konton')).toBe('34');
    expect(statValue('Väntande ansökningar')).toBe('2');
    // Hinten visar hur många som är aktiva, inte nya påhittade siffror.
    expect(screen.getAllByText('2 aktiva')).toHaveLength(2);
    expect(screen.getByText('2 speciallärare')).toBeTruthy();
  });

  it('visar senaste systemhändelserna', async () => {
    render(<AdminHome onNavigate={vi.fn()} />);

    expect(await screen.findByText('Konto aktiverat')).toBeTruthy();
    expect(screen.getByText(/admin01/)).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('list_audit_log', { p_limit: 6 });
  });

  it('navigerar från snabbgenvägarna', async () => {
    const onNavigate = vi.fn();
    render(<AdminHome onNavigate={onNavigate} />);
    await screen.findByText('Konto aktiverat');

    fireEvent.click(screen.getByRole('button', { name: /Alla konton/ }));
    expect(onNavigate).toHaveBeenCalledWith('anvandare');

    fireEvent.click(screen.getByRole('button', { name: /Funktionshantering/ }));
    expect(onNavigate).toHaveBeenCalledWith('funktioner');

    fireEvent.click(screen.getByRole('button', { name: /Visa alla/ }));
    expect(onNavigate).toHaveBeenCalledWith('logg');
  });

  it('visar ett fel i stället för påhittade siffror när servern inte svarar', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'nere' } });

    render(<AdminHome onNavigate={vi.fn()} />);

    expect(
      await screen.findByText(/Kontosammanställningen kunde inte hämtas/),
    ).toBeTruthy();
    // Rutorna visas med streck i stället för påhittade siffror.
    expect(statValue('Elever')).toBe('—');
    expect(statValue('Konton')).toBe('—');
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeTruthy();
  });
});
