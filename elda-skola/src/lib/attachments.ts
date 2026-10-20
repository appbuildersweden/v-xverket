import { supabase, errorMessage } from './supabase';
import type { InformationAttachment, PendingAttachment } from './types';

/**
 * Bilagor till meddelanden.
 *
 * Filer laddas upp till den privata bucketen `elda-meddelanden` under den egna
 * användarmappen. Åtkomst till en skickad fil kräver åtkomst till
 * konversationen, vilket i sin tur kräver samma skolorganisation – det avgörs
 * av Storage-policyerna, inte av gränssnittet. Nedladdning sker alltid via en
 * kortlivad signerad länk.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Filtyper som får bifogas, enligt skolans regler. */
export const ALLOWED_ATTACHMENT_TYPES: Array<{ mime: string; label: string; ext: string[] }> = [
  { mime: 'application/pdf', label: 'PDF', ext: ['pdf'] },
  { mime: 'text/plain', label: 'Text', ext: ['txt'] },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
    ext: ['docx'],
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel',
    ext: ['xlsx'],
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint',
    ext: ['pptx'],
  },
  { mime: 'image/png', label: 'PNG', ext: ['png'] },
  { mime: 'image/jpeg', label: 'JPG', ext: ['jpg', 'jpeg'] },
];

const MIME_BY_EXT = new Map<string, string>();
for (const type of ALLOWED_ATTACHMENT_TYPES) {
  for (const ext of type.ext) MIME_BY_EXT.set(ext, type.mime);
}

export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.flatMap((type) =>
  type.ext.map((ext) => `.${ext}`),
).join(',');

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

/**
 * Validerar en fil innan uppladdning. Kontrollerar namn, storlek och typ – både
 * webbläsarens MIME-typ och filändelsen, så att en felaktigt märkt fil avvisas.
 */
export function validateAttachment(file: File): string | null {
  if (!file.name.trim()) return 'Välj en fil.';
  if (file.size === 0) return 'Filen är tom.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Filen är för stor. Max 10 MB.';

  const ext = extensionOf(file.name);
  const expected = MIME_BY_EXT.get(ext);
  if (!expected) {
    return 'Filtypen stöds inte. Välj PDF, DOCX, XLSX, PPTX, TXT, PNG eller JPG.';
  }
  if (file.type && file.type !== expected) {
    // Vissa system rapporterar tom eller generisk typ; då räcker ändelsen.
    if (file.type !== 'application/octet-stream') {
      return 'Filen verkar inte vara av den typ som filnamnet anger.';
    }
  }
  return null;
}

export function attachmentSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
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

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Din session har gått ut. Logga in igen.');
  return data.user.id;
}

/** Laddar upp en fil och registrerar den som en oskickad bilaga. */
export async function uploadAttachment(
  channelId: string,
  file: File,
): Promise<PendingAttachment> {
  const problem = validateAttachment(file);
  if (problem) throw new Error(problem);

  const userId = await uid();
  const path = `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from('elda-meddelanden')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    if (/bucket|not found/i.test(uploadError.message)) {
      throw new Error(
        'Fillagringen är inte konfigurerad. Skapa den privata bucketen elda-meddelanden i Supabase och försök igen.',
      );
    }
    throw new Error(errorMessage(uploadError, 'Filen kunde inte laddas upp.'));
  }

  const { data, error } = await supabase
    .from('message_attachments')
    .insert({
      channel_id: channelId,
      uploader_id: userId,
      file_name: file.name.slice(0, 200),
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select('id, file_name, mime_type, size_bytes, created_at, storage_path')
    .single();

  if (error || !data) {
    await supabase.storage.from('elda-meddelanden').remove([path]);
    throw new Error(errorMessage(error, 'Bilagan kunde inte registreras.'));
  }

  return data as PendingAttachment;
}

/** Tar bort en oskickad bilaga. Skickade bilagor kan inte tas bort. */
export async function deletePendingAttachment(
  attachment: Pick<PendingAttachment, 'id' | 'storage_path'>,
): Promise<void> {
  const { error } = await supabase
    .from('message_attachments')
    .delete()
    .eq('id', attachment.id)
    .is('message_id', null);
  if (error) throw new Error(errorMessage(error, 'Bilagan kunde inte tas bort.'));
  await supabase.storage.from('elda-meddelanden').remove([attachment.storage_path]);
}

/**
 * Laddar upp en bilaga till ett informationsutskick. Filen hamnar i den egna
 * mappen i samma privata bucket; läsrätten följer utskicket via
 * Storage-policyn, så bara klassens elever och personalen kan öppna den.
 */
export async function uploadInformationAttachment(file: File): Promise<InformationAttachment> {
  const problem = validateAttachment(file);
  if (problem) throw new Error(problem);

  const userId = await uid();
  const path = `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;

  const { error } = await supabase.storage
    .from('elda-meddelanden')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) {
    if (/bucket|not found/i.test(error.message)) {
      throw new Error(
        'Fillagringen är inte konfigurerad. Skapa den privata bucketen elda-meddelanden i Supabase och försök igen.',
      );
    }
    throw new Error(errorMessage(error, 'Filen kunde inte laddas upp.'));
  }

  return {
    file_name: file.name.slice(0, 200),
    storage_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
  };
}

/** Tar bort en bilaga som aldrig skickades iväg. */
export async function removeInformationAttachment(storagePath: string): Promise<void> {
  await supabase.storage.from('elda-meddelanden').remove([storagePath]);
}

/** Kortlivad signerad länk till en bilaga. Åtkomsten kontrolleras av Storage. */
export async function attachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('elda-meddelanden')
    .createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) {
    throw new Error(errorMessage(error, 'Filen kunde inte öppnas.'));
  }
  return data.signedUrl;
}

/** Öppnar bilagan i en ny flik via en signerad länk. */
export async function openAttachment(storagePath: string): Promise<void> {
  const url = await attachmentUrl(storagePath);
  window.open(url, '_blank', 'noopener,noreferrer');
}
