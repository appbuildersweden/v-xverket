import React, { useState } from 'react';
import { AlertTriangle, Download, Eye, FileText, Pencil, Search, Upload } from 'lucide-react';
import {
  DocumentRow,
  MAX_FILE_BYTES,
  createDocumentUrl,
  deleteDocument,
  documentFileName,
  documentKindLabel,
  filterDocuments,
  formatBytes,
  groupDocumentsBySubject,
  listDocuments,
  storageReady,
  updateDocument,
  uploadDocument,
} from '../../lib/documents';
import { AssignedTask, listAssignedTasks } from '../../lib/assignments';
import { listClasses } from '../../lib/classes';
import { StudentSummary, listMyStudents } from '../../lib/students';
import { formatDate } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  Toolbar,
} from '../../components/ui';
import {
  ConfirmButton,
  FormActions,
  Modal,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/forms';

/**
 * Undervisningsmaterial. Filerna ligger i den privata bucketen och delas genom
 * att ett dokument kopplas till en elev eller en klass — bara den som får läsa
 * dokumentet kan skapa en länk till filen. Ett dokument kan dessutom kopplas till
 * en uppgift, och dyker då upp i uppgiften hos eleven.
 *
 * Är lagringen inte konfigurerad i projektet visas det tydligt, och
 * uppladdningsknappen är avstängd i stället för att se ut att fungera.
 */
export const MaterialPage: React.FC = () => {
  const documents = useAsync(listDocuments);
  const storage = useAsync(storageReady);
  const tasks = useAsync(() => listAssignedTasks({ createdByMe: true }));
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [shared, setShared] = useState<'alla' | 'elev' | 'klass' | 'uppgift'>('alla');

  const all = documents.data ?? [];
  const taskById = new Map((tasks.data ?? []).map((task) => [task.id, task]));
  const subjects = [...new Set(all.map((row) => row.subject?.trim() || 'Övrigt'))].sort((a, b) =>
    a.localeCompare(b, 'sv'),
  );

  const visible = filterDocuments(all, { subject, query }).filter((row) => {
    if (shared === 'elev') return row.student_id !== null;
    if (shared === 'klass') return row.class_id !== null;
    if (shared === 'uppgift') return row.task_id !== null;
    return true;
  });
  const groups = groupDocumentsBySubject(visible);

  const open = async (row: DocumentRow, download: boolean) => {
    setError(null);
    const result = await createDocumentUrl(row, { download });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.data, '_blank', 'noopener,noreferrer');
  };

  const remove = async (row: DocumentRow) => {
    const result = await deleteDocument(row);
    if (result.ok) documents.reload();
    else setError(result.error);
  };

  return (
    <div className="panel-page" data-testid="page-speciallarar-material">
      <SectionCard
        title="Undervisningsmaterial"
        subtitle="Dokument och filer du delar med dina elever"
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowUpload(true)}
            disabled={storage.data === false}
            title={
              storage.data === false
                ? 'Fillagringen är inte konfigurerad ännu'
                : 'Ladda upp material'
            }
          >
            <Upload size={16} /> Ladda upp
          </button>
        }
      >
        {storage.loading && <LoadingState label="Kontrollerar fillagringen…" />}

        {storage.data === false && (
          <div className="state-note state-note-error" role="alert" data-testid="storage-missing">
            <AlertTriangle size={15} />
            <span>
              Fillagringen är inte konfigurerad i projektet ännu. En administratör behöver
              köra migreringen som skapar bucketen <span className="mono">elda-dokument</span>.
              Tills dess kan du inte ladda upp eller öppna filer — men dokumentlistan
              fungerar.
            </span>
          </div>
        )}

        {error && (
          <div className="state-note state-note-error" role="alert" data-testid="material-error">
            {error}
          </div>
        )}

        {documents.loading && <LoadingState label="Hämtar dokument…" />}
        {!documents.loading && documents.error && (
          <ErrorState message={documents.error} onRetry={documents.reload} />
        )}

        {documents.data && documents.data.length === 0 && (
          <EmptyState
            icon={<FileText size={22} />}
            title="Inget material ännu"
            description="Ladda upp en fil och koppla den till en elev eller klass. Eleven ser den sedan under Mina dokument."
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
                  placeholder="Sök material"
                  aria-label="Sök material"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <label className="field field-inline">
                <span>Delat med</span>
                <select
                  className="input"
                  aria-label="Filtrera på mottagare"
                  value={shared}
                  onChange={(e) => setShared(e.target.value as typeof shared)}
                >
                  <option value="alla">Allt</option>
                  <option value="elev">En elev</option>
                  <option value="klass">En klass</option>
                  <option value="uppgift">En uppgift</option>
                </select>
              </label>
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
                description="Inget material matchar sökningen eller filtret."
              />
            ) : (
              groups.map((group) => (
                <div key={group.subject} data-testid={`material-group-${group.subject}`}>
                  <h3 className="list-item-title">{group.subject}</h3>
                  <ul className="list">
                    {group.documents.map((row) => (
                      <li className="list-item list-item-static" key={row.id}>
                        <FileText size={16} aria-hidden="true" />
                        <div className="list-item-content">
                          <div className="list-item-title">{row.title}</div>
                          <div className="list-item-sub">
                            {documentFileName(row)} · {formatBytes(row.size_bytes)} · uppladdat{' '}
                            {formatDate(row.created_at.slice(0, 10))}
                          </div>
                          {row.description && (
                            <div className="list-item-sub">{row.description}</div>
                          )}
                          <div className="list-item-sub">
                            {row.student_id
                              ? 'Delat med en elev'
                              : row.class_id
                                ? 'Delat med en klass'
                                : 'Bara för dig'}
                            {row.task_id && taskById.get(row.task_id)
                              ? ` · till uppgiften ${taskById.get(row.task_id)?.title}`
                              : row.task_id
                                ? ' · kopplat till en uppgift'
                                : ''}
                          </div>
                        </div>
                        <Pill tone="muted">{documentKindLabel(row)}</Pill>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditing(row)}
                          title={`Redigera ${row.title}`}
                        >
                          <Pencil size={15} /> Redigera
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void open(row, false)}
                          disabled={storage.data === false}
                          title={`Öppna ${row.title}`}
                        >
                          <Eye size={15} /> Öppna
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void open(row, true)}
                          disabled={storage.data === false}
                          title={`Ladda ner ${documentFileName(row)}`}
                        >
                          <Download size={15} /> Ladda ner
                        </button>
                        <ConfirmButton
                          label="Ta bort"
                          confirmLabel="Ta bort"
                          question={`Ta bort "${row.title}"?`}
                          onConfirm={() => void remove(row)}
                        />
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
          Filer lagras privat och nås bara via tidsbegränsade länkar. Bara den du delar
          med (och elevens klass, om du väljer en klass) kommer åt filen. Max{' '}
          {formatBytes(MAX_FILE_BYTES)} per fil.
        </p>
      </SectionCard>

      {showUpload && (
        <UploadModal
          tasks={tasks.data ?? []}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            documents.reload();
          }}
        />
      )}

      {editing && (
        <EditMaterialModal
          document={editing}
          tasks={tasks.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            documents.reload();
          }}
        />
      )}
    </div>
  );
};

/** Redigering av titel, ämne, beskrivning och uppgiftskoppling. */
const EditMaterialModal: React.FC<{
  document: DocumentRow;
  tasks: readonly AssignedTask[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ document: row, tasks, onClose, onSaved }) => {
  const [title, setTitle] = useState(row.title);
  const [subject, setSubject] = useState(row.subject ?? '');
  const [description, setDescription] = useState(row.description ?? '');
  const [taskId, setTaskId] = useState(row.task_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await updateDocument(row.id, {
      title,
      subject,
      description,
      taskId: taskId || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <Modal
      title={`Redigera: ${row.title}`}
      onClose={onClose}
      closeLabel="Stäng redigering"
    >
      <form className="form" onSubmit={(e) => void submit(e)}>
        <TextField label="Titel" value={title} onChange={setTitle} maxLength={200} required />
        <TextField
          label="Ämne"
          value={subject}
          onChange={setSubject}
          hint="Används för att gruppera materialet."
        />
        <TextAreaField
          label="Beskrivning"
          value={description}
          onChange={setDescription}
          rows={3}
          placeholder="Kort beskrivning till eleven"
        />
        <SelectField
          label="Koppla till uppgift"
          value={taskId}
          onChange={setTaskId}
          options={[
            { value: '', label: 'Ingen uppgift' },
            ...tasks.map((task) => ({ value: task.id, label: task.title })),
          ]}
          hint="Materialet visas då i uppgiften hos eleven. Det ändrar inte vem som får läsa filen."
        />

        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="edit-material-error">
            {error}
          </p>
        )}

        <FormActions busy={busy} submitLabel="Spara ändringar" onCancel={onClose} />
      </form>
    </Modal>
  );
};

const UploadModal: React.FC<{
  tasks: readonly AssignedTask[];
  onClose: () => void;
  onUploaded: () => void;
}> = ({ tasks, onClose, onUploaded }) => {
  const students = useAsync(listMyStudents);
  const classes = useAsync(listClasses);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [taskId, setTaskId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targets = [
    ...(students.data ?? []).map((s: StudentSummary) => ({
      value: `elev:${s.id}`,
      label: `Elev: ${s.username}`,
    })),
    ...(classes.data ?? []).map((c) => ({ value: `klass:${c.id}`, label: `Klass: ${c.name}` })),
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Välj en fil först.');
      return;
    }
    if (!target) {
      setError('Välj vem materialet ska delas med.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await uploadDocument({
      file,
      title: title || file.name,
      description,
      subject,
      studentId: target.startsWith('elev:') ? target.slice(5) : null,
      classId: target.startsWith('klass:') ? target.slice(6) : null,
      taskId: taskId || null,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onUploaded();
  };

  return (
    <Modal title="Ladda upp material" onClose={onClose} closeLabel="Stäng uppladdning">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <SelectField
          label="Dela med"
          value={target}
          onChange={setTarget}
          options={[{ value: '', label: 'Välj elev eller klass' }, ...targets]}
          hint="Eleven eller klassens elever ser dokumentet under Mina dokument."
        />

        <div className="field">
          <label htmlFor="material-file">Fil</label>
          <input
            id="material-file"
            className="input"
            type="file"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null;
              setFile(selected);
              if (selected && !title) setTitle(selected.name);
            }}
          />
          <p className="field-hint">
            PDF, bild, text, Word, Excel, PowerPoint eller zip. Max {formatBytes(MAX_FILE_BYTES)}.
          </p>
        </div>

        <TextField label="Titel" value={title} onChange={setTitle} placeholder="Filens titel" />
        <TextField
          label="Ämne"
          value={subject}
          onChange={setSubject}
          placeholder="T.ex. Svenska"
        />
        <TextAreaField
          label="Beskrivning"
          value={description}
          onChange={setDescription}
          rows={2}
          placeholder="Kort beskrivning till eleven"
        />
        {tasks.length > 0 && (
          <SelectField
            label="Koppla till uppgift"
            value={taskId}
            onChange={setTaskId}
            options={[
              { value: '', label: 'Ingen uppgift' },
              ...tasks.map((task) => ({ value: task.id, label: task.title })),
            ]}
            hint="Frivilligt — materialet visas då i uppgiften hos eleven."
          />
        )}

        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="upload-error">
            {error}
          </p>
        )}

        <FormActions busy={busy} submitLabel="Ladda upp" onCancel={onClose} />
      </form>
    </Modal>
  );
};
