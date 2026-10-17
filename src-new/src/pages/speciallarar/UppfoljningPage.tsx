import React, { useState } from 'react';
import { ClipboardList, Pencil, Plus, Search } from 'lucide-react';
import {
  AssignedTask,
  countAssignedTasks,
  deleteAssignedTask,
  filterAssignedTasks,
  listAssignedTasks,
  sortAssignedTasks,
} from '../../lib/assignments';
import { listClasses } from '../../lib/classes';
import { listMyStudents } from '../../lib/students';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SectionCard,
  StatCard,
  TaskStatusPill,
  Toolbar,
} from '../../components/ui';
import { ConfirmButton, Modal } from '../../components/forms';
import { AssignmentForm } from '../../components/AssignmentForm';
import { TaskRow } from './EleverPage';

/**
 * Uppgifter och uppföljning. Här skapas, redigeras och följs de uppgifter som
 * specialläraren har gett sina elever. Allt sparas i databasen och kontrolleras
 * serversidigt — eleven kan bara ändra sin egen status, aldrig uppgiften.
 */
export const UppfoljningPage: React.FC = () => {
  const tasks = useAsync(() => listAssignedTasks({ createdByMe: true }));
  const students = useAsync(listMyStudents);
  const classes = useAsync(listClasses);

  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<AssignedTask | null>(null);
  const [status, setStatus] = useState<AssignedTask['status'] | 'alla'>('alla');
  const [studentId, setStudentId] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const all = tasks.data ?? [];
  const counts = countAssignedTasks(all, today);

  const filtered = sortAssignedTasks(
    filterAssignedTasks(all, { status, query }).filter(
      (task) => !studentId || task.student_id === studentId,
    ),
  );

  const remove = async (task: AssignedTask) => {
    const result = await deleteAssignedTask(task.id);
    if (result.ok) tasks.reload();
    else setError(result.error);
  };

  const waiting = sortAssignedTasks(all.filter((t) => t.submitted_at && !t.followed_up_at));

  return (
    <div className="panel-page" data-testid="page-speciallarar-uppfoljning">
      <SectionCard
        title="Uppgifter och uppföljning"
        subtitle="Uppgifter du har gett dina elever"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Ny uppgift
          </button>
        }
      >
        <div className="grid-4">
          <StatCard label="Totalt" value={counts.total} />
          <StatCard label="Öppna" value={counts.open} />
          <StatCard label="Klara" value={counts.done} />
          <StatCard label="Väntar uppföljning" value={counts.needsFollowUp} />
        </div>

        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {tasks.loading && <LoadingState label="Hämtar uppgifter…" />}
        {!tasks.loading && tasks.error && (
          <ErrorState message={tasks.error} onRetry={tasks.reload} />
        )}

        {tasks.data && tasks.data.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="Inga uppgifter ännu"
            description="Skapa en uppgift och tilldela den till en elev eller en klass. Eleven ser den direkt under Uppgifter."
          />
        )}

        {tasks.data && tasks.data.length > 0 && (
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
                <span>Elev</span>
                <select
                  className="input"
                  aria-label="Filtrera på elev"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  <option value="">Alla elever</option>
                  {(students.data ?? []).map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.username}
                    </option>
                  ))}
                </select>
              </label>
            </Toolbar>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="Inga träffar"
                description="Ingen uppgift matchar filtret. Prova ett annat filter eller en annan sökning."
              />
            ) : (
              <ul className="list">
                {filtered.map((task) => (
                  <li className="list-item list-item-static" key={task.id}>
                    <div className="list-item-content">
                      <TaskTitle task={task} />
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
                      question="Ta bort uppgiften?"
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
                onFollowedUp={() => tasks.reload()}
                onError={setError}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {showNew && (
        <Modal title="Ny uppgift" onClose={() => setShowNew(false)} closeLabel="Stäng ny uppgift">
          <AssignmentForm
            students={(students.data ?? []).map((s) => ({ id: s.id, username: s.username }))}
            classes={(classes.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
            onCancel={() => setShowNew(false)}
            onSaved={() => {
              setShowNew(false);
              tasks.reload();
            }}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Redigera: ${editing.title}`}
          onClose={() => setEditing(null)}
          closeLabel="Stäng redigering"
        >
          <AssignmentForm
            task={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              tasks.reload();
            }}
          />
        </Modal>
      )}

      {classes.data && classes.data.length === 0 && (
        <SectionCard title="Klasser" subtitle="Tilldela en hel klass">
          <EmptyState
            title="Inga klasser ännu"
            description="Skapa en klass för att kunna tilldela samma uppgift till flera elever samtidigt."
          />
        </SectionCard>
      )}
    </div>
  );
};

const TaskTitle: React.FC<{ task: AssignedTask }> = ({ task }) => (
  <>
    <div className="list-item-title">{task.title}</div>
    <div className="list-item-sub">
      {task.student_username ? `${task.student_username} · ` : ''}
      {task.subject ? `${task.subject} · ` : ''}
      {task.due_date ? `förfaller ${task.due_date}` : 'inget datum'}
      {task.submitted_at ? ' · inlämnad' : ''}
    </div>
  </>
);
