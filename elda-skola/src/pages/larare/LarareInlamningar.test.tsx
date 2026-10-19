import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SchoolClass, StudentRow, Submission, Task } from '../../lib/types';

const listTasks = vi.fn();
const listMyStudents = vi.fn();
const listClasses = vi.fn();
const listSubmissions = vi.fn();
const listDocuments = vi.fn();
const reviewSubmission = vi.fn();

vi.mock('../../lib/api', () => ({
  documentSize: () => '1 kB',
  listClasses: (...args: unknown[]) => listClasses(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listMyStudents: (...args: unknown[]) => listMyStudents(...args),
  listSubmissions: (...args: unknown[]) => listSubmissions(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
  openDocument: vi.fn(),
  reviewSubmission: (...args: unknown[]) => reviewSubmission(...args),
}));

import { LarareInlamningar } from './LarareInlamningar';

const klass: SchoolClass = {
  id: 'klass-1',
  name: '7A Samhällskunskap',
  description: null,
  subject: 'Samhällskunskap',
  member_role: 'larare',
  member_count: 2,
  join_code: 'ABC123',
  created_at: '2026-10-01T10:00:00Z',
};

const task: Task = {
  id: 'task-1',
  created_by: 'larare-1',
  student_id: null,
  class_id: 'klass-1',
  title: 'Rapport: hållbar utveckling',
  description: null,
  instructions: null,
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
  published: true,
};

const anna: StudentRow = {
  id: 'elev-1',
  username: 'eannaad01',
  first_name: 'Anna',
  last_name: 'Andersson',
  account_type: 'skola',
  class_id: 'klass-1',
  class_name: '7A Samhällskunskap',
  class_subject: 'Samhällskunskap',
};

const bertil: StudentRow = {
  ...anna,
  id: 'elev-2',
  username: 'ebertil02',
  first_name: 'Bertil',
  last_name: 'Bertilsson',
};

const cilla: StudentRow = {
  ...anna,
  id: 'elev-3',
  username: 'ecilla03',
  first_name: 'Cilla',
  last_name: 'Carlsson',
};

const annaSubmission: Submission = {
  id: 'sub-anna',
  task_id: 'task-1',
  student_id: 'elev-1',
  class_id: 'klass-1',
  content: 'Annas alldeles egna svar',
  status: 'inlamnad',
  feedback: null,
  feedback_at: null,
  reviewed_by: null,
  submitted_at: '2026-10-21T10:00:00Z',
  returned_at: null,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-21T10:00:00Z',
};

const bertilSubmission: Submission = {
  ...annaSubmission,
  id: 'sub-bertil',
  student_id: 'elev-2',
  content: 'Bertils helt andra svar',
  submitted_at: '2026-10-22T10:00:00Z',
  created_at: '2026-10-20T11:00:00Z',
  updated_at: '2026-10-22T10:00:00Z',
};

describe('LarareInlamningar', () => {
  beforeEach(() => {
    listTasks.mockResolvedValue([task]);
    listMyStudents.mockResolvedValue([anna, bertil, cilla]);
    listClasses.mockResolvedValue([klass]);
    listSubmissions.mockResolvedValue([annaSubmission, bertilSubmission]);
    listDocuments.mockResolvedValue([]);
    reviewSubmission.mockReset();
  });

  it('visar två elevers svar separat och blandar inte ihop dem', async () => {
    render(<LarareInlamningar />);
    await screen.findByRole('heading', { name: 'Rapport: hållbar utveckling', level: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Öppna uppgift' }));
    expect(screen.getByRole('button', { name: 'Inget svar' })).toBeTruthy();
    expect(screen.getByText('Cilla Carlsson')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Visa svar' })[0]);
    expect(await screen.findByText('Annas alldeles egna svar')).toBeTruthy();
    expect(screen.queryByText('Bertils helt andra svar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tillbaka till elevlistan' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Visa svar' })[1]);
    expect(await screen.findByText('Bertils helt andra svar')).toBeTruthy();
    expect(screen.queryByText('Annas alldeles egna svar')).toBeNull();
  });

  it('sparar återkoppling till rätt elev', async () => {
    reviewSubmission.mockResolvedValue({ ...annaSubmission, status: 'granskad' });
    render(<LarareInlamningar />);
    await screen.findByRole('heading', { name: 'Rapport: hållbar utveckling', level: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Öppna uppgift' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Visa svar' })[0]);

    fireEvent.change(screen.getByLabelText('Återkoppling till Anna Andersson'), {
      target: { value: 'Tydlig slutsats. Utveckla källkritiken.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Spara och markera granskad' }));

    await waitFor(() => {
      expect(reviewSubmission).toHaveBeenCalledWith(
        'sub-anna',
        'Tydlig slutsats. Utveckla källkritiken.',
        'granskad',
      );
      expect(screen.getByText(/Återkopplingen är sparad/)).toBeTruthy();
    });
  });

  it('kräver en förklaring när svaret återlämnas för komplettering', async () => {
    render(<LarareInlamningar />);
    await screen.findByRole('heading', { name: 'Rapport: hållbar utveckling', level: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Öppna uppgift' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Visa svar' })[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Återlämna för komplettering' }));
    expect(await screen.findByText(/Skriv en kort förklaring/)).toBeTruthy();
    expect(reviewSubmission).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Återkoppling till Anna Andersson'), {
      target: { value: 'Komplettera med en källförteckning.' },
    });
    reviewSubmission.mockResolvedValue({ ...annaSubmission, status: 'aterlamnad' });
    fireEvent.click(screen.getByRole('button', { name: 'Återlämna för komplettering' }));

    await waitFor(() => {
      expect(reviewSubmission).toHaveBeenCalledWith(
        'sub-anna',
        'Komplettera med en källförteckning.',
        'aterlamnad',
      );
    });
  });
});
