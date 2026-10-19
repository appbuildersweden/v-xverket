import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  MessageSquare,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  ApiError,
  documentSize,
  listDocuments,
  listMySubmissions,
  listTasks,
  openDocument,
  saveSubmission,
  uploadDocument,
} from '../../lib/api';
import { deadlineLabel, displayName, shortDate, truncate } from '../../lib/format';
import {
  findSubmission,
  isSubmissionLocked,
  isTaskOpen,
  submissionLabel,
  submissionTone,
} from '../../lib/submissions';
import type { SchoolDocument, Submission, Task } from '../../lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageIntro,
  Spinner,
} from '../../components/ui';

type Filter = 'alla' | 'oppna' | 'utkast' | 'inlamnade' | 'aterkoppling';

export const ElevUppgifter: React.FC = () => {
  const { identity, profile } = useAuth();
  const state = useAsync(async () => {
    const [tasks, submissions, documents] = await Promise.all([
      listTasks(),
      listMySubmissions(),
      listDocuments(),
    ]);
    return { tasks, submissions, documents };
  }, []);
  const [statusFilter, setStatusFilter] = useState<Filter>('alla');
  const [subject, setSubject] = useState('alla');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Task | null>(null);

  const tasks = state.data?.tasks ?? [];
  const submissions = state.data?.submissions ?? [];
  const documents = state.data?.documents ?? [];

  const subjects = useMemo(
    () => [...new Set(tasks.map((task) => task.subject?.trim() || 'Övrigt'))].sort((a, b) => a.localeCompare(b, 'sv')),
    [tasks],
  );

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return tasks
      .filter((task) => !task.archived_at)
      .filter((task) => {
        const submission = findSubmission(submissions, task.id);
        if (statusFilter === 'oppna') return isTaskOpen(task, submission);
        if (statusFilter === 'utkast') return submission?.status === 'utkast';
        if (statusFilter === 'inlamnade') return submission?.status === 'inlamnad';
        if (statusFilter === 'aterkoppling') {
          return submission?.status === 'aterlamnad' || Boolean(submission?.feedback);
        }
        return true;
      })
      .filter((task) => subject === 'alla' || (task.subject?.trim() || 'Övrigt') === subject)
      .filter((task) => {
        if (!text) return true;
        return `${task.title} ${task.description ?? ''} ${task.subject ?? ''}`.toLowerCase().includes(text);
      });
  }, [tasks, submissions, statusFilter, subject, query]);

  if (state.loading) return <Spinner label="Hämtar dina uppgifter…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Uppgifter" description="Dina uppgifter och inlämningar." />
        <Card>
          <EmptyState
            title="Kunde inte hämta uppgifterna"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Elevpanel"
        title="Uppgifter"
        description="Läs instruktionerna, spara ditt eget utkast och lämna in. Bara du och din lärare ser ditt svar."
      />

      <div className="filter-bar">
        <input
          className="input"
          placeholder="Sök uppgift…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Sök uppgift"
        />
        <select className="input" value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Filtrera ämne">
          <option value="alla">Alla ämnen</option>
          {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {[
          ['alla', 'Alla'],
          ['oppna', 'Att göra'],
          ['utkast', 'Utkast'],
          ['inlamnade', 'Inlämnade'],
          ['aterkoppling', 'Återkoppling'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`chip ${statusFilter === value ? 'chip-active' : ''}`}
            onClick={() => setStatusFilter(value as Filter)}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={24} />}
            title={tasks.length === 0 ? 'Inga uppgifter ännu' : 'Inga uppgifter matchar filtret'}
            description={
              tasks.length === 0
                ? 'När en lärare publicerar en uppgift för din klass eller dig visas den här.'
                : 'Prova ett annat filter eller rensa sökningen.'
            }
          />
        </Card>
      ) : (
        <div className="item-grid">
          {filtered.map((task) => {
            const submission = findSubmission(submissions, task.id);
            const files = documents.filter((row) => row.task_id === task.id && row.owner_id === identity?.id);
            return (
              <article key={task.id} className="item-card">
                <div className="item-card-head">
                  <div>
                    <h3>{task.title}</h3>
                    <p>{task.subject || 'Övrigt'} · {task.class_name || 'Din klass'}</p>
                  </div>
                  <Badge tone={submissionTone(submission, task)}>
                    {submissionLabel(submission, task)}
                  </Badge>
                </div>
                {task.description && <p>{truncate(task.description, 110)}</p>}
                <div className="meta">
                  <span>{shortDate(task.due_date)}</span>
                  <span>·</span>
                  <span>{deadlineLabel(task.due_date)}</span>
                  {files.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{files.length} egen bilaga{files.length === 1 ? '' : 'r'}</span>
                    </>
                  )}
                </div>
                <div className="item-actions">
                  <Button size="sm" onClick={() => setSelected(task)}>
                    {submission?.status === 'aterlamnad'
                      ? 'Komplettera'
                      : submission?.status === 'inlamnad' || submission?.status === 'granskad'
                        ? 'Visa inlämning'
                        : 'Öppna uppgift'}
                  </Button>
                  {submission?.feedback && <Badge tone="green">Återkoppling finns</Badge>}
                  {submission?.status === 'utkast' && <Badge tone="amber">Sparat utkast</Badge>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <TaskDetail
          task={selected}
          submission={findSubmission(submissions, selected.id) ?? null}
          documents={documents}
          userId={identity?.id ?? ''}
          studentName={profile ? displayName(profile) : identity?.username ?? ''}
          onClose={() => setSelected(null)}
          onChanged={async () => {
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const TaskDetail: React.FC<{
  task: Task;
  submission: Submission | null;
  documents: SchoolDocument[];
  userId: string;
  studentName: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}> = ({ task, submission, documents, userId, studentName, onClose, onChanged }) => {
  const [current, setCurrent] = useState<Submission | null>(submission);
  const [answer, setAnswer] = useState(submission?.content ?? '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const locked = isSubmissionLocked(current);
  const ownFiles = documents.filter(
    (row) => row.task_id === task.id && row.owner_id === userId,
  );
  const teacherFiles = documents.filter(
    (row) => row.task_id === task.id && row.owner_id !== userId,
  );

  const save = async (mode: 'utkast' | 'inlamnad') => {
    if (busy || locked) return;
    const text = answer.trim();
    if (mode === 'inlamnad' && !text && ownFiles.length === 0) {
      setError('Skriv ett svar eller bifoga en fil innan du lämnar in.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveSubmission(task.id, text, mode);
      setCurrent(saved);
      await onChanged();
      setMessage(
        mode === 'inlamnad'
          ? `Ditt svar är inlämnat ${shortDate(saved.submitted_at)}.`
          : 'Utkastet är sparat. Du kan fortsätta senare.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara svaret.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file || uploading || locked) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      let active = current;
      if (!active) {
        active = await saveSubmission(task.id, answer.trim(), 'utkast');
        setCurrent(active);
      }
      await uploadDocument({
        file,
        title: file.name,
        description: `Elevens bilaga till ${task.title}`,
        subject: task.subject ?? '',
        // Ingen class_id här: filen är elevens egen och ska inte bli läsbar
        // för klasskamrater. Läraren ser den via elevkopplingen.
        classId: null,
        studentId: userId,
        taskId: task.id,
      });
      setFile(null);
      await onChanged();
      setMessage('Bilagan är uppladdad. Den syns bara för dig och din lärare.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Filen kunde inte laddas upp.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={task.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Stäng</Button>
          {!locked && (
            <>
              <Button
                variant="secondary"
                icon={<Save size={16} />}
                loading={busy}
                onClick={() => void save('utkast')}
              >
                Spara utkast
              </Button>
              <Button
                icon={<Send size={16} />}
                loading={busy}
                onClick={() => void save('inlamnad')}
              >
                {current?.status === 'aterlamnad' ? 'Lämna in igen' : 'Lämna in'}
              </Button>
            </>
          )}
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <div className="row" style={{ marginBottom: 12 }}>
        <Badge tone={submissionTone(current, task)}>{submissionLabel(current, task)}</Badge>
        <span className="small muted">{task.subject || 'Övrigt'} · {task.class_name || 'Din klass'}</span>
        <span className="small muted">Deadline: {task.due_date ? shortDate(task.due_date) : 'saknas'}</span>
      </div>

      {current?.status === 'aterlamnad' && (
        <Alert tone="info">
          Läraren har återlämnat uppgiften för komplettering. Läs återkopplingen
          och lämna in ett nytt svar när du är klar.
        </Alert>
      )}

      {current?.status === 'inlamnad' && (
        <Alert tone="success">
          Inlämnad {shortDate(current.submitted_at)}. Svaret ligger hos läraren och
          kan inte ändras förrän det har återlämnats.
        </Alert>
      )}

      {current?.status === 'granskad' && (
        <Alert tone="success">
          Uppgiften är granskad {shortDate(current.feedback_at ?? current.updated_at)}.
          Läs lärarens återkoppling nedan.
        </Alert>
      )}

      {task.description && (
        <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{task.description}</p>
      )}
      {task.instructions && (
        <Card title="Instruktioner" className="note-box">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{task.instructions}</p>
        </Card>
      )}

      {teacherFiles.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Bilagor från läraren</h3>
          <div className="list">
            {teacherFiles.map((row) => (
              <div key={row.id} className="list-row">
                <FileText size={18} color="var(--green)" />
                <div className="list-main">
                  <p className="list-title">{row.title}</p>
                  <p className="list-sub">{documentSize(row.size_bytes)}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<Download size={15} />} onClick={() => void openDocument(row)}>
                  Öppna
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {current?.feedback && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Lärarens återkoppling</h3>
          <div className="note-box" data-testid="submission-feedback">
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{current.feedback}</p>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              <MessageSquare size={13} /> {shortDate(current.feedback_at ?? current.updated_at)}
            </p>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Field
          label="Ditt svar"
          htmlFor="elev-answer"
          hint={
            locked
              ? 'Svaret är låst eftersom det redan är inlämnat eller granskat.'
              : `Sparas som utkast när du klickar på Spara utkast. Inlämning markeras med datum. Inloggad som ${studentName}.`
          }
        >
          <textarea
            id="elev-answer"
            className="input"
            rows={8}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Skriv ditt svar här…"
            disabled={busy || locked}
            readOnly={locked}
          />
        </Field>

        {ownFiles.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 13, marginBottom: 6 }}>Dina bilagor</h3>
            <div className="list">
              {ownFiles.map((row) => (
                <div key={row.id} className="list-row">
                  <FileText size={18} color="var(--green)" />
                  <div className="list-main">
                    <p className="list-title">{row.title}</p>
                    <p className="list-sub">{documentSize(row.size_bytes)}</p>
                  </div>
                  <Button size="sm" variant="ghost" icon={<Download size={15} />} onClick={() => void openDocument(row)}>
                    Öppna
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!locked && (
          <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Field
                label="Bifoga fil (frivilligt)"
                htmlFor="elev-file"
                hint="PDF, bild, text, Word, Excel, PowerPoint eller zip. Max 10 MB."
              >
                <input
                  id="elev-file"
                  className="input"
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={uploading}
                />
              </Field>
            </div>
            <Button
              variant="secondary"
              icon={<Upload size={16} />}
              loading={uploading}
              onClick={() => void upload()}
              disabled={!file}
            >
              Ladda upp
            </Button>
          </div>
        )}
      </div>

      <div className="notice" style={{ marginTop: 14 }}>
        <CheckCircle2 size={17} />
        <span>
          Svaret och dina filer sparas på ditt konto. Andra elever kan inte läsa
          dem, och läraren ser dem bara genom sin behörighet till klassen.
        </span>
      </div>
    </Modal>
  );
};
