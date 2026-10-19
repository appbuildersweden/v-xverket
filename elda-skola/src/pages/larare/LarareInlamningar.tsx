import React, { useMemo, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Download, FileText, Save, Undo2, Users } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  documentSize,
  listClasses,
  listDocuments,
  listMyStudents,
  listSubmissions,
  listTasks,
  openDocument,
  reviewSubmission,
} from '../../lib/api';
import { countSubmissions } from '../../lib/submissions';
import { dateTime, shortDate } from '../../lib/format';
import type {
  SchoolClass,
  SchoolDocument,
  Submission,
  Task,
} from '../../lib/types';
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

type StatusFilter = 'vantar' | 'saknas' | 'aterlamnad' | 'granskad' | 'alla';

interface AudienceStudent {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  class_id: string | null;
}

export const LarareInlamningar: React.FC = () => {
  const state = useAsync(async () => {
    const [tasks, students, classes, submissions, documents] = await Promise.all([
      // Alla uppgifter läraren har behörighet till, inte bara de läraren själv
      // skapat: en medlärare i klassen ska kunna granska och ge återkoppling.
      listTasks(),
      listMyStudents(),
      listClasses(),
      listSubmissions(),
      listDocuments(),
    ]);
    return { tasks, students, classes, submissions, documents };
  }, []);
  const [filter, setFilter] = useState<StatusFilter>('vantar');
  const [classFilter, setClassFilter] = useState('alla');
  const [taskFilter, setTaskFilter] = useState('alla');
  const [active, setActive] = useState<Task | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const tasks = state.data?.tasks ?? [];
  const students = state.data?.students ?? [];
  const classes = state.data?.classes ?? [];
  const submissions = state.data?.submissions ?? [];
  const documents = state.data?.documents ?? [];

  const allStudents = useMemo(() => {
    const seen = new Set<string>();
    const rows: AudienceStudent[] = [];
    for (const row of students) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    return rows;
  }, [students]);

  const audienceFor = (task: Task): AudienceStudent[] => {
    if (task.student_id) {
      const found = allStudents.find((row) => row.id === task.student_id);
      if (found) return [found];
      return [{
        id: task.student_id,
        username: task.student_username ?? '',
        first_name: task.student_name ?? null,
        last_name: null,
        class_id: task.class_id,
      }];
    }
    const seen = new Set<string>();
    return students
      .filter((row) => row.class_id === task.class_id)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  };

  const rows = useMemo(() => {
    return tasks
      .filter((task) => !task.archived_at)
      .filter((task) => classFilter === 'alla' || task.class_id === classFilter)
      .filter((task) => taskFilter === 'alla' || task.id === taskFilter)
      .map((task) => {
        const audience = audienceFor(task);
        return { task, audience, counts: countSubmissions(task, submissions, audience.length) };
      })
      .filter(({ counts }) => {
        if (filter === 'vantar') return counts.waiting > 0;
        if (filter === 'saknas') return counts.total - counts.submitted > 0;
        if (filter === 'aterlamnad') return counts.returned > 0;
        if (filter === 'granskad') return counts.reviewed > 0;
        return true;
      });
  }, [tasks, students, submissions, filter, classFilter, taskFilter]);

  const myTaskIds = new Set(tasks.map((row) => row.id));
  const mySubmissions = submissions.filter((row) => myTaskIds.has(row.task_id));
  const waitingCount = mySubmissions.filter((row) => row.status === 'inlamnad').length;
  const submittedCount = mySubmissions.filter((row) => row.status !== 'utkast').length;
  const returnedCount = mySubmissions.filter((row) => row.status === 'aterlamnad').length;

  if (state.loading) return <Spinner label="Hämtar inlämningar…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Inlämningar och återkoppling" />
        <Card><EmptyState title="Kunde inte hämta inlämningarna" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title="Inlämningar och återkoppling"
        description="Varje elev har sitt eget svar. Öppna en uppgift för att se hela klassen, läsa enskilda svar och ge individuell återkoppling."
      />

      {message && <Alert tone="success">{message}</Alert>}

      <div className="filter-bar">
        {[
          ['vantar', `Väntar (${waitingCount})`],
          ['saknas', 'Saknas'],
          ['aterlamnad', `Komplettering (${returnedCount})`],
          ['granskad', 'Granskade'],
          ['alla', `Alla (${submittedCount} inlämnade)`],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`chip ${filter === value ? 'chip-active' : ''}`}
            onClick={() => setFilter(value as StatusFilter)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <select
          className="input"
          value={classFilter}
          onChange={(event) => {
            setClassFilter(event.target.value);
            setTaskFilter('alla');
          }}
          aria-label="Filtrera klass"
        >
          <option value="alla">Alla klasser</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <select
          className="input"
          value={taskFilter}
          onChange={(event) => setTaskFilter(event.target.value)}
          aria-label="Filtrera uppgift"
        >
          <option value="alla">Alla uppgifter</option>
          {tasks
            .filter((task) => !task.archived_at)
            .filter((task) => classFilter === 'alla' || task.class_id === classFilter)
            .map((task) => (
              <option key={task.id} value={task.id}>{task.title}</option>
            ))}
        </select>
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          {submittedCount} inlämningar totalt · {waitingCount} väntar på dig
        </span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={24} />}
            title={filter === 'vantar' ? 'Inget väntar på återkoppling' : 'Inga uppgifter att visa'}
            description={
              filter === 'vantar'
                ? 'När elever lämnar in hamnar de här tills du har granskat eller återlämnat svaret.'
                : 'Byt filter eller skapa en uppgift för en klass.'
            }
          />
        </Card>
      ) : (
        <div className="item-grid">
          {rows.map(({ task, counts }) => {
            const classRow: SchoolClass | undefined = classes.find((row) => row.id === task.class_id);
            const pending = counts.total - counts.submitted;
            const badgeTone =
              counts.waiting > 0
                ? 'amber'
                : counts.returned > 0
                  ? 'amber'
                  : pending > 0
                    ? 'red'
                    : 'green';
            const badgeLabel =
              counts.waiting > 0
                ? `${counts.waiting} väntar`
                : counts.returned > 0
                  ? `${counts.returned} kompletterar`
                  : counts.drafts > 0
                    ? `${counts.drafts} utkast`
                    : pending > 0
                      ? `${counts.missing} saknas`
                      : 'Alla klara';
            return (
              <article key={task.id} className="item-card">
                <div className="item-card-head">
                  <div>
                    <h3>{task.title}</h3>
                    <p>{classRow?.name || 'Enskild elev'} · {task.subject || 'Övrigt'}</p>
                  </div>
                  <Badge tone={badgeTone}>{badgeLabel}</Badge>
                </div>
                <div className="meta">
                  <span><Users size={12} /> {counts.submitted}/{counts.total} inlämnade</span>
                  <span>·</span>
                  <span>{counts.drafts} utkast</span>
                  <span>·</span>
                  <span>{task.due_date ? shortDate(task.due_date) : 'Ingen deadline'}</span>
                </div>
                <div className="item-actions">
                  <Button size="sm" onClick={() => setActive(task)}>Öppna uppgift</Button>
                  {counts.waiting > 0 && <Badge tone="amber">Väntar på återkoppling</Badge>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {active && (
        <SubmissionModal
          task={active}
          audience={audienceFor(active)}
          submissions={submissions.filter((row) => row.task_id === active.id)}
          documents={documents}
          onClose={() => setActive(null)}
          onChanged={async () => {
            await state.reload();
          }}
          onMessage={setMessage}
        />
      )}
    </div>
  );
};

function rowStatus(submission?: Submission): { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' | 'blue' } {
  if (!submission) return { label: 'Saknas', tone: 'red' };
  switch (submission.status) {
    case 'utkast':
      return { label: 'Utkast', tone: 'neutral' };
    case 'inlamnad':
      return { label: 'Väntar', tone: 'amber' };
    case 'aterlamnad':
      return { label: 'Komplettering', tone: 'amber' };
    case 'granskad':
      return { label: 'Granskad', tone: 'green' };
    default:
      return { label: 'Saknas', tone: 'red' };
  }
}

const SubmissionModal: React.FC<{
  task: Task;
  audience: AudienceStudent[];
  submissions: Submission[];
  documents: SchoolDocument[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}> = ({ task, audience, submissions, documents, onClose, onChanged, onMessage }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = audience.find((row) => row.id === selectedId) ?? null;
  const selectedSubmission = selected
    ? submissions.find((row) => row.student_id === selected.id) ?? null
    : null;

  return (
    <Modal
      open
      wide
      title={task.title}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Stäng</Button>}
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge tone={task.published === false ? 'amber' : 'green'}>
          {task.published === false ? 'Utkast' : 'Publicerad'}
        </Badge>
        <span className="small muted">{task.subject || 'Övrigt'} · {task.class_name || 'Klass'}</span>
        <span className="small muted">Deadline: {task.due_date ? shortDate(task.due_date) : 'saknas'}</span>
      </div>

      {selected ? (
        <StudentReview
          key={`${selected.id}-${selectedSubmission?.id ?? 'none'}-${selectedSubmission?.status ?? 'none'}`}
          student={selected}
          submission={selectedSubmission}
          documents={documents.filter(
            (row) => row.task_id === task.id && row.student_id === selected.id && row.owner_id === selected.id,
          )}
          onBack={() => setSelectedId(null)}
          onChanged={async () => {
            await onChanged();
            onMessage('Återkopplingen är sparad och eleven ser den i sin uppgift.');
          }}
        />
      ) : (
        <>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Elever i uppgiften</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Elev</th>
                  <th>Status</th>
                  <th>Inlämnad</th>
                  <th>Senast ändrad</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {audience.length === 0 ? (
                  <tr><td colSpan={5} className="muted">Klasslistan är tom.</td></tr>
                ) : audience.map((student) => {
                  const submission = submissions.find((row) => row.student_id === student.id);
                  const status = rowStatus(submission);
                  return (
                    <tr key={student.id}>
                      <td>
                        <strong>{[student.first_name, student.last_name].filter(Boolean).join(' ') || student.username || 'Elev'}</strong>
                        {student.username && <div className="small muted">@{student.username}</div>}
                      </td>
                      <td><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td>{submission?.submitted_at ? dateTime(submission.submitted_at) : '—'}</td>
                      <td>{submission ? dateTime(submission.updated_at) : '—'}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedId(student.id)}
                          disabled={!submission}
                        >
                          {submission ? 'Visa svar' : 'Inget svar'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Saknade inlämningar visas som egna rader. Ett utkast kan läsas men
            kan inte få återkoppling förrän eleven har lämnat in.
          </p>
        </>
      )}
    </Modal>
  );
};

const StudentReview: React.FC<{
  student: AudienceStudent;
  submission: Submission | null;
  documents: SchoolDocument[];
  onBack: () => void;
  onChanged: () => Promise<void>;
}> = ({ student, submission, documents, onBack, onChanged }) => {
  const [feedback, setFeedback] = useState(submission?.feedback ?? '');
  const [busy, setBusy] = useState<'granskad' | 'aterlamnad' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = async (status: 'granskad' | 'aterlamnad') => {
    if (!submission || busy) return;
    if (status === 'aterlamnad' && !feedback.trim()) {
      setError('Skriv en kort förklaring innan du återlämnar för komplettering.');
      return;
    }
    setBusy(status);
    setError(null);
    try {
      await reviewSubmission(submission.id, feedback, status);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara återkopplingen.');
    } finally {
      setBusy(null);
    }
  };

  const name = [student.first_name, student.last_name].filter(Boolean).join(' ') || student.username || 'Eleven';

  return (
    <div>
      <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={onBack}>
        Tillbaka till elevlistan
      </Button>

      <div className="row" style={{ margin: '10px 0 12px' }}>
        <strong>{name}</strong>
        {student.username && <span className="small muted">@{student.username}</span>}
        <Badge tone={rowStatus(submission ?? undefined).tone}>
          {rowStatus(submission ?? undefined).label}
        </Badge>
      </div>

      {error && <Alert>{error}</Alert>}

      {!submission ? (
        <div className="notice">
          <ClipboardCheck size={17} />
          <span>Eleven har inte lämnat in något svar ännu.</span>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="small muted">
              Skapad {dateTime(submission.created_at)}
            </span>
            <span className="small muted">
              Senast ändrad {dateTime(submission.updated_at)}
            </span>
            {submission.submitted_at && (
              <span className="small muted">Inlämnad {dateTime(submission.submitted_at)}</span>
            )}
          </div>

          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Elevens svar</h3>
          <div className="note-box" style={{ marginBottom: 14, whiteSpace: 'pre-wrap' }}>
            {submission.content || 'Eleven har lämnat in utan text.'}
          </div>

          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Bilagor från eleven</h3>
          {documents.length === 0 ? (
            <p className="small muted" style={{ marginBottom: 14 }}>Inga bilagor.</p>
          ) : (
            <div className="list" style={{ marginBottom: 14 }}>
              {documents.map((row) => (
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
          )}

          {submission.status === 'utkast' ? (
            <div className="notice">
              <ClipboardCheck size={17} />
              <span>
                Eleven har sparat ett utkast men inte lämnat in. Återkoppling kan
                sparas först när svaret är inlämnat.
              </span>
            </div>
          ) : (
            <>
              <Field
                label={`Återkoppling till ${name}`}
                htmlFor="feedback"
                hint="Bara eleven och behörig personal ser texten."
              >
                <textarea
                  id="feedback"
                  className="input"
                  rows={6}
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Skriv vad eleven gjorde bra och vad som kan utvecklas…"
                />
              </Field>

              <div className="row" style={{ marginTop: 12 }}>
                <Button
                  icon={<Save size={16} />}
                  loading={busy === 'granskad'}
                  onClick={() => void review('granskad')}
                >
                  Spara och markera granskad
                </Button>
                <Button
                  variant="secondary"
                  icon={<Undo2 size={16} />}
                  loading={busy === 'aterlamnad'}
                  onClick={() => void review('aterlamnad')}
                >
                  Återlämna för komplettering
                </Button>
              </div>

              {submission.feedback_at && (
                <p className="small muted" style={{ marginTop: 10 }}>
                  Återkoppling sparades {dateTime(submission.feedback_at)}.
                  Du kan uppdatera den.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
