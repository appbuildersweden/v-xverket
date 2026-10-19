import React from 'react';
import { ArrowRight, ClipboardCheck, ClipboardList, GraduationCap, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  listActivities,
  listAnnouncements,
  listClasses,
  listEvents,
  listMyStudents,
  listSubmissions,
  listTasks,
} from '../../lib/api';
import { deadlineLabel, shortDate, displayName } from '../../lib/format';
import { countSubmissions } from '../../lib/submissions';
import type { Task } from '../../lib/types';
import { Badge, Button, Card, EmptyState, PageIntro, Spinner, Stat } from '../../components/ui';

interface Props {
  onNavigate: (page: string) => void;
}

export const LarareOversikt: React.FC<Props> = ({ onNavigate }) => {
  const { profile, identity } = useAuth();
  const state = useAsync(async () => {
    const classes = await listClasses();
    const [students, tasks, activities, events, announcements, submissions] = await Promise.all([
      listMyStudents(),
      // Alla uppgifter läraren har behörighet till, inklusive en medlärares
      // uppgifter i samma klass.
      listTasks(),
      listActivities(),
      listEvents(),
      listAnnouncements(classes.map((row) => row.id)),
      listSubmissions(),
    ]);
    return { classes, students, tasks, activities, events, announcements, submissions };
  }, []);

  if (state.loading) return <Spinner label="Hämtar översikten…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Översikt" />
        <Card><EmptyState title="Kunde inte hämta översikten" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  const { classes, students, tasks, activities, events, announcements, submissions } = state.data ?? {
    classes: [],
    students: [],
    tasks: [],
    activities: [],
    events: [],
    announcements: [],
    submissions: [],
  };
  // Bara publicerade uppgifter räknas: ett utkast har ingen elev som kan sakna
  // en inlämning och ska inte påverka översikten.
  const openTasks = tasks.filter(
    (row) => !row.archived_at && row.published !== false,
  );
  const taskIds = new Set(openTasks.map((row) => row.id));
  const waiting = submissions.filter(
    (row) => row.status === 'inlamnad' && taskIds.has(row.task_id),
  );

  // Saknade svar räknas mot den klass eller elev som uppgiften faktiskt gäller.
  const studentsByClass = new Map<string, Set<string>>();
  for (const row of students) {
    const set = studentsByClass.get(row.class_id) ?? new Set<string>();
    set.add(row.id);
    studentsByClass.set(row.class_id, set);
  }
  const audienceSize = (task: Task): number => {
    if (task.student_id) return 1;
    if (!task.class_id) return 0;
    return studentsByClass.get(task.class_id)?.size ?? 0;
  };
  const totals = openTasks.reduce(
    (sum, task) => {
      const counts = countSubmissions(task, submissions, audienceSize(task));
      return {
        missing: sum.missing + counts.missing,
        returned: sum.returned + counts.returned,
        reviewed: sum.reviewed + counts.reviewed,
      };
    },
    { missing: 0, returned: 0, reviewed: 0 },
  );
  const soon = [...openTasks]
    .filter((row) => row.due_date)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 5);
  const name = profile ? displayName(profile) : identity?.username ?? '';
  const uniqueStudents = new Set(students.map((row) => row.id)).size;

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title={`God dag, ${name.split(' ')[0] || ''}`}
        description="En samlad bild av dina klasser, uppgifter och det som väntar på återkoppling."
        actions={<Button icon={<ClipboardList size={16} />} onClick={() => onNavigate('uppgifter')}>Ny uppgift</Button>}
      />

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Stat label="Klasser" value={classes.length} hint="Där du är lärare" />
        <Stat label="Elever" value={uniqueStudents} tone={uniqueStudents ? 'green' : 'neutral'} hint="Unika konton" />
        <Stat label="Öppna uppgifter" value={openTasks.length} hint="För dina klasser och elever" />
        <Stat label="Väntar på återkoppling" value={waiting.length} tone={waiting.length ? 'amber' : 'green'} hint="Inlämnade svar" />
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <Card
            title="Kommande deadlines"
            subtitle="Publicerade för dina klasser och elever"
            action={<Button size="sm" variant="ghost" icon={<ArrowRight size={15} />} onClick={() => onNavigate('uppgifter')}>Alla uppgifter</Button>}
          >
            {soon.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={22} />}
                title="Inga uppgifter med deadline"
                description="Skapa en uppgift för en klass eller en enskild elev. Den dyker upp här."
                action={<Button onClick={() => onNavigate('uppgifter')}>Skapa uppgift</Button>}
              />
            ) : (
              <div className="list">
                {soon.map((task) => (
                  <div key={task.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{task.title}</p>
                      <p className="list-sub">{task.class_name || 'Enskild elev'} · {task.subject || 'Övrigt'}</p>
                    </div>
                    <div className="list-side">
                      <span className="small muted">{shortDate(task.due_date)}</span>
                      <Badge tone={task.due_date && new Date(task.due_date) < new Date() ? 'red' : 'amber'}>
                        {deadlineLabel(task.due_date)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Väntar på återkoppling"
            subtitle="Elever som har lämnat in"
            action={<Button size="sm" variant="ghost" onClick={() => onNavigate('inlamningar')}>Öppna inlämningar</Button>}
          >
            {waiting.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck size={22} />}
                title="Inget väntar"
                description="När en elev lämnar in en uppgift visas den här tills du har gett återkoppling."
              />
            ) : (
              <div className="list">
                {waiting.slice(0, 5).map((task) => (
                  <div key={task.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{task.task_title || 'Uppgift'}</p>
                      <p className="list-sub">
                        {task.student_name || task.student_username || 'Elev'} · inlämnad {shortDate(task.submitted_at)}
                      </p>
                    </div>
                    <Badge tone="amber">Väntar</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card
            title="Inlämningsläge"
            subtitle="Räknat från elevernas individuella inlämningar"
            action={<Button size="sm" variant="ghost" onClick={() => onNavigate('inlamningar')}>Öppna</Button>}
          >
            <div className="list">
              <div className="list-row">
                <div className="list-main">
                  <p className="list-title">Väntar på återkoppling</p>
                  <p className="list-sub">Inlämnade svar som du inte har granskat</p>
                </div>
                <Badge tone={waiting.length ? 'amber' : 'green'}>{waiting.length}</Badge>
              </div>
              <div className="list-row">
                <div className="list-main">
                  <p className="list-title">Saknar inlämning</p>
                  <p className="list-sub">Elever som ännu inte har någon inlämning</p>
                </div>
                <Badge tone={totals.missing ? 'red' : 'green'}>{totals.missing}</Badge>
              </div>
              <div className="list-row">
                <div className="list-main">
                  <p className="list-title">Kompletterar</p>
                  <p className="list-sub">Återlämnade för komplettering</p>
                </div>
                <Badge tone={totals.returned ? 'amber' : 'green'}>{totals.returned}</Badge>
              </div>
              <div className="list-row">
                <div className="list-main">
                  <p className="list-title">Granskade</p>
                  <p className="list-sub">Svar med återkoppling</p>
                </div>
                <Badge tone="green">{totals.reviewed}</Badge>
              </div>
            </div>
          </Card>

          <Card
            title="Mina klasser"
            subtitle="Klasser och elevantal"
            action={<Button size="sm" variant="ghost" onClick={() => onNavigate('klasser')}>Hantera</Button>}
          >
            {classes.length === 0 ? (
              <EmptyState
                icon={<GraduationCap size={22} />}
                title="Inga klasser ännu"
                description="Skapa din första klass och bjud in elever med klasskoden."
                action={<Button onClick={() => onNavigate('klasser')}>Skapa klass</Button>}
              />
            ) : (
              <div className="list">
                {classes.map((row) => (
                  <div key={row.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{row.name}</p>
                      <p className="list-sub">{row.subject || 'Ämnesklass'} · {row.member_count} medlemmar</p>
                    </div>
                    <Badge tone="green">{row.member_role === 'larare' ? 'Lärare' : 'Elev'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Nästa händelser" subtitle="Kalender och planering">
            {events.length === 0 ? (
              <EmptyState
                icon={<Users size={22} />}
                title="Inga händelser"
                description="Lägg in planerade aktiviteter i kalendern."
                action={<Button size="sm" onClick={() => onNavigate('kalender')}>Öppna kalendern</Button>}
              />
            ) : (
              <div className="list">
                {events.slice(0, 4).map((event) => (
                  <div key={event.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{event.title}</p>
                      <p className="list-sub">{shortDate(event.starts_at)} · {event.class_name || 'Alla klasser'}</p>
                    </div>
                    <Badge tone="blue">Händelse</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Senaste information" subtitle="Publicerat för dina klasser">
            {announcements.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck size={22} />}
                title="Ingen information ännu"
                description="Skriv ett meddelande till en klass."
                action={<Button size="sm" onClick={() => onNavigate('meddelanden')}>Skriv information</Button>}
              />
            ) : (
              <div className="list">
                {announcements.slice(0, 3).map((row) => (
                  <div key={row.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{row.title}</p>
                      <p className="list-sub">{shortDate(row.created_at)} · {classes.find((c) => c.id === row.class_id)?.name ?? 'Klass'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="Läraktiviteter" subtitle="Dina publicerade aktiviteter" action={<Button size="sm" variant="ghost" onClick={() => onNavigate('aktiviteter')}>Skapa aktivitet</Button>} className="" >
        {activities.length === 0 ? (
          <EmptyState title="Inga aktiviteter ännu" description="Skapa en aktivitet som eleverna kan arbeta med i klassen." />
        ) : (
          <div className="item-grid">
            {activities.slice(0, 4).map((row) => (
              <div key={row.id} className="item-card">
                <div className="item-card-head">
                  <h3>{row.title}</h3>
                  <Badge tone={row.published ? 'green' : 'neutral'}>{row.published ? 'Publicerad' : 'Utkast'}</Badge>
                </div>
                <p>{row.subject || 'Övrigt'} · {row.class_name || 'Klass'}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
