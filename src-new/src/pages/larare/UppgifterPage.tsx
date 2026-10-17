import React, { useMemo, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { MyClass, MyStudent, listMyClasses, listMyStudents } from '../../lib/classes';
import {
  AssignedTask,
  assignmentStage,
  deleteAssignedTask,
  listAssignedTasks,
  sortAssignedTasks,
} from '../../lib/assignments';
import { Result } from '../../lib/db';
import { formatDate, todayISO } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SectionCard,
  TaskStagePill,
} from '../../components/ui';
import { AssignmentForm } from '../../components/AssignmentForm';
import { ConfirmButton } from '../../components/forms';

interface Data {
  classes: MyClass[];
  students: MyStudent[];
  tasks: AssignedTask[];
  warnings: string[];
}

async function loadData(): Promise<Result<Data>> {
  const [classes, students, tasks] = await Promise.all([
    listMyClasses(),
    listMyStudents(),
    listAssignedTasks({ createdByMe: true }),
  ]);

  if (!tasks.ok) return tasks;

  const warnings: string[] = [];
  if (!classes.ok) warnings.push(classes.error);
  if (!students.ok) warnings.push(students.error);

  return {
    ok: true,
    data: {
      classes: classes.ok ? classes.data.filter((c) => c.member_role === 'larare') : [],
      students: students.ok ? students.data : [],
      tasks: tasks.data,
      warnings,
    },
  };
}

/**
 * Uppgifter. Läraren skapar uppgifter till en klass eller en enskild elev i sin
 * egen klass och ser sitt eget uppföljningsläge. Servern (RLS) avgör vad som
 * får läsas och skrivas — läraren kan aldrig se en annan lärares uppgifter.
 */
export const UppgifterPage: React.FC = () => {
  const data = useAsync(loadData);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const classes = useMemo(
    () => (data.data?.classes ?? []).map((c) => ({ id: c.id, name: c.name })),
    [data.data],
  );
  const students = useMemo(
    () =>
      (data.data?.students ?? []).map((s) => ({
        id: s.id,
        username: s.username,
      })),
    [data.data],
  );

  const remove = async (taskId: string) => {
    setActionError(null);
    const result = await deleteAssignedTask(taskId);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    data.reload();
  };

  const tasks = sortAssignedTasks(data.data?.tasks ?? []);
  const today = todayISO();

  return (
    <div className="panel-page" data-testid="page-larare-uppgifter">
      <SectionCard
        title="Uppgifter"
        subtitle="Tilldela en klass eller en enskild elev — med deadline och instruktioner"
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus size={15} /> {showForm ? 'Stäng' : 'Ny uppgift'}
          </button>
        }
      >
        {data.loading && <LoadingState label="Hämtar dina uppgifter…" />}
        {!data.loading && data.error && (
          <ErrorState message={data.error} onRetry={data.reload} />
        )}
        {data.data && data.data.warnings.length > 0 && (
          <div className="state-note state-note-error" role="status">
            {data.data.warnings[0]}
          </div>
        )}
        {actionError && (
          <div className="state-note state-note-error" role="alert">
            {actionError}
          </div>
        )}

        {showForm && (
          <AssignmentForm
            students={students}
            classes={classes}
            onSaved={() => {
              setShowForm(false);
              data.reload();
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {data.data && tasks.length === 0 && !showForm && (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="Inga uppgifter ännu"
            description="Skapa en uppgift och välj om den gäller en klass eller en enskild elev."
          />
        )}

        {tasks.length > 0 && (
          <ul className="list">
            {tasks.map((task) => {
              const klass = classes.find((c) => c.id === task.class_id);
              const elev = students.find((s) => s.id === task.student_id);
              return (
                <li className="list-item list-item-static" key={task.id}>
                  <ClipboardList size={16} aria-hidden="true" />
                  <div className="list-item-content">
                    <div className="list-item-title">{task.title}</div>
                    <div className="list-item-sub">
                      {klass ? `Klass: ${klass.name}` : elev ? `Elev: ${elev.username}` : 'Utan mottagare'}
                      {task.subject ? ` · ${task.subject}` : ''}
                      {' · '}
                      {task.due_date ? `förfaller ${formatDate(task.due_date)}` : 'ingen deadline'}
                      {task.due_date && task.status !== 'klar' && task.due_date < today
                        ? ' · försenad'
                        : ''}
                    </div>
                  </div>
                  <TaskStagePill stage={assignmentStage(task)} />
                  <ConfirmButton
                    label="Ta bort"
                    confirmLabel="Bekräfta"
                    question={`Ta bort uppgiften "${task.title}"?`}
                    onConfirm={() => void remove(task.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {data.data && (
        <SectionCard title="Mottagare" subtitle="Det du kan tilldela uppgifter till">
          <div className="grid-2">
            <div>
              <h3 className="card-sub">Klasser</h3>
              <ul className="list">
                {classes.length === 0 && <li className="list-item">Inga klasser ännu.</li>}
                {classes.map((klass) => (
                  <li className="list-item list-item-static" key={klass.id}>
                    {klass.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="card-sub">Elever i dina klasser</h3>
              <ul className="list">
                {students.length === 0 && <li className="list-item">Inga elever ännu.</li>}
                {students.map((student) => (
                  <li className="list-item list-item-static mono" key={student.id}>
                    {student.username}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>
      )}

    </div>
  );
};
