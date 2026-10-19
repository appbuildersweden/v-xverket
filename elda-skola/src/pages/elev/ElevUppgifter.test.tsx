import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Submission, Task } from '../../lib/types';

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    identity: {
      id: 'elev-1',
      username: 'eannaad01',
      role: 'elev',
      accountType: 'skola',
      active: true,
      mustChangePassword: false,
      lastSignInAt: null,
    },
    profile: {
      id: 'elev-1',
      username: 'eannaad01',
      role: 'elev',
      active: true,
      account_type: 'skola',
      first_name: 'Anna',
      last_name: 'Andersson',
      organisation: null,
      created_at: '2026-10-01T10:00:00Z',
    },
  }),
}));

const listTasks = vi.fn();
const listMySubmissions = vi.fn();
const listDocuments = vi.fn();
const saveSubmission = vi.fn();
vi.mock('../../lib/api', () => ({
  ApiError: class ApiError extends Error {},
  documentSize: () => '1 kB',
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listMySubmissions: (...args: unknown[]) => listMySubmissions(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
  openDocument: vi.fn(),
  saveSubmission: (...args: unknown[]) => saveSubmission(...args),
  uploadDocument: vi.fn(),
}));

import { ElevUppgifter } from './ElevUppgifter';

const task: Task = {
  id: 'task-1',
  created_by: 'larare-1',
  student_id: null,
  class_id: 'klass-1',
  title: 'Rapport: hållbar utveckling',
  description: 'Skriv en kort rapport.',
  instructions: 'Använd minst två källor.',
  subject: 'Samhällskunskap',
  due_date: '2026-10-23',
  status: 'ej_paborjad',
  submission: null,
  submitted_at: null,
  completed_at: null,
  follow_up: false,
  follow_up_note: null,
  followed_up_at: null,
  created_at: '2026-10-18T10:00:00Z',
  updated_at: '2026-10-18T10:00:00Z',
  class_name: '7A Samhällskunskap',
};

const draft: Submission = {
  id: 'sub-1',
  task_id: 'task-1',
  student_id: 'elev-1',
  class_id: 'klass-1',
  content: 'Mitt påbörjade svar',
  status: 'utkast',
  feedback: null,
  feedback_at: null,
  reviewed_by: null,
  submitted_at: null,
  returned_at: null,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
};

const reviewed: Submission = {
  ...draft,
  id: 'sub-2',
  content: 'Mitt färdiga svar',
  status: 'granskad',
  feedback: 'Bra källor. Utveckla slutsatsen.',
  feedback_at: '2026-10-24T10:00:00Z',
  submitted_at: '2026-10-22T10:00:00Z',
};

describe('ElevUppgifter', () => {
  beforeEach(() => {
    listDocuments.mockResolvedValue([]);
    listMySubmissions.mockResolvedValue([]);
    saveSubmission.mockReset();
  });

  it('visar ett begripligt tomt läge', async () => {
    listTasks.mockResolvedValue([]);
    render(<ElevUppgifter />);
    expect(await screen.findByText('Inga uppgifter ännu')).toBeTruthy();
  });

  it('visar uppgiften och öppnar detaljvyn med elevens eget svar', async () => {
    listTasks.mockResolvedValue([task]);
    listMySubmissions.mockResolvedValue([draft]);
    render(<ElevUppgifter />);
    expect(await screen.findByText('Rapport: hållbar utveckling')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Öppna uppgift' }));
    await waitFor(() => {
      expect(screen.getByText('Använd minst två källor.')).toBeTruthy();
      expect((screen.getByLabelText('Ditt svar') as HTMLTextAreaElement).value).toBe('Mitt påbörjade svar');
    });
  });

  it('sparar ett utkast och visar att det är sparat', async () => {
    listTasks.mockResolvedValue([task]);
    listMySubmissions.mockResolvedValue([]);
    saveSubmission.mockResolvedValue({ ...draft, content: 'Nytt utkast' });
    render(<ElevUppgifter />);
    await screen.findByText('Rapport: hållbar utveckling');
    fireEvent.click(screen.getByRole('button', { name: 'Öppna uppgift' }));
    fireEvent.change(screen.getByLabelText('Ditt svar'), { target: { value: 'Nytt utkast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara utkast' }));
    await waitFor(() => {
      expect(saveSubmission).toHaveBeenCalledWith('task-1', 'Nytt utkast', 'utkast');
      expect(screen.getByText(/Utkastet är sparat/)).toBeTruthy();
    });
  });

  it('visar lärarens återkoppling och låser ett granskat svar', async () => {
    listTasks.mockResolvedValue([task]);
    listMySubmissions.mockResolvedValue([reviewed]);
    render(<ElevUppgifter />);
    await screen.findByText('Rapport: hållbar utveckling');
    fireEvent.click(screen.getByRole('button', { name: 'Visa inlämning' }));
    await waitFor(() => {
      expect(screen.getByTestId('submission-feedback').textContent).toContain('Bra källor');
      expect((screen.getByLabelText('Ditt svar') as HTMLTextAreaElement).disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Lämna in' })).toBeNull();
    });
  });
});
