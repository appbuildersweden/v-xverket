import React, { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  deleteAdaptation,
  listAdaptations,
  listClasses,
  listSpecialStudents,
  saveAdaptation,
} from '../../lib/api';
import { shortDate } from '../../lib/format';
import type { Adaptation, SchoolClass, SpecialStudent } from '../../lib/types';
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

/**
 * Speciallärarens elever och elevstöd.
 *
 * Anpassningarna är känslig information: servern släpper bara igenom dem för
 * personal som är kopplad till eleven i samma skola. Eleven själv ser dem aldrig
 * i elevpanelen.
 */
export const SpeciallararElever: React.FC = () => {
  const state = useAsync(async () => {
    const [students, adaptations, classes] = await Promise.all([
      listSpecialStudents(),
      listAdaptations(),
      listClasses(),
    ]);
    return { students, adaptations, classes };
  }, []);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ student: SpecialStudent; row: Adaptation | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const students = state.data?.students ?? [];
  const adaptations = state.data?.adaptations ?? [];
  const classes = state.data?.classes ?? [];

  const byStudent = useMemo(() => {
    const map = new Map<string, Adaptation[]>();
    for (const row of adaptations) {
      map.set(row.student_id, [...(map.get(row.student_id) ?? []), row]);
    }
    return map;
  }, [adaptations]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return students;
    return students.filter((row) =>
      `${row.display_name} ${row.username} ${row.class_name}`.toLowerCase().includes(text),
    );
  }, [students, query]);

  const remove = async (row: Adaptation) => {
    if (!window.confirm(`Ta bort anpassningen ”${row.title}”?`)) return;
    setError(null);
    try {
      await deleteAdaptation(row.id);
      setNotice('Anpassningen är borttagen.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort anpassningen.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar dina elever…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Mina elever" />
        <Card>
          <EmptyState
            title="Kunde inte hämta eleverna"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Speciallärarpanel · känslig information"
        title="Mina elever och elevstöd"
        description="Elever du arbetar med och deras pedagogiska anpassningar. Bara behörig personal i samma skola ser elevstödet – aldrig eleven själv."
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="notice" style={{ marginBottom: 16 }}>
        <Lock size={17} />
        <span>
          Åtkomsten kontrolleras i databasen: en anpassning kan bara läsas av personal som är
          kopplad till eleven, och bara inom den egna skolorganisationen.
        </span>
      </div>

      <div className="search-field" style={{ marginBottom: 16, maxWidth: 420 }}>
        <Search size={16} aria-hidden />
        <input
          className="input"
          placeholder="Sök elev eller klass"
          aria-label="Sök elev"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserRound size={24} />}
            title={query ? 'Inga elever matchar' : 'Inga elever kopplade ännu'}
            description={
              query
                ? 'Prova ett annat sökord.'
                : 'Du ser elever som är kopplade till dig eller går i en klass du undervisar. Kopplingen görs av behörig personal i din skola.'
            }
          />
        </Card>
      ) : (
        <div className="stack">
          {filtered.map((student) => {
            const rows = byStudent.get(student.id) ?? [];
            return (
              <Card
                key={student.id}
                title={student.display_name}
                subtitle={`@${student.username}${student.class_name ? ` · ${student.class_name}` : ''}`}
                action={
                  <Button
                    size="sm"
                    icon={<Plus size={15} />}
                    onClick={() => setEditing({ student, row: null })}
                  >
                    Ny anpassning
                  </Button>
                }
              >
                {rows.length === 0 ? (
                  <EmptyState
                    title="Ingen anpassning ännu"
                    description="Skapa en anpassning när eleven behöver särskilt stöd i ett ämne eller en uppgift."
                  />
                ) : (
                  <div className="list">
                    {rows.map((row) => (
                      <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                        <div className="list-main">
                          <p className="list-title">
                            {row.title}{' '}
                            <Badge tone={row.status === 'aktiv' ? 'green' : 'neutral'}>
                              {row.status === 'aktiv' ? 'Aktiv' : 'Avslutad'}
                            </Badge>
                          </p>
                          <p className="list-sub">
                            {row.subject || 'Inget ämne'}
                            {row.class_name ? ` · ${row.class_name}` : ''} · {row.creator_name} ·{' '}
                            {shortDate(row.updated_at)}
                          </p>
                          {row.description && <p className="list-sub">{row.description}</p>}
                          {row.measures && (
                            <div className="note-box" style={{ marginTop: 6 }}>
                              <strong>Insats: </strong>
                              {row.measures}
                            </div>
                          )}
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil size={14} />}
                            onClick={() => setEditing({ student, row })}
                          >
                            Redigera
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 size={14} />}
                            onClick={() => void remove(row)}
                          >
                            Ta bort
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <AdaptationForm
          student={editing.student}
          row={editing.row}
          classes={classes}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice('Anpassningen är sparad.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const AdaptationForm: React.FC<{
  student: SpecialStudent;
  row: Adaptation | null;
  classes: SchoolClass[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ student, row, classes, onClose, onSaved }) => {
  const [title, setTitle] = useState(row?.title ?? '');
  const [subject, setSubject] = useState(row?.subject ?? '');
  const [classId, setClassId] = useState(row?.class_id ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [measures, setMeasures] = useState(row?.measures ?? '');
  const [status, setStatus] = useState<'aktiv' | 'avslutad'>(row?.status ?? 'aktiv');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('Ge anpassningen en rubrik.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAdaptation({
        id: row?.id ?? null,
        studentId: student.id,
        classId,
        subject,
        taskId: row?.task_id ?? null,
        title,
        description,
        measures,
        status,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anpassningen kunde inte sparas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Anpassning – ${student.display_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Spara
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Rubrik" htmlFor="ada-title" required>
        <input
          id="ada-title"
          className="input"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <div className="grid-2">
        <Field label="Ämne" htmlFor="ada-subject">
          <input
            id="ada-subject"
            className="input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        <Field label="Klass" htmlFor="ada-class">
          <select
            id="ada-class"
            className="input"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value="">Ingen klass</option>
            {classes.map((rowClass) => (
              <option key={rowClass.id} value={rowClass.id}>
                {rowClass.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Beskrivning" htmlFor="ada-desc">
        <textarea
          id="ada-desc"
          className="input"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field label="Insats" htmlFor="ada-measures" hint="Vad ska göras, och av vem?">
        <textarea
          id="ada-measures"
          className="input"
          rows={3}
          value={measures}
          onChange={(event) => setMeasures(event.target.value)}
        />
      </Field>
      <Field label="Status" htmlFor="ada-status">
        <select
          id="ada-status"
          className="input"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'aktiv' | 'avslutad')}
        >
          <option value="aktiv">Aktiv</option>
          <option value="avslutad">Avslutad</option>
        </select>
      </Field>
    </Modal>
  );
};
