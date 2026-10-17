/**
 * Dokument och undervisningsmaterial.
 *
 * Filerna ligger i den privata Supabase-bucketen `elda-dokument`. En fil är
 * aldrig offentlig: den nås bara via en signerad länk, och bara av den som får
 * läsa dokumentraden — ägaren, eleven materialet delats med, klassens medlemmar,
 * kopplad personal eller admin (se `can_see_document` i databasen). Klasskamrater
 * kommer inte åt en elevs egna filer eller material som delats med en enskild elev.
 * Varje fil lagras i uppladdarens egen mapp, vilket också är vad åtkomstreglerna
 * kontrollerar.
 *
 * Ett dokument kan kopplas till en uppgift (`task_id`): material som personalen
 * lägger till i uppgiften, eller en fil som eleven lämnar in. Kopplingen ändrar
 * aldrig vem som får läsa filen — den avgörs av reglerna ovan.
 *
 * Om bucketen eller rättigheterna inte finns i projektet ännu visas ett tydligt
 * meddelande i gränssnittet i stället för en uppladdningsknapp som inte gör
 * något.
 */
import { Result, withClient } from './db';

export const BUCKET = 'elda-dokument';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 3600;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;

/** Filtyper som får laddas upp. Håller listan kort och förutsägbar. */
export const ALLOWED_MIME: readonly string[] = [
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

export interface DocumentRow {
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
  /** Uppgiften dokumentet hör till, om det är kopplat till en. */
  task_id: string | null;
  created_at: string;
}

export interface UploadInput {
  file: File;
  title: string;
  description: string;
  subject: string;
  studentId: string | null;
  classId: string | null;
  /** Kopplar filen till en uppgift (material eller inlämning). */
  taskId?: string | null;
}

/** Validerar en fil innan den laddas upp. Null betyder att allt är ok. */
export function validateUpload(file: { name: string; size: number; type: string }): string | null {
  if (!file.name.trim()) return 'Välj en fil först.';
  if (file.size === 0) return 'Filen är tom.';
  if (file.size > MAX_FILE_BYTES) {
    return `Filen är för stor. Max ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  if (file.type && !ALLOWED_MIME.includes(file.type)) {
    return 'Filtypen stöds inte. Ladda upp PDF, bild, text, Word, Excel, PowerPoint eller zip.';
  }
  return null;
}

/** Validerar titel och beskrivning. Null betyder att allt är ok. */
export function validateDocumentMeta(title: string, description = ''): string | null {
  if (!title.trim()) return 'Ge dokumentet en titel.';
  if (title.trim().length > MAX_TITLE_LENGTH) {
    return `Titeln är för lång (max ${MAX_TITLE_LENGTH} tecken).`;
  }
  if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
    return `Beskrivningen är för lång (max ${MAX_DESCRIPTION_LENGTH} tecken).`;
  }
  return null;
}

/** '2,4 MB' — för filstorlekar i listor. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} kB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Filens namn, utan den slumpade delen och mappen. Filen lagras som
 * `<användar-id>/<uuid>-<namn>`; användaren ska se namnet den laddade upp.
 */
export function documentFileName(row: Pick<DocumentRow, 'storage_path' | 'title'>): string {
  const last = row.storage_path.split('/').pop() ?? '';
  const withoutId = last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
  return withoutId || last || row.title;
}

/**
 * Kort etikett för filtypen, så att eleven ser vad filen är. Den uppladdade
 * filens egen typ (mime) väger tyngst — filnamnets ändelse används bara när
 * typen inte är känd.
 */
export function documentKindLabel(row: Pick<DocumentRow, 'mime_type' | 'storage_path'>): string {
  const mime = (row.mime_type ?? '').toLowerCase();
  const extension = (row.storage_path.split('.').pop() ?? '').toLowerCase();

  if (mime) {
    if (mime === 'application/pdf') return 'PDF';
    if (mime.startsWith('image/')) return 'Bild';
    if (mime.startsWith('text/')) return 'Text';
    if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word';
    if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'Excel';
    if (mime.includes('presentationml')) return 'PowerPoint';
    if (mime === 'application/zip') return 'Zip';
  }

  if (extension === 'pdf') return 'PDF';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) return 'Bild';
  if (['txt', 'csv'].includes(extension)) return 'Text';
  if (['doc', 'docx'].includes(extension)) return 'Word';
  if (['xls', 'xlsx'].includes(extension)) return 'Excel';
  if (['ppt', 'pptx'].includes(extension)) return 'PowerPoint';
  if (extension === 'zip') return 'Zip';
  return 'Fil';
}

/** Grupperar dokument per ämne. Utan ämne hamnar de under 'Övrigt'. */
export function groupDocumentsBySubject(
  rows: readonly DocumentRow[],
): Array<{ subject: string; documents: DocumentRow[] }> {
  const map = new Map<string, DocumentRow[]>();
  for (const row of rows) {
    const subject = row.subject?.trim() || 'Övrigt';
    const list = map.get(subject) ?? [];
    list.push(row);
    map.set(subject, list);
  }
  return [...map.entries()]
    .map(([subject, documents]) => ({ subject, documents }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'sv'));
}

/** Filtrerar dokumentlistan på fritext och ämne. */
export function filterDocuments(
  rows: readonly DocumentRow[],
  options: { subject?: string; query?: string } = {},
): DocumentRow[] {
  const text = (options.query ?? '').trim().toLowerCase();
  return rows.filter((row) => {
    if (options.subject && (row.subject?.trim() || 'Övrigt') !== options.subject) return false;
    if (text) {
      const haystack = `${row.title} ${documentFileName(row)} ${row.subject ?? ''} ${
        row.description ?? ''
      }`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

/** Ett läsbart filnamn, utan tecken som ställer till problem i en lagringsväg. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'fil';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return cleaned || 'fil';
}

function looksMissing(error: unknown): boolean {
  const message = String(
    typeof error === 'string' ? error : ((error as { message?: unknown })?.message ?? ''),
  );
  return /bucket not found|does not exist|not found|object not found/i.test(message);
}

export async function listDocuments(
  filter: {
    studentId?: string;
    classId?: string;
    taskId?: string;
    mineOnly?: boolean;
  } = {},
): Promise<Result<DocumentRow[]>> {
  return withClient(async (sup) => {
    let request = sup
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter.studentId) request = request.eq('student_id', filter.studentId);
    if (filter.classId) request = request.eq('class_id', filter.classId);
    if (filter.taskId) request = request.eq('task_id', filter.taskId);
    if (filter.mineOnly) {
      const { data: userData } = await sup.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Din session har gått ut. Logga in igen.');
      request = request.eq('owner_id', uid);
    }

    const { data, error } = await request;
    if (error) throw error;
    return (data ?? []) as DocumentRow[];
  });
}

/**
 * Kontrollerar om fillagringen är konfigurerad. Returnerar false när bucketen
 * saknas, så att gränssnittet kan visa ett tydligt meddelande i stället för en
 * uppladdning som inte fungerar.
 */
export async function storageReady(): Promise<Result<boolean>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { error } = await sup.storage.from(BUCKET).list(uid, { limit: 1 });
    if (!error) return true;
    if (looksMissing(error)) return false;
    throw error;
  });
}

export async function uploadDocument(input: UploadInput): Promise<Result<DocumentRow>> {
  return withClient(async (sup) => {
    const problem = validateUpload(input.file) ?? validateDocumentMeta(input.title, input.description);
    if (problem) throw new Error(problem);

    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    // Filnamnet får ett unikt prefix, så att två filer med samma namn aldrig
    // skriver över varandra.
    const path = `${uid}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;

    const { error: uploadErr } = await sup.storage
      .from(BUCKET)
      .upload(path, input.file, {
        contentType: input.file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadErr) {
      if (looksMissing(uploadErr)) {
        throw new Error(
          'Fillagringen är inte konfigurerad. En administratör behöver köra migreringen som skapar bucketen elda-dokument.',
        );
      }
      throw uploadErr;
    }

    const { data, error } = await sup
      .from('documents')
      .insert({
        owner_id: uid,
        title: input.title.trim() || input.file.name,
        description: input.description.trim() || null,
        subject: input.subject.trim() || null,
        storage_path: path,
        mime_type: input.file.type || null,
        size_bytes: input.file.size,
        student_id: input.studentId,
        class_id: input.classId,
        task_id: input.taskId ?? null,
      })
      .select()
      .single();

    if (error) {
      // Ingen föräldralös fil: tas raden inte med ska filen inte ligga kvar.
      await sup.storage.from(BUCKET).remove([path]);
      throw error;
    }
    return data as DocumentRow;
  });
}

export interface DocumentPatch {
  title?: string;
  description?: string | null;
  subject?: string | null;
  /** Kopplar dokumentet till en uppgift, eller lossar det (null). */
  taskId?: string | null;
}

/**
 * Uppdaterar titel, ämne, beskrivning eller uppgiftskoppling. Servern kräver att
 * användaren äger dokumentet (eller är administratör) — den som bara får läsa en
 * fil kan aldrig ändra den.
 */
export async function updateDocument(
  id: string,
  patch: DocumentPatch,
): Promise<Result<DocumentRow>> {
  return withClient(async (sup) => {
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      const problem = validateDocumentMeta(patch.title, patch.description ?? '');
      if (problem) throw new Error(problem);
      fields.title = patch.title.trim();
    }
    if (patch.description !== undefined) {
      fields.description = patch.description?.trim() || null;
    }
    if (patch.subject !== undefined) fields.subject = patch.subject?.trim() || null;
    if (patch.taskId !== undefined) fields.task_id = patch.taskId;

    if (Object.keys(fields).length === 0) throw new Error('Inget att spara.');

    const { data, error } = await sup
      .from('documents')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as DocumentRow;
  });
}

/** Tar bort både dokumentraden och filen. */
export async function deleteDocument(row: DocumentRow): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('documents').delete().eq('id', row.id);
    if (error) throw error;
    const { error: removeErr } = await sup.storage.from(BUCKET).remove([row.storage_path]);
    if (removeErr && !looksMissing(removeErr)) throw removeErr;
    return true as const;
  });
}

/**
 * Tillfällig, signerad länk till filen. Gäller i en timme.
 *
 * Med `download: true` får länken filen att laddas ner i stället för att öppnas,
 * och filnamnet blir det användaren känner igen.
 */
export async function createDocumentUrl(
  row: DocumentRow,
  options: { download?: boolean } = {},
): Promise<Result<string>> {
  return withClient(async (sup) => {
    const downloadName = documentFileName(row);
    const { data, error } = await sup.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS, {
        download: options.download ? downloadName : undefined,
      });
    if (error) {
      if (looksMissing(error)) {
        throw new Error(
          `Filen "${row.title}" finns inte i lagringen längre. Be din lärare ladda upp den igen.`,
        );
      }
      throw error;
    }
    const url = data?.signedUrl;
    if (!url) throw new Error(`Kunde inte skapa en länk till "${row.title}".`);
    return url;
  });
}
