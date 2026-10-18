import React, { useState } from 'react';
import { CalendarCheck, ClipboardList, Plus, Search } from 'lucide-react';
import {
  PlannerTask,
  UnlockCelebration,
  XpState,
  completeTask,
  fetchXpState,
  countPlannerTasks,
  deleteTask,
  listTasks,
  reopenTask,
  updateTask,
} from '../../lib/planner';
import { AssignedTask, listMyTasks, sortAssignedTasks } from '../../lib/assignments';
import { Result } from '../../lib/db';
import { dueLabel, formatDate, todayISO } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  StatCard,
  TaskStatusPill,
  Toolbar,
} from '../../components/ui';
import { PlannerTaskFormModal, PlannerTaskItem } from '../../components/PlannerTask';
import { RewardCelebration } from '../../components/RewardCelebration';
import { PlannerCalendar } from '../../components/PlannerCalendar';
import { Panel } from '../../lib/auth-types';
import { studentCopy, studentPageTestId } from '../../lib/panel-copy';

interface Data {
  own: PlannerTask[];
  assigned: AssignedTask[];
  /** Elevens totala XP — samma summa som belöningarna räknas ur. */
  xp: XpState;
}

async function loadPlanering(): Promise<Result<Data>> {
  const [own, assigned, xp] = await Promise.all([listTasks(), listMyTasks(), fetchXpState()]);
  if (!own.ok) return own;
  if (!assigned.ok) return assigned;
  if (!xp.ok) return xp;
  return {
    ok: true,
    data: { own: own.data, assigned: assigned.data, xp: xp.data },
  };
}

/**
 * Min planering är elevens att-göra-lista. Här finns två tydligt åtskilda
 * saker:
 *   * Planering som din lärare har gett dig (läses, status ändras under Uppgifter).
 *   * Dina egna poster, som bara du ser och kan ändra.
 *
 * En egen post som bockas av ger 10 XP — exakt en gång per post. Servern avgör
 * det, och samma svar innehåller de belöningar som XP:n låste upp.
 */
export const PlaneringPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const copy = studentCopy(panel);
  const state: AsyncState<Data> = useAsync(loadPlanering);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlannerTask | null>(null);
  const [scope, setScope] = useState<'oppna' | 'alla' | 'klar'>('oppna');
  const [search, setSearch] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{
    xp: number;
    unlocks: UnlockCelebration[];
  } | null>(null);

  const today = todayISO();
  const own = state.data?.own ?? [];
  const assigned = state.data?.assigned ?? [];
  const counts = countPlannerTasks(own, today);
  const ownXp = state.data?.xp.totalXp ?? 0;

  const visibleOwn = own
    .filter((task) => (day ? task.due_date === day : true))
    .filter((task) => (scope === 'klar' ? task.status === 'klar' : scope === 'oppna' ? task.status !== 'klar' : true))
    .filter((task) =>
      search.trim()
        ? `${task.title} ${task.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
        : true,
    );

  const assignedForDay = day ? assigned.filter((t) => t.due_date === day) : assigned;
  const upcomingAssigned = sortAssignedTasks(
    assignedForDay.filter((t) => t.status !== 'klar'),
  ).slice(0, day ? 20 : 6);

  const handleComplete = async (task: PlannerTask) => {
    setError(null);
    setNotice(null);
    const result = await completeTask(task.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const { xpAwarded, unlocks } = result.data;
    setNotice(
      xpAwarded > 0
        ? `Posten är klar. Du fick ${xpAwarded} XP.`
        : 'Posten var redan avklarad — ingen ny XP betalas ut.',
    );
    if (xpAwarded > 0 || unlocks.length > 0) {
      setCelebration({ xp: xpAwarded, unlocks });
    }
    state.reload();
  };

  const handleReopen = async (task: PlannerTask) => {
    setNotice(null);
    const result = await reopenTask(task.id);
    if (result.ok) {
      setNotice('Posten är öppen igen. Den XP du redan fått ligger kvar.');
      state.reload();
    } else {
      setError(result.error);
    }
  };

  const handleStart = async (task: PlannerTask) => {
    const result = await updateTask(task.id, { status: 'pagar' });
    if (result.ok) state.reload();
    else setError(result.error);
  };

  const handleDelete = async (task: PlannerTask) => {
    const result = await deleteTask(task.id);
    if (result.ok) state.reload();
    else setError(result.error);
  };

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'planering')}>
      <SectionCard title="Min planering" subtitle={copy.planningSubtitle}>
        {state.loading && <LoadingState label="Hämtar din planering…" />}
        {!state.loading && state.error && <ErrorState message={state.error} onRetry={state.reload} />}

        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="state-note" role="status" data-testid="planner-notice">
            {notice}
          </div>
        )}

        {state.data && (
          <div className="grid-4">
            <StatCard label="Tilldelat" value={assigned.filter((t) => t.status !== 'klar').length} />
            <StatCard label="Egna poster" value={counts.open} />
            <StatCard label="Klara" value={counts.done} />
            <StatCard label="XP" value={ownXp} hint="10 XP per avklarad post" />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Kalender"
        subtitle={copy.planningCalendarSubtitle}
        action={
          day ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDay(null)}>
              Visa alla dagar
            </button>
          ) : undefined
        }
      >
        {state.data && (
          <PlannerCalendar items={[...own, ...assigned]} selected={day} onSelect={setDay} />
        )}
        {day && (
          <div className="state-note" role="status" data-testid="day-filter">
            <CalendarCheck size={15} />
            <span>
              Visar {formatDate(day)} — {upcomingAssigned.length} uppgift
              {upcomingAssigned.length === 1 ? '' : 'er'} {copy.planningDayFilter}{' '}
              {visibleOwn.length} egen post{visibleOwn.length === 1 ? '' : 'er'}.
            </span>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={copy.planningAssignedTitle}
        subtitle={day ? `Planering den ${formatDate(day)}` : 'Planering som har tilldelats dig'}
      >
        {state.data && upcomingAssigned.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={day ? 'Inget inplanerat den dagen' : 'Inget tilldelat just nu'}
            description={
              day ? 'Välj en annan dag i kalendern, eller visa alla dagar igen.' : copy.planningAssignedEmpty
            }
          />
        ) : (
          <ul className="list">
            {upcomingAssigned.map((task) => (
              <li className="list-item list-item-static" key={task.id}>
                <div className="list-item-content">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-sub">
                    {task.subject ? `${task.subject} · ` : ''}
                    {task.due_date ? dueLabel(task.due_date, new Date()) : 'inget datum'}
                  </div>
                </div>
                <TaskStatusPill status={task.status} />
                {task.due_date && task.due_date < today && <Pill tone="warn">Försenad</Pill>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Mina egna poster"
        subtitle="Bara du ser dem · 10 XP när du bockar av"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Ny post
          </button>
        }
      >
        <p className="security-note">
          <CalendarCheck size={14} aria-hidden="true" />
          {copy.planningXpNote}
        </p>

        {own.length > 0 && (
          <Toolbar>
            <div className="search-field">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                className="input"
                placeholder="Sök post"
                aria-label="Sök i min planering"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="field field-inline">
              <span>Visa</span>
              <select
                className="input"
                aria-label="Visa egna poster"
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="oppna">Att göra</option>
                <option value="alla">Alla</option>
                <option value="klar">Klara</option>
              </select>
            </label>
          </Toolbar>
        )}

        {state.data && own.length === 0 && (
          <EmptyState
            icon={<CalendarCheck size={22} />}
            title={day ? 'Inga egna poster den dagen' : 'Inga egna poster'}
            description={
              day
                ? 'Välj en annan dag i kalendern, eller visa alla dagar igen.'
                : 'Skriv upp läxor, prov eller annat du vill komma ihåg. Bara du ser dina egna poster.'
            }
            action={
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                <Plus size={16} /> Skriv din första post
              </button>
            }
          />
        )}

        {own.length > 0 && visibleOwn.length === 0 && (
          <EmptyState
            icon={<Search size={22} />}
            title="Inga poster matchar"
            description="Prova ett annat filter, en annan sökning eller en annan dag."
          />
        )}

        {visibleOwn.length > 0 && (
          <ul className="list">
            {visibleOwn.map((task) => (
              <PlannerTaskItem
                key={task.id}
                task={task}
                today={today}
                completeLabel="Klar"
                showXp
                onStart={() => void handleStart(task)}
                onComplete={() => void handleComplete(task)}
                onReopen={() => void handleReopen(task)}
                onEdit={() => setEditing(task)}
                onDelete={() => void handleDelete(task)}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {celebration && (
        <RewardCelebration
          xpAwarded={celebration.xp}
          unlocks={celebration.unlocks}
          onClose={() => setCelebration(null)}
        />
      )}

      {(showForm || editing) && (
        <PlannerTaskFormModal
          task={editing ?? undefined}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            state.reload();
          }}
        />
      )}
    </div>
  );
};
