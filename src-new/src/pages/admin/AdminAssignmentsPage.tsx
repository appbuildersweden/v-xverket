import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { AuthAccount } from '../../lib/auth-types';
import { displayName, sortAccounts } from '../../lib/accounts';
import { ClassInfo, listClasses } from '../../lib/classes';
import {
  AssignedTask,
  countAssignedTasks,
  deleteAssignedTask,
  filterAssignedTasks,
  listAssignedTasks,
  sortAssignedTasks,
} from '../../lib/assignments';
import { formatDate } from '../../lib/dates';
import { AssignmentForm } from '../../components/AssignmentForm';
import { ConfirmButton, Modal } from '../../components/forms';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SectionCard,
  StatCard,
  TaskStatusPill,
  Toolbar,
} from '../../components/ui';
import { TaskRow } from '../speciallarar/EleverPage';

interface Props {
  onNavigate: (pageId: string) => void;
}

/**
 * Uppgifter. Administratören ser och hanterar samma uppgifter som lärarna och
 * eleverna arbetar med — det finns bara ett uppgiftssystem i Elda.
 *
 * Tabellen `student_tasks` delas av alla paneler och Row Level Security ger
 * administratören läsning och ändring av alla uppgifter, medan en lärare bara
 * når sina egna elevers och en elev bara sina egna. Elevernas inlämningar och
 * XP följer med uppgiften och rörs inte av administratörens ändringar.
 */
export const AdminAssignmentsPage: React.FC<Props> = ({ onNavigate }) => {
  const { listAccounts } = useAuth();
  const [tasks, setTasks] = useState<AssignedTask[] | null>(null);
  const [students, setStudents] = useState<AuthAccount[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AssignedTask['status'] | 'alla'>('alla');
  const [targetFilter, setTargetFilter] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AssignedTask | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [taskResult, classResult, accountResult] = await Promise.all([
      listAssignedTasks(),
      listClasses(),
      listAccounts(),
    ]);
    let problem: string | null = null;
    if (taskResult.ok) setTasks(taskResult.data);
    else {
      setTasks(null);
      problem = taskResult.error;
    }
    if (classResult.ok) setClasses(classResult.data);
    else if (!problem) problem = classResult.error;
    if (accountResult.ok) {
      setStudents(sortAccounts(accountResult.accounts.filter((a) => a.role === 'elev')));
    } else if (!problem) problem = accountResult.error;
    setError(problem);
    setLoading(false);
  }, [listAccounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = tasks ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const counts = countAssignedTasks(all, today);

  const visible = useMemo(() => {
    const key = targetFilter.startsWith('klass:')
      ? { classId: targetFilter.slice(6) }
      : targetFilter.startsWith('elev:')
        ? { studentId: targetFilter.slice(5) }
        : {};
    let list = filterAssignedTasks(all, { status, query });
    if (key.classId) list = list.filter((t) => t.class_id === key.classId);
    if (key.studentId) list = list.filter((t) => t.student_id === key.studentId);
    return sortAssignedTasks(list);
  }, [all, status, query, targetFilter]);

  const waiting = sortAssignedTasks(all.filter((t) => t.submitted_at && !t.followed_up_at));

  const remove = async (task: AssignedTask) => {
    setActionError(null);
    const result = await deleteAssignedTask(task.id);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await load();
  };

  return (
    <div className="panel-page" data-testid="page-admin-uppgifter">
      <SectionCard
        title="Uppgifter"
        subtitle="Samma uppgifter som lärarna och eleverna arbetar med"
        action={
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
              <RefreshCw size={15} /> Uppdatera
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCreating(true)}
              disabled={students.length === 0 && classes.length === 0}
            >
              <Plus size={15} /> Ny uppgift
            </button>
          </>
        }
      >
        <div className="grid-4">
          <StatCard label="Totalt" value={counts.total} />
          <StatCard label="Öppna" value={counts.open} hint={`${counts.overdue} försenade`} />
          <StatCard label="Klara" value={counts.done} />
          <StatCard label="Väntar uppföljning" value={counts.needsFollowUp} />
        </div>

        {actionError && (
          <div className="state-note state-note-error" role="alert">
            {actionError}
          </div>
        )}

        {loading && <LoadingState label="Hämtar uppgifter…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && all.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="Inga uppgifter ännu"
            description="Skapa en uppgift och tilldela den till en elev eller en klass. Den dyker upp direkt i elevens uppgiftslista."
            action={
              students.length > 0 || classes.length > 0 ? (
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                  <Plus size={16} /> Ny uppgift
                </button>
              ) : undefined
            }
          />
        )}

        {!loading && !error && all.length > 0 && (
          <>
            <Toolbar>
              <div className="search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  className="input"
                  placeholder="Sök rubrik, ämne eller beskrivning"
                  aria-label="Sök uppgift"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <label className="field field-inline">
                <span>Status</span>
                <select
                  className="input"
                  aria-label="Filtrera på status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AssignedTask['status'] | 'alla')}
                >
                  <option value="alla">Alla</option>
                  <option value="ej_paborjad">Ej påbörjad</option>
                  <option value="pagar">Pågår</option>
                  <option value="klar">Klar</option>
                </select>
              </label>
              <label className="field field-inline">
                <span>Tilldelad</span>
                <select
                  className="input"
                  aria-label="Filtrera på mottagare"
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value)}
                >
                  <option value="">Alla mottagare</option>
                  {classes.map((c) => (
                    <option key={c.id} value={`klass:${c.id}`}>
                      Klass: {c.name}
                    </option>
                  ))}
                  {students.map((s) => (
                    <option key={s.id} value={`elev:${s.id}`}>
                      Elev: {s.username}
                    </option>
                  ))}
                </select>
              </label>
            </Toolbar>

            {visible.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="Inga träffar"
                description="Ingen uppgift matchar filtret. Prova ett annat filter eller en annan sökning."
              />
            ) : (
              <ul className="list">
                {visible.map((task) => (
                  <li className="list-item list-item-static" key={task.id}>
                    <div className="list-item-content">
                      <div className="list-item-title">{task.title}</div>
                      <div className="list-item-sub">
                        {task.student_username ? `${task.student_username} · ` : ''}
                        {task.class_id
                          ? `Klass: ${classes.find((c) => c.id === task.class_id)?.name ?? 'okänd klass'} · `
                          : ''}
                        {task.subject ? `${task.subject} · ` : ''}
                        {task.due_date ? `förfaller ${formatDate(task.due_date)}` : 'inget datum'}
                        {task.submitted_at ? ' · inlämnad' : ''}
                        {task.followed_up_at ? ' · uppföljd' : ''}
                      </div>
                    </div>
                    <TaskStatusPill status={task.status} />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setEditing(task)}
                    >
                      <Pencil size={15} /> Redigera
                    </button>
                    <ConfirmButton
                      label="Ta bort"
                      confirmLabel="Ta bort"
                      question={`Ta bort uppgiften "${task.title}"? Elevens svar på uppgiften försvinner också.`}
                      onConfirm={() => void remove(task)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SectionCard>

      {waiting.length > 0 && (
        <SectionCard title="Inlämningar att följa upp" subtitle="Eleven har lämnat in">
          <ul className="list">
            {waiting.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onFollowedUp={() => void load()}
                onError={setActionError}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {students.length === 0 && classes.length === 0 && !loading && (
        <SectionCard title="Inga mottagare ännu" subtitle="En uppgift behöver en elev eller en klass">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="Skapa en klass eller ett elevkonto först"
            description="En uppgift tilldelas en elev eller en hel klass. Lägg upp en klass eller ett elevkonto, kom sedan tillbaka hit."
            action={
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onNavigate('create-user')}
                >
                  Skapa konto
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onNavigate('klasser')}
                >
                  Till klasser
                </button>
              </div>
            }
          />
        </SectionCard>
      )}

      {creating && (
        <Modal title="Ny uppgift" onClose={() => setCreating(false)} closeLabel="Stäng uppgiften">
          <AssignmentForm
            students={students.map((s) => ({
              id: s.id,
              username: displayName(s) ? `${s.username} (${displayName(s)})` : s.username,
            }))}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              void load();
            }}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Redigera: ${editing.title}`}
          onClose={() => setEditing(null)}
          closeLabel="Stäng redigeringen"
        >
          <AssignmentForm
            task={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
        </Modal>
      )}
    </div>
  );
};
