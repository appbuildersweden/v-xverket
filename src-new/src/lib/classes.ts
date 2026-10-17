/**
 * Klasser och elevgrupper.
 *
 * Klassen är grunden för "Min klass", klasskamrater, klasschatt och för att
 * kunna tilldela en uppgift till flera elever samtidigt. Medlemskap kontrolleras
 * serversidigt: en elev ser bara sin egen klass och sina egna klasskamrater.
 */
import { Result, query, withClient } from './db';

export interface ClassInfo {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  /** Rollen i klassen, när användaren själv är medlem. */
  member_role: 'elev' | 'larare' | null;
  memberCount: number;
}

export interface ClassMember {
  user_id: string;
  username: string;
  role: string;
  member_role: 'elev' | 'larare';
}

interface ClassRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

interface MemberRow {
  class_id: string;
  user_id: string;
  member_role: 'elev' | 'larare';
}

/** Alla klasser användaren har åtkomst till (egen klass, eller alla som personal). */
export async function listClasses(): Promise<Result<ClassInfo[]>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id ?? '';

    const { data: classes, error } = await sup
      .from('classes')
      .select('id, name, description, created_by, created_at')
      .order('name', { ascending: true });
    if (error) throw error;

    const rows = (classes ?? []) as ClassRow[];
    if (rows.length === 0) return [];

    const { data: members, error: memberErr } = await sup
      .from('class_members')
      .select('class_id, user_id, member_role')
      .in('class_id', rows.map((c) => c.id));
    if (memberErr) throw memberErr;

    const memberRows = (members ?? []) as MemberRow[];
    return rows.map((c) => {
      const inClass = memberRows.filter((m) => m.class_id === c.id);
      const mine = inClass.find((m) => m.user_id === uid);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        created_by: c.created_by,
        created_at: c.created_at,
        member_role: mine?.member_role ?? null,
        memberCount: inClass.filter((m) => m.member_role === 'elev').length,
      };
    });
  });
}

export async function listClassMembers(classId: string): Promise<Result<ClassMember[]>> {
  return withClient(async (sup) => {
    const { data: members, error } = await sup
      .from('class_members')
      .select('user_id, member_role')
      .eq('class_id', classId);
    if (error) throw error;

    const rows = (members ?? []) as Array<{ user_id: string; member_role: 'elev' | 'larare' }>;
    if (rows.length === 0) return [];

    const { data: profiles, error: profileErr } = await sup
      .from('profiles')
      .select('id, username, role')
      .in('id', rows.map((r) => r.user_id));
    if (profileErr) throw profileErr;

    const byId = new Map<string, { username: string; role: string }>();
    for (const p of (profiles ?? []) as Array<{ id: string; username: string; role: string }>) {
      byId.set(p.id, { username: p.username, role: p.role });
    }

    return rows.map((r) => ({
      user_id: r.user_id,
      member_role: r.member_role,
      username: byId.get(r.user_id)?.username ?? 'okänd',
      role: byId.get(r.user_id)?.role ?? 'elev',
    }));
  });
}

export async function addClassMember(
  classId: string,
  userId: string,
  memberRole: 'elev' | 'larare',
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('add_class_member', {
      p_class: classId,
      p_user: userId,
      p_member_role: memberRole,
    });
    if (error) throw error;
    return true as const;
  });
}

export async function removeClassMember(
  classId: string,
  userId: string,
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('remove_class_member', {
      p_class: classId,
      p_user: userId,
    });
    if (error) throw error;
    return true as const;
  });
}

/**
 * Alla klassmedlemskap för en användare, med medlemsrollen.
 * Row Level Security ger administratören hela bilden och en lärare bara de
 * egna klasserna — klienten förutsätter ingenting.
 */
export async function listMembershipsForUser(
  userId: string,
): Promise<Result<Array<{ class_id: string; member_role: 'elev' | 'larare' }>>> {
  return query<{ class_id: string; member_role: 'elev' | 'larare' }>((sup) =>
    sup.from('class_members').select('class_id, member_role').eq('user_id', userId),
  );
}

/** Hämtar klassens chattkanal (skapas vid första anropet av en medlem). */
export async function getClassChannelId(classId: string): Promise<Result<string>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('class_channel', { p_class: classId });
    if (error) throw error;
    const id = typeof data === 'string' ? data : '';
    if (!id) throw new Error('Klassens chatt kunde inte öppnas.');
    return id;
  });
}

/** Eleverna i klassen, utan den inloggade själv. Ren funktion. */
export function classmates(
  members: readonly ClassMember[],
  meId: string | null | undefined,
): ClassMember[] {
  return members
    .filter((m) => m.member_role === 'elev' && m.user_id !== meId)
    .sort((a, b) => a.username.localeCompare(b.username, 'sv'));
}

/** Lärarna i klassen (för information till eleven). Ren funktion. */
export function classTeachers(members: readonly ClassMember[]): ClassMember[] {
  return members
    .filter((m) => m.member_role === 'larare')
    .sort((a, b) => a.username.localeCompare(b.username, 'sv'));
}

// ----------------------------------------------------------------
// Klasskod och klassmedlemskap (serverfunktioner)
// ----------------------------------------------------------------
//
// En klasskod är aldrig ett skydd i sig: den skapar bara en förfrågan hos
// klassens lärare, och först ett *godkänt* medlemskap ger åtkomst till klassens
// innehåll. All kontroll ligger i databasens funktioner (security definer).

/** Klassens formkod: sex tecken utan I, O, 0 och 1. Samma regel som servern. */
export const CLASS_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Normaliserar en klasskod innan den skickas till servern. */
export function normalizeClassCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface MyClass {
  id: string;
  name: string;
  description: string | null;
  member_role: 'elev' | 'larare';
  member_count: number;
  /** Endast satt för klassens lärare (och admin). */
  join_code: string | null;
  created_at: string;
}

/** Klasserna jag är med i (elev) eller lärare för (lärare). */
export async function listMyClasses(): Promise<Result<MyClass[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_my_classes');
    if (error) throw error;
    return (data ?? []) as MyClass[];
  });
}

export interface NewClass {
  id: string;
  name: string;
  join_code: string;
}

/** Skapar en klass med klasskod. Endast lärare och admin (servern avgör). */
export async function createClassWithCode(
  name: string,
  description = '',
): Promise<Result<NewClass>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('create_class_with_code', {
      p_name: name.trim(),
      p_description: description.trim() || null,
    });
    if (error) throw error;
    const row = (data ?? {}) as Partial<NewClass>;
    if (!row.id || !row.join_code) throw new Error('Klassen kunde inte skapas.');
    return { id: String(row.id), name: String(row.name ?? name), join_code: String(row.join_code) };
  });
}

/** Ny klasskod — den gamla slutar gälla direkt. */
export async function rotateClassCode(classId: string): Promise<Result<string>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('rotate_class_code', { p_class: classId });
    if (error) throw error;
    const code = typeof data === 'string' ? data : '';
    if (!code) throw new Error('Ny klasskod kunde inte skapas.');
    return code;
  });
}

export interface JoinResult {
  status: 'vantar';
  class_id: string;
  class_name: string;
  message: string;
}

/** Elevens ansökan om att gå med i en klass med hjälp av en klasskod. */
export async function requestClassJoin(code: string): Promise<Result<JoinResult>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('request_class_join', {
      p_code: normalizeClassCode(code),
    });
    if (error) throw error;
    return data as JoinResult;
  });
}

export interface JoinRequest {
  id: string;
  class_id: string;
  class_name: string;
  student_id: string;
  student_username: string;
  status: 'vantar' | 'godkand' | 'nekad';
  requested_at: string;
}

/** Klassansökningar till de klasser jag är lärare för. */
export async function listClassJoinRequests(): Promise<Result<JoinRequest[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_class_join_requests');
    if (error) throw error;
    return (data ?? []) as JoinRequest[];
  });
}

/** Lärarens beslut: ett godkännande skapar medlemskapet som ger åtkomst. */
export async function decideClassJoinRequest(
  requestId: string,
  approve: boolean,
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('decide_class_join_request', {
      p_request: requestId,
      p_approve: approve,
    });
    if (error) throw error;
    return true as const;
  });
}

export interface MyStudent {
  id: string;
  username: string;
  account_type: string;
  class_id: string;
  class_name: string;
}

/** Eleverna i de klasser jag är lärare för (aldrig någon annans elever). */
export async function listMyStudents(): Promise<Result<MyStudent[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_my_students');
    if (error) throw error;
    return (data ?? []) as MyStudent[];
  });
}

/** Tar bort en elev ur en klass jag är lärare för (medlemskapet, inte kontot). */
export async function removeClassStudent(
  classId: string,
  studentId: string,
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('remove_class_student', {
      p_class: classId,
      p_student: studentId,
    });
    if (error) throw error;
    return true as const;
  });
}

/** Skolans administratörer, så att en lärare kan kontakta en av dem. */
export async function listAdminAccounts(): Promise<
  Result<Array<{ id: string; username: string }>>
> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_admin_accounts');
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; username: string }>;
  });
}

/** Antal ansökningar som väntar på beslut (för nyckeltal och menyn). */
export function countPendingRequests(requests: readonly JoinRequest[]): number {
  return requests.filter((r) => r.status === 'vantar').length;
}

/** Grupperar elever per klass. Ren funktion. */
export function groupStudentsByClass(
  students: readonly MyStudent[],
): Array<{ classId: string; className: string; students: MyStudent[] }> {
  const map = new Map<string, { classId: string; className: string; students: MyStudent[] }>();
  for (const student of students) {
    const group = map.get(student.class_id) ?? {
      classId: student.class_id,
      className: student.class_name,
      students: [],
    };
    group.students.push(student);
    map.set(student.class_id, group);
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      students: [...group.students].sort((a, b) => a.username.localeCompare(b.username, 'sv')),
    }))
    .sort((a, b) => a.className.localeCompare(b.className, 'sv'));
}
