import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import { listEvents, listMySubmissions, listTasks } from '../../lib/api';
import { longDate, shortDate, timeOnly } from '../../lib/format';
import { findSubmission, mergeTaskSubmission } from '../../lib/submissions';
import { Badge, Button, Card, EmptyState, PageIntro, Spinner } from '../../components/ui';
import { groupCalendarItems, MonthCalendar } from '../../components/Calendar';

export const ElevKalender: React.FC = () => {
  const state = useAsync(async () => {
    const [tasks, submissions, events] = await Promise.all([
      listTasks(),
      listMySubmissions(),
      listEvents(),
    ]);
    return { tasks, submissions, events };
  }, []);
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(null);

  const submissions = state.data?.submissions ?? [];
  const tasks = (state.data?.tasks ?? [])
    .filter((row) => !row.archived_at)
    .map((task) =>
      mergeTaskSubmission(
        task,
        findSubmission(submissions, task.id),
      ),
    );
  const events = state.data?.events ?? [];
  const items = useMemo(() => groupCalendarItems(tasks, events), [tasks, events]);

  const dayTasks = selected ? tasks.filter((row) => row.due_date === selected) : [];
  const dayEvents = selected
    ? events.filter((row) => row.starts_at.slice(0, 10) === selected)
    : [];

  if (state.loading) return <Spinner label="Hämtar kalendern…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Kalender och planering" />
        <Card><EmptyState title="Kunde inte hämta kalendern" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Elevpanel"
        title="Kalender och planering"
        description="Deadlines från dina uppgifter och händelser som lärarna har lagt in. Allt hämtas från skolans riktiga data."
      />

      <div className="dashboard-grid">
        <Card>
          <MonthCalendar
            month={month}
            items={items}
            selected={selected}
            onSelect={setSelected}
            onMonthChange={setMonth}
          />
          <div className="row small muted" style={{ marginTop: 12, gap: 14 }}>
            <span><span className="legend-dot task" /> Uppgift</span>
            <span><span className="legend-dot event" /> Händelse</span>
          </div>
        </Card>

        <Card
          title={selected ? longDate(selected) : 'Välj en dag'}
          subtitle={selected ? 'Det som händer den här dagen' : 'Klicka på en dag i kalendern'}
          action={
            selected && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Rensa
              </Button>
            )
          }
        >
          {!selected ? (
            <EmptyState
              icon={<CalendarDays size={22} />}
              title="Ingen dag vald"
              description="Välj en dag för att se deadlines och händelser."
            />
          ) : dayTasks.length === 0 && dayEvents.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={22} />}
              title="Inget planerat"
              description="Det finns inga uppgifter eller händelser den här dagen."
            />
          ) : (
            <div className="list">
              {dayEvents.map((event) => (
                <div key={event.id} className="list-row">
                  <div className="list-main">
                    <p className="list-title">{event.title}</p>
                    <p className="list-sub">
                      {event.all_day ? 'Heldag' : timeOnly(event.starts_at)}
                      {event.class_name ? ` · ${event.class_name}` : ''}
                    </p>
                    {event.description && <p className="list-sub">{event.description}</p>}
                  </div>
                  <Badge tone="blue">Händelse</Badge>
                </div>
              ))}
              {dayTasks.map((task) => (
                <div key={task.id} className="list-row">
                  <div className="list-main">
                    <p className="list-title">{task.title}</p>
                    <p className="list-sub">{task.subject || 'Övrigt'} · {task.class_name || 'Din klass'}</p>
                  </div>
                  <Badge tone={task.status === 'klar' ? 'green' : 'amber'}>
                    {task.status === 'klar' ? 'Klar' : 'Deadline'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Kommande" subtitle="Närmaste deadlines och händelser" className="" >
        <div className="list">
          {[...tasks.filter((task) => task.due_date && task.due_date >= new Date().toISOString().slice(0, 10)).map((task) => ({
            id: `t-${task.id}`,
            date: task.due_date as string,
            title: task.title,
            sub: `${task.subject || 'Övrigt'} · ${task.class_name || 'Din klass'}`,
            kind: 'Uppgift',
            tone: (task.status === 'klar' ? 'green' : 'amber') as 'green' | 'amber',
          })), ...events.map((event) => ({
            id: `e-${event.id}`,
            date: event.starts_at.slice(0, 10),
            title: event.title,
            sub: event.all_day ? 'Heldag' : `Kl. ${timeOnly(event.starts_at)}`,
            kind: 'Händelse',
            tone: 'blue' as const,
          }))].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map((item) => (
            <div key={item.id} className="list-row">
              <div className="list-main">
                <p className="list-title">{item.title}</p>
                <p className="list-sub"><Clock size={11} /> {shortDate(item.date)} · {item.sub}</p>
              </div>
              <Badge tone={item.tone}>{item.kind}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <style>{`
        .legend-dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px}
        .legend-dot.task{background:var(--green-active)}
        .legend-dot.event{background:#cfe1ec}
      `}</style>
    </div>
  );
};
