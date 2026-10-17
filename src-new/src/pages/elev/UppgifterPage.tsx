import React, { useState } from 'react';
import { CheckSquare, Search, Send } from 'lucide-react';
import {
  AssignedTask,
  assignmentStage,
  countAssignedTasks,
  filterAssignedTasks,
  hasTeacherFeedback,
  listMyTasks,
  setMyTaskStatus,
  sortAssignedTasks,
} from '../../lib/assignments';
import { UnlockCelebration } from '../../lib/planner';
import { formatDate, dueLabel } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  StatCard,
  TaskStagePill,
  Toolbar,
} from '../../components/ui';
import { RewardCelebration } from '../../components/RewardCelebration';
import { TaskFiles } from '../../components/TaskFiles';
import { Panel } from '../../lib/auth-types';
import { studentCopy, studentPageTestId } from '../../lib/panel-copy';

/**
 * Elevens uppgifter. Eleven kan läsa instruktionerna, öppna materialet som hör
 * till uppgiften, lämna in ett svar och ladda upp en fil. Lärarens instruktioner
 * kan eleven inte ändra, och XP betalas ut av servern exakt en gång när uppgiften
 * blir klar.
 */
export const UppgifterPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const copy = studentCopy(panel);
  const tasks = useAsync(listMyTasks);
  const [status, setStatus] = useState<'alla' | AssignedTask['status']>('alla');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState<{ xp: number; unlocks: UnlockCelebration[] } | null>(
    null,
  );

  const all = tasks.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const counts = countAssignedTasks(all, today);
  const visible = sortAssignedTasks(filterAssignedTasks(all, { status, query }));
  const selected = all.find((task) => task.id === selectedId) ?? null;

  const applyStatus = async (task: AssignedTask, next: AssignedTask['status']) => {
    setBusy(true);
    setError(null);
    const result = await setMyTaskStatus(task.id, next, null);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(
      next === 'klar'
        ? result.data.xpAwarded > 0
          ? `Uppgiften är klar. Du fick ${result.data.xpAwarded} XP.`
          : 'Uppgiften är markerad som klar.'
        : 'Status sparad.',
    );
    if (result.data.xpAwarded > 0 || result.data.unlocks.length > 0) {
      setCelebration({ xp: result.data.xpAwarded, unlocks: result.data.unlocks });
    }
    tasks.reload();
  };

  const submitAnswer = async (task: AssignedTask, answer: string) => {
    if (!answer.trim()) {
      setError('Skriv ditt svar innan du lämnar in.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setMyTaskStatus(task.id, nextStatusAfterSubmit(task), answer);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(
      result.data.xpAwarded > 0
        ? `Svaret är inlämnat och uppgiften är klar. Du fick ${result.data.xpAwarded} XP.`
        : copy.submittedNotice,
    );
    if (result.data.xpAwarded > 0 || result.data.unlocks.length > 0) {
      setCelebration({ xp: result.data.xpAwarded, unlocks: result.data.unlocks });
    }
    tasks.reload();
  };

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'uppgifter')}>
      <SectionCard title="Uppgifter" subtitle={copy.tasksSubtitle}>
        {tasks.loading && <LoadingState label="Hämtar dina uppgifter…" />}
        {!tasks.loading && tasks.error && <ErrorState message={tasks.error} onRetry={tasks.reload} />}

        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="state-note" role="status" data-testid="task-notice">
            {notice}
          </div>
        )}

        {tasks.data && (
          <div className="grid-4">
            <StatCard label="Totalt" value={counts.total} />
            <StatCard label="Kvar att göra" value={counts.open} />
            <StatCard label="Klara" value={counts.done} />
            <StatCard label="Försenade" value={counts.overdue} />
          </div>
        )}

        {tasks.data && all.length === 0 && (
          <EmptyState
            icon={<CheckSquare size={22} />}
            title={copy.tasksEmptyTitle}
            description={copy.tasksEmptyDescription}
          />
        )}

        {tasks.data && all.length > 0 && (
          <>
            <Toolbar>
              <div className="search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  className="input"
                  placeholder="Sök uppgift"
                  aria-label="Sök uppgift"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <label className="field field-inline">
                <span>Visa</span>
                <select
                  className="input"
                  aria-label="Filtrera uppgifter"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="alla">Alla</option>
                  <option value="ej_paborjad">Ej påbörjade</option>
                  <option value="pagar">Pågående</option>
                  <option value="klar">Klara</option>
                </select>
              </label>
            </Toolbar>

            {visible.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="Inga träffar"
                description="Ingen uppgift matchar filtret. Prova ett annat filter."
              />
            ) : (
              <ul className="list">
                {visible.map((task) => (
                  <li className="list-item list-item-static" key={task.id}>
                    <div className="list-item-content">
                      <div className="list-item-title">{task.title}</div>
                      <div className="list-item-sub">
                        {task.subject ? `${task.subject} · ` : ''}
                        {task.due_date ? dueLabel(task.due_date, new Date()) : 'inget datum'}
                        {task.submitted_at ? ' · inlämnad' : ''}
                      </div>
                    </div>
                    <TaskStagePill stage={assignmentStage(task)} />
                    {task.due_date && task.due_date < today && task.status !== 'klar' && (
                      <Pill tone="warn">Försenad</Pill>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setNotice(null);
                        setSelectedId(selectedId === task.id ? null : task.id);
                      }}
                    >
                      {selectedId === task.id ? 'Stäng' : 'Öppna'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SectionCard>

      {selected && (
        <SectionCard
          title={selected.title}
          subtitle={
            selected.subject
              ? `${selected.subject} · ${selected.due_date ? `förfaller ${formatDate(selected.due_date)}` : 'inget datum'}`
              : selected.due_date
                ? `Förfaller ${formatDate(selected.due_date)}`
                : 'Inget datum'
          }
        >
          <div className="row-actions">
            <TaskStagePill stage={assignmentStage(selected)} />
            {selected.due_date && (
              <Pill tone={selected.due_date < today && selected.status !== 'klar' ? 'warn' : 'muted'}>
                {dueLabel(selected.due_date, new Date())}
              </Pill>
            )}
          </div>

          {selected.description && <p className="card-sub">{selected.description}</p>}
          {selected.instructions && (
            <div className="instructions">
              <div className="list-item-title">Instruktioner</div>
              <p className="instructions-text">{selected.instructions}</p>
            </div>
          )}

          {hasTeacherFeedback(selected) && (
            <div className="instructions" data-testid="teacher-feedback">
              <div className="list-item-title">{copy.feedbackTitle}</div>
              <p className="instructions-text">
                {selected.follow_up_note ?? copy.feedbackFallback}
              </p>
              {selected.followed_up_at && (
                <p className="field-hint">
                  Uppföljd {formatDate(selected.followed_up_at.slice(0, 10))}
                </p>
              )}
            </div>
          )}

          <div className="row-actions">
            {selected.status !== 'pagar' && selected.status !== 'klar' && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void applyStatus(selected, 'pagar')}
                disabled={busy}
              >
                Markera som påbörjad
              </button>
            )}
            {selected.status !== 'klar' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void applyStatus(selected, 'klar')}
                disabled={busy}
              >
                Markera klar
              </button>
            )}
            {selected.status === 'klar' && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void applyStatus(selected, 'pagar')}
                disabled={busy}
              >
                Återuppta uppgiften
              </button>
            )}
          </div>

          <SubmissionBox
            task={selected}
            busy={busy}
            placeholder={copy.submissionPlaceholder}
            onSubmit={(answer) => void submitAnswer(selected, answer)}
          />

          <TaskFiles taskId={selected.id} mode="elev" />
        </SectionCard>
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

/**
 * När ett svar lämnas in markeras uppgiften som pågående (om eleven inte redan
 * valt att den är klar) — eleven bestämmer själv när den är färdig.
 */
function nextStatusAfterSubmit(task: AssignedTask): AssignedTask['status'] {
  return task.status === 'klar' ? 'klar' : 'pagar';
}

const SubmissionBox: React.FC<{
  task: AssignedTask;
  busy: boolean;
  placeholder: string;
  onSubmit: (answer: string) => void;
}> = ({ task, busy, placeholder, onSubmit }) => {
  const [answer, setAnswer] = useState(task.submission ?? '');

  return (
    <div className="submission-box">
      <label className="field-label" htmlFor="submission-text">
        Ditt svar
      </label>
      <textarea
        id="submission-text"
        className="input textarea"
        rows={4}
        value={answer}
        placeholder={placeholder}
        onChange={(e) => setAnswer(e.target.value)}
      />
      {task.submitted_at && (
        <p className="field-hint">Inlämnad {formatDate(task.submitted_at.slice(0, 10))}.</p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => onSubmit(answer)}
        disabled={busy}
      >
        <Send size={15} /> {busy ? 'Skickar…' : task.submitted_at ? 'Uppdatera svaret' : 'Lämna in'}
      </button>
    </div>
  );
};
