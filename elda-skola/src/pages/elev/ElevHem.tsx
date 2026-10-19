import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  listActivities,
  listAnnouncements,
  listClasses,
  listEvents,
  listMySubmissions,
  celebrateSubmissionXp,
  listTasks,
} from '../../lib/api';
import { findSubmission, isTaskOpen, mergeTaskSubmission } from '../../lib/submissions';
import { deadlineLabel, displayName, isoWeek, longDate, shortDate, sortByDate, truncate } from '../../lib/format';
import { Button, Card, EmptyState, PageIntro, Spinner, Stat } from '../../components/ui';
import { groupCalendarItems, MonthCalendar } from '../../components/Calendar';
import { XpPopup } from '../../components/XpPopup';

interface Props {
  onNavigate: (page: string) => void;
}

export const ElevHem: React.FC<Props> = ({ onNavigate }) => {
  const { identity, profile } = useAuth();
  const state = useAsync(async () => {
    const classes = await listClasses();
    const [tasks, submissions, events, announcements, activities] = await Promise.all([
      listTasks(),
      listMySubmissions(),
      listEvents(),
      listAnnouncements(classes.map((row) => row.id)),
      listActivities(),
    ]);
    return { classes, tasks, submissions, events, announcements, activities };
  }, []);

  // XP-popupen: en godkänd inlämning som ännu inte visats. Servern betalar ut
  // XP en gång och returnerar beloppet; popupen visas först när det finns.
  const [xpPopup, setXpPopup] = React.useState<{ xp: number; title: string | null } | null>(null);
  const unseenXp = state.data?.submissions.find((row) => row.xp_awarded && !row.xp_celebrated_at) ?? null;
  const unseenId = unseenXp?.id ?? null;
  const unseenTitle = unseenXp?.task_title ?? null;
  React.useEffect(() => {
    if (!unseenId) return;
    let cancelled = false;
    celebrateSubmissionXp(unseenId)
      .then((res) => {
        if (!cancelled && res.xp_awarded > 0) {
          setXpPopup({ xp: res.xp_awarded, title: unseenTitle });
        }
      })
      .catch((err) => console.warn('Kunde inte visa XP-beloppet', err));
    return () => {
      cancelled = true;
    };
  }, [unseenId, unseenTitle]);

  if (state.loading) return <Spinner label="Hämtar din skoldag…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Hem" description="Din skoldag i Elda Skola." />
        <Card>
          <EmptyState
            title="Kunde inte hämta startsidan"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  const { classes, tasks, submissions, events, announcements, activities } = state.data ?? {
    classes: [],
    tasks: [],
    submissions: [],
    events: [],
    announcements: [],
    activities: [],
  };
  const open = tasks.filter(
    (task) => !task.archived_at && isTaskOpen(task, findSubmission(submissions, task.id)),
  );
  const calendarTasks = tasks.map((task) =>
    mergeTaskSubmission(task, findSubmission(submissions, task.id)),
  );
  const upcoming = sortByDate(open, (task) => task.due_date).slice(0, 5);
  const unread = announcements.filter((row) => !row.read_at);
  const className = classes.map((row) => row.name).join(' · ') || 'Ingen klass ännu';
  const name = profile ? displayName(profile) : identity?.username ?? '';
  const monthItems = groupCalendarItems(calendarTasks, events);
  const activitiesOpen = activities.filter((activity) => !activity.completed);
  const feedback = submissions
    .filter((row) => Boolean(row.feedback))
    .sort((a, b) => (b.feedback_at ?? b.updated_at).localeCompare(a.feedback_at ?? a.updated_at))
    .slice(0, 3);

  return (
    <div>
      {xpPopup && (
        <XpPopup xp={xpPopup.xp} taskTitle={xpPopup.title} onClose={() => setXpPopup(null)} />
      )}
      <PageIntro
        eyebrow="Elevpanel"
        title={`Hej ${name.split(' ')[0] || ''}`}
        description={`${longDate()} · Vecka ${isoWeek()} · ${className}`}
      />

      <div className="hero">
        <img src="/ronneby.webp" alt="Ronnebyån en solig dag" />
        <div className="hero-content">
          <div className="hero-meta">
            <span>Vecka {isoWeek()}</span>
            <span>{classes.length} klass{classes.length === 1 ? '' : 'er'}</span>
            <span>{open.length} öppna uppgifter</span>
          </div>
          <h2>Din skoldag, samlad på ett ställe</h2>
          <p>
            Här ser du vad som händer just nu: uppgifter, deadlines, klassinformation
            och material från dina lärare.
          </p>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Stat label="Öppna uppgifter" value={open.length} tone={open.length ? 'green' : 'neutral'} hint="Ej inlämnade" />
        <Stat
          label="Nästa deadline"
          value={upcoming[0] ? shortDate(upcoming[0].due_date) : '—'}
          tone={upcoming[0] ? 'amber' : 'neutral'}
          hint={upcoming[0] ? deadlineLabel(upcoming[0].due_date) : 'Ingen kommande'}
        />
        <Stat
          label="Olästa meddelanden"
          value={unread.length}
          tone={unread.length ? 'amber' : 'neutral'}
          hint={unread.length ? 'Från dina lärare' : 'Allt läst'}
        />
        <Stat label="Aktiviteter kvar" value={activitiesOpen.length} hint="Publicerade för dig" />
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <Card
            title="Kommande deadlines"
            subtitle="Uppgifter som väntar på dig"
            action={
              <Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={() => onNavigate('uppgifter')}>
                Alla uppgifter
              </Button>
            }
          >
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={22} />}
                title="Inga öppna uppgifter"
                description="När en lärare publicerar en uppgift dyker den upp här."
              />
            ) : (
              <div className="list">
                {upcoming.map((task) => (
                  <div key={task.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{task.title}</p>
                      <p className="list-sub">
                        {task.subject || 'Övrigt'} · {task.class_name || 'Din klass'}
                      </p>
                    </div>
                    <div className="list-side">
                      <span className="small muted">{shortDate(task.due_date)}</span>
                      <span className={`badge ${deadlineLabel(task.due_date).includes('försenad') ? 'badge-red' : 'badge-amber'}`}>
                        {deadlineLabel(task.due_date)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Återkoppling från lärare"
            subtitle="Kommentarer på dina inlämningar"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('uppgifter')}>
                Alla uppgifter
              </Button>
            }
          >
            {feedback.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={22} />}
                title="Ingen återkoppling ännu"
                description="När en lärare har granskat eller återlämnat en uppgift visas kommentaren här."
              />
            ) : (
              <div className="list">
                {feedback.map((row) => {
                  const task = tasks.find((item) => item.id === row.task_id);
                  return (
                    <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                      <div className="list-main">
                        <p className="list-title">{task?.title || 'Uppgift'}</p>
                        <p className="list-sub">
                          {task?.subject || 'Övrigt'} · {shortDate(row.feedback_at ?? row.updated_at)}
                        </p>
                        <div className="note-box" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                          {truncate(row.feedback, 220)}
                        </div>
                      </div>
                      <span className={`badge ${row.status === 'aterlamnad' ? 'badge-amber' : 'badge-green'}`}>
                        {row.status === 'aterlamnad' ? 'Komplettera' : 'Granskad'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Dina ämnen" subtitle="Genvägar till material och uppgifter">
            {classes.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={22} />}
                title="Du är inte kopplad till någon klass ännu"
                description="Din lärare lägger till dig i rätt klass. Därefter syns dina ämnen här."
              />
            ) : (
              <div className="item-grid">
                {classes.map((row) => (
                  <button key={row.id} type="button" className="subject-tile" onClick={() => onNavigate('amnen')}>
                    <span className="icon"><BookOpen size={18} /></span>
                    <h3>{row.subject || row.name}</h3>
                    <p>{row.name} · {row.member_count} medlemmar</p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Den här månaden" subtitle="Dina deadlines och händelser">
            <MonthCalendar
              month={new Date()}
              items={monthItems}
              selected={null}
              onSelect={() => onNavigate('kalender')}
              onMonthChange={() => onNavigate('kalender')}
            />
            <Button
              variant="ghost"
              size="sm"
              className="btn-block"
              icon={<CalendarDays size={15} />}
              onClick={() => onNavigate('kalender')}
              style={{ marginTop: 10, width: '100%' }}
            >
              Öppna kalendern
            </Button>
          </Card>

          <Card
            title="Senaste information"
            subtitle="Från dina lärare"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('meddelanden')}>
                Visa alla
              </Button>
            }
          >
            {announcements.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={21} />}
                title="Ingen information ännu"
                description="Klassens meddelanden visas här när läraren publicerar dem."
              />
            ) : (
              <div className="list">
                {announcements.slice(0, 3).map((row) => (
                  <div key={row.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{row.title}</p>
                      <p className="list-sub">{row.author_name} · {shortDate(row.created_at)}</p>
                    </div>
                    {!row.read_at && <span className="badge badge-green">Ny</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Aktiviteter" subtitle="Publicerat för dina klasser">
            {activitiesOpen.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={21} />}
                title="Inga aktiviteter just nu"
                description="När en lärare publicerar en läraktivitet syns den här."
              />
            ) : (
              <div className="list">
                {activitiesOpen.slice(0, 3).map((activity) => (
                  <div key={activity.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{activity.title}</p>
                      <p className="list-sub">{activity.subject || 'Övrigt'} · {activity.class_name || 'Din klass'}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onNavigate('amnen')}>
                      Öppna
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
