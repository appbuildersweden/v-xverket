import React from 'react';
import { CalendarDays, CheckSquare, MessageSquare, Star } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { AssignedTask, listMyTasks, sortAssignedTasks } from '../../lib/assignments';
import { PlannerTask, XpState, fetchXpState, listTasks } from '../../lib/planner';
import { DirectConversation, conversationPreview, listDirectConversations } from '../../lib/chat';
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
  tasks: AssignedTask[];
  own: PlannerTask[];
  conversations: DirectConversation[];
  xp: XpState;
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

async function loadOversikt(): Promise<Result<Data>> {
  const [tasks, own, conversations, xp] = await Promise.all([
    listMyTasks(),
    listTasks(),
    listDirectConversations(),
    fetchXpState(),
  ]);

  if (!tasks.ok) return tasks;

  // Uppgifterna är det sidan bygger på; de övriga får misslyckas var för sig,
  // men då namnges de i stället för att räknas som noll.
  const missing: string[] = [];
  if (!own.ok) missing.push('dina egna poster');
  if (!conversations.ok) missing.push('dina meddelanden');
  if (!xp.ok) missing.push('dina poäng');

  return {
    ok: true,
    data: {
      tasks: tasks.data,
      own: own.ok ? own.data : [],
      conversations: conversations.ok ? conversations.data : [],
      xp: xp.ok
        ? xp.data
        : { totalXp: 0, level: 1, xpPerLevel: 100, intoLevel: 0, xpToNext: 100 },
      missing,
    },
  };
}

/**
 * Elevens översikt: dagens planering, kommande uppgifter och det senaste från
 * lärare och klass. Bara data som faktiskt finns visas — annars ett tydligt
 * tomt läge. Sidan hålls luftig med få sektioner.
 */
export const ElevStartPage: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useAuth();
  const state: AsyncState<Data> = useAsync(loadOversikt);
  const today = todayISO();

  const openTasks = sortAssignedTasks((state.data?.tasks ?? []).filter((t) => t.status !== 'klar'));
  const todayTasks = openTasks.filter((t) => t.due_date === today);
  const ownToday = (state.data?.own ?? []).filter(
    (t) => t.status !== 'klar' && t.due_date === today,
  );

  return (
    <div className="panel-page" data-testid="page-elev-start">
      <SectionCard
        title={`Hej ${user?.username ?? ''}`.trim()}
        subtitle={formatLongDate()}
      >
        {state.loading && <LoadingState label="Hämtar din översikt…" />}
        {!state.loading && state.error && <ErrorState message={state.error} onRetry={state.reload} />}
        {state.data && (
          <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />
        )}

        {state.data && (
          <>
            <p className="card-sub">
              {openTasks.length > 0
                ? `Du har ${openTasks.length} uppgift${openTasks.length === 1 ? '' : 'er'} kvar att göra.`
                : 'Du har inga uppgifter kvar just nu.'}
            </p>
            {state.data.xp.totalXp > 0 && (
              <ProgressBar
                value={state.data.xp.intoLevel}
                max={state.data.xp.xpPerLevel}
                label={`Nivå ${state.data.xp.level}`}
                caption={`${state.data.xp.intoLevel} / ${state.data.xp.xpPerLevel} XP`}
              />
            )}
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
        {state.data && todayTasks.length === 0 && ownToday.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="Inget inplanerat idag"
            description="Inga uppgifter eller egna poster har dagens datum. Lägg gärna upp något i Min planering."
          />
        ) : (
          <ul className="list">
            {todayTasks.map((task) => (
              <li className="list-item list-item-static" key={task.id}>
                <CheckSquare size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-sub">
                    Från din lärare{task.subject ? ` · ${task.subject}` : ''}
                  </div>
                </div>
                <Pill tone="info">Uppgift</Pill>
              </li>
            ))}
            {ownToday.map((task) => (
              <li className="list-item list-item-static" key={task.id}>
                <CalendarDays size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-sub">Din egen post</div>
                </div>
                <Pill tone="muted">Egen</Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Kommande uppgifter"
        subtitle={openTasks.length > 0 ? `${openTasks.length} kvar` : 'Inget att göra'}
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
        {state.data && openTasks.length === 0 ? (
          <EmptyState
            icon={<CheckSquare size={22} />}
            title="Inga uppgifter just nu"
            description="Uppgifter som din lärare ger dig dyker upp här."
          />
        ) : (
          <ul className="list">
            {openTasks.slice(0, 5).map((task) => (
              <li className="list-item list-item-static" key={task.id}>
                <CheckSquare size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-sub">
                    {task.subject ? `${task.subject} · ` : ''}
                    {task.due_date ?? 'inget datum'}
                  </div>
                </div>
                {task.due_date && task.due_date < today && <Pill tone="warn">Försenad</Pill>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Meddelanden"
        subtitle="Senaste från dina lärare"
        action={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onNavigate('meddelanden')}
          >
            Alla meddelanden
          </button>
        }
      >
        {state.data && state.data.conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={22} />}
            title="Inga meddelanden ännu"
            description="När en lärare skriver till dig visas det här."
          />
        ) : (
          <ul className="list">
            {(state.data?.conversations ?? []).slice(0, 3).map((conversation) => (
              <li className="list-item list-item-static" key={conversation.channelId}>
                <MessageSquare size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title mono">{conversation.otherUsername}</div>
                  <div className="list-item-sub">{conversationPreview(conversation)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {state.data && state.data.xp.totalXp > 0 && (
        <SectionCard title="Belöningar" subtitle="Din nivå och nästa mål">
          <div className="row-actions">
            <Pill tone="info">
              <Star size={13} aria-hidden="true" /> {state.data.xp.totalXp} XP
            </Pill>
            <Pill tone="muted">{state.data.xp.xpToNext} XP till nästa nivå</Pill>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onNavigate('belonningar')}
            >
              Se belöningar
            </button>
          </div>
        </SectionCard>
      )}

      <QuickLinks
        panel="elev"
        onNavigate={onNavigate}
        pages={['uppgifter', 'flashcards', 'provtraning', 'ai-hjalp', 'dokument', 'framsteg']}
        title="Genvägar"
        subtitle="Populära sektioner"
      />
    </div>
  );
};
