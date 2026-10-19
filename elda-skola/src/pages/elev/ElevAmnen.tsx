import React, { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, FileText, Sparkles } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  documentSize,
  listActivities,
  listClasses,
  listDocuments,
  listMySubmissions,
  listTasks,
  openDocument,
  setActivityDone,
} from '../../lib/api';
import { findSubmission, mergeTaskSubmission } from '../../lib/submissions';
import { KIND_LABEL, shortDate, truncate } from '../../lib/format';
import type { Activity } from '../../lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageIntro,
  Spinner,
} from '../../components/ui';

export const ElevAmnen: React.FC = () => {
  const state = useAsync(async () => {
    const [classes, tasks, submissions, documents, activities] = await Promise.all([
      listClasses(),
      listTasks(),
      listMySubmissions(),
      listDocuments(),
      listActivities(),
    ]);
    const mergedTasks = tasks.map((task) =>
      mergeTaskSubmission(task, findSubmission(submissions, task.id)),
    );
    const subjects = new Set<string>();
    classes.forEach((row) => row.subject && subjects.add(row.subject));
    tasks.forEach((row) => subjects.add(row.subject?.trim() || 'Övrigt'));
    documents.forEach((row) => subjects.add(row.subject?.trim() || 'Övrigt'));
    activities.forEach((row) => subjects.add(row.subject?.trim() || 'Övrigt'));
    return {
      classes,
      tasks: mergedTasks,
      documents,
      activities,
      subjects: [...subjects].sort((a, b) => a.localeCompare(b, 'sv')),
    };
  }, []);
  const [active, setActive] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);

  const data = state.data;
  const selected = active ?? data?.subjects[0] ?? null;

  const tasks = useMemo(
    () =>
      (data?.tasks ?? []).filter(
        (row) => !row.archived_at && (row.subject?.trim() || 'Övrigt') === selected,
      ),
    [data, selected],
  );
  const documents = useMemo(
    () => (data?.documents ?? []).filter((row) => (row.subject?.trim() || 'Övrigt') === selected),
    [data, selected],
  );
  const activities = useMemo(
    () => (data?.activities ?? []).filter((row) => (row.subject?.trim() || 'Övrigt') === selected),
    [data, selected],
  );

  if (state.loading) return <Spinner label="Hämtar ämnen och material…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Mina ämnen och material" />
        <Card><EmptyState title="Kunde inte hämta materialet" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Elevpanel"
        title="Mina ämnen och material"
        description="Allt som hör till dina ämnen: uppgifter, filer och aktiviteter som lärarna har publicerat."
      />

      {!data || data.subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={24} />}
            title="Inget material ännu"
            description="När du är kopplad till en klass och läraren publicerar material visas ämnena här."
          />
        </Card>
      ) : (
        <>
          <div className="item-grid" style={{ marginBottom: 18 }}>
            {data.subjects.map((subject) => {
              const count =
                data.tasks.filter((row) => (row.subject?.trim() || 'Övrigt') === subject).length +
                data.documents.filter((row) => (row.subject?.trim() || 'Övrigt') === subject).length +
                data.activities.filter((row) => (row.subject?.trim() || 'Övrigt') === subject).length;
              return (
                <button
                  key={subject}
                  type="button"
                  className="subject-tile"
                  onClick={() => setActive(subject)}
                  style={selected === subject ? { borderColor: 'var(--green)', background: 'var(--surface-2)' } : undefined}
                >
                  <span className="icon"><BookOpen size={18} /></span>
                  <h3>{subject}</h3>
                  <p>{count} sak{count === 1 ? '' : 'er'} · {data.classes.filter((row) => (row.subject || 'Övrigt') === subject).length || 1} klass</p>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="stack">
              <div className="grid-2">
                <Card title={`Material i ${selected}`} subtitle="Filer och instruktioner från läraren">
                  {documents.length === 0 ? (
                    <EmptyState icon={<FileText size={20} />} title="Inget material" description="Läraren har inte publicerat några filer i ämnet ännu." />
                  ) : (
                    <div className="list">
                      {documents.map((row) => (
                        <div key={row.id} className="list-row">
                          <FileText size={18} color="var(--green)" />
                          <div className="list-main">
                            <p className="list-title">{row.title}</p>
                            <p className="list-sub">
                              {row.description || 'Material'} · {documentSize(row.size_bytes)} · {shortDate(row.created_at)}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => void openDocument(row)}>Öppna</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Uppgifter i ämnet" subtitle="Det som hör till dina klasser">
                  {tasks.length === 0 ? (
                    <EmptyState icon={<CheckCircle2 size={20} />} title="Inga uppgifter" description="Inga uppgifter har publicerats i ämnet ännu." />
                  ) : (
                    <div className="list">
                      {tasks.map((task) => (
                        <div key={task.id} className="list-row">
                          <div className="list-main">
                            <p className="list-title">{task.title}</p>
                            <p className="list-sub">{truncate(task.description, 80) || 'Ingen beskrivning'}</p>
                          </div>
                          <div className="list-side">
                            <span className="small muted">{shortDate(task.due_date)}</span>
                            <Badge tone={task.status === 'klar' ? 'green' : 'neutral'}>
                              {task.status === 'klar' ? 'Klar' : task.status === 'pagar' ? 'Pågående' : 'Öppen'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card title="Aktiviteter" subtitle="Interaktiva övningar och reflektioner">
                {activities.length === 0 ? (
                  <EmptyState icon={<Sparkles size={20} />} title="Inga aktiviteter" description="Läraren har inte publicerat några aktiviteter i ämnet ännu." />
                ) : (
                  <div className="item-grid">
                    {activities.map((row) => (
                      <article key={row.id} className="item-card">
                        <div className="item-card-head">
                          <h3>{row.title}</h3>
                          <Badge tone={row.completed ? 'green' : 'blue'}>{row.completed ? 'Klar' : 'Att göra'}</Badge>
                        </div>
                        <p>{truncate(row.description, 110) || KIND_LABEL[row.kind] || 'Aktivitet'}</p>
                        <div className="meta"><span>{KIND_LABEL[row.kind] || row.kind}</span><span>·</span><span>{row.class_name || 'Din klass'}</span></div>
                        <div className="item-actions">
                          <Button size="sm" variant={row.completed ? 'ghost' : 'secondary'} onClick={() => setActivity(row)}>
                            {row.completed ? 'Visa' : 'Öppna'}
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {activity && (
        <ActivityModal
          activity={activity}
          onClose={() => setActivity(null)}
          onChanged={async () => {
            await state.reload();
            setActivity(null);
          }}
        />
      )}
    </div>
  );
};

const ActivityModal: React.FC<{
  activity: Activity;
  onClose: () => void;
  onChanged: () => Promise<void>;
}> = ({ activity, onClose, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await setActivityDone(activity.id, !activity.completed);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={activity.title}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Stäng</Button><Button loading={busy} onClick={() => void toggle()}>{activity.completed ? 'Markera som inte klar' : 'Markera som klar'}</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge tone="blue">{KIND_LABEL[activity.kind] || activity.kind}</Badge>
        <span className="small muted">{activity.subject || 'Övrigt'} · {activity.class_name || 'Din klass'}</span>
      </div>
      {activity.description && <p style={{ whiteSpace: 'pre-wrap' }}>{activity.description}</p>}
      {activity.instructions && (
        <div className="note-box" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{activity.instructions}</div>
      )}
    </Modal>
  );
};
