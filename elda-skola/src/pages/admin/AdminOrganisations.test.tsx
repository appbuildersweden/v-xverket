import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  AdminClass,
  AdminClassMember,
  AdminMembership,
  SchoolOrganisation,
} from '../../lib/types';

const assignMembership = vi.fn();
const listAdminClassMembers = vi.fn();
const listAdminClasses = vi.fn();
const listMemberships = vi.fn();
const listOrganisations = vi.fn();
const saveOrganisation = vi.fn();
const setOrganisationActive = vi.fn();

vi.mock('../../lib/api', () => ({
  assignMembership: (...args: unknown[]) => assignMembership(...args),
  listAdminClassMembers: (...args: unknown[]) => listAdminClassMembers(...args),
  listAdminClasses: (...args: unknown[]) => listAdminClasses(...args),
  listMemberships: (...args: unknown[]) => listMemberships(...args),
  listOrganisations: (...args: unknown[]) => listOrganisations(...args),
  saveOrganisation: (...args: unknown[]) => saveOrganisation(...args),
  setOrganisationActive: (...args: unknown[]) => setOrganisationActive(...args),
}));

import { AdminOrganisations } from './AdminOrganisations';

const ronneby: SchoolOrganisation = {
  id: 'org-1',
  name: 'Ronneby Skola',
  slug: 'ronneby-skola',
  municipality: 'Ronneby',
  contact_email: 'kontakt@ronneby.se',
  active: true,
  members: 2,
  students: 1,
  teachers: 1,
  special_teachers: 0,
  classes: 1,
  created_at: '2026-10-01T10:00:00Z',
};

const karlskrona: SchoolOrganisation = {
  ...ronneby,
  id: 'org-2',
  name: 'Karlskrona Gymnasium',
  slug: 'karlskrona-gymnasium',
  municipality: 'Karlskrona',
  contact_email: null,
  active: false,
  members: 1,
  students: 1,
  teachers: 0,
  classes: 0,
};

const people: AdminMembership[] = [
  {
    user_id: 'user-1',
    username: 'anna01',
    display_name: 'Anna Andersson',
    role: 'lärare',
    active: true,
    organisation_id: 'org-1',
    organisation_name: 'Ronneby Skola',
  },
  {
    user_id: 'user-2',
    username: 'erik02',
    display_name: 'Erik Eriksson',
    role: 'elev',
    active: true,
    organisation_id: 'org-1',
    organisation_name: 'Ronneby Skola',
  },
  {
    user_id: 'user-3',
    username: 'sara03',
    display_name: 'Sara Sara',
    role: 'elev',
    active: false,
    organisation_id: null,
    organisation_name: null,
  },
];

const klasses: AdminClass[] = [
  {
    id: 'klass-1',
    name: '7A Samhällskunskap',
    subject: 'Samhällskunskap',
    description: null,
    archived: false,
    join_code: 'ABC123',
    created_at: '2026-10-02T10:00:00Z',
    member_count: 2,
    student_count: 1,
    teacher_count: 1,
    teacher_names: 'Anna Andersson',
  },
];

const classMembers: AdminClassMember[] = [
  {
    class_id: 'klass-1',
    class_name: '7A Samhällskunskap',
    user_id: 'user-2',
    username: 'erik02',
    display_name: 'Erik Eriksson',
    role: 'elev',
    member_role: 'elev',
  },
];

describe('AdminOrganisations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOrganisations.mockResolvedValue([ronneby, karlskrona]);
    listMemberships.mockResolvedValue(people);
    listAdminClasses.mockResolvedValue(klasses);
    listAdminClassMembers.mockResolvedValue(classMembers);
    saveOrganisation.mockResolvedValue('org-3');
    assignMembership.mockResolvedValue(undefined);
    setOrganisationActive.mockResolvedValue(undefined);
  });

  it('visar statistik men ingen skolista förrän administratören söker', async () => {
    render(<AdminOrganisations />);
    expect(await screen.findByText('Skolor och medlemskap')).toBeTruthy();
    expect(screen.getByText('Sök efter en skola')).toBeTruthy();
    // Inga sökträffar renderas innan sökfältet används.
    expect(screen.queryByRole('button', { name: 'Hantera' })).toBeNull();
    expect(document.querySelectorAll('.org-card')).toHaveLength(0);
    // Statistiken räknas från datan: 2 skolor, 1 aktiv, 3 konton, 1 klass, 1 utan skola.
    const stats = Array.from(document.querySelectorAll('.stat')).map((node) => ({
      label: node.querySelector('.stat-label')?.textContent?.trim(),
      value: node.querySelector('.stat-value')?.textContent?.trim(),
    }));
    expect(stats).toEqual(
      expect.arrayContaining([
        { label: 'Skolor', value: '2' },
        { label: 'Aktiva skolor', value: '1' },
        { label: 'Konton', value: '3' },
        { label: 'Klasser', value: '1' },
        { label: 'Utan skola', value: '1' },
      ]),
    );
  });

  it('söker fram skola på namn och kommun', async () => {
    render(<AdminOrganisations />);
    await screen.findByText('Sök efter en skola');
    fireEvent.change(screen.getByLabelText('Sök skola'), { target: { value: 'karlskrona' } });
    await waitFor(() => expect(document.querySelectorAll('.org-card')).toHaveLength(1));
    expect(screen.getByText('Karlskrona Gymnasium')).toBeTruthy();
    expect(screen.getByText('Karlskrona')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hantera' })).toBeTruthy();
  });

  it('öppnar skapa skola i en dialog', async () => {
    render(<AdminOrganisations />);
    await screen.findByText('Sök efter en skola');
    fireEvent.click(screen.getByRole('button', { name: /Skapa skola/ }));
    expect(await screen.findByRole('dialog', { name: 'Skapa skola' })).toBeTruthy();
    expect(screen.getByLabelText(/Skolans namn/)).toBeTruthy();
  });

  it('visar skolans detaljer med flikar först när skolan öppnas', async () => {
    render(<AdminOrganisations />);
    await screen.findByText('Sök efter en skola');
    fireEvent.change(screen.getByLabelText('Sök skola'), { target: { value: 'ronneby' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Hantera' }));

    expect(await screen.findByRole('tab', { name: /Medlemmar/ })).toBeTruthy();
    expect(screen.getByText('kontakt@ronneby.se')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Medlemmar/ }));
    const panel = document.querySelector('.panel') as HTMLElement;
    expect(await within(panel).findByText('Anna Andersson')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Klasser/ }));
    expect(await within(panel).findByText('7A Samhällskunskap')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Inställningar/ }));
    expect(await screen.findByRole('button', { name: /Inaktivera skolan/ })).toBeTruthy();
  });

  it('kräver bekräftelse innan en skola inaktiveras', async () => {
    render(<AdminOrganisations />);
    await screen.findByText('Sök efter en skola');
    fireEvent.change(screen.getByLabelText('Sök skola'), { target: { value: 'ronneby' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Hantera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inaktivera' }));

    expect(await screen.findByRole('dialog', { name: 'Inaktivera skolan?' })).toBeTruthy();
    expect(setOrganisationActive).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Inaktivera' }));
    await waitFor(() => expect(setOrganisationActive).toHaveBeenCalledWith('org-1', false));
  });

  it('filtrerar konton på roll och utan skola', async () => {
    render(<AdminOrganisations />);
    fireEvent.click(await screen.findByRole('button', { name: /Utan skola/ }));
    expect(await screen.findByText('Sara Sara')).toBeTruthy();
    expect(screen.queryByText('Anna Andersson')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Lärare/ }));
    expect(await screen.findByText('Anna Andersson')).toBeTruthy();
    expect(screen.queryByText('Sara Sara')).toBeNull();
  });

  it('byter skolkoppling i en dialog med sökning och bekräftelse', async () => {
    render(<AdminOrganisations />);
    const button = await screen.findByRole('button', {
      name: 'Ändra skolkoppling för Sara Sara',
    });
    fireEvent.click(button);

    const dialog = await screen.findByRole('dialog', { name: 'Ändra skolkoppling' });
    fireEvent.change(within(dialog).getByLabelText('Sök skola för koppling'), {
      target: { value: 'karlskrona' },
    });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Karlskrona Gymnasium/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spara koppling' }));

    await waitFor(() => expect(assignMembership).toHaveBeenCalledWith('user-3', 'org-2'));
  });
});
