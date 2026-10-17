import React from 'react';
import {
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Plus,
  Sparkles,
  Star,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { AssignedTask, listMyTasks, sortAssignedTasks } from '../../lib/assignments';
import { PlannerTask, XpState, fetchXpState, listTasks, sortPlannerTasks } from '../../lib/planner';
import { Result } from '../../lib/db';
import { dueLabel, formatLongDate, todayISO } from '../../lib/dates';
import { WEEKDAY_LABELS, toISODate } from '../../lib/calendar';
import { AsyncState, useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PartialDataNotice,
  Pill,
  ProgressBar,
  SectionCard,
} from '../../components/ui';
import { QuickLinks } from '../../components/QuickLinks';

interface Props {
  onNavigate: (pageId: string) => void;
}

interface Data {
  own: PlannerTask[];
  tasks: AssignedTask[];
  xp: XpState;
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

async function loadOversikt(): Promise<Result<Data>> {
  const [own, tasks, xp] = await Promise.all([listTasks(), listMyTasks(), fetchXpState()]);

  if (!own.ok) return own;

  const missing: string[] = [];
  if (!tasks.ok) missing.push('dina uppgifter');
  if (!xp.ok) missing.push('dina poäng');

  return {
    ok: true,
    data: {
      own: own.data,
      tasks: tasks.ok ? tasks.data : [],
      xp: xp.ok
        ? xp.data
        : { totalXp: 0, level: 1, xpPerLevel: 100, intoLevel: 0, xpToNext: 100 },
      missing,
    },
  };
}

/** En rad i dagens agenda — antingen en egen post eller en uppgift. */
interface AgendaItem {
  id: string;
  title: string;
  sub: string;
  kind: 'uppgift' | 'egen';
  due: string | null;
  overdue: boolean;
}

function taskItem(task: AssignedTask, today: string): AgendaItem {
  return {
    id: task.id,
    title: task.title,
    sub: [task.subject, task.submitted_at ? 'Inlämnad uppgift' : 'Uppgift från skolan']
      .filter(Boolean)
      .join(' · '),
    kind: 'uppgift',
    due: task.due_date,
    overdue: Boolean(task.due_date && task.due_date < today),
  };
}

function ownItem(task: PlannerTask, today: string): AgendaItem {
  return {
    id: task.id,
    title: task.title,
    sub: [task.category, 'Din egen post'].filter(Boolean).join(' · '),
    kind: 'egen',
    due: task.due_date,
    overdue: Boolean(task.due_date && task.due_date < today),
  };
}

interface WeekDay {
  iso: string;
  weekday: string;
  day: number;
  count: number;
  isToday: boolean;
}

/** De kommande sju dagarna med antal poster per dag, ur elevens riktiga data. */
function nextWeek(today: string, counts: ReadonlyMap<string, number>): WeekDay[] {
  const [year, month, day] = today.split('-').map(Number);
  const base = new Date(year, month - 1, day);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + index);
    const iso = toISODate(date.getFullYear(), date.getMonth(), date.getDate());
    return {
      iso,
      weekday: WEEKDAY_LABELS[(date.getDay() + 6) % 7],
      day: date.getDate(),
      count: counts.get(iso) ?? 0,
      isToday: index === 0,
    };
  });
}

/** Ring som visar hur långt eleven har kvar till nästa nivå. */
const LevelRing: React.FC<{ level: number; intoLevel: number; xpPerLevel: number }> = ({
  level,
  intoLevel,
  xpPerLevel,
}) => {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const ratio = xpPerLevel > 0 ? Math.min(Math.max(intoLevel / xpPerLevel, 0), 1) : 0;

  return (
    <div
      className="pv-ring"
      role="img"
      aria-label={`Nivå ${level}. ${intoLevel} av ${xpPerLevel} XP mot nästa nivå.`}
    >
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="pv-ring-track" cx="52" cy="52" r={radius} />
        <circle
          className="pv-ring-fill"
          cx="52"
          cy="52"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="pv-ring-center">
        <span className="pv-ring-value">{level}</span>
        <span className="pv-ring-label">Nivå</span>
      </div>
    </div>
  );
};

/**
 * Privatelevens översikt.
 *
 * Visar bara elevens egna poster och uppgifter — ingen klass, inga kamrater och
 * ingen klasschatt. Allt räknas fram ur det som finns i databasen; saknas data
 * visas ett tydligt tomt läge i stället för påhittade siffror.
 */
export const PrivateStartPage: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useAuth();
  const state: AsyncState<Data> = useAsync(loadOversikt);
  const today = todayISO();

  const own = state.data?.own ?? [];
  const tasks = state.data?.tasks ?? [];
  const xp = state.data?.xp ?? null;
  const xpKnown = Boolean(state.data) && !state.data?.missing.includes('dina poäng');

  const openOwn = sortPlannerTasks(own.filter((task) => task.status !== 'klar'));
  const openTasks = sortAssignedTasks(tasks.filter((task) => task.status !== 'klar'));
  const doneOwn = own.filter((task) => task.status === 'klar');
  const doneTasks = tasks.filter((task) => task.status === 'klar');

  const todayItems: AgendaItem[] = [
    ...openTasks.filter((task) => task.due_date === today).map((task) => taskItem(task, today)),
    ...openOwn.filter((task) => task.due_date === today).map((task) => ownItem(task, today)),
  ];

  // Försenade först, därefter så som planeringen själv sorterar dem.
  const upcomingItems: AgendaItem[] = [
    ...openTasks.map((task) => taskItem(task, today)),
    ...openOwn.map((task) => ownItem(task, today)),
  ]
    .sort((a, b) => Number(b.overdue) - Number(a.overdue))
    .slice(0, 5);

  const overdueCount = [...openOwn, ...openTasks].filter(
    (task) => task.due_date && task.due_date < today,
  ).length;
  const openTotal = openOwn.length + openTasks.length;
  const doneTotal = doneOwn.length + doneTasks.length;

  const weekCounts = new Map<string, number>();
  for (const task of [...own, ...tasks]) {
    if (!task.due_date) continue;
    const iso = task.due_date.slice(0, 10);
    weekCounts.set(iso, (weekCounts.get(iso) ?? 0) + 1);
  }
  const week = nextWeek(today, weekCounts);
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);

  const lead = (() => {
    if (!state.data) return 'Här samlas din planering, dina uppgifter och dina framsteg.';
    if (overdueCount > 0) {
      return `${overdueCount} ${overdueCount === 1 ? 'post har' : 'poster har'} passerat sitt datum. Börja med dem, eller flytta fram dem i Min planering.`;
    }
    if (todayItems.length > 0) {
      return `Du har ${todayItems.length} ${todayItems.length === 1 ? 'sak' : 'saker'} inplanerade idag.`;
    }
    if (openTotal > 0) {
      return `${openTotal} ${openTotal === 1 ? 'post väntar' : 'poster väntar'} på dig. Ta nästa när du är redo.`;
    }
    return 'Inget inplanerat just nu. Skriv upp nästa studiepass i Min planering när du vill komma igång.';
  })();

  const name = user?.username ?? '';

  return (
    <div className="panel-page" data-testid="page-privat-start">
      {state.loading && <LoadingState label="Hämtar din översikt…" />}
      {!state.loading && state.error && (
        <ErrorState message={state.error} onRetry={state.reload} />
      )}
      {state.data && <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />}

      <section className="pv-hero" aria-labelledby="pv-hero-title">
        <div className="pv-hero-main">
          <p className="pv-eyebrow">Privat konto · {formatLongDate()}</p>
          <h2 className="pv-hero-title" id="pv-hero-title">
            Hej {name}
          </h2>
          <p className="pv-hero-lead">{lead}</p>
          <div className="pv-hero-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNavigate('ai-hjalp')}
            >
              <Sparkles size={16} aria-hidden="true" /> Fråga AI-studiehjälpen
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onNavigate('planering')}
            >
              <Plus size={16} aria-hidden="true" /> Planera ett studiepass
            </button>
          </div>
        </div>

        <div className="pv-hero-side">
          {xp && xpKnown && (
            <LevelRing level={xp.level} intoLevel={xp.intoLevel} xpPerLevel={xp.xpPerLevel} />
          )}
          <div className="pv-facts">
            <div className="pv-fact">
              <span className="pv-fact-value">{todayItems.length}</span>
              <span className="pv-fact-label">inplanerat idag</span>
            </div>
            <div className="pv-fact">
              <span className="pv-fact-value">{openTotal}</span>
              <span className="pv-fact-label">kvar att göra</span>
            </div>
            <div className="pv-fact">
              <span className="pv-fact-value">{doneTotal}</span>
              <span className="pv-fact-label">avklarade</span>
            </div>
            {xp && xpKnown && (
              <div className="pv-fact">
                <span className="pv-fact-value">{xp.totalXp}</span>
                <span className="pv-fact-label">XP totalt</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="pv-columns">
        <div className="pv-stack">
          <SectionCard
            title="Idag"
            subtitle="Dagens planering och uppgifter"
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onNavigate('planering')}
              >
                Min planering
              </button>
            }
          >
            {state.data && todayItems.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={22} />}
                title="Inget inplanerat idag"
                description="Ingen egen post och ingen uppgift har dagens datum. Lägg gärna upp ett studiepass i Min planering."
                action={
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onNavigate('planering')}
                  >
                    <Plus size={15} aria-hidden="true" /> Ny post
                  </button>
                }
              />
            ) : (
              <ul className="list">
                {todayItems.map((item) => (
                  <li className="pv-agenda-item" key={`${item.kind}-${item.id}`}>
                    <span className="pv-agenda-icon" aria-hidden="true">
                      {item.kind === 'uppgift' ? (
                        <CheckSquare size={15} />
                      ) : (
                        <CalendarDays size={15} />
                      )}
                    </span>
                    <div className="pv-agenda-body">
                      <div className="pv-agenda-title">{item.title}</div>
                      <div className="pv-agenda-sub">{item.sub}</div>
                    </div>
                    {item.overdue ? (
                      <Pill tone="warn">Försenad</Pill>
                    ) : (
                      <Pill tone={item.kind === 'uppgift' ? 'info' : 'muted'}>
                        {item.kind === 'uppgift' ? 'Uppgift' : 'Egen'}
                      </Pill>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Att göra härnäst"
            subtitle={
              overdueCount > 0
                ? `${overdueCount} ${overdueCount === 1 ? 'försenad' : 'försenade'} · ${openTotal} kvar totalt`
                : `${openTotal} kvar totalt`
            }
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onNavigate('uppgifter')}
              >
                Alla uppgifter
              </button>
            }
          >
            {state.data && upcomingItems.length === 0 ? (
              <EmptyState
                icon={<CheckSquare size={22} />}
                title="Inget att göra just nu"
                description="Dina egna studieaktiviteter och de uppgifter som tilldelats dig visas här."
              />
            ) : (
              <ul className="list">
                {upcomingItems.map((item) => (
                  <li className="pv-agenda-item" key={`next-${item.kind}-${item.id}`}>
                    <span className="pv-agenda-icon" aria-hidden="true">
                      {item.kind === 'uppgift' ? (
                        <ClipboardList size={15} />
                      ) : (
                        <CalendarDays size={15} />
                      )}
                    </span>
                    <div className="pv-agenda-body">
                      <div className="pv-agenda-title">{item.title}</div>
                      <div className="pv-agenda-sub">
                        {item.due ? `${dueLabel(item.due, new Date())} · ` : ''}
                        {item.sub}
                      </div>
                    </div>
                    {item.overdue && <Pill tone="warn">Försenad</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="pv-stack">
          <SectionCard title="Din vecka" subtitle="De kommande sju dagarna">
            <div className="pv-week">
              {week.map((day) => (
                <div
                  className={`pv-week-day ${day.isToday ? 'is-today' : ''}`}
                  key={day.iso}
                  title={`${day.weekday} ${day.day}: ${day.count} poster`}
                >
                  <span className="pv-week-weekday">{day.weekday}</span>
                  <span className="pv-week-number">{day.day}</span>
                  <span
                    className={`pv-week-count ${day.count > 0 ? 'has-items' : 'is-empty'}`}
                    aria-label={`${day.count} poster`}
                  >
                    {day.count > 0 ? day.count : '–'}
                  </span>
                </div>
              ))}
            </div>
            <p className="security-note" role="status">
              {state.loading
                ? 'Räknar ihop din vecka…'
                : weekTotal > 0
                  ? `${weekTotal} ${weekTotal === 1 ? 'post' : 'poster'} med datum de kommande sju dagarna.`
                  : 'Ingen post med datum de kommande sju dagarna.'}
            </p>
          </SectionCard>

          <SectionCard title="AI-studiehjälp" subtitle="Få hjälp att förstå och komma vidare">
            <div className="pv-ai">
              <span className="pv-ai-icon" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <div className="pv-ai-body">
                <p className="pv-ai-text">
                  Ställ en fråga om det du studerar, så hjälper AI:n dig att förstå
                  sammanhanget. Du kan också göra ett Word-, Excel- eller
                  PowerPoint-dokument av samtalet.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onNavigate('ai-hjalp')}
                >
                  Öppna AI-studiehjälpen
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Mina framsteg"
            subtitle="Din egen utveckling i Elda"
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onNavigate('framsteg')}
              >
                Visa mer
              </button>
            }
          >
            {xp && xpKnown ? (
              <>
                <div className="row-actions">
                  <Pill tone="info">
                    <Star size={13} aria-hidden="true" /> {xp.totalXp} XP
                  </Pill>
                  <Pill tone="muted">Nivå {xp.level}</Pill>
                </div>
                <ProgressBar
                  value={xp.intoLevel}
                  max={xp.xpPerLevel}
                  label={`Nivå ${xp.level}`}
                  caption={`${xp.intoLevel} / ${xp.xpPerLevel} XP`}
                />
              </>
            ) : (
              <p className="pv-ai-text">
                Poängen kunde inte hämtas just nu, så de visas inte här.
              </p>
            )}
            <p className="security-note">
              {doneTotal > 0
                ? `${doneTotal} ${doneTotal === 1 ? 'post' : 'poster'} avklarade. `
                : ''}
              Statistiken räknas fram ur dina egna uppgifter och poster.
            </p>
          </SectionCard>
        </div>
      </div>

      <QuickLinks
        panel="privat"
        onNavigate={onNavigate}
        pages={['amnen', 'dokument', 'flashcards', 'provtraning']}
        title="Dina studieverktyg"
        subtitle="Ämnen, dokument, repetition och provträning"
      />
    </div>
  );
};
