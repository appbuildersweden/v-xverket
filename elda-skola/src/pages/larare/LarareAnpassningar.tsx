import React, { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  deleteAdaptation,
  listAdaptations,
  listClasses,
  listMyStudents,
  listTasks,
  saveAdaptation,
} from '../../lib/api';
import { displayName, shortDate } from '../../lib/format';
import type { Adaptation, SchoolClass, StudentRow, Task } from '../../lib/types';
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

export const LarareAnpassningar: React.FC = () => {
  const state = useAsync(async () => {
    const [adaptations, students, classes, tasks] = await Promise.all([
      listAdaptations(),
      listMyStudents(),
      listClasses(),
      listTasks({ createdByMe: true }),
    ]);
    return { adaptations, students, classes, tasks };
  }, []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'alla' | 'aktiv' | 'avslutad'>('alla');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Adaptation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adaptations = state.data?.adaptations ?? [];
  const students = state.data?.students ?? [];
  const classes = state.data?.classes ?? [];
  const tasks = state.data?.tasks ?? [];

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return adaptations
      .filter((row) => status === 'alla' || row.status === status)
      .filter((row) => {
        if (!text) return true;
        return `${row.student_name} ${row.title} ${row.measures ?? ''} ${row.subject ?? ''}`
          .toLowerCase()
          .includes(text);
      });
  }, [adaptations, status, query]);

  const byStudent = useMemo(() => {
    const map = new Map<string, Adaptation[]>();
    for (const row of filtered) {
      map.set(row.student_id, [...(map.get(row.student_id) ?? []), row]);
    }
    return [...map.entries()];
  }, [filtered]);

  const remove = async (row: Adaptation) => {
    if (!window.confirm(`Ta bort anpassningen ”${row.title}”?`)) return;
    try {
      await deleteAdaptation(row.id);
      setMessage('Anpassningen är borttagen.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort anpassningen.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar anpassningar…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Anpassningar" />
        <Card><EmptyState title="Kunde inte hämta anpassningarna" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel · känslig information"
        title="Anpassningar"
        description="Pedagogiska anpassningar och stödinsatser för elever du undervisar. Bara behöriga lärare kan läsa dem – aldrig eleven själv eller obehörig personal."
        actions={<Button icon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>Ny anpassning</Button>}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="notice" style={{ marginBottom: 16 }}>
        <Lock size={17} />
        <span>
          Åtkomsten kontrolleras i databasen: en anpassning kan bara läsas av lärare
          som undervisar eleven i samma klass, och bara skrivas av den lärare som
          skapade den. Eleven ser dem inte i elevpanelen.
        </span>
      </div>

      <div className="filter-bar">
        <input className="input" placeholder="Sök elev eller anpassning…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Sök anpassning" />
        {[['alla', 'Alla'], ['aktiv', 'Aktiva'], ['avslutad', 'Avslutade']].map(([value, label]) => (
          <button key={value} type="button" className={`chip ${status === value ? 'chip-active' : ''}`} onClick={() => setStatus(value as typeof status)}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserRound size={24} />}
            title={adaptations.length === 0 ? 'Inga anpassningar registrerade' : 'Inga träffar'}
            description={
              adaptations.length === 0
                ? 'Dokumentera en anpassning för en elev du undervisar. Den blir synlig för behöriga lärare i samma klass.'
                : 'Prova ett annat filter eller en annan sökning.'
            }
            action={students.length > 0 && adaptations.length === 0 ? <Button onClick={() => setOpen(true)}>Skapa anpassning</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="stack">
          {byStudent.map(([studentId, rows]) => (
            <Card
              key={studentId}
              title={rows[0].student_name}
              subtitle={`${rows[0].class_name || 'Klass'} · ${rows.length} anpassning${rows.length === 1 ? '' : 'ar'}`}
            >
              <div className="list">
                {rows.map((row) => (
                  <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="list-main">
                      <p className="list-title">{row.title}</p>
                      <p className="list-sub">{row.subject || 'Allmänt'}{row.task_id ? ' · kopplad till uppgift' : ''} · {shortDate(row.created_at)} · {row.creator_name}</p>
                      {row.description && <p className="list-sub">{row.description}</p>}
                      {row.measures && <div className="note-box" style={{ marginTop: 6 }}>{row.measures}</div>}
                    </div>
                    <div className="list-side">
                      <Badge tone={row.status === 'aktiv' ? 'green' : 'neutral'}>{row.status === 'aktiv' ? 'Aktiv' : 'Avslutad'}</Badge>
                      <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => { setEditing(row); setOpen(true); }}>Redigera</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove(row)}>Ta bort</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <AdaptationForm
          adaptation={editing}
          students={students}
          classes={classes}
          tasks={tasks}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            setMessage('Anpassningen är sparad.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const AdaptationForm: React.FC<{
  adaptation: Adaptation | null;
  students: StudentRow[];
  classes: SchoolClass[];
  tasks: Task[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ adaptation, students, classes, tasks, onClose, onSaved }) => {
  const [studentId, setStudentId] = useState(adaptation?.student_id ?? students[0]?.id ?? '');
  const [classId, setClassId] = useState(adaptation?.class_id ?? students[0]?.class_id ?? classes[0]?.id ?? '');
  const [subject, setSubject] = useState(adaptation?.subject ?? '');
  const [taskId, setTaskId] = useState(adaptation?.task_id ?? '');
  const [title, setTitle] = useState(adaptation?.title ?? '');
  const [description, setDescription] = useState(adaptation?.description ?? '');
  const [measures, setMeasures] = useState(adaptation?.measures ?? '');
  const [status, setStatus] = useState<'aktiv' | 'avslutad'>(adaptation?.status ?? 'aktiv');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentClasses = classes.filter((row) =>
    students.some((student) => student.id === studentId && student.class_id === row.id),
  );
  const studentTasks = tasks.filter((row) => row.student_id === studentId || (row.class_id === classId && !row.student_id));

  const save = async () => {
    if (!studentId) {
      setError('Välj en elev.');
      return;
    }
    if (!title.trim()) {
      setError('Ge anpassningen en kort rubrik.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAdaptation({
        id: adaptation?.id ?? null,
        studentId,
        classId,
        subject,
        taskId: taskId || null,
        title,
        description,
        measures,
        status,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara anpassningen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={adaptation ? 'Redigera anpassning' : 'Ny anpassning'}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Avbryt</Button><Button loading={busy} onClick={() => void save()}>Spara</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <Field label="Elev" htmlFor="adaptation-student" required>
          <select
            id="adaptation-student"
            className="input"
            value={studentId}
            onChange={(event) => {
              const next = event.target.value;
              setStudentId(next);
              const row = students.find((student) => student.id === next);
              if (row) setClassId(row.class_id);
              setTaskId('');
            }}
          >
            <option value="">Välj elev</option>
            {students.map((row) => (
              <option key={`${row.id}-${row.class_id}`} value={row.id}>
                {displayName(row)} · {row.class_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Klass" htmlFor="adaptation-class" required>
          <select id="adaptation-class" className="input" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Välj klass</option>
            {(studentClasses.length > 0 ? studentClasses : classes).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ämne" htmlFor="adaptation-subject">
          <input id="adaptation-subject" className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="T.ex. Matematik" />
        </Field>
        <Field label="Kopplad uppgift" htmlFor="adaptation-task" hint="Frivilligt – använd om anpassningen gäller en specifik uppgift.">
          <select id="adaptation-task" className="input" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
            <option value="">Ingen uppgift</option>
            {studentTasks.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Rubrik" htmlFor="adaptation-title" required hint="Kort och neutralt, t.ex. ”Längre tid vid prov”.">
        <input id="adaptation-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
      </Field>
      <Field label="Beskrivning" htmlFor="adaptation-description">
        <textarea id="adaptation-description" className="input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label="Stödinsatser" htmlFor="adaptation-measures" hint="Vad ska lärare göra i praktiken? Skriv bara det som behövs för undervisningen.">
        <textarea id="adaptation-measures" className="input" rows={5} value={measures} onChange={(event) => setMeasures(event.target.value)} />
      </Field>
      <Field label="Status" htmlFor="adaptation-status">
        <select id="adaptation-status" className="input" value={status} onChange={(event) => setStatus(event.target.value as 'aktiv' | 'avslutad')}>
          <option value="aktiv">Aktiv</option>
          <option value="avslutad">Avslutad</option>
        </select>
      </Field>
      <div className="notice">
        <Lock size={17} />
        <span>Anpassningar är känsliga uppgifter. Skriv bara det som behövs för undervisningen och dela dem inte utanför Elda Skola.</span>
      </div>
    </Modal>
  );
};
