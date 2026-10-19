import { describe, expect, it } from 'vitest';
import {
  countSubmissions,
  findSubmission,
  isSubmissionLocked,
  isTaskOpen,
  mergeTaskSubmission,
  submissionLabel,
} from './submissions';
import type { Submission, Task } from './types';

const task: Task = {
  id: 'task-1',
  created_by: 'larare-1',
  student_id: null,
  class_id: 'klass-1',
  title: 'Rapport',
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
};

function row(overrides: Partial<Submission>): Submission {
  return {
    id: 'sub-1',
    task_id: 'task-1',
    student_id: 'elev-1',
    class_id: 'klass-1',
    content: 'Svar',
    status: 'inlamnad',
    feedback: null,
    feedback_at: null,
    reviewed_by: null,
    submitted_at: '2026-10-20T10:00:00Z',
    returned_at: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
    ...overrides,
  };
}

describe('inlämningshjälp', () => {
  it('håller isär två elevers inlämningar på samma uppgift', () => {
    const submissions = [
      row({ id: 'a', student_id: 'elev-1', content: 'Annas svar' }),
      row({ id: 'b', student_id: 'elev-2', content: 'Bertils svar' }),
    ];
    expect(findSubmission(submissions, 'task-1')?.content).toBe('Annas svar');
    expect(submissions.filter((item) => item.student_id === 'elev-2')).toHaveLength(1);
    expect(submissions.filter((item) => item.student_id === 'elev-2')[0].content).toBe('Bertils svar');
  });

  it('låser inlämnade och granskade svar men inte utkast', () => {
    expect(isSubmissionLocked(row({ status: 'utkast' }))).toBe(false);
    expect(isSubmissionLocked(row({ status: 'aterlamnad' }))).toBe(false);
    expect(isSubmissionLocked(row({ status: 'inlamnad' }))).toBe(true);
    expect(isSubmissionLocked(row({ status: 'granskad' }))).toBe(true);
  });

  it('räknar väntande, saknade och granskade per uppgift', () => {
    const counts = countSubmissions(
      task,
      [
        row({ student_id: 'elev-1', status: 'inlamnad' }),
        row({ student_id: 'elev-2', status: 'utkast', submitted_at: null }),
        row({ student_id: 'elev-3', status: 'granskad' }),
      ],
      4,
    );
    expect(counts.submitted).toBe(2);
    expect(counts.waiting).toBe(1);
    expect(counts.drafts).toBe(1);
    expect(counts.reviewed).toBe(1);
    expect(counts.missing).toBe(1);
  });

  it('visar rätt etikett och öppnar kompletteringar men inte inlämnade svar', () => {
    expect(submissionLabel(null, task)).toBe('Ej påbörjad');
    expect(submissionLabel(row({ status: 'utkast' }), task)).toBe('Utkast');
    expect(submissionLabel(row({ status: 'aterlamnad' }), task)).toBe('Komplettera');
    expect(isTaskOpen(task, row({ status: 'aterlamnad' }))).toBe(true);
    expect(isTaskOpen(task, row({ status: 'inlamnad' }))).toBe(false);
  });

  it('speglar inlämningen i den äldre uppgiftsvyn', () => {
    const merged = mergeTaskSubmission(task, row({ status: 'inlamnad', content: 'Svar' }));
    expect(merged.status).toBe('klar');
    expect(merged.submission).toBe('Svar');
    expect(merged.submitted_at).toBe('2026-10-20T10:00:00Z');
  });
});
