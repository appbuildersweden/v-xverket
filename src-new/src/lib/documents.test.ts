import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentRow,
  MAX_FILE_BYTES,
  MAX_TITLE_LENGTH,
  createDocumentUrl,
  documentFileName,
  documentKindLabel,
  filterDocuments,
  formatBytes,
  groupDocumentsBySubject,
  updateDocument,
  validateDocumentMeta,
  validateUpload,
} from './documents';

/**
 * Dokumentens hjälpfunktioner och anropen mot lagringen.
 *
 * Databasanropet är mockat, så att testet ser exakt vilka fält som skickas (t.ex.
 * att nedladdningslänken får filens namn) och vilka filer som visas i listan.
 * Själva behörigheten — vem som får läsa en fil — ligger i RLS och provas mot en
 * riktig databas.
 */
const mocks = vi.hoisted(() => ({
  signedUrlArgs: [] as unknown[],
  updateFields: null as Record<string, unknown> | null,
  updateError: null as unknown,
}));

vi.mock('./auth-supabase', () => ({
  getOrCreateSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'elev-1' } } }) },
    storage: {
      from: () => ({
        createSignedUrl: async (...args: unknown[]) => {
          mocks.signedUrlArgs = args;
          return { data: { signedUrl: 'https://example.test/fil' }, error: null };
        },
      }),
    },
    from: () => {
      const builder = {
        update: (fields: Record<string, unknown>) => {
          mocks.updateFields = fields;
          return builder;
        },
        eq: () => builder,
        select: () => builder,
        single: async () => ({ data: { id: 'doc-1', ...mocks.updateFields }, error: mocks.updateError }),
      };
      return builder;
    },
  }),
}));

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    owner_id: 'spec-1',
    title: 'Arbetsblad bråk',
    description: null,
    subject: 'Matematik',
    storage_path: 'spec-1/6f9a1f52-1111-2222-3333-444455556666-arbetsblad.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    student_id: 'elev-1',
    class_id: null,
    task_id: null,
    created_at: '2026-10-12T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mocks.signedUrlArgs = [];
  mocks.updateFields = null;
  mocks.updateError = null;
});

describe('filnamn och filtyp', () => {
  it('visar filens namn utan den slumpade delen', () => {
    expect(documentFileName(row())).toBe('arbetsblad.pdf');
    expect(
      documentFileName(row({ storage_path: 'elev-1/abc_utan-uuid.docx' })),
    ).toBe('abc_utan-uuid.docx');
  });

  it('känner igen filtypen ur mime-typ eller ändelse', () => {
    expect(documentKindLabel(row())).toBe('PDF');
    expect(documentKindLabel(row({ mime_type: 'image/png' }))).toBe('Bild');
    expect(documentKindLabel(row({ mime_type: 'text/plain' }))).toBe('Text');
    expect(
      documentKindLabel(
        row({
          mime_type:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
    ).toBe('Excel');
    expect(documentKindLabel(row({ mime_type: null, storage_path: 'elev-1/x.pptx' }))).toBe(
      'PowerPoint',
    );
    // Okänd typ visas som en vanlig fil — aldrig som något den inte är.
    expect(documentKindLabel(row({ mime_type: null, storage_path: 'elev-1/x.bin' }))).toBe(
      'Fil',
    );
  });
});

describe('sökning och gruppering', () => {
  const rows = [
    row({ id: 'a', subject: 'Matematik', title: 'Bråk' }),
    row({ id: 'b', subject: null, title: 'Läslogg' }),
    row({ id: 'c', subject: 'Svenska', title: 'Bokrecension' }),
    row({ id: 'd', subject: 'Matematik', title: 'Geometri', description: 'Area och omkrets' }),
  ];

  it('grupperar per ämne och lägger dokument utan ämne under Övrigt', () => {
    const groups = groupDocumentsBySubject(rows);
    expect(groups.map((g) => g.subject)).toEqual(['Matematik', 'Svenska', 'Övrigt']);
    expect(groups[0].documents.map((d) => d.id)).toEqual(['a', 'd']);
  });

  it('filtrerar på ämne och fritext, även filnamn och beskrivning', () => {
    expect(filterDocuments(rows, { subject: 'Svenska' }).map((d) => d.id)).toEqual(['c']);
    expect(filterDocuments(rows, { subject: 'Övrigt' }).map((d) => d.id)).toEqual(['b']);
    expect(filterDocuments(rows, { query: 'geometri' }).map((d) => d.id)).toEqual(['d']);
    expect(filterDocuments(rows, { query: 'omkrets' }).map((d) => d.id)).toEqual(['d']);
    expect(filterDocuments(rows, { query: 'arbetsblad' }).map((d) => d.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(filterDocuments(rows, { query: 'ingenting' })).toEqual([]);
  });
});

describe('validering', () => {
  it('godkänner bara rimliga filer', () => {
    expect(validateUpload({ name: '', size: 10, type: 'text/plain' })).toMatch(/välj en fil/i);
    expect(validateUpload({ name: 'a.txt', size: 0, type: 'text/plain' })).toMatch(/tom/i);
    expect(
      validateUpload({ name: 'stor.zip', size: MAX_FILE_BYTES + 1, type: 'application/zip' }),
    ).toMatch(/för stor/i);
    expect(validateUpload({ name: 'skript.exe', size: 10, type: 'application/x-msdownload' })).toMatch(
      /stöds inte/i,
    );
    expect(validateUpload({ name: 'prov.pdf', size: 10, type: 'application/pdf' })).toBeNull();
  });

  it('kräver en titel och begränsar längden', () => {
    expect(validateDocumentMeta('')).toMatch(/titel/i);
    expect(validateDocumentMeta('x'.repeat(MAX_TITLE_LENGTH + 1))).toMatch(/för lång/i);
    expect(validateDocumentMeta('Bråk', 'Ett stycke')).toBeNull();
  });

  it('visar filstorlekar läsbart', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2,0 MB');
  });
});

describe('nedladdningslänk', () => {
  it('ber om en nedladdningslänk med filens namn', async () => {
    const result = await createDocumentUrl(row(), { download: true });
    expect(result).toEqual({ ok: true, data: 'https://example.test/fil' });
    expect(mocks.signedUrlArgs[0]).toBe(row().storage_path);
    expect(mocks.signedUrlArgs[2]).toEqual({ download: 'arbetsblad.pdf' });
  });

  it('ber om en vanlig länk när filen bara ska öppnas', async () => {
    await createDocumentUrl(row());
    expect(mocks.signedUrlArgs[2]).toEqual({ download: undefined });
  });
});

describe('metadata', () => {
  it('skickar bara de fält som ändrats', async () => {
    const result = await updateDocument('doc-1', { subject: 'Svenska', taskId: 'task-9' });
    expect(result.ok).toBe(true);
    expect(mocks.updateFields).toEqual({ subject: 'Svenska', task_id: 'task-9' });
  });

  it('rensar tomma fält i stället för att spara tomma strängar', async () => {
    await updateDocument('doc-1', { description: '   ', subject: '' });
    expect(mocks.updateFields).toEqual({ description: null, subject: null });
  });

  it('vägrar spara en titel som är tom', async () => {
    const result = await updateDocument('doc-1', { title: '  ' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/titel/i);
    expect(mocks.updateFields).toBeNull();
  });

  it('klär ett databasfel i begriplig svenska', async () => {
    mocks.updateError = { message: 'row-level security policy' };
    const result = await updateDocument('doc-1', { title: 'Ny titel' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/behörighet/i);
  });
});
