import React, { useMemo, useState } from 'react';
import {
  Copy,
  GraduationCap,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  addStudentByUsername,
  createClass,
  createStudentAccount,
  decideJoinRequest,
  listAdaptations,
  listClassRoster,
  listClasses,
  listJoinRequests,
  listMyStudents,
  listSubmissions,
  listTasks,
  removeStudent,
  rotateClassCode,
  updateClass,
} from '../../lib/api';
import { displayName, shortDate } from '../../lib/format';
import type { Adaptation, CreatedStudent, JoinRequest, SchoolClass, StudentRow, Submission, Task } from '../../lib/types';
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

export const LarareKlasser: React.FC = () => {
  const state = useAsync(async () => {
    const [classes, students, tasks, adaptations, requests, submissions] = await Promise.all([
      listClasses(),
      listMyStudents(),
      listTasks({ createdByMe: true }),
      listAdaptations(),
      listJoinRequests(),
      listSubmissions(),
    ]);
    return { classes, students, tasks, adaptations, requests, submissions };
  }, []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editClass, setEditClass] = useState<SchoolClass | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classes = state.data?.classes ?? [];
  const students = state.data?.students ?? [];
  const tasks = state.data?.tasks ?? [];
  const submissions = state.data?.submissions ?? [];
  const adaptations = state.data?.adaptations ?? [];
  const requests = state.data?.requests ?? [];
  const pendingRequests = requests.filter((row) => row.status === 'vantar');
  const active = classes.find((row) => row.id === activeId) ?? classes[0] ?? null;

  const roster = useAsync(
    async () => (active ? listClassRoster(active.id) : []),
    [active?.id],
    { enabled: Boolean(active) },
  );

  const classStudents = useMemo(
    () => (active ? students.filter((row) => row.class_id === active.id) : []),
    [students, active],
  );

  const refresh = async () => {
    await state.reload();
    await roster.reload();
  };

  const remove = async (row: StudentRow) => {
    if (!active) return;
    if (!window.confirm(`Ta bort ${displayName(row)} från ${active.name}? Kontot finns kvar.`)) return;
    setError(null);
    try {
      await removeStudent(active.id, row.id);
      setMessage('Eleven är borttagen från klassen. Kontot och profilen finns kvar.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort eleven.');
    }
  };

  const decide = async (request: JoinRequest, approve: boolean) => {
    setError(null);
    try {
      await decideJoinRequest(request.id, approve);
      setMessage(
        approve
          ? `${request.student_username} är godkänd och tillagd i ${request.class_name}.`
          : `Ansökan från ${request.student_username} är nekad.`,
      );
      await state.reload();
      await roster.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hantera ansökan.');
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setMessage('Klasskoden är kopierad.');
    } catch {
      setError('Kunde inte kopiera automatiskt. Markera koden och kopiera manuellt.');
    }
  };

  const rotate = async (row: SchoolClass) => {
    if (!window.confirm('Skapa en ny klasskod? Den gamla slutar gälla direkt.')) return;
    setError(null);
    try {
      await rotateClassCode(row.id);
      setMessage('En ny klasskod har skapats. Den gamla fungerar inte längre.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte förnya klasskoden.');
    }
  };

  // Visa bara helskärmsladdning första gången. Vid en uppdatering ska öppna
  // modaler (t.ex. engångslösenordet) ligga kvar.
  if (state.loading && !state.data) return <Spinner label="Hämtar klasser och elever…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Mina klasser och elever" />
        <Card><EmptyState title="Kunde inte hämta klasserna" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title="Mina klasser och elever"
        description="Skapa klasser, dela klasskoden och hantera elever. En elev har ett konto och en profil även om hen läser flera ämnen."
        actions={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>Skapa klass</Button>}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      {classes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GraduationCap size={24} />}
            title="Inga klasser ännu"
            description="Skapa din första klass. Eleverna kan sedan gå med via klasskoden, eller läggas till av dig om kontot redan finns."
            action={<Button onClick={() => setCreateOpen(true)}>Skapa klass</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="item-grid" style={{ marginBottom: 18 }}>
            {classes.map((row) => (
              <button
                key={row.id}
                type="button"
                className="subject-tile"
                onClick={() => setActiveId(row.id)}
                style={active?.id === row.id ? { borderColor: 'var(--green)', background: 'var(--surface-2)' } : undefined}
              >
                <span className="icon"><GraduationCap size={18} /></span>
                <h3>{row.name}</h3>
                <p>{row.subject || 'Ämnesklass'} · {row.member_count} medlemmar</p>
                <p className="small muted">Kod: {row.join_code ?? 'saknas'}</p>
              </button>
            ))}
          </div>

          {active && (
            <div className="dashboard-grid">
              <div className="stack">
                <Card
                  title={active.name}
                  subtitle={`${active.subject || 'Ämnesklass'} · ${classStudents.length} elever`}
                  action={
                    <div className="row">
                      <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditClass(active)}>Redigera</Button>
                      <Button size="sm" variant="ghost" icon={<UserPlus size={14} />} onClick={() => setAddOpen(true)}>Ny elev eller tilldela</Button>
                    </div>
                  }
                >
                  <div className="row" style={{ justifyContent: 'space-between', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                    <div>
                      <span className="small muted">Klasskod för elever</span>
                      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>{active.join_code ?? '—'}</div>
                    </div>
                    <div className="row">
                      {active.join_code && (
                        <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => void copyCode(active.join_code as string)}>Kopiera</Button>
                      )}
                      <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => void rotate(active)}>Förnya</Button>
                    </div>
                  </div>
                  <p className="small muted">
                    Eleven ansöker med klasskoden och du godkänner i din klasslista. Koden ger aldrig åtkomst i sig.
                  </p>

                  {roster.loading ? (
                    <Spinner label="Hämtar klasslistan…" />
                  ) : roster.error ? (
                    <Alert>{roster.error}</Alert>
                  ) : (
                    <div className="list" style={{ marginTop: 10 }}>
                      {(roster.data ?? []).filter((row) => row.member_role === 'larare').map((row) => (
                        <div key={row.id} className="list-row">
                          <div className="list-main">
                            <p className="list-title">{row.display_name}</p>
                            <p className="list-sub">@{row.username}</p>
                          </div>
                          <Badge tone="green">Lärare</Badge>
                        </div>
                      ))}
                      {classStudents.map((row) => (
                        <div key={row.id} className="list-row">
                          <div className="list-main">
                            <p className="list-title">{displayName(row)}</p>
                            <p className="list-sub">@{row.username}</p>
                          </div>
                          <div className="list-side">
                            <Button size="sm" variant="ghost" onClick={() => setStudent(row)}>Visa elev</Button>
                            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove(row)}>Ta bort</Button>
                          </div>
                        </div>
                      ))}
                      {classStudents.length === 0 && (
                          <EmptyState
                            icon={<Users size={21} />}
                            title="Inga elever i klassen"
                            description="Dela klasskoden eller skapa ett elevkonto direkt här."
                            action={<Button size="sm" onClick={() => setAddOpen(true)}>Lägg till elev</Button>}
                          />
                      )}
                    </div>
                  )}
                </Card>
              </div>

              <div className="stack">
                <Card
                  title="Klassansökningar"
                  subtitle={
                    pendingRequests.length === 0
                      ? 'Inga väntande ansökningar'
                      : `${pendingRequests.length} väntar på ditt beslut`
                  }
                >
                  {pendingRequests.length === 0 ? (
                    <p className="small muted" style={{ margin: 0 }}>
                      Elever som ansöker med klasskoden hamnar här. Först när du
                      godkänner får eleven tillgång till klassens innehåll.
                    </p>
                  ) : (
                    <div className="list">
                      {pendingRequests.map((row) => (
                        <div key={row.id} className="list-row">
                          <div className="list-main">
                            <p className="list-title">@{row.student_username}</p>
                            <p className="list-sub">{row.class_name} · {shortDate(row.requested_at)}</p>
                          </div>
                          <div className="list-side">
                            <Button size="sm" onClick={() => void decide(row, true)}>Godkänn</Button>
                            <Button size="sm" variant="ghost" onClick={() => void decide(row, false)}>Neka</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Klassöversikt" subtitle="Sammanställning för vald klass">
                  <div className="dl">
                    <div><dt>Klasskod</dt><dd>{active.join_code ?? 'Saknas'}</dd></div>
                    <div><dt>Ämne</dt><dd>{active.subject || 'Ej angivet'}</dd></div>
                    <div><dt>Elever</dt><dd>{classStudents.length}</dd></div>
                    <div><dt>Uppgifter</dt><dd>{tasks.filter((row) => row.class_id === active.id).length}</dd></div>
                    <div><dt>Anpassningar</dt><dd>{adaptations.filter((row) => row.class_id === active.id).length}</dd></div>
                    <div><dt>Skapad</dt><dd>{shortDate(active.created_at)}</dd></div>
                  </div>
                  {active.description && <p className="small muted" style={{ marginTop: 12 }}>{active.description}</p>}
                </Card>

                <Card title="Så fungerar elevkonton" subtitle="En identitet, flera klasser">
                  <p className="small muted" style={{ margin: 0 }}>
                    En elev kan vara med i flera ämnesklasser men har alltid samma
                    konto. Lägg till en elev som redan finns med användarnamn, eller
                    låt eleven gå med via klasskoden. Nya skolelever skapas av
                    skolans personal – det finns ingen öppen självregistrering.
                  </p>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {createOpen && (
        <ClassForm
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            setMessage('Klassen är skapad. Dela klasskoden med eleverna.');
            await state.reload();
          }}
        />
      )}
      {editClass && (
        <ClassForm
          existing={editClass}
          onClose={() => setEditClass(null)}
          onSaved={async () => {
            setEditClass(null);
            setMessage('Klassuppgifterna är sparade.');
            await state.reload();
          }}
        />
      )}
      {addOpen && active && (
        <AddStudentForm
          classRow={active}
          onClose={() => setAddOpen(false)}
          onCreated={async (text) => {
            setMessage(text);
            await refresh();
          }}
          onSaved={async (text) => {
            setAddOpen(false);
            setMessage(text);
            await refresh();
          }}
        />
      )}
      {student && (
        <StudentModal
          student={student}
          tasks={tasks.filter((row) => row.student_id === student.id || row.class_id === student.class_id)}
          submissions={submissions.filter((row) => row.student_id === student.id)}
          adaptations={adaptations.filter((row) => row.student_id === student.id)}
          onClose={() => setStudent(null)}
        />
      )}
    </div>
  );
};

const ClassForm: React.FC<{
  existing?: SchoolClass;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ existing, onClose, onSaved }) => {
  const [name, setName] = useState(existing?.name ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) {
      setError('Ge klassen ett namn med minst två tecken.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await updateClass({ id: existing.id, name, subject, description });
      } else {
        await createClass({ name, subject, description });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara klassen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={existing ? 'Redigera klass' : 'Skapa klass'}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Avbryt</Button><Button loading={busy} onClick={() => void save()}>{existing ? 'Spara' : 'Skapa klass'}</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Klassnamn" htmlFor="class-name" required hint="T.ex. 7A Samhällskunskap eller Åk 8 Svenska.">
        <input id="class-name" className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      </Field>
      <Field label="Ämne" htmlFor="class-subject" hint="Används för att gruppera material och uppgifter.">
        <input id="class-subject" className="input" value={subject} onChange={(event) => setSubject(event.target.value)} />
      </Field>
      <Field label="Beskrivning" htmlFor="class-description">
        <textarea id="class-description" className="input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      {!existing && (
        <div className="notice">
          <KeyRound size={17} />
          <span>En klasskod skapas automatiskt. Eleven ansöker med koden och du godkänner i klasslistan.</span>
        </div>
      )}
    </Modal>
  );
};

const AddStudentForm: React.FC<{
  classRow: SchoolClass;
  onClose: () => void;
  /** Anropas när kontot skapats men innan engångslösenordet visats. */
  onCreated: (message: string) => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}> = ({ classRow, onClose, onCreated, onSaved }) => {
  const [mode, setMode] = useState<'ny' | 'befintlig'>('ny');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedStudent | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'ny') {
        if (!firstName.trim()) {
          setError('Ange elevens förnamn.');
          setBusy(false);
          return;
        }
        const created = await createStudentAccount({
          firstName,
          lastName,
          classId: classRow.id,
        });
        // Stäng inte modalen här: engångslösenordet måste visas för läraren
        // innan den försvinner. Klart-knappen stänger den sedan.
        setResult(created);
        await onCreated(`Elevkontot ${created.username} är skapat och tillagt i ${classRow.name}.`);
      } else {
        if (!username.trim()) {
          setError('Ange elevens användarnamn.');
          setBusy(false);
          return;
        }
        await addStudentByUsername(classRow.id, username);
        await onSaved('Eleven är tillagd i klassen. Kontot och profilen är oförändrade.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte lägga till eleven.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal open title="Elevkontot är skapat" onClose={onClose} footer={<Button onClick={onClose}>Klart</Button>}>
        <Alert tone="success">
          {result.username} är nu elev i {classRow.name} och kan logga in i Elda Skola.
        </Alert>
        {result.initialPassword && (
          <div className="notice" style={{ marginBottom: 12 }}>
            <KeyRound size={17} />
            <span>
              Tillfälligt lösenord: <strong style={{ letterSpacing: 1 }}>{result.initialPassword}</strong>
            </span>
          </div>
        )}
        <p className="small muted">
          Lämna användarnamnet och det tillfälliga lösenordet till eleven. Lösenordet
          visas bara den här gången och eleven måste välja ett eget vid första
          inloggningen.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={`Lägg till elev i ${classRow.name}`}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Avbryt</Button><Button loading={busy} onClick={() => void add()}>{mode === 'ny' ? 'Skapa konto' : 'Lägg till'}</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <div className="filter-bar">
        <button type="button" className={`chip ${mode === 'ny' ? 'chip-active' : ''}`} onClick={() => setMode('ny')}>Nytt elevkonto</button>
        <button type="button" className={`chip ${mode === 'befintlig' ? 'chip-active' : ''}`} onClick={() => setMode('befintlig')}>Befintligt konto</button>
      </div>
      {mode === 'ny' ? (
        <>
          <div className="grid-2">
            <Field label="Förnamn" htmlFor="new-student-first" required>
              <input id="new-student-first" className="input" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </Field>
            <Field label="Efternamn" htmlFor="new-student-last">
              <input id="new-student-last" className="input" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </Field>
          </div>
          <div className="notice">
            <UserPlus size={17} />
            <span>
              Kontot får ett servergenererat användarnamn (e + förnamn + efternamn)
              och ett tillfälligt lösenord som visas en gång. Eleven läggs direkt i
              {` ${classRow.name}`} med samma identitet som i Elda.
            </span>
          </div>
        </>
      ) : (
        <>
          <Field label="Användarnamn" htmlFor="student-username" required hint="Eleven måste redan ha ett skolkonto i Elda. Kontot flyttas inte och dupliceras inte.">
            <input id="student-username" className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" />
          </Field>
          <div className="notice">
            <UserPlus size={17} />
            <span>Använd det här när eleven redan har ett konto i Elda Skola, till exempel för ett annat ämne.</span>
          </div>
        </>
      )}
    </Modal>
  );
};

const StudentModal: React.FC<{
  student: StudentRow;
  tasks: Task[];
  submissions: Submission[];
  adaptations: Adaptation[];
  onClose: () => void;
}> = ({ student, tasks, submissions, adaptations, onClose }) => {
  const relevantTaskIds = new Set(tasks.map((row) => row.id));
  const mine = tasks.filter((row) => row.student_id === student.id);
  const submitted = submissions.filter(
    (row) => relevantTaskIds.has(row.task_id) && row.status !== 'utkast',
  );
  return (
    <Modal open wide title={displayName(student)} onClose={onClose} footer={<Button onClick={onClose}>Stäng</Button>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge tone="green">Elev</Badge>
        <span className="small muted">@{student.username} · {student.class_name}</span>
      </div>
      <div className="dl">
        <div><dt>Klass</dt><dd>{student.class_name}</dd></div>
        <div><dt>Ämne</dt><dd>{student.class_subject || 'Ej angivet'}</dd></div>
        <div><dt>Individuella uppgifter</dt><dd>{mine.length}</dd></div>
        <div><dt>Inlämnade</dt><dd>{submitted.length}</dd></div>
      </div>

      <h3 style={{ fontSize: 13, marginTop: 18 }}>Individuella uppgifter</h3>
      {mine.length === 0 ? (
        <p className="small muted">Inga individuella uppgifter till eleven.</p>
      ) : (
        <div className="list">
          {mine.map((task) => (
            <div key={task.id} className="list-row">
              <div className="list-main">
                <p className="list-title">{task.title}</p>
                <p className="list-sub">{task.subject || 'Övrigt'} · {shortDate(task.due_date)}</p>
              </div>
              <Badge
                tone={
                  submissions.find((row) => row.task_id === task.id)?.status === 'granskad'
                    ? 'green'
                    : submissions.find((row) => row.task_id === task.id)
                      ? 'amber'
                      : 'neutral'
                }
              >
                {(() => {
                  const status = submissions.find((row) => row.task_id === task.id)?.status;
                  if (status === 'granskad') return 'Granskad';
                  if (status === 'inlamnad') return 'Inlämnad';
                  if (status === 'aterlamnad') return 'Komplettera';
                  if (status === 'utkast') return 'Utkast';
                  return 'Ej inlämnad';
                })()}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 13, marginTop: 18 }}>Anpassningar</h3>
      {adaptations.length === 0 ? (
        <p className="small muted">Inga anpassningar registrerade för eleven.</p>
      ) : (
        <div className="list">
          {adaptations.map((row) => (
            <div key={row.id} className="list-row">
              <div className="list-main">
                <p className="list-title">{row.title}</p>
                <p className="list-sub">{row.measures || row.description || 'Ingen beskrivning'}</p>
              </div>
              <Badge tone={row.status === 'aktiv' ? 'green' : 'neutral'}>{row.status}</Badge>
            </div>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 14 }}>
        Anpassningar visas här bara för behöriga lärare. De är inte synliga för eleven
        i elevpanelen.
      </p>
    </Modal>
  );
};
