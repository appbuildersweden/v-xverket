import React, { useMemo, useState } from 'react';
import { FileText, FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  deleteDocument,
  documentSize,
  listClasses,
  listDocuments,
  listMyStudents,
  openDocument,
  uploadDocument,
  validateFile,
} from '../../lib/api';
import { shortDate } from '../../lib/format';
import type { SchoolClass, SchoolDocument, StudentRow } from '../../lib/types';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageIntro,
  Spinner,
} from '../../components/ui';

export const LarareMaterial: React.FC = () => {
  const state = useAsync(async () => {
    const [documents, classes, students] = await Promise.all([
      listDocuments(),
      listClasses(),
      listMyStudents(),
    ]);
    return { documents, classes, students };
  }, []);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const documents = state.data?.documents ?? [];
  const classes = state.data?.classes ?? [];
  const students = state.data?.students ?? [];

  const bySubject = useMemo(() => {
    const map = new Map<string, SchoolDocument[]>();
    for (const row of documents) {
      const key = row.subject?.trim() || 'Övrigt';
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'));
  }, [documents]);

  const remove = async (row: SchoolDocument) => {
    if (!window.confirm(`Ta bort ”${row.title}” och dess fil?`)) return;
    setError(null);
    try {
      await deleteDocument(row);
      setMessage('Materialet är borttaget.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort materialet.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar undervisningsmaterial…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Undervisningsmaterial" />
        <Card><EmptyState title="Kunde inte hämta materialet" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title="Undervisningsmaterial"
        description="Ladda upp filer och publicera dem till rätt klass eller elev. Materialet är privat och nås via signerade länkar."
        actions={<Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>Ladda upp material</Button>}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      {documents.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderOpen size={24} />}
            title="Inget material ännu"
            description="Ladda upp en PDF, bild eller ett dokument och koppla det till en klass och ett ämne."
            action={classes.length > 0 ? <Button onClick={() => setOpen(true)}>Ladda upp</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="stack">
          {bySubject.map(([subject, rows]) => (
            <Card key={subject} title={subject} subtitle={`${rows.length} fil${rows.length === 1 ? '' : 'er'}`}>
              <div className="list">
                {rows.map((row) => (
                  <div key={row.id} className="list-row">
                    <FileText size={19} color="var(--green)" />
                    <div className="list-main">
                      <p className="list-title">{row.title}</p>
                      <p className="list-sub">
                        {row.description || 'Material'} · {documentSize(row.size_bytes)} ·{' '}
                        {classes.find((c) => c.id === row.class_id)?.name ?? 'Enskild elev'} ·{' '}
                        {shortDate(row.created_at)}
                      </p>
                    </div>
                    <div className="list-side">
                      <Button size="sm" variant="ghost" onClick={() => void openDocument(row)}>Öppna</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove(row)}>Ta bort</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <MaterialForm
          classes={classes}
          students={students}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            setMessage('Materialet är uppladdat och publicerat.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const MaterialForm: React.FC<{
  classes: SchoolClass[];
  students: StudentRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ classes, students, onClose, onSaved }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classStudents = students.filter((row) => row.class_id === classId);

  const save = async () => {
    if (!file) {
      setError('Välj en fil.');
      return;
    }
    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    if (!title.trim()) {
      setError('Ge materialet en titel.');
      return;
    }
    if (!classId) {
      setError('Välj en klass.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadDocument({
        file,
        title,
        description,
        subject,
        classId,
        studentId: studentId || null,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ladda upp filen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Ladda upp material"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Avbryt</Button><Button icon={<Upload size={16} />} loading={busy} onClick={() => void save()}>Ladda upp</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Fil" htmlFor="material-file" required hint="PDF, bild, text, Word, Excel, PowerPoint eller zip. Max 10 MB.">
        <input
          id="material-file"
          className="input"
          type="file"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''));
          }}
        />
      </Field>
      <Field label="Titel" htmlFor="material-title" required>
        <input id="material-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
      </Field>
      <Field label="Beskrivning" htmlFor="material-description">
        <textarea id="material-description" className="input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Klass" htmlFor="material-class" required>
          <select id="material-class" className="input" value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId(''); }}>
            <option value="">Välj klass</option>
            {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </Field>
        <Field label="Ämne" htmlFor="material-subject">
          <input id="material-subject" className="input" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </Field>
      </div>
      <Field label="Mottagare" htmlFor="material-student" hint="Lämna tomt för att dela med hela klassen.">
        <select id="material-student" className="input" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
          <option value="">Hela klassen</option>
          {classStudents.map((row) => (
            <option key={row.id} value={row.id}>
              {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.username}
            </option>
          ))}
        </select>
      </Field>
      <div className="notice">
        <FileText size={17} />
        <span>Filen lagras i den privata bucketen <code>elda-dokument</code> och öppnas bara via en signerad länk för behöriga.</span>
      </div>
    </Modal>
  );
};
