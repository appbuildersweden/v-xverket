import { supabase, errorMessage } from './supabase';
import type {
  Activity,
  Adaptation,
  Announcement,
  Contact,
  CreatedStudent,
  JoinRequest,
  Profile,
  RosterRow,
  SchoolClass,
  SchoolDocument,
  SchoolEvent,
  SchoolSettings,
  AdaptationStats,
  AdminAdaptation,
  AdminClass,
  AdminClassMember,
  AdminEvent,
  AdminMembership,
  AdminPublication,
  ChatMessage,
  Conversation,
  InboxMessage,
  SentConversation,
  MessageAudience,
  MessageContact,
  MyOrganisation,
  PendingAttachment,
  Publication,
  PublicationKind,
  PublicationStatus,
  SchoolOrganisation,
  SentMessage,
  SpecialStudent,
  StudentRow,
  Submission,
  Task,
} from './types';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function fail(error: unknown): never {
  throw new ApiError(errorMessage(error));
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new ApiError('Din session har gått ut. Logga in igen.');
  return data.user.id;
}

// --------------------------------------------------------------- profil

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role, active, account_type, first_name, last_name, organisation, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) fail(error);
  return (data as Profile | null) ?? null;
}

export async function loadContact(): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('profile_private')
    .select('contact_email, phone, mobile, street_address, postal_address, alt_contact, updated_at')
    .maybeSingle();
  if (error) fail(error);
  return (data as Contact | null) ?? null;
}

export async function saveContact(input: Omit<Contact, 'updated_at'>): Promise<void> {
  const { error } = await supabase.rpc('update_my_contact', {
    p_contact_email: input.contact_email || null,
    p_phone: input.phone || null,
    p_mobile: input.mobile || null,
    p_street_address: input.street_address || null,
    p_postal_address: input.postal_address || null,
    p_alt_contact: input.alt_contact || null,
  });
  if (error) fail(error);
}

export async function saveMyName(firstName: string, lastName: string): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_update_my_name', {
    p_first_name: firstName,
    p_last_name: lastName,
  });
  if (error) fail(error);
}

// --------------------------------------------------------------- klasser

export async function listClasses(): Promise<SchoolClass[]> {
  const { data, error } = await supabase.rpc('elda_skola_my_classes');
  if (error) fail(error);
  return (data ?? []) as SchoolClass[];
}

export async function createClass(input: {
  name: string;
  subject: string;
  description: string;
}): Promise<{ id: string; join_code: string }> {
  const { data, error } = await supabase.rpc('elda_skola_create_class', {
    p_name: input.name,
    p_subject: input.subject,
    p_description: input.description,
  });
  if (error) fail(error);
  const row = (data ?? {}) as { id?: string; join_code?: string };
  if (!row.id) throw new ApiError('Klassen skapades men kunde inte läsas.');
  return { id: row.id, join_code: row.join_code ?? '' };
}

export async function updateClass(input: {
  id: string;
  name: string;
  subject: string;
  description: string;
}): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_update_class', {
    p_class: input.id,
    p_name: input.name,
    p_subject: input.subject,
    p_description: input.description,
  });
  if (error) fail(error);
}

export async function rotateClassCode(classId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_class_code', { p_class: classId });
  if (error) fail(error);
  return String(data ?? '');
}

export async function listMyStudents(): Promise<StudentRow[]> {
  const { data, error } = await supabase.rpc('elda_skola_my_students');
  if (error) fail(error);
  return (data ?? []) as StudentRow[];
}

export async function listClassRoster(classId: string): Promise<RosterRow[]> {
  const { data, error } = await supabase.rpc('elda_skola_class_roster', { p_class: classId });
  if (error) fail(error);
  return (data ?? []) as RosterRow[];
}

export async function addStudentByUsername(
  classId: string,
  username: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('elda_skola_add_student', {
    p_class: classId,
    p_username: username.trim().toLowerCase(),
  });
  if (error) fail(error);
  return String(data ?? '');
}

export async function removeStudent(classId: string, studentId: string): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_remove_student', {
    p_class: classId,
    p_student: studentId,
  });
  if (error) fail(error);
}

/** Elevens ansökan med klasskod. Koden ger ingen åtkomst i sig. */
export async function requestClassJoin(code: string): Promise<{
  class_name: string;
  message: string;
}> {
  const { data, error } = await supabase.rpc('request_class_join', { p_code: code.trim().toUpperCase() });
  if (error) fail(error);
  const row = (data ?? {}) as { class_name?: string; message?: string };
  return {
    class_name: row.class_name ?? 'Klassen',
    message: row.message ?? 'Ansökan är skickad till din lärare.',
  };
}

export async function listJoinRequests(): Promise<JoinRequest[]> {
  const { data, error } = await supabase.rpc('list_class_join_requests');
  if (error) fail(error);
  return (data ?? []) as JoinRequest[];
}

export async function decideJoinRequest(id: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_class_join_request', {
    p_request: id,
    p_approve: approve,
  });
  if (error) fail(error);
}

/**
 * Skapar ett skolelevskonto åt en klass. Går via den skyddade serverfunktionen,
 * som kontrollerar att anroparen är lärare för klassen. Det tillfälliga
 * lösenordet visas en gång och finns inte kvar i klartext efteråt.
 */
export async function createStudentAccount(input: {
  firstName: string;
  lastName: string;
  classId: string;
}): Promise<CreatedStudent> {
  const { data, error } = await supabase.functions.invoke('school-account', {
    body: input,
  });
  const payload = (data ?? {}) as {
    error?: string;
    ok?: boolean;
    username?: string;
    initialPassword?: string | null;
  };
  if (error) {
    if (typeof error === 'object' && 'context' in error) {
      try {
        const body = await (error as { context: Response }).context.clone().json();
        if (body?.error) throw new ApiError(String(body.error));
      } catch (inner) {
        if (inner instanceof ApiError) throw inner;
      }
    }
    throw new ApiError(errorMessage(error, 'Kunde inte skapa elevkontot.'));
  }
  if (!payload.username) {
    throw new ApiError(payload.error ?? 'Kunde inte skapa elevkontot.');
  }
  return {
    username: payload.username,
    initialPassword: payload.initialPassword ?? null,
    mustChangePassword: true,
  };
}

// --------------------------------------------------------------- uppgifter

interface TaskRow extends Task {
  classes?: { name: string } | null;
}

interface TaskStudentProfile {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Hämtar uppgifter. Elevnamnet hämtas i en separat läsning: student_tasks
 * pekar på auth.users, inte på profiles, så PostgREST kan inte bädda in
 * profilen via någon främmande nyckel.
 */
export async function listTasks(options: { createdByMe?: boolean } = {}): Promise<Task[]> {
  let query = supabase
    .from('student_tasks')
    .select('*, classes(name)')
    .order('created_at', { ascending: false });
  if (options.createdByMe) {
    query = query.eq('created_by', await uid());
  }
  const { data, error } = await query;
  if (error) fail(error);

  const rows = (data ?? []) as TaskRow[];
  if (rows.length === 0) return [];

  const studentIds = [
    ...new Set(rows.map((row) => row.student_id).filter((id): id is string => Boolean(id))),
  ];
  const students = new Map<string, TaskStudentProfile>();
  if (studentIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, first_name, last_name')
      .in('id', studentIds);
    if (profileError) fail(profileError);
    for (const profile of (profileRows ?? []) as TaskStudentProfile[]) {
      students.set(profile.id, profile);
    }
  }

  return rows.map((row) => {
    const student = row.student_id ? students.get(row.student_id) : null;
    return {
      ...row,
      class_name: row.classes?.name ?? null,
      student_username: student?.username ?? null,
      student_name:
        [student?.first_name, student?.last_name].filter(Boolean).join(' ') || null,
    };
  });
}

export async function createTask(input: {
  title: string;
  description: string;
  instructions: string;
  subject: string;
  due_date: string;
  class_id: string;
  student_id?: string | null;
  published?: boolean;
}): Promise<string> {
  const userId = await uid();
  const { data, error } = await supabase
    .from('student_tasks')
    .insert({
      created_by: userId,
      class_id: input.class_id,
      student_id: input.student_id || null,
      title: input.title.trim(),
      description: input.description.trim() || null,
      instructions: input.instructions.trim() || null,
      subject: input.subject.trim() || null,
      due_date: input.due_date || null,
      published: input.published !== false,
    })
    .select('id')
    .single();
  if (error) fail(error);
  return String((data as { id?: string } | null)?.id ?? '');
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<Task, 'title' | 'description' | 'instructions' | 'subject' | 'due_date' | 'status' | 'published'>
  >,
): Promise<void> {
  const { error } = await supabase
    .from('student_tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error);
}

export async function archiveTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('student_tasks')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error);
}

export async function restoreTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('student_tasks')
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error);
}

// --------------------------------------------------------------- inlämningar


/** Elevens egna inlämningar. RLS släpper aldrig in någon annans rad. */
export async function listMySubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('school_submissions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as Submission[];
}

/** Lärarens inlämningar, med elev- och uppgiftsnamn. */
export async function listSubmissions(options: { taskId?: string } = {}): Promise<Submission[]> {
  let query = supabase
    .from('school_submissions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (options.taskId) query = query.eq('task_id', options.taskId);
  const { data, error } = await query;
  if (error) fail(error);
  const rows = (data ?? []) as Submission[];
  if (rows.length === 0) return [];

  // Inlämningen pekar på auth.users, inte direkt på profiles. Namnen hämtas
  // därför i en separat läsning som RLS begränsar till elever läraren ser.
  const studentIds = [...new Set(rows.map((row) => row.student_id))];
  const taskIds = [...new Set(rows.map((row) => row.task_id))];
  const [profilesResult, tasksResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, first_name, last_name')
      .in('id', studentIds),
    supabase
      .from('student_tasks')
      .select('id, title, subject, due_date')
      .in('id', taskIds),
  ]);
  if (profilesResult.error) fail(profilesResult.error);
  if (tasksResult.error) fail(tasksResult.error);

  const profiles = new Map(
    (profilesResult.data ?? []).map((row) => [String(row.id), row]),
  );
  const tasks = new Map(
    (tasksResult.data ?? []).map((row) => [String(row.id), row]),
  );

  return rows.map((row) => {
    const profile = profiles.get(row.student_id);
    const task = tasks.get(row.task_id);
    return {
      ...row,
      student_username: (profile?.username as string | undefined) ?? null,
      student_name:
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null,
      task_title: (task?.title as string | undefined) ?? null,
      task_subject: (task?.subject as string | null | undefined) ?? null,
      task_due_date: (task?.due_date as string | null | undefined) ?? null,
    };
  });
}

/** Sparar utkast eller lämnar in. Servern validerar status och ägarskap. */
export async function saveSubmission(
  taskId: string,
  content: string,
  mode: 'utkast' | 'inlamnad',
): Promise<Submission> {
  const { data, error } = await supabase.rpc('elda_skola_save_submission', {
    p_task: taskId,
    p_content: content,
    p_status: mode,
  });
  if (error) fail(error);
  return data as Submission;
}

/** Lärarens återkoppling. Bara behörig lärare kan anropa servern. */
export async function reviewSubmission(
  submissionId: string,
  feedback: string,
  status: 'granskad' | 'aterlamnad',
): Promise<Submission> {
  const { data, error } = await supabase.rpc('elda_skola_review_submission', {
    p_submission: submissionId,
    p_feedback: feedback.trim() || null,
    p_status: status,
  });
  if (error) fail(error);
  return data as Submission;
}

/**
 * Eleven markerar en godkänd inlämning som visad. Servern returnerar XP-beloppet
 * från xp_transactions, så popupen visar samma siffra som databasen. Ett nytt
 * anrop ger samma svar men skriver ingenting på nytt.
 */
export async function celebrateSubmissionXp(submissionId: string): Promise<{
  xp_awarded: number;
  total_xp: number;
  level: number;
}> {
  const { data, error } = await supabase.rpc('elda_skola_celebrate_submission_xp', {
    p_submission: submissionId,
  });
  if (error) fail(error);
  return data as { xp_awarded: number; total_xp: number; level: number };
}

// --------------------------------------------------------------- material

export async function listDocuments(): Promise<SchoolDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as SchoolDocument[];
}

const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
];

export function validateFile(file: File): string | null {
  if (!file.name.trim()) return 'Välj en fil.';
  if (file.size === 0) return 'Filen är tom.';
  if (file.size > MAX_FILE) return 'Filen är för stor. Max 10 MB.';
  if (file.type && !ALLOWED.includes(file.type)) {
    return 'Filtypen stöds inte. Välj PDF, bild, text, Word, Excel, PowerPoint eller zip.';
  }
  return null;
}

function safeName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(-80) || 'fil'
  );
}

export async function uploadDocument(input: {
  file: File;
  title: string;
  description: string;
  subject: string;
  classId: string | null;
  studentId: string | null;
  taskId?: string | null;
}): Promise<void> {
  const problem = validateFile(input.file);
  if (problem) throw new ApiError(problem);
  if (!input.title.trim()) throw new ApiError('Ge materialet en titel.');
  const userId = await uid();
  const path = `${userId}/${crypto.randomUUID()}-${safeName(input.file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from('elda-dokument')
    .upload(path, input.file, { contentType: input.file.type || undefined, upsert: false });
  if (uploadError) {
    if (/bucket|not found/i.test(uploadError.message)) {
      throw new ApiError(
        'Fillagringen är inte konfigurerad. Skapa den privata bucketen elda-dokument i Supabase och försök igen.',
      );
    }
    fail(uploadError);
  }

  const { error } = await supabase.from('documents').insert({
    owner_id: userId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    subject: input.subject.trim() || null,
    storage_path: path,
    mime_type: input.file.type || null,
    size_bytes: input.file.size,
    class_id: input.classId,
    student_id: input.studentId,
    task_id: input.taskId ?? null,
  });
  if (error) {
    await supabase.storage.from('elda-dokument').remove([path]);
    fail(error);
  }
}

export async function openDocument(row: SchoolDocument): Promise<void> {
  const { data, error } = await supabase.storage
    .from('elda-dokument')
    .createSignedUrl(row.storage_path, 3600);
  if (error || !data?.signedUrl) {
    fail(error ?? new Error('Filen kunde inte öppnas.'));
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

export async function deleteDocument(row: SchoolDocument): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', row.id);
  if (error) fail(error);
  await supabase.storage.from('elda-dokument').remove([row.storage_path]);
}

export function documentSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// --------------------------------------------------------------- meddelanden

export async function listAnnouncements(classIds: string[]): Promise<Announcement[]> {
  const { data, error } = await supabase.rpc('elda_skola_list_announcements');
  if (error) fail(error);
  const rows = (data ?? []) as Announcement[];
  const allowed = new Set(classIds);
  return rows.filter((row) => allowed.size === 0 || allowed.has(row.class_id));
}

export async function createAnnouncement(input: {
  classId: string;
  title: string;
  body: string;
}): Promise<void> {
  const userId = await uid();
  const { error } = await supabase.from('school_announcements').insert({
    class_id: input.classId,
    author_id: userId,
    title: input.title.trim(),
    body: input.body.trim(),
  });
  if (error) fail(error);
}

export async function markAnnouncementRead(id: string): Promise<void> {
  const userId = await uid();
  const { error } = await supabase
    .from('school_announcement_reads')
    .upsert(
      { announcement_id: id, user_id: userId, read_at: new Date().toISOString() },
      { onConflict: 'announcement_id,user_id' },
    );
  if (error) fail(error);
}

// --------------------------------------------------------------- kalender

export async function listEvents(): Promise<SchoolEvent[]> {
  const { data, error } = await supabase
    .from('school_events')
    .select('*, classes(name)')
    .order('starts_at', { ascending: true });
  if (error) fail(error);
  return ((data ?? []) as Array<SchoolEvent & { classes?: { name: string } | null }>).map((row) => ({
    ...row,
    class_name: row.classes?.name ?? null,
  }));
}

export async function createEvent(input: {
  classId: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}): Promise<void> {
  const userId = await uid();
  const { error } = await supabase.from('school_events').insert({
    class_id: input.classId,
    created_by: userId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    starts_at: input.startsAt,
    ends_at: input.endsAt || null,
    all_day: input.allDay,
  });
  if (error) fail(error);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('school_events').delete().eq('id', id);
  if (error) fail(error);
}

// --------------------------------------------------------------- aktiviteter

export async function listActivities(): Promise<Activity[]> {
  const { data, error } = await supabase.rpc('elda_skola_list_activities');
  if (error) fail(error);
  return (data ?? []) as Activity[];
}

export async function createActivity(input: {
  classId: string;
  subject: string;
  title: string;
  description: string;
  instructions: string;
  kind: string;
  published: boolean;
}): Promise<void> {
  const userId = await uid();
  const { error } = await supabase.from('school_activities').insert({
    class_id: input.classId,
    subject: input.subject.trim() || null,
    title: input.title.trim(),
    description: input.description.trim() || null,
    instructions: input.instructions.trim() || null,
    kind: input.kind,
    published: input.published,
    created_by: userId,
  });
  if (error) fail(error);
}

export async function updateActivity(
  id: string,
  patch: Partial<Pick<Activity, 'title' | 'description' | 'instructions' | 'subject' | 'published'>>,
): Promise<void> {
  const { error } = await supabase
    .from('school_activities')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error);
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('school_activities').delete().eq('id', id);
  if (error) fail(error);
}

export async function setActivityDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_set_activity_done', {
    p_activity: id,
    p_done: done,
  });
  if (error) fail(error);
}

// --------------------------------------------------------------- anpassningar

export async function listAdaptations(): Promise<Adaptation[]> {
  const { data, error } = await supabase.rpc('elda_skola_list_adaptations');
  if (error) fail(error);
  return (data ?? []) as Adaptation[];
}

export async function saveAdaptation(input: {
  id?: string | null;
  studentId: string;
  classId: string;
  subject: string;
  taskId: string | null;
  title: string;
  description: string;
  measures: string;
  status: 'aktiv' | 'avslutad';
}): Promise<string> {
  const { data, error } = await supabase.rpc('elda_skola_save_adaptation', {
    p_id: input.id ?? null,
    p_student: input.studentId,
    p_class: input.classId || null,
    p_subject: input.subject.trim() || null,
    p_task: input.taskId || null,
    p_title: input.title.trim(),
    p_description: input.description.trim() || null,
    p_measures: input.measures.trim() || null,
    p_status: input.status,
  });
  if (error) fail(error);
  return String(data ?? '');
}

export async function deleteAdaptation(id: string): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_delete_adaptation', { p_id: id });
  if (error) fail(error);
}

// ------------------------------------------------------------ admin: klasser

export async function listAdminClasses(): Promise<AdminClass[]> {
  const { data, error } = await supabase.rpc('elda_skola_admin_classes');
  if (error) fail(error);
  return (data ?? []) as AdminClass[];
}

export async function listAdminClassMembers(): Promise<AdminClassMember[]> {
  const { data, error } = await supabase.rpc('elda_skola_admin_class_members');
  if (error) fail(error);
  return (data ?? []) as AdminClassMember[];
}

export async function setClassArchived(classId: string, archived: boolean): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_admin_set_class_archived', {
    p_class: classId,
    p_archived: archived,
  });
  if (error) fail(error);
}

export async function addClassMember(
  classId: string,
  userId: string,
  memberRole: 'elev' | 'larare',
): Promise<void> {
  const { error } = await supabase.rpc('add_class_member', {
    p_class: classId,
    p_user: userId,
    p_member_role: memberRole,
  });
  if (error) fail(error);
}

export async function removeClassMember(classId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_class_member', {
    p_class: classId,
    p_user: userId,
  });
  if (error) fail(error);
}

// -------------------------------------------------------- admin: meddelanden

export async function sendSchoolMessage(input: {
  subject: string;
  body: string;
  audience: MessageAudience;
  classId: string | null;
  userIds: string[];
}): Promise<number> {
  const { data, error } = await supabase.rpc('elda_skola_send_message', {
    p_subject: input.subject.trim(),
    p_body: input.body.trim(),
    p_audience: input.audience,
    p_class: input.classId || null,
    p_user_ids: input.userIds.length ? input.userIds : null,
  });
  if (error) fail(error);
  return Number(data ?? 0);
}

export async function listSentMessages(): Promise<SentMessage[]> {
  const { data, error } = await supabase.rpc('elda_skola_sent_messages');
  if (error) fail(error);
  return (data ?? []) as SentMessage[];
}

export async function listMyMessages(): Promise<InboxMessage[]> {
  const { data, error } = await supabase.rpc('elda_skola_my_messages');
  if (error) fail(error);
  return (data ?? []) as InboxMessage[];
}

export async function markMessageRead(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_mark_message_read', { p_message: messageId });
  if (error) fail(error);
}

// ---------------------------------------------------------- admin: planering

export async function listAdminEvents(): Promise<AdminEvent[]> {
  const { data, error } = await supabase.rpc('elda_skola_admin_events');
  if (error) fail(error);
  return (data ?? []) as AdminEvent[];
}

export async function saveAdminEvent(input: {
  id?: string | null;
  classId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  published: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('elda_skola_admin_save_event', {
    p_id: input.id ?? null,
    p_class: input.classId || null,
    p_title: input.title.trim(),
    p_description: input.description.trim() || null,
    p_starts: input.startsAt,
    p_ends: input.endsAt || null,
    p_all_day: input.allDay,
    p_published: input.published,
  });
  if (error) fail(error);
  return String(data ?? '');
}

export async function deleteAdminEvent(id: string): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_admin_delete_event', { p_id: id });
  if (error) fail(error);
}

// -------------------------------------------------------- admin: elevstöd

export async function listAdminAdaptations(): Promise<AdminAdaptation[]> {
  const { data, error } = await supabase.rpc('elda_skola_admin_adaptations');
  if (error) fail(error);
  return (data ?? []) as AdminAdaptation[];
}

export async function saveAdminAdaptation(input: {
  id?: string | null;
  studentId: string;
  classId: string;
  subject: string;
  title: string;
  description: string;
  measures: string;
  status: 'aktiv' | 'avslutad';
  followUpAt: string;
  followUpBy: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('elda_skola_admin_save_adaptation', {
    p_id: input.id ?? null,
    p_student: input.studentId,
    p_class: input.classId || null,
    p_subject: input.subject.trim() || null,
    p_title: input.title.trim(),
    p_description: input.description.trim() || null,
    p_measures: input.measures.trim() || null,
    p_status: input.status,
    p_follow_up_at: input.followUpAt || null,
    p_follow_up_by: input.followUpBy || null,
  });
  if (error) fail(error);
  return String(data ?? '');
}

export async function deleteAdminAdaptation(id: string): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_admin_delete_adaptation', { p_id: id });
  if (error) fail(error);
}

// ------------------------------------------------------- skolans inställningar

function toSchoolSettings(data: unknown): SchoolSettings | null {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row.school_name !== 'string') return null;
  return {
    school_name: row.school_name,
    contact_email: typeof row.contact_email === 'string' ? row.contact_email : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function getSchoolSettings(): Promise<SchoolSettings> {
  const { data, error } = await supabase.rpc('elda_skola_school_settings');
  if (error) fail(error);
  return (
    toSchoolSettings(data) ?? { school_name: 'Elda Skola', contact_email: null, updated_at: null }
  );
}

export async function saveSchoolSettings(input: {
  schoolName: string;
  contactEmail: string;
}): Promise<SchoolSettings> {
  const { data, error } = await supabase.rpc('elda_skola_save_school_settings', {
    p_school_name: input.schoolName.trim(),
    p_contact_email: input.contactEmail.trim() || null,
  });
  if (error) fail(error);
  const saved = toSchoolSettings(data);
  if (!saved) throw new ApiError('Inställningarna sparades men kunde inte läsas tillbaka.');
  return saved;
}

/** Aggregat för adminpanelen. Returnerar null när kontot inte är admin. */
export async function getAdaptationStats(): Promise<AdaptationStats | null> {
  const { data, error } = await supabase.rpc('elda_skola_adaptation_stats');
  if (error) fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row) return null;
  return {
    total: Number(row.total ?? 0),
    active: Number(row.active ?? 0),
    completed: Number(row.completed ?? 0),
    students: Number(row.students ?? 0),
    last_updated: typeof row.last_updated === 'string' ? row.last_updated : null,
  };
}

// ---------------------------------------------------------- organisationer

/** Den inloggades skolorganisation, eller null om kontot saknar skola. */
export async function getMyOrganisation(): Promise<MyOrganisation | null> {
  const { data, error } = await supabase.rpc('elda_skola_my_organisation');
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row.name !== 'string') return null;
  return {
    id: String(row.id ?? ''),
    name: row.name,
    contact_email: typeof row.contact_email === 'string' ? row.contact_email : null,
  };
}

export async function listOrganisations(): Promise<SchoolOrganisation[]> {
  const { data, error } = await supabase.rpc('elda_skola_admin_organisations');
  if (error) fail(error);
  return (data ?? []) as SchoolOrganisation[];
}

export async function saveOrganisation(input: {
  id?: string | null;
  name: string;
  slug: string;
  contactEmail: string;
  active: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('elda_skola_admin_save_organisation', {
    p_id: input.id ?? null,
    p_name: input.name.trim(),
    p_slug: input.slug.trim().toLowerCase(),
    p_contact_email: input.contactEmail.trim() || null,
    p_active: input.active,
  });
  if (error) fail(error);
  return String(data ?? '');
}

export async function setOrganisationActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_admin_set_organisation_active', {
    p_id: id,
    p_active: active,
  });
  if (error) fail(error);
}

export async function listMemberships(): Promise<AdminMembership[]> {
  const { data, error } = await supabase.rpc('elda_skola_admin_memberships');
  if (error) fail(error);
  return (data ?? []) as AdminMembership[];
}

/** Kopplar ett konto till en skola. null tar bort kopplingen utan att radera kontot. */
export async function assignMembership(userId: string, organisationId: string | null): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_admin_assign_membership', {
    p_user: userId,
    p_org: organisationId,
  });
  if (error) fail(error);
}

// ----------------------------------------------------------- publiceringar

export async function listPublications(): Promise<Publication[]> {
  const { data, error } = await supabase.rpc('elda_skola_list_publications');
  if (error) fail(error);
  return (data ?? []) as Publication[];
}

export async function listAdminPublications(): Promise<AdminPublication[]> {
  const { data, error } = await supabase.rpc('elda_skola_admin_publications');
  if (error) fail(error);
  return (data ?? []) as AdminPublication[];
}

export async function savePublication(input: {
  id?: string | null;
  kind: PublicationKind;
  title: string;
  summary: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  status: PublicationStatus;
  organisationIds: string[] | null;
  roles: string[] | null;
  userIds: string[] | null;
  publishAt: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('elda_skola_admin_save_publication', {
    p_id: input.id ?? null,
    p_kind: input.kind,
    p_title: input.title.trim(),
    p_summary: input.summary.trim() || null,
    p_body: input.body.trim() || null,
    p_link_url: input.linkUrl.trim() || null,
    p_link_label: input.linkLabel.trim() || null,
    p_status: input.status,
    p_organisation_ids: input.organisationIds?.length ? input.organisationIds : null,
    p_roles: input.roles?.length ? input.roles : null,
    p_user_ids: input.userIds?.length ? input.userIds : null,
    p_publish_at: input.publishAt,
  });
  if (error) fail(error);
  return String(data ?? '');
}

export async function setPublicationStatus(
  id: string,
  status: PublicationStatus,
): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_admin_set_publication_status', {
    p_id: id,
    p_status: status,
  });
  if (error) fail(error);
}

// ------------------------------------------------------ systemmeddelanden

export async function sendSystemMessage(input: {
  subject: string;
  body: string;
  organisationIds: string[];
  roles: string[];
  userIds: string[];
}): Promise<number> {
  const { data, error } = await supabase.rpc('elda_skola_send_system_message', {
    p_subject: input.subject.trim(),
    p_body: input.body.trim(),
    p_organisation_ids: input.organisationIds.length ? input.organisationIds : null,
    p_roles: input.roles.length ? input.roles : null,
    p_user_ids: input.userIds.length ? input.userIds : null,
  });
  if (error) fail(error);
  return Number(data ?? 0);
}

export interface AudienceRow {
  user_id: string;
  display_name: string;
  username: string;
  role: string;
  organisation_name: string;
}

/** Vilka som skulle få ett systemutskick. Endast systemadministratören. */
export async function systemMessageAudience(input: {
  organisationIds: string[];
  roles: string[];
  userIds: string[];
}): Promise<AudienceRow[]> {
  const { data, error } = await supabase.rpc('elda_skola_system_message_audience', {
    p_organisation_ids: input.organisationIds.length ? input.organisationIds : null,
    p_roles: input.roles.length ? input.roles : null,
    p_user_ids: input.userIds.length ? input.userIds : null,
  });
  if (error) fail(error);
  return (data ?? []) as AudienceRow[];
}

// ---------------------------------------------------- gemensamma meddelanden

export async function listMessageContacts(): Promise<MessageContact[]> {
  const { data, error } = await supabase.rpc('list_message_contacts');
  if (error) fail(error);
  return (data ?? []) as MessageContact[];
}

/** Alla mina konversationer med oläst antal och arkivstatus. */
export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('elda_skola_conversations');
  if (error) fail(error);
  return (data ?? []) as Conversation[];
}

/** Konversationer där jag har skickat minst ett meddelande. */
export async function listSentConversations(): Promise<SentConversation[]> {
  const { data, error } = await supabase.rpc('elda_skola_sent_conversations');
  if (error) fail(error);
  return (data ?? []) as SentConversation[];
}

export async function listChannelMessages(channelId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc('elda_skola_list_channel_messages', {
    p_channel: channelId,
  });
  if (error) fail(error);
  return ((data ?? []) as ChatMessage[]).map((row) => ({
    ...row,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  }));
}

/**
 * Skickar ett meddelande. Formaterat innehåll saneras i klienten före sändning
 * och kontrolleras igen av servern, som också kopplar bilagorna till meddelandet.
 */
export async function sendChannelMessage(
  channelId: string,
  body: string,
  options: { bodyHtml?: string; attachmentIds?: string[] } = {},
): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_send_rich_message', {
    p_channel: channelId,
    p_body: body,
    p_body_html: options.bodyHtml?.trim() ? options.bodyHtml : null,
    p_attachment_ids: options.attachmentIds?.length ? options.attachmentIds : null,
  });
  if (error) fail(error);
}

/** Arkiverad-markering per användare. */
export async function archiveChannel(channelId: string, archived: boolean): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_archive_channel', {
    p_channel: channelId,
    p_archived: archived,
  });
  if (error) fail(error);
}

/** Totalt antal olästa meddelanden, för menyns badge. */
export async function unreadTotal(): Promise<number> {
  const { data, error } = await supabase.rpc('elda_skola_unread_total');
  if (error) fail(error);
  return Number(data ?? 0);
}

/** Oskickade bilagor i den egna kladden för en konversation. */
export async function pendingAttachments(channelId: string): Promise<PendingAttachment[]> {
  const { data, error } = await supabase.rpc('elda_skola_pending_attachments', {
    p_channel: channelId,
  });
  if (error) fail(error);
  return (data ?? []) as PendingAttachment[];
}

export async function openDirectChannel(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_direct_channel', { p_other: otherId });
  if (error) fail(error);
  return String(data ?? '');
}

export async function markChannelRead(channelId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_channel_read', { p_channel: channelId });
  if (error) fail(error);
}

// --------------------------------------------------------- speciallärare

export async function listSpecialStudents(): Promise<SpecialStudent[]> {
  const { data, error } = await supabase.rpc('elda_skola_my_special_students');
  if (error) fail(error);
  return (data ?? []) as SpecialStudent[];
}

export async function linkSpecialStudent(studentId: string): Promise<void> {
  const { error } = await supabase.rpc('elda_skola_link_student', { p_student: studentId });
  if (error) fail(error);
}

// --------------------------------------------------------------- kalenderhjälp

/** @deprecated Använd isTaskOpen i lib/submissions.ts. */
export function taskIsOpen(task: Task): boolean {
  return task.status !== 'klar' && !task.submitted_at;
}

export function isOverdue(date: string | null): boolean {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${date}T23:59:59`).getTime() < today.getTime();
}
