import React, { useState } from 'react';
import { CalendarCheck, Plus, Search, Star } from 'lucide-react';
import {
  CompleteResult,
  PlannerTask,
  UnlockCelebration,
  XpState,
  completeTask,
  countPlannerTasks,
  deleteTask,
  fetchXpState,
  filterPlannerTasks,
  listTasks,
  reopenTask,
  updateTask,
} from '../../lib/planner';
import { Result } from '../../lib/db';
import { todayISO } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PartialDataNotice,
  ProgressBar,
  SectionCard,
  StatCard,
  Toolbar,
} from '../../components/ui';
import { PlannerTaskFormModal, PlannerTaskItem } from '../../components/PlannerTask';
import { RewardCelebration } from '../../components/RewardCelebration';

interface PlannerData {
  tasks: PlannerTask[];
  xp: XpState;
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

const EMPTY_XP: XpState = {
  totalXp: 0,
  level: 1,
  xpPerLevel: 100,
  intoLevel: 0,
  xpToNext: 100,
};

async function loadPlanner(): Promise<Result<PlannerData>> {
  const [tasks, xp] = await Promise.all([listTasks(), fetchXpState()]);
  if (!tasks.ok) return tasks;
  // Poängen får inte se ut som noll när hämtningen misslyckades.
  return {
    ok: true,
    data: { tasks: tasks.data, xp: xp.ok ? xp.data : EMPTY_XP, missing: xp.ok ? [] : ['dina poäng'] },
  };
}

/**
 * Min planering och att göra. Posterna är personliga (RLS ger bara åtkomst till
 * egna rader) och varje slutförd post ger XP en gång — servern håller räkningen.
 */
export const PlaneringPage: React.FC = () => {
  const planner: AsyncState<PlannerData> = useAsync(loadPlanner);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlannerTask | null>(null);
  const [scope, setScope] = useState<'oppna' | 'alla' | 'klar'>('oppna');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ xp: number; unlocks: UnlockCelebration[] } | null>(
    null,
  );

  const today = todayISO();
  const tasks = planner.data?.tasks ?? [];
  const counts = countPlannerTasks(tasks, today);

  const visible = filterPlannerTasks(tasks, {
    status: scope === 'klar' ? 'klar' : 'alla',
    query: search,
  }).filter((task) => (scope === 'oppna' ? task.status !== 'klar' : true));

  const handleComplete = async (task: PlannerTask) => {
    setError(null);
    const result = await completeTask(task.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const data: CompleteResult = result.data;
    if (data.xpAwarded > 0 || data.unlocks.length > 0) {
      setCelebration({ xp: data.xpAwarded, unlocks: data.unlocks });
    }
    planner.reload();
  };

  const handleReopen = async (task: PlannerTask) => {
    const result = await reopenTask(task.id);
    if (result.ok) planner.reload();
    else setError(result.error);
  };

  const handleStart = async (task: PlannerTask) => {
    const result = await updateTask(task.id, { status: 'pagar' });
    if (result.ok) planner.reload();
    else setError(result.error);
  };

  const handleDelete = async (task: PlannerTask) => {
    const result = await deleteTask(task.id);
    if (result.ok) planner.reload();
    else setError(result.error);
  };

  return (
    <div className="panel-page" data-testid="page-speciallarar-planering">
      <SectionCard
        title="Min planering och att göra"
        subtitle="Dina egna poster — ingen annan ser dem"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Ny post
          </button>
        }
      >
        {planner.loading && <LoadingState label="Hämtar din planering…" />}
        {planner.data && (
          <PartialDataNotice missing={planner.data.missing} onRetry={planner.reload} />
        )}
        {!planner.loading && planner.error && (
          <ErrorState message={planner.error} onRetry={planner.reload} />
        )}

        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {planner.data && (
          <>
            <div className="grid-4">
              <StatCard label="Att göra" value={counts.open} />
              <StatCard label="Idag" value={counts.today} />
              <StatCard label="Försenade" value={counts.overdue} />
              <StatCard label="Klara" value={counts.done} />
            </div>

            <div className="xp-card">
              <div className="xp-card-top">
                <div>
                  <div className="lbl">Din nivå</div>
                  <div className="val">Nivå {planner.data.xp.level}</div>
                </div>
                <div className="xp-total">
                  <Star size={16} aria-hidden="true" /> {planner.data.xp.totalXp} XP
                </div>
              </div>
              <ProgressBar
                value={planner.data.xp.intoLevel}
                max={planner.data.xp.xpPerLevel}
                label="Mot nästa nivå"
                caption={`${planner.data.xp.intoLevel} / ${planner.data.xp.xpPerLevel} XP`}
              />
              <p className="list-item-sub">
                En slutförd post ger XP en gång — servern håller räkningen, så samma
                post kan aldrig ge poäng två gånger.
              </p>
            </div>
          </>
        )}
      </SectionCard>

      {planner.data && tasks.length === 0 && (
        <SectionCard title="Kom igång" subtitle="Första posten">
          <EmptyState
            icon={<CalendarCheck size={22} />}
            title="Planeringen är tom"
            description="Lägg till en post med rubrik, datum och prioritet. När du markerar den klar betalas XP ut en gång."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                <Plus size={16} /> Skapa din första post
              </button>
            }
          />
        </SectionCard>
      )}

      {planner.data && tasks.length > 0 && (
        <SectionCard title="Planeringen" subtitle={`${visible.length} av ${tasks.length} poster`}>
          <Toolbar>
            <div className="search-field">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                className="input"
                placeholder="Sök post"
                aria-label="Sök i planeringen"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="field field-inline">
              <span>Visa</span>
              <select
                className="input"
                aria-label="Visa poster"
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="oppna">Att göra</option>
                <option value="alla">Alla</option>
                <option value="klar">Klara</option>
              </select>
            </label>
          </Toolbar>

          {visible.length === 0 ? (
            <EmptyState
              icon={<Search size={22} />}
              title="Inga poster matchar"
              description="Prova ett annat filter eller en annan sökning."
            />
          ) : (
            <ul className="list">
              {visible.map((task) => (
                <PlannerTaskItem
                  key={task.id}
                  task={task}
                  today={today}
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
            planner.reload();
          }}
        />
      )}

      {celebration && (
        <RewardCelebration
          xpAwarded={celebration.xp}
          unlocks={celebration.unlocks}
          onClose={() => setCelebration(null)}
        />
      )}
    </div>
  );
};
