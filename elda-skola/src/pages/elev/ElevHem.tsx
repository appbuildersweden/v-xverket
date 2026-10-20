import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  listActivities,
  listAnnouncements,
  listClasses,
  listMySubmissions,
  celebrateSubmissionXp,
  listTasks,
} from '../../lib/api';
import { findSubmission, isTaskOpen } from '../../lib/submissions';
import { greetingFor } from '../../lib/greeting';
import { deadlineLabel, displayName, isoWeek, longDate, shortDate, sortByDate } from '../../lib/format';
import { Button, Card, EmptyState, PageIntro, Spinner, Stat } from '../../components/ui';
import { SchoolNews } from '../../components/SchoolNews';
import { XpPopup } from '../../components/XpPopup';
import { HalloweenInvite } from '../../components/halloween/HalloweenInvite';
import { DailyJoke } from '../../components/DailyJoke';

interface Props {
  onNavigate: (page: string) => void;
}

/** Uppdaterar tiden var minut så att hälsningen byter när tidsintervallet ändras. */
function useClock(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export const ElevHem: React.FC<Props> = ({ onNavigate }) => {
  const { identity, profile } = useAuth();
  const now = useClock();
  const state = useAsync(async () => {
    const classes = await listClasses();
    const [tasks, submissions, announcements, activities] = await Promise.all([
      listTasks(),
      listMySubmissions(),
      listAnnouncements(classes.map((row) => row.id)),
      listActivities(),
    ]);
    return { classes, tasks, submissions, announcements, activities };
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

  const { classes, tasks, submissions, announcements, activities } = state.data ?? {
    classes: [],
    tasks: [],
    submissions: [],
    announcements: [],
    activities: [],
  };
  const open = tasks.filter(
    (task) => !task.archived_at && isTaskOpen(task, findSubmission(submissions, task.id)),
  );
  const nextTask = sortByDate(open, (task) => task.due_date)[0] ?? null;
  const unread = announcements.filter((row) => !row.read_at);
  const className = classes.map((row) => row.name).join(' · ') || 'Ingen klass ännu';
  const greeting = greetingFor(now, profile ? displayName(profile) : identity?.username ?? null);
  const activitiesOpen = activities.filter((activity) => !activity.completed);

  return (
    <div>
      {xpPopup && (
        <XpPopup xp={xpPopup.xp} taskTitle={xpPopup.title} onClose={() => setXpPopup(null)} />
      )}
      <PageIntro
        eyebrow="Elevpanel"
        title={greeting}
        description={`${longDate()} · Vecka ${isoWeek()} · ${className}`}
      />

      <div className="hero">
        <img src="ronneby.webp" alt="Ronnebyån en solig dag" />
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

      <DailyJoke />

      <HalloweenInvite onOpen={() => onNavigate('halloween')} />

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Stat label="Öppna uppgifter" value={open.length} tone={open.length ? 'green' : 'neutral'} hint="Ej inlämnade" />
        <Stat
          label="Nästa deadline"
          value={nextTask ? shortDate(nextTask.due_date) : '—'}
          tone={nextTask ? 'amber' : 'neutral'}
          hint={nextTask ? deadlineLabel(nextTask.due_date) : 'Ingen kommande'}
        />
        <Stat
          label="Olästa meddelanden"
          value={unread.length}
          tone={unread.length ? 'amber' : 'neutral'}
          hint={unread.length ? 'Från dina lärare' : 'Allt läst'}
        />
        <Stat label="Aktiviteter kvar" value={activitiesOpen.length} hint="Publicerade för dig" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <SchoolNews />
      </div>

      <div className="dashboard-grid">
        <div className="stack">
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
        </div>

        <div className="stack">
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
