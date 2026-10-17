import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ThemeProvider } from '../theme';
import type { AssignedTask } from '../lib/assignments';
import type { AuthServiceBackend, VäxverketUser } from '../lib/auth-types';
import type { DocumentRow } from '../lib/documents';

/**
 * Dokument, undervisningsmaterial och inlämningar i gränssnittet.
 *
 * Datalagret är mockat (RLS och lagringen kräver en riktig databas), men testet
 * följer hela flödet: vad som visas, vilka anrop som skickas och vad som händer
 * efter en åtgärd. Behörigheten i sig — att en klasskamrat inte kommer åt en
 * elevs fil — ligger i databasen och testas där (supabase/tests).
 */
const mocks = vi.hoisted(() => ({
  backend: null as unknown,
  listDocuments: vi.fn(),
  storageReady: vi.fn(),
  createDocumentUrl: vi.fn(),
  uploadDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  listMyTasks: vi.fn(),
  listAssignedTasks: vi.fn(),
  createAssignedTask: vi.fn(),
  updateAssignedTask: vi.fn(),
  deleteAssignedTask: vi.fn(),
  markFollowUp: vi.fn(),
  listMyStudents: vi.fn(),
  listStaffAccounts: vi.fn(),
  listClasses: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  createAuthBackend: () => mocks.backend,
}));

vi.mock('../lib/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documents')>();
  return {
    ...actual,
    listDocuments: mocks.listDocuments,
    storageReady: mocks.storageReady,
    createDocumentUrl: mocks.createDocumentUrl,
    uploadDocument: mocks.uploadDocument,
    updateDocument: mocks.updateDocument,
    deleteDocument: mocks.deleteDocument,
  };
});

vi.mock('../lib/assignments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assignments')>();
  return {
    ...actual,
    listMyTasks: mocks.listMyTasks,
    listAssignedTasks: mocks.listAssignedTasks,
    createAssignedTask: mocks.createAssignedTask,
    updateAssignedTask: mocks.updateAssignedTask,
    deleteAssignedTask: mocks.deleteAssignedTask,
    markFollowUp: mocks.markFollowUp,
  };
});

vi.mock('../lib/students', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/students')>();
  return {
    ...actual,
    listMyStudents: mocks.listMyStudents,
    listStaffAccounts: mocks.listStaffAccounts,
  };
});

vi.mock('../lib/classes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/classes')>();
  return { ...actual, listClasses: mocks.listClasses };
});

const ELEV: VäxverketUser = {
  id: 'elev-1',
  username: 'eanna01',
  role: 'elev',
  active: true,
  mustChangePassword: false,
};

const SPECIALLARARE: VäxverketUser = {
  id: 'spec-1',
  username: 'eelda01',
  role: 'speciallärare',
  active: true,
  mustChangePassword: false,
};

function document(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    owner_id: 'spec-1',
    title: 'Arbetsblad bråk',
    description: 'Träna bråk.',
    subject: 'Matematik',
    storage_path: 'spec-1/6f9a1f52-1111-2222-3333-444455556666-arbetsblad.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    student_id: 'elev-1',
    class_id: null,
    task_id: 't1',
    created_at: '2026-10-12T10:00:00Z',
    ...overrides,
  };
}

function task(overrides: Partial<AssignedTask> = {}): AssignedTask {
  return {
    id: 't1',
    created_by: 'spec-1',
    student_id: 'elev-1',
    class_id: null,
    title: 'Träna bråk',
    description: 'Gör klart arbetsbladet.',
    instructions: 'Visa uträkningen.',
    subject: 'Matematik',
    due_date: '2026-10-20',
    status: 'pagar',
    submission: null,
    submitted_at: null,
    completed_at: null,
    xp_awarded: false,
    follow_up: false,
    follow_up_note: null,
    followed_up_at: null,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    student_username: 'eanna01',
    ...overrides,
  };
}

function makeBackend(session: { exists: boolean; user?: VäxverketUser }) {
  const backend = {
    login: vi.fn(async () => ({ ok: false as const, error: 'Fel' })),
    logout: vi.fn(async () => undefined),
    getSession: vi.fn(async () => session),
    getCurrentUser: vi.fn(async () => session.user ?? null),
    suggestUsername: vi.fn(async () => ({ ok: true as const, username: '' })),
    createAccountWithUsername: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    createAccount: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
    completePasswordChange: vi.fn(async () => ({ ok: true as const })),
    listAccounts: vi.fn(async () => ({ ok: true as const, accounts: [] })),
    setAccountActive: vi.fn(async () => ({ ok: true as const })),
    changePassword: vi.fn(async () => ({ ok: false as const, error: 'ej tillåtet' })),
  } as unknown as AuthServiceBackend;
  mocks.backend = backend;
  return backend;
}

async function renderApp(hash: string) {
  window.history.replaceState(null, '', hash);
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Laddar…')).toBeNull());
}

let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.listDocuments.mockResolvedValue({ ok: true, data: [document()] });
  mocks.storageReady.mockResolvedValue({ ok: true, data: true });
  mocks.createDocumentUrl.mockResolvedValue({ ok: true, data: 'https://example.test/fil' });
  mocks.uploadDocument.mockResolvedValue({ ok: true, data: document({ owner_id: 'elev-1' }) });
  mocks.updateDocument.mockResolvedValue({ ok: true, data: document() });
  mocks.deleteDocument.mockResolvedValue({ ok: true, data: true });
  mocks.listMyTasks.mockResolvedValue({ ok: true, data: [task()] });
  mocks.listAssignedTasks.mockResolvedValue({ ok: true, data: [task()] });
  mocks.createAssignedTask.mockResolvedValue({ ok: true, data: task() });
  mocks.updateAssignedTask.mockResolvedValue({ ok: true, data: true });
  mocks.deleteAssignedTask.mockResolvedValue({ ok: true, data: true });
  mocks.markFollowUp.mockResolvedValue({ ok: true, data: true });
  mocks.listMyStudents.mockResolvedValue({
    ok: true,
    data: [{ id: 'elev-1', username: 'eanna01', account_type: 'skola', class_id: null, class_name: null }],
  });
  mocks.listStaffAccounts.mockResolvedValue({ ok: true, data: [] });
  mocks.listClasses.mockResolvedValue({ ok: true, data: [] });
  // jsdom har ingen flik att öppna i; anropet fångas i stället för att kasta.
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  mocks.backend = null;
  openSpy.mockRestore();
  vi.clearAllMocks();
});

describe('elevens dokument', () => {
  it('visar filnamn, filtyp, ämne och vilken uppgift filen hör till', async () => {
    makeBackend({ exists: true, user: ELEV });
    await renderApp('#/elev/dokument');

    expect(await screen.findByTestId('page-elev-dokument')).toBeTruthy();
    expect(await screen.findByText('Arbetsblad bråk')).toBeTruthy();
    expect(screen.getByText(/arbetsblad\.pdf/)).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
    expect(screen.getByText(/Till uppgiften: Träna bråk/)).toBeTruthy();
    expect(screen.getByTestId('document-group-Matematik')).toBeTruthy();
  });

  it('laddar ner filen med en nedladdningslänk och visar fel med filens namn', async () => {
    makeBackend({ exists: true, user: ELEV });
    await renderApp('#/elev/dokument');
    await screen.findByText('Arbetsblad bråk');

    const row = screen.getByText('Arbetsblad bråk').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Ladda ner/ }));
    await waitFor(() =>
      expect(mocks.createDocumentUrl).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc-1' }),
        { download: true },
      ),
    );
    expect(openSpy).toHaveBeenCalledWith('https://example.test/fil', '_blank', 'noopener,noreferrer');

    mocks.createDocumentUrl.mockResolvedValue({
      ok: false,
      error: 'Filen "Arbetsblad bråk" finns inte i lagringen längre.',
    });
    fireEvent.click(within(row).getByRole('button', { name: /Öppna/ }));
    const error = await screen.findByTestId('document-error');
    expect(error.textContent).toContain('Arbetsblad bråk');
  });
});

describe('undervisningsmaterial', () => {
  it('redigerar metadata och kopplar materialet till en uppgift', async () => {
    makeBackend({ exists: true, user: SPECIALLARARE });
    await renderApp('#/speciallarar/material');
    await screen.findByText('Arbetsblad bråk');

    fireEvent.click(screen.getByRole('button', { name: /Redigera/ }));
    // Etiketten kan innehålla en markering för obligatoriskt fält.
    const title = await screen.findByLabelText(/^Titel/);
    fireEvent.change(title, { target: { value: 'Arbetsblad bråk (v2)' } });
    fireEvent.change(screen.getByLabelText(/Koppla till uppgift/), { target: { value: 't1' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara ändringar/ }));

    await waitFor(() =>
      expect(mocks.updateDocument).toHaveBeenCalledWith('doc-1', {
        title: 'Arbetsblad bråk (v2)',
        subject: 'Matematik',
        description: 'Träna bråk.',
        taskId: 't1',
      }),
    );
  });

  it('filtrerar materialet på ämne och mottagare', async () => {
    makeBackend({ exists: true, user: SPECIALLARARE });
    mocks.listDocuments.mockResolvedValue({
      ok: true,
      data: [
        document({ id: 'doc-1', subject: 'Matematik' }),
        document({ id: 'doc-2', subject: 'Svenska', title: 'Läslogg', task_id: null, class_id: 'c1', student_id: null }),
      ],
    });
    await renderApp('#/speciallarar/material');
    await screen.findByText('Läslogg');

    fireEvent.click(screen.getByRole('button', { name: 'Svenska' }));
    expect(screen.queryByText('Arbetsblad bråk')).toBeNull();
    expect(screen.getByText('Läslogg')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Alla ämnen' }));
    fireEvent.change(screen.getByLabelText('Filtrera på mottagare'), { target: { value: 'klass' } });
    expect(screen.queryByText('Arbetsblad bråk')).toBeNull();
    expect(screen.getByText('Läslogg')).toBeTruthy();
  });
});

describe('material till uppgiften', () => {
  it('kopplar och lossar material när uppgiften sparas', async () => {
    makeBackend({ exists: true, user: SPECIALLARARE });
    await renderApp('#/speciallarar/uppfoljning');
    await screen.findByText('Träna bråk');

    fireEvent.click(screen.getByRole('button', { name: /Redigera/ }));
    const chip = await screen.findByRole('button', { name: /Arbetsblad bråk/ });
    // Dokumentet är redan kopplat till uppgiften — klicket lossar det.
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /Spara ändringar/ }));
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledWith('doc-1', { taskId: null }));
  });

  it('visar materialet i uppgiften hos eleven och tar emot en filinlämning', async () => {
    makeBackend({ exists: true, user: ELEV });
    await renderApp('#/elev/uppgifter');
    await screen.findByText('Träna bråk');

    fireEvent.click(screen.getByRole('button', { name: 'Öppna' }));
    const files = await screen.findByTestId('task-files-t1');
    expect(within(files).getByText('Material från din lärare')).toBeTruthy();
    expect(within(files).getByText('Arbetsblad bråk')).toBeTruthy();
    expect(mocks.listDocuments).toHaveBeenCalledWith({ taskId: 't1' });

    const input = within(files).getByLabelText('Lämna in en fil') as HTMLInputElement;
    const file = new File(['prov'], 'mitt-svar.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
          taskId: 't1',
          studentId: 'elev-1',
          classId: null,
        }),
      ),
    );
    expect(await within(files).findByTestId('task-files-notice')).toBeTruthy();
  });
});

describe('personalens uppföljning', () => {
  it('visar elevens inlämnade fil vid uppgiften', async () => {
    makeBackend({ exists: true, user: SPECIALLARARE });
    mocks.listAssignedTasks.mockResolvedValue({
      ok: true,
      data: [task({ submission: 'Mitt svar', submitted_at: '2026-10-15T10:00:00Z' })],
    });
    mocks.listDocuments.mockResolvedValue({
      ok: true,
      data: [
        document({ id: 'doc-9', owner_id: 'elev-1', title: 'mitt-svar.pdf', student_id: 'elev-1' }),
      ],
    });
    await renderApp('#/speciallarar/uppfoljning');

    const files = await screen.findByTestId('task-files-t1');
    // Filerna hämtas asynkront — vänta tills listan har laddats klart.
    expect(await within(files).findByText('Elevens inlämnade filer')).toBeTruthy();
    expect(within(files).getByText('mitt-svar.pdf')).toBeTruthy();
    // Personalen ser filen men kan inte ta bort elevens inlämning härifrån.
    expect(within(files).queryByRole('button', { name: 'Ta bort' })).toBeNull();
  });
});
