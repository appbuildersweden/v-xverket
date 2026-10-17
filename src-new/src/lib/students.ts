/**
 * Mina elever — kopplingen mellan speciallärare och elever.
 *
 * En speciallärare ser bara de elever som är kopplade till hen via
 * `student_links`. Kopplingen skapas av personal och kontrolleras serversidigt
 * (att målet verkligen är ett elevkonto). RLS hindrar en lärare från att läsa
 * någon annan lärares elever, och en elev från att läsa andras uppgifter.
 */
import { Result, withClient } from './db';

export interface StudentSummary {
  id: string;
  username: string;
  linkedAt: string;
  totalTasks: number;
  openTasks: number;
  doneTasks: number;
  overdueTasks: number;
  lastActivityAt: string | null;
}

export interface LinkableStudent {
  id: string;
  username: string;
}

interface LinkRow {
  elev_id: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  username: string;
}

interface TaskCountRow {
  student_id: string | null;
  status: string;
  due_date: string | null;
  updated_at: string | null;
}

/** Räknar ihop en elevs uppgifter. Ren funktion så att den kan testas direkt. */
export function summarizeStudentTasks(
  studentId: string,
  rows: readonly TaskCountRow[],
  today: string,
): Pick<StudentSummary, 'totalTasks' | 'openTasks' | 'doneTasks' | 'overdueTasks' | 'lastActivityAt'> {
  let total = 0;
  let open = 0;
  let done = 0;
  let overdue = 0;
  let last: string | null = null;

  for (const row of rows) {
    if (row.student_id !== studentId) continue;
    total += 1;
    if (row.status === 'klar') done += 1;
    else {
      open += 1;
      if (row.due_date && row.due_date < today) overdue += 1;
    }
    if (row.updated_at && (!last || row.updated_at > last)) last = row.updated_at;
  }

  return { totalTasks: total, openTasks: open, doneTasks: done, overdueTasks: overdue, lastActivityAt: last };
}

/** Hämtar de elever som är kopplade till den inloggade specialläraren. */
export async function listMyStudents(): Promise<Result<StudentSummary[]>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data: links, error: linkErr } = await sup
      .from('student_links')
      .select('elev_id, created_at')
      .eq('speciallarare_id', uid)
      .order('created_at', { ascending: true });
    if (linkErr) throw linkErr;

    const linkRows = (links ?? []) as LinkRow[];
    if (linkRows.length === 0) return [];

    const ids = linkRows.map((l) => l.elev_id);
    const today = new Date().toISOString().slice(0, 10);

    const [profilesRes, tasksRes] = await Promise.all([
      sup.from('profiles').select('id, username').in('id', ids),
      sup
        .from('student_tasks')
        .select('student_id, status, due_date, updated_at')
        .in('student_id', ids),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (tasksRes.error) throw tasksRes.error;

    const names = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as ProfileRow[]) names.set(p.id, p.username);
    const tasks = (tasksRes.data ?? []) as TaskCountRow[];

    return linkRows.map((link) => ({
      id: link.elev_id,
      username: names.get(link.elev_id) ?? 'okänd elev',
      linkedAt: link.created_at,
      ...summarizeStudentTasks(link.elev_id, tasks, today),
    }));
  });
}

export interface StaffAccount {
  id: string;
  username: string;
  role: string;
}

/** Aktiva personalkonton (för t.ex. ett nytt privat samtal). Endast personal. */
export async function listStaffAccounts(): Promise<Result<StaffAccount[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_staff_accounts');
    if (error) throw error;
    return ((data ?? []) as StaffAccount[]).filter((a) => !!a.id);
  });
}

/** Konton som får kopplas (aktiva elevkonton), utan de som redan är kopplade. */
export async function listLinkableStudents(): Promise<Result<LinkableStudent[]>> {
  return withClient(async (sup) => {
    const [accountsRes, linksRes, userData] = await Promise.all([
      sup.rpc('list_elev_accounts'),
      sup.from('student_links').select('elev_id'),
      sup.auth.getUser(),
    ]);
    if (accountsRes.error) throw accountsRes.error;
    if (linksRes.error) throw linksRes.error;

    const linked = new Set((linksRes.data ?? []).map((r) => String((r as { elev_id: string }).elev_id)));
    const me = userData.data.user?.id ?? '';
    void me;

    return ((accountsRes.data ?? []) as LinkableStudent[]).filter((a) => !linked.has(a.id));
  });
}

export async function linkStudent(studentId: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('link_student', { p_elev: studentId });
    if (error) throw error;
    return true as const;
  });
}

export async function unlinkStudent(studentId: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('unlink_student', { p_elev: studentId });
    if (error) throw error;
    return true as const;
  });
}

/** Fritextfilter mot användarnamn, för sökfältet i elevlistan. */
export function filterStudents(
  students: readonly StudentSummary[],
  queryText: string,
): StudentSummary[] {
  const text = queryText.trim().toLowerCase();
  if (!text) return [...students];
  return students.filter((s) => s.username.toLowerCase().includes(text));
}

/** Sorterar elevlistan på användarnamn i svensk ordning. */
export function sortStudents(students: readonly StudentSummary[]): StudentSummary[] {
  return [...students].sort((a, b) =>
    a.username.localeCompare(b.username, 'sv', { sensitivity: 'base' }),
  );
}
