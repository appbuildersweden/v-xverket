/**
 * Tilldelade uppgifter och uppföljning.
 *
 * Personal skapar uppgifter som riktas till en elev eller till en hel klass.
 * Eleven får läsa sina uppgifter och ändra status/status och lämna in svar via
 * serverfunktionen `student_set_task_status` — eleven kan aldrig skriva direkt i
 * tabellen och kan därför inte ändra lärarens instruktioner eller någon annans
 * uppgift. XP betalas ut av servern exakt en gång när uppgiften blir klar.
 */
import { Result, withClient } from './db';
import { STATUS_LABELS, TaskStatus, UnlockCelebration, mapUnlocks } from './planner';
import { isOverdue } from './dates';

export { STATUS_LABELS };
export type AssignedStatus = TaskStatus;

export interface AssignedTask {
  id: string;
  created_by: string;
  student_id: string | null;
  class_id: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  subject: string | null;
  due_date: string | null;
  status: AssignedStatus;
  submission: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  xp_awarded: boolean;
  follow_up: boolean;
  follow_up_note: string | null;
  followed_up_at: string | null;
  created_at: string;
  updated_at: string;
  /** Elevens användarnamn, när servern har gett åtkomst till profilen. */
  student_username?: string | null;
}

export interface NewAssignmentInput {
  title: string;
  description: string;
  instructions: string;
  subject: string;
  due_date: string;
  student_id: string | null;
  class_id: string | null;
}

export interface StudentStatusResult {
  status: AssignedStatus;
  xpAwarded: number;
  totalXp: number;
  level: number;
  /** Belöningar som låstes upp i samma åtgärd (kan vara tom). */
  unlocks: UnlockCelebration[];
}

export async function listAssignedTasks(
  filter: { studentId?: string; classId?: string; createdByMe?: boolean; onlyOpen?: boolean } = {},
): Promise<Result<AssignedTask[]>> {
  return withClient(async (sup) => {
    let request = sup
      .from('student_tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (filter.studentId) request = request.eq('student_id', filter.studentId);
    if (filter.classId) request = request.eq('class_id', filter.classId);
    if (filter.onlyOpen) request = request.neq('status', 'klar');
    if (filter.createdByMe) {
      const { data: userData } = await sup.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Din session har gått ut. Logga in igen.');
      request = request.eq('created_by', uid);
    }

    const { data, error } = await request;
    if (error) throw error;

    const tasks = (data ?? []) as AssignedTask[];
    const ids = [...new Set(tasks.map((t) => t.student_id).filter((v): v is string => !!v))];
    if (ids.length === 0) return tasks;

    const { data: profiles, error: profileErr } = await sup
      .from('profiles')
      .select('id, username')
      .in('id', ids);
    if (profileErr) {
      // Namnen är en trevlig detalj — uppgifterna visas ändå.
      return tasks;
    }
    const names = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{ id: string; username: string }>) {
      names.set(p.id, p.username);
    }
    return tasks.map((t) => ({
      ...t,
      student_username: t.student_id ? names.get(t.student_id) ?? null : null,
    }));
  });
}

/** Elevens egna uppgifter (individuella och klassens). RLS avgör vad som syns. */
export async function listMyTasks(): Promise<Result<AssignedTask[]>> {
  return listAssignedTasks();
}

export function validateAssignment(input: NewAssignmentInput): string | null {
  if (input.title.trim().length < 2) return 'Ge uppgiften en rubrik (minst 2 tecken).';
  if (input.title.trim().length > 200) return 'Rubriken är för lång (max 200 tecken).';
  if (input.description.length > 4000) return 'Beskrivningen är för lång (max 4000 tecken).';
  if (input.instructions.length > 8000) return 'Instruktionerna är för långa (max 8000 tecken).';
  if (!input.student_id && !input.class_id) {
    return 'Välj en elev eller en klass att tilldela uppgiften till.';
  }
  if (input.student_id && input.class_id) {
    return 'Välj antingen en elev eller en klass, inte båda.';
  }
  if (input.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) {
    return 'Datumet måste vara i formatet ÅÅÅÅ-MM-DD.';
  }
  return null;
}

export async function createAssignedTask(
  input: NewAssignmentInput,
): Promise<Result<AssignedTask>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup
      .from('student_tasks')
      .insert({
        created_by: uid,
        student_id: input.student_id,
        class_id: input.class_id,
        title: input.title.trim(),
        description: input.description.trim() || null,
        instructions: input.instructions.trim() || null,
        subject: input.subject.trim() || null,
        due_date: input.due_date || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as AssignedTask;
  });
}

export type AssignmentPatch = Partial<
  Pick<
    AssignedTask,
    'title' | 'description' | 'instructions' | 'subject' | 'due_date' | 'status' | 'follow_up' | 'follow_up_note'
  >
>;

export async function updateAssignedTask(
  id: string,
  patch: AssignmentPatch,
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup
      .from('student_tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

export async function deleteAssignedTask(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('student_tasks').delete().eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

export async function markFollowUp(id: string, note = ''): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('mark_follow_up', {
      p_task_id: id,
      p_note: note.trim() || null,
    });
    if (error) throw error;
    return true as const;
  });
}

/**
 * Elevens egen åtgärd: markera status och/eller lämna in ett svar.
 * Servern kontrollerar att uppgiften är tilldelad eleven och delar ut XP en gång.
 */
export async function setMyTaskStatus(
  id: string,
  status: AssignedStatus | null,
  submission: string | null = null,
): Promise<Result<StudentStatusResult>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('student_set_task_status', {
      p_task_id: id,
      p_status: status,
      p_submission: submission,
    });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      status: String(r.status ?? 'ej_paborjad') as AssignedStatus,
      xpAwarded: Number(r.xp_awarded ?? 0),
      totalXp: Number(r.total_xp ?? 0),
      level: Number(r.level ?? 1),
      unlocks: mapUnlocks(r.unlocks),
    };
  });
}

// ------------------------------------------------------- Uppgiftens läge

/**
 * Var uppgiften står i flödet. Det är lärarens uppföljning som avgör om den är
 * bedömd — eleven kan aldrig sätta det själv.
 */
export type AssignmentStage = 'ny' | 'pagar' | 'klar' | 'inlamnad' | 'bedomd';

export const STAGE_LABELS: Readonly<Record<AssignmentStage, string>> = {
  ny: 'Ny',
  pagar: 'Pågående',
  klar: 'Klar',
  inlamnad: 'Inlämnad',
  bedomd: 'Bedömd',
};

/** Läget i ordning: ny → pågående → klar/inlämnad → bedömd. Ren funktion. */
export function assignmentStage(task: AssignedTask): AssignmentStage {
  if (task.followed_up_at) return 'bedomd';
  if (task.submitted_at) return 'inlamnad';
  if (task.status === 'klar') return 'klar';
  if (task.status === 'pagar') return 'pagar';
  return 'ny';
}

/** Om eleven har fått återkoppling från sin lärare. */
export function hasTeacherFeedback(task: AssignedTask): boolean {
  return Boolean(task.followed_up_at || task.follow_up_note);
}

// ---------------------------------------------------------------- Hjälpare

export function sortAssignedTasks(tasks: readonly AssignedTask[]): AssignedTask[] {
  return [...tasks].sort((a, b) => {
    if (a.status === 'klar' !== (b.status === 'klar')) return a.status === 'klar' ? 1 : -1;
    const aDue = a.due_date ?? '9999-12-31';
    const bDue = b.due_date ?? '9999-12-31';
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    return a.title.localeCompare(b.title, 'sv');
  });
}

export interface AssignmentCounts {
  total: number;
  open: number;
  done: number;
  overdue: number;
  submitted: number;
  needsFollowUp: number;
}

/** Räknar uppgifter för listor och nyckeltal. Ren funktion. */
export function countAssignedTasks(
  tasks: readonly AssignedTask[],
  today: string,
  now: Date = new Date(),
): AssignmentCounts {
  const counts: AssignmentCounts = {
    total: tasks.length,
    open: 0,
    done: 0,
    overdue: 0,
    submitted: 0,
    needsFollowUp: 0,
  };
  for (const task of tasks) {
    if (task.status === 'klar') counts.done += 1;
    else {
      counts.open += 1;
      if (isOverdue(task.due_date, now) && (task.due_date ?? '') < today) counts.overdue += 1;
    }
    if (task.submitted_at) counts.submitted += 1;
    if (task.submitted_at && !task.followed_up_at) counts.needsFollowUp += 1;
  }
  return counts;
}

/** Grupperar uppgifter per ämne. Uppgifter utan ämne hamnar under 'Övrigt'. */
export function groupTasksBySubject(
  tasks: readonly AssignedTask[],
): Array<{ subject: string; tasks: AssignedTask[] }> {
  const map = new Map<string, AssignedTask[]>();
  for (const task of sortAssignedTasks(tasks)) {
    const subject = task.subject?.trim() || 'Övrigt';
    const list = map.get(subject) ?? [];
    list.push(task);
    map.set(subject, list);
  }
  return [...map.entries()]
    .map(([subject, list]) => ({ subject, tasks: list }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'sv'));
}

/** Filtrerar uppgiftslistan på status och fritext. */
export function filterAssignedTasks(
  tasks: readonly AssignedTask[],
  options: { status?: 'alla' | AssignedStatus; subject?: string; query?: string } = {},
): AssignedTask[] {
  const status = options.status ?? 'alla';
  const text = (options.query ?? '').trim().toLowerCase();
  return tasks.filter((task) => {
    if (status !== 'alla' && task.status !== status) return false;
    if (options.subject && (task.subject?.trim() || 'Övrigt') !== options.subject) return false;
    if (text) {
      const haystack = `${task.title} ${task.description ?? ''} ${task.subject ?? ''}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}
