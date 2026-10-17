import React from 'react';
import { CalendarDays, CheckSquare, Star } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { AssignedTask, listMyTasks, sortAssignedTasks } from '../../lib/assignments';
import { PlannerTask, XpState, fetchXpState, listTasks } from '../../lib/planner';
import { Result } from '../../lib/db';
import { formatLongDate, todayISO } from '../../lib/dates';
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
  const [own, tasks, xp] = await Promise.all([
    listTasks(),
    listMyTasks(),
    fetchXpState(),
  ]);

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

/**
 * Privatelevens översikt.
 *
 * Visar bara elevens egna poster och uppgifter — ingen klass, inga kamrater och
 * ingen klasschatt. Allt räknas fram ur det som finns i databasen; saknas data
 * visas ett tydligt tomt läge.
 */
export const PrivateStartPage: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useAuth();
  const state: AsyncState<Data> = useAsync(loadOversikt);
  const today = todayISO();

  const openOwn = (state.data?.own ?? []).filter((t) => t.status !== 'klar');
  const todayOwn = openOwn.filter((t) => t.due_date === today);
  const openTasks = sortAssignedTasks(
    (state.data?.tasks ?? []).filter((t) => t.status !== 'klar'),
  );
  const todayTasks = openTasks.filter((t) => t.due_date === today);
  const done = (state.data?.own ?? []).filter((t) => t.status === 'klar').length;

  return (
    <div className="panel-page" data-testid="page-privat-start">
      <SectionCard
        title={`Hej ${user?.username ?? ''}`.trim()}
        subtitle={`${formatLongDate()} · Privat konto`}
      >
        {state.loading && <LoadingState label="Hämtar din översikt…" />}
        {!state.loading && state.error && (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
        {state.data && (
          <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />
        )}

        {state.data && (
          <>
            <p className="card-sub">
              {openOwn.length === 0
                ? 'Du har inga egna poster kvar just nu. Lägg upp nästa studiepass i Min planering.'
                : `Du har ${openOwn.length} egen post${
                    openOwn.length === 1 ? '' : 'er'
                  } kvar att göra.`}
            </p>
            {state.data.xp.totalXp > 0 && (
              <ProgressBar
                value={state.data.xp.intoLevel}
                max={state.data.xp.xpPerLevel}
                label={`Nivå ${state.data.xp.level}`}
                caption={`${state.data.xp.intoLevel} / ${state.data.xp.xpPerLevel} XP`}
              />
            )}
            <div className="row-actions">
              <Pill tone="info">
                <CheckSquare size={13} aria-hidden="true" /> {done} avklarade
              </Pill>
              <Pill tone="muted">
                <Star size={13} aria-hidden="true" /> {state.data.xp.totalXp} XP
              </Pill>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Idag"
        subtitle="Dagens planering"
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
        {state.data && todayOwn.length === 0 && todayTasks.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="Inget inplanerat idag"
            description="Inga egna poster eller uppgifter har dagens datum. Lägg gärna upp ett studiepass i Min planering."
          />
        ) : (
          <ul className="list">
            {todayOwn.map((task) => (
              <li className="list-item list-item-static" key={task.id}>
                <CalendarDays size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-sub">
                    {task.category ? `${task.category} · ` : ''}Din egen post
                  </div>
                </div>
                <Pill tone="muted">Egen</Pill>
              </li>
            ))}
            {todayTasks.map((task) => (
              <li className="list-item list-item-static" key={task.id}>
                <CheckSquare size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-sub">
                    Uppgift{task.subject ? ` · ${task.subject}` : ''}
                  </div>
                </div>
                <Pill tone="info">Uppgift</Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Mina uppgifter"
        subtitle={openOwn.length > 0 ? `${openOwn.length} kvar` : 'Inget att göra'}
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
        {state.data && openOwn.length === 0 ? (
          <EmptyState
            icon={<CheckSquare size={22} />}
            title="Inga uppgifter just nu"
            description="Dina egna studieaktiviteter och uppgifter som uttryckligen tilldelats dig visas här."
          />
        ) : (
          <ul className="list">
            {openOwn.slice(0, 5).map((task) => (
              <li className="list-item list-item-static" key={task.id}>
                <CheckSquare size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-sub">
                    {task.category ? `${task.category} · ` : ''}
                    {task.due_date ?? 'inget datum'}
                  </div>
                </div>
                {task.due_date && task.due_date < today && <Pill tone="warn">Försenad</Pill>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <QuickLinks
        panel="privat"
        onNavigate={onNavigate}
        pages={['planering', 'amnen', 'flashcards', 'provtraning', 'ai-hjalp', 'framsteg']}
        title="Genvägar"
        subtitle="Dina studieverktyg"
      />
    </div>
  );
};
