/** Gemensamma typer för Elda Skola. */

export type SchoolRole = 'lärare' | 'elev' | 'speciallärare' | 'admin' | 'okand';

export interface Identity {
  id: string;
  username: string;
  role: SchoolRole;
  accountType: 'skola' | 'privat';
  active: boolean;
  mustChangePassword: boolean;
  /** Tidpunkten då den aktuella sessionen skapades, om servern anger den. */
  lastSignInAt: string | null;
}

export interface Profile {
  id: string;
  username: string;
  role: SchoolRole;
  active: boolean;
  account_type: 'skola' | 'privat';
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  created_at: string;
}

export interface Contact {
  contact_email: string | null;
  phone: string | null;
  mobile: string | null;
  street_address: string | null;
  postal_address: string | null;
  alt_contact: string | null;
  updated_at: string | null;
}

export interface SchoolClass {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  member_role: 'elev' | 'larare';
  member_count: number;
  join_code: string | null;
  created_at: string;
}

export type TaskStatus = 'ej_paborjad' | 'pagar' | 'klar';

export interface Task {
  id: string;
  created_by: string;
  student_id: string | null;
  class_id: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  subject: string | null;
  due_date: string | null;
  status: TaskStatus;
  submission: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  follow_up: boolean;
  follow_up_note: string | null;
  followed_up_at: string | null;
  archived_at?: string | null;
  published?: boolean;
  created_at: string;
  updated_at: string;
  class_name?: string | null;
  student_name?: string | null;
  student_username?: string | null;
}

export type SubmissionStatus = 'utkast' | 'inlamnad' | 'aterlamnad' | 'granskad';

/** En elevs egen inlämning till en uppgift. */
export interface Submission {
  id: string;
  task_id: string;
  student_id: string;
  class_id: string | null;
  content: string | null;
  status: SubmissionStatus;
  feedback: string | null;
  feedback_at: string | null;
  reviewed_by: string | null;
  submitted_at: string | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
  /** Satt av servern när läraren godkänt inlämningen och XP har betalats ut. */
  xp_awarded?: boolean;
  /** När eleven har sett XP-popupen. Null betyder att den ännu inte visats. */
  xp_celebrated_at?: string | null;
  student_name?: string | null;
  student_username?: string | null;
  task_title?: string | null;
  task_subject?: string | null;
  task_due_date?: string | null;
}

export interface SchoolDocument {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  subject: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  student_id: string | null;
  class_id: string | null;
  task_id: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  class_id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  /** Antal elever som har läst meddelandet. */
  read_count?: number;
  /** Antal elever i mottagarklassen. */
  recipient_count?: number;
}

export interface Adaptation {
  id: string;
  student_id: string;
  student_name: string;
  class_id: string | null;
  class_name: string | null;
  subject: string | null;
  task_id: string | null;
  title: string;
  description: string | null;
  measures: string | null;
  status: 'aktiv' | 'avslutad';
  created_by: string;
  creator_name: string;
  created_at: string;
  updated_at: string;
}

export interface SchoolEvent {
  id: string;
  class_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  created_at: string;
  class_name?: string | null;
}

export interface Activity {
  id: string;
  class_id: string;
  class_name?: string | null;
  subject: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  kind: string;
  published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed?: boolean;
}

export interface StudentRow {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  account_type: 'skola' | 'privat';
  class_id: string;
  class_name: string;
  class_subject: string | null;
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

export interface CreatedStudent {
  username: string;
  initialPassword: string | null;
  mustChangePassword: boolean;
}

export interface RosterRow {
  id: string;
  username: string;
  display_name: string;
  member_role: 'elev' | 'larare';
}
