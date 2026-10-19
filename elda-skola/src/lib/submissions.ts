import type { Submission, Task } from './types';

/** Sant om uppgiften fortfarande väntar på elevens arbete. */
export function isTaskOpen(task: Task, submission?: Submission | null): boolean {
  if (task.archived_at) return false;
  if (submission) {
    return submission.status === 'utkast' || submission.status === 'aterlamnad';
  }
  // Äldre individuella uppgifter som ännu inte har en inlämningsrad.
  return task.status !== 'klar' && !task.submitted_at;
}

/** Inlämningen är låst när den ligger hos läraren eller är granskad. */
export function isSubmissionLocked(submission?: Submission | null): boolean {
  return submission?.status === 'inlamnad' || submission?.status === 'granskad';
}

export function isOverdueDate(date: string | null | undefined): boolean {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${date}T23:59:59`).getTime() < today.getTime();
}

export function submissionLabel(
  submission?: Submission | null,
  task?: Pick<Task, 'due_date'> | null,
): string {
  if (!submission) {
    return isOverdueDate(task?.due_date) ? 'Försenad' : 'Ej påbörjad';
  }
  switch (submission.status) {
    case 'utkast':
      return 'Utkast';
    case 'inlamnad':
      return 'Inlämnad';
    case 'aterlamnad':
      return 'Komplettera';
    case 'granskad':
      return 'Granskad';
    default:
      return 'Ej påbörjad';
  }
}

export function submissionTone(
  submission?: Submission | null,
  task?: Pick<Task, 'due_date'> | null,
): 'green' | 'amber' | 'red' | 'neutral' {
  if (!submission) return isOverdueDate(task?.due_date) ? 'red' : 'neutral';
  switch (submission.status) {
    case 'utkast':
      return 'amber';
    case 'inlamnad':
      return 'green';
    case 'aterlamnad':
      return 'amber';
    case 'granskad':
      return 'green';
    default:
      return 'neutral';
  }
}

/** Gör om en uppgift till den äldre vyn med elevens egen status. */
export function mergeTaskSubmission(task: Task, submission?: Submission | null): Task {
  if (!submission) return task;
  const done = submission.status === 'inlamnad' || submission.status === 'granskad';
  return {
    ...task,
    status: done ? 'klar' : 'pagar',
    submission: submission.content ?? task.submission,
    submitted_at: submission.submitted_at ?? task.submitted_at,
    follow_up: Boolean(submission.feedback),
    follow_up_note: submission.feedback ?? task.follow_up_note,
    followed_up_at: submission.feedback_at ?? task.followed_up_at,
  };
}

export function findSubmission(
  submissions: Submission[],
  taskId: string,
): Submission | undefined {
  return submissions.find((row) => row.task_id === taskId);
}

export interface SubmissionCounts {
  total: number;
  drafts: number;
  submitted: number;
  waiting: number;
  returned: number;
  reviewed: number;
  missing: number;
}

/** Räknar en uppgifts inlämningar mot det antal elever som uppgiften gäller. */
export function countSubmissions(
  task: Task,
  submissions: Submission[],
  totalStudents: number,
): SubmissionCounts {
  const rows = submissions.filter((row) => row.task_id === task.id);
  const submitted = rows.filter((row) => row.status !== 'utkast');
  return {
    total: totalStudents,
    drafts: rows.filter((row) => row.status === 'utkast').length,
    submitted: new Set(submitted.map((row) => row.student_id)).size,
    waiting: rows.filter((row) => row.status === 'inlamnad').length,
    returned: rows.filter((row) => row.status === 'aterlamnad').length,
    reviewed: rows.filter((row) => row.status === 'granskad').length,
    missing: Math.max(0, totalStudents - new Set(rows.map((row) => row.student_id)).size),
  };
}
