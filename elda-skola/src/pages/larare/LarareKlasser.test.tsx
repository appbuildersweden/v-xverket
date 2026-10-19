import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SchoolClass } from '../../lib/types';

const addStudentByUsername = vi.fn();
const createStudentAccount = vi.fn();
const listClasses = vi.fn();
const listClassRoster = vi.fn();
const listMyStudents = vi.fn();
const listSubmissions = vi.fn();
const listTasks = vi.fn();
const listAdaptations = vi.fn();
const listJoinRequests = vi.fn();

vi.mock('../../lib/api', () => ({
  addStudentByUsername: (...args: unknown[]) => addStudentByUsername(...args),
  createClass: vi.fn(),
  createStudentAccount: (...args: unknown[]) => createStudentAccount(...args),
  decideJoinRequest: vi.fn(),
  listAdaptations: (...args: unknown[]) => listAdaptations(...args),
  listClassRoster: (...args: unknown[]) => listClassRoster(...args),
  listClasses: (...args: unknown[]) => listClasses(...args),
  listJoinRequests: (...args: unknown[]) => listJoinRequests(...args),
  listMyStudents: (...args: unknown[]) => listMyStudents(...args),
  listSubmissions: (...args: unknown[]) => listSubmissions(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
  removeStudent: vi.fn(),
  rotateClassCode: vi.fn(),
  updateClass: vi.fn(),
}));

import { LarareKlasser } from './LarareKlasser';

const klass: SchoolClass = {
  id: 'klass-1',
  name: '7A Samhällskunskap',
  description: null,
  subject: 'Samhällskunskap',
  member_role: 'larare',
  member_count: 1,
  join_code: 'ABC123',
  created_at: '2026-10-01T10:00:00Z',
};

describe('LarareKlasser', () => {
  beforeEach(() => {
    listClasses.mockResolvedValue([klass]);
    listClassRoster.mockResolvedValue([
      { id: 'larare-1', username: 'larare01', display_name: 'Lärare Ett', member_role: 'larare' },
    ]);
    listMyStudents.mockResolvedValue([]);
    listSubmissions.mockResolvedValue([]);
    listTasks.mockResolvedValue([]);
    listAdaptations.mockResolvedValue([]);
    listJoinRequests.mockResolvedValue([]);
    createStudentAccount.mockReset();
    addStudentByUsername.mockReset();
  });

  it('skapar ett elevkonto via skolans kontoflöde och visar engångslösenordet', async () => {
    createStudentAccount.mockResolvedValue({
      username: 'eannaan01',
      initialPassword: 'TempPass123',
      mustChangePassword: true,
    });

    render(<LarareKlasser />);
    await screen.findByRole('button', { name: 'Ny elev eller tilldela' });

    fireEvent.click(screen.getByRole('button', { name: 'Ny elev eller tilldela' }));
    fireEvent.change(await screen.findByLabelText(/Förnamn/), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByLabelText(/Efternamn/), { target: { value: 'Andersson' } });
    fireEvent.click(screen.getByRole('button', { name: 'Skapa konto' }));

    await waitFor(() => {
      expect(createStudentAccount).toHaveBeenCalledWith({
        firstName: 'Anna',
        lastName: 'Andersson',
        classId: 'klass-1',
      });
      const dialog = within(screen.getByRole('dialog', { name: 'Elevkontot är skapat' }));
      expect(dialog.getByText(/eannaan01/)).toBeTruthy();
      expect(dialog.getByText('TempPass123')).toBeTruthy();
    });
  });

  it('lägger till ett befintligt konto utan att skapa ett nytt', async () => {
    addStudentByUsername.mockResolvedValue('befintlig01');

    render(<LarareKlasser />);
    await screen.findByRole('button', { name: 'Ny elev eller tilldela' });

    fireEvent.click(screen.getByRole('button', { name: 'Ny elev eller tilldela' }));
    fireEvent.click(screen.getByRole('button', { name: 'Befintligt konto' }));
    fireEvent.change(await screen.findByLabelText(/Användarnamn/), {
      target: { value: 'befintlig01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));

    await waitFor(() => {
      expect(addStudentByUsername).toHaveBeenCalledWith('klass-1', 'befintlig01');
      expect(createStudentAccount).not.toHaveBeenCalled();
    });
  });
});
