import React from 'react';
import { AlertTriangle, CalendarCheck, ClipboardList, MessageSquare, Users } from 'lucide-react';
import { Result } from '../../lib/db';
import {
  PlannerTask,
  countPlannerTasks,
  groupPlannerTasks,
  listTasks,
} from '../../lib/planner';
import { StudentSummary, listMyStudents, sortStudents } from '../../lib/students';
import {
  AssignedTask,
  countAssignedTasks,
  listAssignedTasks,
  sortAssignedTasks,
} from '../../lib/assignments';
import { DirectConversation, conversationPreview, listDirectConversations } from '../../lib/chat';
import { dueLabel, formatLongDate, todayISO } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  StatCard,
} from '../../components/ui';
import { QuickLinks } from '../../components/QuickLinks';

interface Props {
  onNavigate: (pageId: string) => void;
}

interface HemData {
  tasks: PlannerTask[];
  students: StudentSummary[];
  assigned: AssignedTask[];
  conversations: DirectConversation[];
  /** Delar som inte kunde hämtas, utan att hela sidan faller. */
  warnings: string[];
}

async function loadHem(): Promise<Result<HemData>> {
  const [tasks, students, assigned, conversations] = await Promise.all([
    listTasks(),
    listMyStudents(),
    listAssignedTasks({ createdByMe: true }),
    listDirectConversations(),
  ]);

  // Planeringen är sidans kärna — går den inte att läsa visas felet.
  if (!tasks.ok) return tasks;

  const warnings: string[] = [];
  if (!students.ok) warnings.push(students.error);
  if (!assigned.ok) warnings.push(assigned.error);
  if (!conversations.ok) warnings.push(conversations.error);

  return {
    ok: true,
    data: {
      tasks: tasks.data,
      students: students.ok ? students.data : [],
      assigned: assigned.ok ? assigned.data : [],
      conversations: conversations.ok ? conversations.data : [],
      warnings: [...new Set(warnings)],
    },
  };
}

/** Speciallärarens hemsida. All statistik räknas fram från hämtade data. */
export const HemPage: React.FC<Props> = ({ onNavigate }) => {
  const state: AsyncState<HemData> = useAsync(loadHem);
  const today = todayISO();

  return (
    <div className="panel-page" data-testid="page-speciallarar-hem">
      <SectionCard title="Hem" subtitle={formatLongDate()}>
        {state.loading && <LoadingState label="Hämtar din översikt…" />}
        {!state.loading && state.error && (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}

        {state.data && (
          <>
            {state.data.warnings.length > 0 && (
              <div className="state-note" role="status">
                <AlertTriangle size={15} />
                <span>
                  En del av översikten kunde inte hämtas: {state.data.warnings.join(' ')}
                </span>
              </div>
            )}

            <div className="grid-4">
              <StatCard
                label="Mina elever"
                value={state.data.students.length}
                hint={state.data.students.length === 0 ? 'Inga kopplade ännu' : undefined}
              />
              <StatCard
                label="Öppna uppgifter"
                value={countAssignedTasks(state.data.assigned, today).open}
                hint="Uppgifter du tilldelat"
              />
              <StatCard
                label="Att göra idag"
                value={countPlannerTasks(state.data.tasks, today).today}
                hint={`${countPlannerTasks(state.data.tasks, today).overdue} försenade`}
              />
              <StatCard
                label="Väntar uppföljning"
                value={countAssignedTasks(state.data.assigned, today).needsFollowUp}
                hint="Inlämningar att titta på"
              />
            </div>
          </>
        )}
      </SectionCard>

      {state.data && (
        <>
          <SectionCard
            title="Dagens planering"
            subtitle="Idag och försenat"
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onNavigate('planering')}
              >
                Öppna planeringen
              </button>
            }
          >
            <TodayList tasks={state.data.tasks} today={today} />
          </SectionCard>

          <SectionCard
            title="Mina elever"
            subtitle="Kopplade till dig"
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onNavigate('elever')}
              >
                Visa alla
              </button>
            }
          >
            {state.data.students.length === 0 ? (
              <EmptyState
                icon={<Users size={22} />}
                title="Inga elever kopplade ännu"
                description="Koppla en elev under Mina elever för att följa planering, uppgifter och uppföljning."
              />
            ) : (
              <ul className="list">
                {sortStudents(state.data.students)
                  .slice(0, 5)
                  .map((student) => (
                    <li className="list-item list-item-static" key={student.id}>
                      <Users size={16} aria-hidden="true" />
                      <div className="list-item-content">
                        <div className="list-item-title mono">{student.username}</div>
                        <div className="list-item-sub">
                          {student.openTasks} öppna uppgifter · {student.doneTasks} klara
                        </div>
                      </div>
                      {student.overdueTasks > 0 && (
                        <Pill tone="warn">{student.overdueTasks} försenade</Pill>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Uppföljning"
            subtitle="Inlämningar som väntar på dig"
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onNavigate('uppfoljning')}
              >
                Öppna uppföljningen
              </button>
            }
          >
            {(() => {
              const waiting = sortAssignedTasks(
                state.data.assigned.filter((t) => t.submitted_at && !t.followed_up_at),
              ).slice(0, 5);
              if (waiting.length === 0) {
                return (
                  <EmptyState
                    icon={<ClipboardList size={22} />}
                    title="Inget att följa upp just nu"
                    description="När en elev lämnar in en uppgift dyker den upp här."
                  />
                );
              }
              return (
                <ul className="list">
                  {waiting.map((task) => (
                    <li className="list-item list-item-static" key={task.id}>
                      <ClipboardList size={16} aria-hidden="true" />
                      <div className="list-item-content">
                        <div className="list-item-title">{task.title}</div>
                        <div className="list-item-sub">
                          {task.student_username ?? 'Elev'} · inlämnad{' '}
                          {dueLabel(task.submitted_at?.slice(0, 10) ?? null)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </SectionCard>

          <SectionCard
            title="Senaste meddelanden"
            subtitle="Privata samtal"
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onNavigate('private-chattar')}
              >
                Alla samtal
              </button>
            }
          >
            {state.data.conversations.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={22} />}
                title="Inga samtal ännu"
                description="Starta ett samtal från Mina elever eller Privata chattar."
              />
            ) : (
              <ul className="list">
                {state.data.conversations.slice(0, 4).map((conversation) => (
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

          <SectionCard title="Snabbstart" subtitle="Vanliga delar av arbetet">
            <div className="quick-row">
              <button type="button" className="quick-link" onClick={() => onNavigate('uppfoljning')}>
                <ClipboardList size={17} /> Ny uppgift
              </button>
              <button type="button" className="quick-link" onClick={() => onNavigate('planering')}>
                <CalendarCheck size={17} /> Planering och att göra
              </button>
              <button
                type="button"
                className="quick-link"
                onClick={() => onNavigate('meddelande-elever')}
              >
                <MessageSquare size={17} /> Meddela en elev
              </button>
            </div>
          </SectionCard>
        </>
      )}

      <QuickLinks
        panel="speciallarar"
        onNavigate={onNavigate}
        pages={['elever', 'material', 'uppfoljning', 'belonningar', 'ai-assistent']}
        title="Genvägar"
        subtitle="Fler delar av panelen"
      />
    </div>
  );
};

const TodayList: React.FC<{ tasks: PlannerTask[]; today: string }> = ({ tasks, today }) => {
  const groups = groupPlannerTasks(tasks, today);
  const visible = [...groups.overdue, ...groups.today].slice(0, 6);

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck size={22} />}
        title="Inget inplanerat idag"
        description="Lägg till en post i Min planering och att göra, eller njut av en lugn dag."
      />
    );
  }

  return (
    <ul className="list">
      {visible.map((task) => (
        <li className="list-item list-item-static" key={task.id}>
          <CalendarCheck size={16} aria-hidden="true" />
          <div className="list-item-content">
            <div className="list-item-title">{task.title}</div>
            <div className="list-item-sub">{dueLabel(task.due_date, new Date())}</div>
          </div>
          {task.due_date && task.due_date < today && <Pill tone="warn">Försenad</Pill>}
        </li>
      ))}
    </ul>
  );
};
