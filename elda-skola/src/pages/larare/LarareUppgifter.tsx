import React, { useMemo, useState } from 'react';
import {
  Archive,
  ClipboardList,
  FilePlus2,
  Pencil,
  Send,
  Upload,
} from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  archiveTask,
  createTask,
  isOverdue,
  listClasses,
  listMyStudents,
  listSubmissions,
  listTasks,
  restoreTask,
  updateTask,
  uploadDocument,
} from '../../lib/api';
import { countSubmissions } from '../../lib/submissions';
import { deadlineLabel, shortDate, sortByDate, truncate } from '../../lib/format';
import type { SchoolClass, StudentRow, Task } from '../../lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageIntro,
  Spinner,
} from '../../components/ui';

export const LarareUppgifter: React.FC = () => {
  const state = useAsync(async () => {
    const [tasks, classes, students, submissions] = await Promise.all([
      listTasks({ createdByMe: true }),
      listClasses(),
      listMyStudents(),
      listSubmissions(),
    ]);
    return { tasks, classes, students, submissions };
  }, []);
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tasks = state.data?.tasks ?? [];
  const classes = state.data?.classes ?? [];
  const students = state.data?.students ?? [];
  const submissions = state.data?.submissions ?? [];

  const visible = useMemo(
    () => tasks.filter((task) => (showArchived ? Boolean(task.archived_at) : !task.archived_at)),
    [tasks, showArchived],
  );

  const studentCountFor = (classId: string | null) =>
    classId ? new Set(students.filter((row) => row.class_id === classId).map((row) => row.id)).size : 1;

  const doArchive = async (task: Task) => {
    setError(null);
    try {
      if (task.archived_at) await restoreTask(task.id);
      else await archiveTask(task.id);
      setMessage(task.archived_at ? 'Uppgiften är återställd.' : 'Uppgiften är arkiverad.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ändra uppgiften.');
    }
  };

  const publish = async (task: Task) => {
    setError(null);
    try {
      await updateTask(task.id, { published: true });
      setMessage('Uppgiften är publicerad och syns för eleverna.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte publicera uppgiften.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar dina uppgifter…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Uppgifter och aktiviteter" />
        <Card><EmptyState title="Kunde inte hämta uppgifterna" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title="Uppgifter och aktiviteter"
        description="Skapa uppgifter, spara utkast, publicera till rätt klass och följ inlämningarna."
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowArchived((value) => !value)} icon={<Archive size={16} />}>
              {showArchived ? 'Visa aktiva' : 'Visa arkiv'}
            </Button>
            <Button icon={<FilePlus2 size={16} />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              Ny uppgift
            </Button>
          </>
        }
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={24} />}
            title={showArchived ? 'Arkivet är tomt' : 'Inga uppgifter ännu'}
            description={
              showArchived
                ? 'Uppgifter du arkiverar hamnar här och kan återställas.'
                : classes.length === 0
                  ? 'Skapa först en klass under Mina klasser. Därefter kan du publicera uppgifter.'
                  : 'Skapa en uppgift med instruktioner, deadline och eventuella bilagor.'
            }
            action={!showArchived && classes.length > 0 ? <Button onClick={() => setFormOpen(true)}>Skapa uppgift</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="item-grid">
          {visible.map((task) => {
            const counts = countSubmissions(task, submissions, studentCountFor(task.class_id));
            return (
              <article key={task.id} className="item-card">
                <div className="item-card-head">
                  <div>
                    <h3>{task.title}</h3>
                    <p>{task.class_name || 'Enskild elev'} · {task.subject || 'Övrigt'}</p>
                  </div>
                  <Badge tone={task.archived_at ? 'neutral' : task.published === false ? 'amber' : 'green'}>
                    {task.archived_at ? 'Arkiverad' : task.published === false ? 'Utkast' : 'Publicerad'}
                  </Badge>
                </div>
                <p>{truncate(task.description, 110) || 'Ingen beskrivning'}</p>
                <div className="meta">
                  <span>{task.due_date ? shortDate(task.due_date) : 'Ingen deadline'}</span>
                  <span>·</span>
                  <span>{task.due_date ? deadlineLabel(task.due_date) : '—'}</span>
                  <span>·</span>
                  <span>{counts.submitted}/{counts.total} inlämnade</span>
                  {counts.waiting > 0 && <Badge tone="amber">{counts.waiting} väntar</Badge>}
                  {isOverdue(task.due_date) && <Badge tone="red">Försenad</Badge>}
                </div>
                <div className="item-actions">
                  <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => { setEditing(task); setFormOpen(true); }}>
                    Redigera
                  </Button>
                  {task.published === false && !task.archived_at && (
                    <Button size="sm" variant="secondary" icon={<Send size={14} />} onClick={() => void publish(task)}>
                      Publicera
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => void doArchive(task)}>
                    {task.archived_at ? 'Återställ' : 'Arkivera'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Card title="Status i uppgifterna" subtitle="Räknat från elevernas individuella inlämningar" className="" >
        <div className="list">
          {sortByDate(tasks.filter((task) => !task.archived_at), (task) => task.due_date).slice(0, 8).map((task) => {
            const counts = countSubmissions(task, submissions, studentCountFor(task.class_id));
            return (
              <div key={task.id} className="list-row">
                <div className="list-main">
                  <p className="list-title">{task.title}</p>
                  <p className="list-sub">
                    {task.student_name || task.student_username || task.class_name || 'Elev'} ·{' '}
                    {counts.submitted} av {counts.total} inlämnade · {counts.drafts} utkast
                  </p>
                </div>
                <div className="list-side">
                  {counts.waiting > 0 && <Badge tone="amber">{counts.waiting} väntar</Badge>}
                  {counts.returned > 0 && <Badge tone="amber">{counts.returned} kompletterar</Badge>}
                  {counts.reviewed > 0 && <Badge tone="green">{counts.reviewed} granskade</Badge>}
                  {counts.submitted === 0 && <Badge tone="neutral">Inga inlämningar</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {formOpen && (
        <TaskForm
          task={editing}
          classes={classes}
          students={students}
          onClose={() => setFormOpen(false)}
          onSaved={async (text) => {
            setFormOpen(false);
            setMessage(text);
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const TaskForm: React.FC<{
  task: Task | null;
  classes: SchoolClass[];
  students: StudentRow[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}> = ({ task, classes, students, onClose, onSaved }) => {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [instructions, setInstructions] = useState(task?.instructions ?? '');
  const [subject, setSubject] = useState(task?.subject ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [classId, setClassId] = useState(task?.class_id ?? classes[0]?.id ?? '');
  const [studentId, setStudentId] = useState(task?.student_id ?? '');
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classStudents = students.filter((row) => row.class_id === classId);

  const save = async (published: boolean) => {
    if (!title.trim()) {
      setError('Ge uppgiften en rubrik.');
      return;
    }
    if (!classId) {
      setError('Välj en klass.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let id = task?.id ?? '';
      if (task) {
        await updateTask(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
          subject: subject.trim() || null,
          due_date: dueDate || null,
          published,
        });
      } else {
        id = await createTask({
          title,
          description,
          instructions,
          subject,
          due_date: dueDate,
          class_id: classId,
          student_id: studentId || null,
          published,
        });
      }

      if (files && id) {
        for (const file of Array.from(files)) {
          await uploadDocument({
            file,
            title: file.name,
            description: `Bilaga till ${title.trim()}`,
            subject,
            classId,
            studentId: studentId || null,
            taskId: id,
          });
        }
      }

      await onSaved(task ? 'Uppgiften är sparad.' : published ? 'Uppgiften är publicerad.' : 'Utkastet är sparat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara uppgiften.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={task ? 'Redigera uppgift' : 'Ny uppgift'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button variant="secondary" loading={busy} onClick={() => void save(false)}>Spara utkast</Button>
          <Button icon={<Send size={16} />} loading={busy} onClick={() => void save(true)}>
            {task?.published === false ? 'Publicera' : 'Spara och publicera'}
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <div className="span-2">
          <Field label="Rubrik" htmlFor="task-title" required>
            <input id="task-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
          </Field>
        </div>
        <Field label="Klass" htmlFor="task-class" required>
          <select
            id="task-class"
            className="input"
            value={classId}
            onChange={(event) => { setClassId(event.target.value); setStudentId(''); }}
          >
            <option value="">Välj klass</option>
            {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </Field>
        <Field label="Mottagare" htmlFor="task-student" hint="Lämna tomt för att ge hela klassen uppgiften.">
          <select id="task-student" className="input" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">Hela klassen</option>
            {classStudents.map((row) => (
              <option key={row.id} value={row.id}>
                {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.username}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ämne" htmlFor="task-subject">
          <input id="task-subject" className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="T.ex. Svenska" />
        </Field>
        <Field label="Deadline" htmlFor="task-due">
          <input id="task-due" className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </div>
      <Field label="Beskrivning" htmlFor="task-description" hint="Visas i uppgiftslistan.">
        <textarea id="task-description" className="input" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </Field>
      <Field label="Instruktioner" htmlFor="task-instructions" hint="Det här läser eleven i uppgiften.">
        <textarea id="task-instructions" className="input" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={6} />
      </Field>
      <Field label="Bilagor" htmlFor="task-files" hint="PDF, bild, text, Word, Excel, PowerPoint eller zip. Max 10 MB per fil.">
        <input id="task-files" className="input" type="file" multiple onChange={(event) => setFiles(event.target.files)} />
      </Field>
      {task?.published === false && (
        <div className="notice">
          <FilePlus2 size={17} />
          <span>Uppgiften är ett utkast och syns inte för eleverna förrän du publicerar den.</span>
        </div>
      )}

      <div className="notice" style={{ marginTop: 10 }}>
        <Upload size={17} />
        <span>Filer laddas upp först när du sparar uppgiften.</span>
      </div>
    </Modal>
  );
};
