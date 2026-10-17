import React, { useState } from 'react';
import { AlertTriangle, Download, Eye, FileText, Search, Upload } from 'lucide-react';
import {
  DocumentRow,
  MAX_FILE_BYTES,
  SIGNED_URL_SECONDS,
  createDocumentUrl,
  deleteDocument,
  documentFileName,
  documentKindLabel,
  filterDocuments,
  formatBytes,
  groupDocumentsBySubject,
  listDocuments,
  storageReady,
  uploadDocument,
} from '../../lib/documents';
import { AssignedTask, listMyTasks } from '../../lib/assignments';
import { Result } from '../../lib/db';
import { formatDate } from '../../lib/dates';
import { useAuth } from '../../lib/AuthContext';
import { AsyncState, useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PartialDataNotice,
  Pill,
  SectionCard,
  Toolbar,
} from '../../components/ui';
import { ConfirmButton, Modal, TextField } from '../../components/forms';
import { Panel } from '../../lib/auth-types';
import { studentCopy, studentPageTestId } from '../../lib/panel-copy';

interface Data {
  documents: DocumentRow[];
  storage: boolean;
  tasks: AssignedTask[];
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

async function loadDokument(): Promise<Result<Data>> {
  const [documents, storage, tasks] = await Promise.all([
    listDocuments(),
    storageReady(),
    listMyTasks(),
  ]);
  if (!documents.ok) return documents;

  const missing: string[] = [];
  if (!storage.ok) missing.push('fillagringen');
  if (!tasks.ok) missing.push('kopplingen till dina uppgifter');

  return {
    ok: true,
    data: {
      documents: documents.data,
      storage: storage.ok ? storage.data : false,
      tasks: tasks.ok ? tasks.data : [],
      missing,
    },
  };
}

/**
 * Mina dokument. Här ligger material som din lärare har delat med dig, filer som
 * hör till en uppgift och dina egna uppladdningar.
 *
 * Filerna lagras privat och nås bara via tidsbegränsade länkar. Vem som får läsa
 * en fil avgörs av servern: du ser dina egna, det som delats med dig och det som
 * delats med din klass. En klasskamrats egna filer kan du inte öppna.
 */
export const DokumentPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const copy = studentCopy(panel);
  const { user } = useAuth();
  const state: AsyncState<Data> = useAsync(loadDokument);
  const [showUpload, setShowUpload] = useState(false);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = state.data?.documents ?? [];
  const taskById = new Map((state.data?.tasks ?? []).map((task) => [task.id, task]));
  const subjects = [...new Set(all.map((row) => row.subject?.trim() || 'Övrigt'))].sort((a, b) =>
    a.localeCompare(b, 'sv'),
  );
  const visible = filterDocuments(all, { subject, query });
  const groups = groupDocumentsBySubject(visible);

  /** Öppnar filen i ett nytt fönster, eller laddar ner den. */
  const open = async (row: DocumentRow, download: boolean) => {
    setError(null);
    const result = await createDocumentUrl(row, { download });
    if (!result.ok) {
      // Felet nämner filen, så att det går att förstå vilken fil det gäller.
      setError(result.error);
      return;
    }
    window.open(result.data, '_blank', 'noopener,noreferrer');
  };

  const remove = async (row: DocumentRow) => {
    const result = await deleteDocument(row);
    if (result.ok) state.reload();
    else setError(result.error);
  };

  const storage = state.data?.storage ?? false;
  const myId = user?.id ?? '';

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'dokument')}>
      <SectionCard
        title="Mina dokument"
        subtitle={copy.documentsSubtitle}
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowUpload(true)}
            disabled={!storage}
            title={!storage ? 'Fillagringen är inte konfigurerad ännu' : 'Ladda upp en fil'}
          >
            <Upload size={16} /> Ladda upp
          </button>
        }
      >
        {state.loading && <LoadingState label="Hämtar dina dokument…" />}
        {!state.loading && state.error && <ErrorState message={state.error} onRetry={state.reload} />}
        {state.data && (
          <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />
        )}

        {!state.loading && state.data && !state.data.storage && (
          <div className="state-note state-note-error" role="alert" data-testid="storage-missing">
            <AlertTriangle size={15} />
            <span>
              Fillagringen är inte konfigurerad ännu, så uppladdning och öppning är
              avstängda. Be en administratör köra migreringen som skapar lagringen.
            </span>
          </div>
        )}

        {error && (
          <div className="state-note state-note-error" role="alert" data-testid="document-error">
            {error}
          </div>
        )}

        {all.length === 0 && state.data && (
          <EmptyState
            icon={<FileText size={22} />}
            title="Inga dokument ännu"
            description={copy.documentsEmpty}
          />
        )}

        {all.length > 0 && (
          <>
            <Toolbar>
              <div className="search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  className="input"
                  placeholder="Sök dokument"
                  aria-label="Sök dokument"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </Toolbar>

            <div className="chip-row" role="group" aria-label="Filtrera på ämne">
              <button
                type="button"
                className={`chip ${subject === '' ? 'chip-active' : ''}`}
                aria-pressed={subject === ''}
                onClick={() => setSubject('')}
              >
                Alla ämnen
              </button>
              {subjects.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`chip ${subject === name ? 'chip-active' : ''}`}
                  aria-pressed={subject === name}
                  onClick={() => setSubject(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="Inga träffar"
                description="Inget dokument matchar sökningen eller filtret. Prova ett annat ämne."
              />
            ) : (
              groups.map((group) => (
                <div key={group.subject} data-testid={`document-group-${group.subject}`}>
                  <h3 className="list-item-title">{group.subject}</h3>
                  <ul className="list">
                    {group.documents.map((row) => (
                      <li className="list-item list-item-static" key={row.id}>
                        <FileText size={16} aria-hidden="true" />
                        <div className="list-item-content">
                          <div className="list-item-title">{row.title}</div>
                          <div className="list-item-sub">
                            {documentFileName(row)} · {formatBytes(row.size_bytes)} ·{' '}
                            {formatDate(row.created_at.slice(0, 10))}
                          </div>
                          {row.description && (
                            <div className="list-item-sub">{row.description}</div>
                          )}
                          {row.task_id && taskById.get(row.task_id) && (
                            <div className="list-item-sub">
                              Till uppgiften: {taskById.get(row.task_id)?.title}
                            </div>
                          )}
                        </div>
                        <Pill tone="muted">{documentKindLabel(row)}</Pill>
                        {row.owner_id === myId && <Pill tone="info">Din fil</Pill>}
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void open(row, false)}
                          disabled={!storage}
                          title={`Öppna ${row.title}`}
                        >
                          <Eye size={15} /> Öppna
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void open(row, true)}
                          disabled={!storage}
                          title={`Ladda ner ${documentFileName(row)}`}
                        >
                          <Download size={15} /> Ladda ner
                        </button>
                        {row.owner_id === myId && (
                          <ConfirmButton
                            label="Ta bort"
                            confirmLabel="Ta bort"
                            question={`Ta bort "${row.title}"?`}
                            onConfirm={() => void remove(row)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}

        <p className="security-note">
          <FileText size={14} aria-hidden="true" />
          Länken till en fil gäller i {Math.round(SIGNED_URL_SECONDS / 60)} minuter och fungerar
          bara för dig. Max {formatBytes(MAX_FILE_BYTES)} per fil.
        </p>
      </SectionCard>

      {showUpload && myId && (
        <UploadOwnFileModal
          ownerId={myId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            state.reload();
          }}
        />
      )}
    </div>
  );
};

const UploadOwnFileModal: React.FC<{
  ownerId: string;
  onClose: () => void;
  onUploaded: () => void;
}> = ({ ownerId, onClose, onUploaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Välj en fil först.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await uploadDocument({
      file,
      title: title || file.name,
      description: '',
      subject,
      studentId: ownerId,
      classId: null,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onUploaded();
  };

  return (
    <Modal title="Ladda upp en egen fil" onClose={onClose} closeLabel="Stäng uppladdning">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="elev-file">Fil</label>
          <input
            id="elev-file"
            className="input"
            type="file"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null;
              setFile(selected);
              if (selected && !title) setTitle(selected.name);
            }}
          />
          <p className="field-hint">Max {formatBytes(MAX_FILE_BYTES)}.</p>
        </div>

        <TextField label="Titel" value={title} onChange={setTitle} />
        <TextField
          label="Ämne"
          value={subject}
          onChange={setSubject}
          hint="Frivilligt — gör att filen hamnar under rätt ämne."
        />

        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="upload-error">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Laddar upp…' : 'Ladda upp'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
