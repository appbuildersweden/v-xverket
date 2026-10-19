import { describe, expect, it, vi } from 'vitest';

interface QueryBuilder extends PromiseLike<{ data: unknown[]; error: null }> {
  select: (columns: string) => QueryBuilder;
  order: (column: string, options?: unknown) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
}

const mock = vi.hoisted(() => {
  const state: { tasks: unknown[]; profiles: unknown[] } = { tasks: [], profiles: [] };
  const selectCalls: Array<{ table: string; columns: string }> = [];

  function builder(table: string): QueryBuilder {
    const rows = () =>
      Promise.resolve({
        data: table === 'student_tasks' ? state.tasks : state.profiles,
        error: null,
      });
    const query: QueryBuilder = {
      select: (columns) => {
        selectCalls.push({ table, columns });
        return query;
      },
      order: () => query,
      eq: () => query,
      in: () => query,
      then: (onfulfilled, onrejected) => rows().then(onfulfilled, onrejected),
    };
    return query;
  }

  return {
    state,
    selectCalls,
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'teacher-1' } } })) },
      from: vi.fn((table: string) => builder(table)),
    },
  };
});

vi.mock('./supabase', () => ({
  supabase: mock.supabase,
  errorMessage: (error: unknown) => String(error),
}));

import { listTasks } from './api';

describe('listTasks', () => {
  it('hämtar elevnamnet i en separat läsning i stället för en ogiltig join', async () => {
    mock.state.tasks = [
      {
        id: 'task-1',
        created_by: 'teacher-1',
        student_id: 'student-1',
        class_id: 'class-1',
        title: 'Uppgift',
        description: null,
        instructions: null,
        subject: 'Matematik',
        due_date: null,
        status: 'ej_paborjad',
        submission: null,
        submitted_at: null,
        completed_at: null,
        follow_up: false,
        follow_up_note: null,
        followed_up_at: null,
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-01T10:00:00Z',
        classes: { name: '9A' },
      },
    ];
    mock.state.profiles = [
      { id: 'student-1', username: 'elev01', first_name: 'Anna', last_name: 'Andersson' },
    ];

    const [task] = await listTasks();

    expect(task.class_name).toBe('9A');
    expect(task.student_name).toBe('Anna Andersson');
    expect(task.student_username).toBe('elev01');
    expect(
      mock.selectCalls.find((call) => call.table === 'student_tasks')?.columns ?? '',
    ).not.toContain('profiles!');
    expect(
      mock.selectCalls.some(
        (call) => call.table === 'profiles' && call.columns.includes('username'),
      ),
    ).toBe(true);
  });
});
