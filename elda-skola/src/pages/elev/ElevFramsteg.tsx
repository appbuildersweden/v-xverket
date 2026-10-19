import React from 'react';
import { Activity as ActivityIcon, CheckCircle2, MessageSquare, TrendingUp } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import { listActivities, listMySubmissions, listTasks } from '../../lib/api';
import { shortDate } from '../../lib/format';
import { Badge, Card, EmptyState, PageIntro, Spinner, Stat } from '../../components/ui';

export const ElevFramsteg: React.FC = () => {
  const state = useAsync(async () => {
    const [tasks, submissions, activities] = await Promise.all([
      listTasks(),
      listMySubmissions(),
      listActivities(),
    ]);
    return { tasks, submissions, activities };
  }, []);

  if (state.loading) return <Spinner label="Räknar ihop dina framsteg…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Mina framsteg" />
        <Card><EmptyState title="Kunde inte hämta framstegen" description={state.error} /></Card>
      </>
    );
  }

  const tasks = (state.data?.tasks ?? []).filter((row) => !row.archived_at);
  const taskIds = new Set(tasks.map((row) => row.id));
  const submissions = (state.data?.submissions ?? []).filter((row) => taskIds.has(row.task_id));
  const activities = state.data?.activities ?? [];
  const submitted = submissions.filter((row) => row.status !== 'utkast');
  const feedback = submissions.filter((row) => Boolean(row.feedback));
  const done = submissions.filter((row) => row.status === 'inlamnad' || row.status === 'granskad');
  const drafts = submissions.filter((row) => row.status === 'utkast');
  const doneActivities = activities.filter((row) => row.completed);
  const rate = tasks.length === 0 ? 0 : Math.round((done.length / tasks.length) * 100);
  const taskTitle = (taskId: string) => tasks.find((row) => row.id === taskId)?.title ?? 'Uppgift';
  const taskSubject = (taskId: string) =>
    tasks.find((row) => row.id === taskId)?.subject?.trim() || 'Övrigt';

  return (
    <div>
      <PageIntro
        eyebrow="Elevpanel"
        title="Mina framsteg"
        description="En översikt över det du har lämnat in, slutfört och fått återkoppling på. Siffrorna räknas fram från dina riktiga uppgifter."
      />

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Stat label="Uppgifter totalt" value={tasks.length} hint="Tilldelade dig" />
        <Stat label="Inlämnade" value={submitted.length} tone="green" hint="Med svar" />
        <Stat label="Återkopplade" value={feedback.length} tone={feedback.length ? 'green' : 'neutral'} hint="Från lärare" />
        <Stat label="Slutförda aktiviteter" value={`${doneActivities.length}/${activities.length}`} hint="Publicerade för dig" />
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <Card title="Din progression" subtitle="Andel uppgifter som är inlämnade">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="small muted">Inlämnade uppgifter</span>
              <strong>{rate}%</strong>
            </div>
            <div className="progress-bar" aria-label={`${rate} procent inlämnade`}>
              <span style={{ width: `${rate}%` }} />
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              {done.length} av {tasks.length} uppgifter är inlämnade. {drafts.length} är
              sparade utkast och {feedback.length} har fått återkoppling.
            </p>
          </Card>

          <Card title="Återkoppling från lärare" subtitle="Det läraren har skrivit">
            {feedback.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={22} />}
                title="Ingen återkoppling ännu"
                description="När en lärare har följt upp en uppgift visas kommentaren här."
              />
            ) : (
              <div className="list">
                {feedback.map((row) => (
                  <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="list-main">
                      <p className="list-title">{taskTitle(row.task_id)}</p>
                      <p className="list-sub">{taskSubject(row.task_id)} · {shortDate(row.feedback_at ?? row.updated_at)}</p>
                      <div className="note-box" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                        {row.feedback}
                      </div>
                    </div>
                    <Badge tone={row.status === 'aterlamnad' ? 'amber' : 'green'}>
                      {row.status === 'aterlamnad' ? 'Komplettera' : 'Granskad'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Inlämningshistorik" subtitle="Dina inlämnade svar">
            {submitted.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={22} />} title="Inga inlämningar ännu" description="När du lämnar in en uppgift syns den här." />
            ) : (
              <div className="list">
                {submitted.map((row) => (
                  <div key={row.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{taskTitle(row.task_id)}</p>
                      <p className="list-sub">{taskSubject(row.task_id)} · inlämnad {shortDate(row.submitted_at)}</p>
                    </div>
                    <Badge tone={row.status === 'granskad' ? 'green' : 'amber'}>
                      {row.status === 'granskad' ? 'Granskad' : row.status === 'aterlamnad' ? 'Komplettera' : 'Väntar'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Aktiviteter" subtitle="Dina slutförda övningar">
            {activities.length === 0 ? (
              <EmptyState icon={<ActivityIcon size={22} />} title="Inga aktiviteter ännu" description="Aktiviteter som lärarna publicerar visas här." />
            ) : (
              <div className="list">
                {activities.map((row) => (
                  <div key={row.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{row.title}</p>
                      <p className="list-sub">{row.subject || 'Övrigt'} · {row.class_name || 'Din klass'}</p>
                    </div>
                    <Badge tone={row.completed ? 'green' : 'neutral'}>{row.completed ? 'Klar' : 'Kvar'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Om statistiken" subtitle="Så räknas den">
            <p className="small muted" style={{ margin: 0 }}>
              <TrendingUp size={14} /> All statistik bygger på dina egna uppgifter,
              inlämningar och aktiviteter. Elda Skola visar inga betyg eller
              påhittade poäng; återkoppling är lärarens egna ord.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
