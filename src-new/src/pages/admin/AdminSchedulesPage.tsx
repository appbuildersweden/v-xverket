import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Pencil, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { AuthAccount } from '../../lib/auth-types';
import { displayName, sortAccounts } from '../../lib/accounts';
import { ClassInfo, listClasses } from '../../lib/classes';
import {
  NewScheduleInput,
  ScheduleEntry,
  WEEKDAY_LABELS,
  createScheduleEntry,
  deleteScheduleEntry,
  filterScheduleEntries,
  formatClock,
  groupByWeekday,
  listScheduleEntries,
  timeRange,
  updateScheduleEntry,
  validateScheduleEntry,
} from '../../lib/schedule';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  StatCard,
  Table,
  Toolbar,
} from '../../components/ui';
import { ConfirmButton, FormActions, Modal, SelectField, TextAreaField, TextField } from '../../components/forms';

interface Props {
  onNavigate: (pageId: string) => void;
}

interface Target {
  id: string;
  label: string;
  kind: 'klass' | 'elev';
}

/** Värdeformatet i målväljaren: 'klass:<id>' eller 'elev:<id>'. */
function targetValue(target: Target): string {
  return `${target.kind}:${target.id}`;
}

const WEEKDAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = WEEKDAY_LABELS.map(
  (label, index) => ({ value: String(index + 1), label }),
);

/**
 * Scheman. Schemaposter beskriver återkommande aktiviteter per veckodag och
 * gäller antingen en klass (då ser klassens medlemmar den) eller en person.
 *
 * Läsningen går mot tabellen `schedule_entries` och begränsas av Row Level
 * Security. All skrivning sker genom databasens funktioner, som kontrollerar
 * adminrollen, validerar tiderna och loggar varje ändring. Inga exempelscheman
 * visas — är tabellen tom står det.
 */
export const AdminSchedulesPage: React.FC<Props> = ({ onNavigate }) => {
  const { listAccounts } = useAuth();
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [students, setStudents] = useState<AuthAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [weekday, setWeekday] = useState<number | 'alla'>('alla');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [scheduleResult, classResult, accountResult] = await Promise.all([
      listScheduleEntries(),
      listClasses(),
      listAccounts(),
    ]);
    let problem: string | null = null;
    if (scheduleResult.ok) setEntries(scheduleResult.data);
    else {
      setEntries(null);
      problem = scheduleResult.error;
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

  const all = entries ?? [];
  const visible = useMemo(
    () => filterScheduleEntries(all, { query, weekday }),
    [all, query, weekday],
  );
  const groups = useMemo(() => groupByWeekday(visible), [visible]);

  const targetNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes) map.set(c.id, `Klass: ${c.name}`);
    for (const s of students) map.set(s.id, `Elev: ${s.username}`);
    return map;
  }, [classes, students]);

  const targets: Target[] = useMemo(
    () => [
      ...classes.map((c) => ({ id: c.id, label: `Klass: ${c.name}`, kind: 'klass' as const })),
      ...students.map((s) => ({
        id: s.id,
        label: `Elev: ${s.username}${displayName(s) ? ` (${displayName(s)})` : ''}`,
        kind: 'elev' as const,
      })),
    ],
    [classes, students],
  );

  const remove = async (entry: ScheduleEntry) => {
    setActionError(null);
    const result = await deleteScheduleEntry(entry.id);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await load();
  };

  return (
    <div className="panel-page" data-testid="page-admin-amnen">
      <SectionCard
        title="Scheman"
        subtitle="Återkommande aktiviteter per veckodag, för en klass eller en person"
        action={
          <>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void load()}
            >
              <RefreshCw size={15} /> Uppdatera
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCreating(true)}
              disabled={targets.length === 0}
            >
              <Plus size={15} /> Ny schemapost
            </button>
          </>
        }
      >
        <div className="grid-4">
          <StatCard label="Poster i schemat" value={all.length} />
          <StatCard
            label="Klassposter"
            value={all.filter((e) => !!e.class_id).length}
          />
          <StatCard
            label="Personposter"
            value={all.filter((e) => !!e.user_id).length}
          />
          <StatCard label="Veckodagar i bruk" value={new Set(all.map((e) => e.weekday)).size} />
        </div>

        {actionError && (
          <div className="state-note state-note-error" role="alert">
            <TriangleAlert size={15} /> {actionError}
          </div>
        )}

        {loading && <LoadingState label="Hämtar schemat…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && all.length === 0 && (
          <EmptyState
            icon={<Calendar size={22} />}
            title="Schemat är tomt"
            description="Skapa den första schemaposten och koppla den till en klass eller en elev. Posten syns sedan i appen för dem den gäller."
            action={
              targets.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={16} /> Ny schemapost
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
                  placeholder="Sök rubrik, ämne eller sal"
                  aria-label="Sök i schemat"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <label className="field field-inline">
                <span>Veckodag</span>
                <select
                  className="input"
                  aria-label="Filtrera på veckodag"
                  value={String(weekday)}
                  onChange={(e) =>
                    setWeekday(e.target.value === 'alla' ? 'alla' : Number(e.target.value))
                  }
                >
                  <option value="alla">Alla dagar</option>
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </Toolbar>

            {visible.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="Inga schemaposter matchar"
                description="Prova en annan sökning eller en annan veckodag."
              />
            ) : (
              groups.map((group) => (
                <div key={group.weekday}>
                  <h3 className="card-sub">{group.label}</h3>
                  <Table
                    head={
                      <tr>
                        <th scope="col">Tid</th>
                        <th scope="col">Aktivitet</th>
                        <th scope="col">Ämne</th>
                        <th scope="col">Sal</th>
                        <th scope="col">Gäller</th>
                        <th scope="col">
                          <span className="visually-hidden">Åtgärd</span>
                        </th>
                      </tr>
                    }
                  >
                    {group.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="mono">{timeRange(entry)}</td>
                        <td>
                          {entry.title}
                          {entry.note && <div className="list-item-sub">{entry.note}</div>}
                        </td>
                        <td className="muted">{entry.subject ?? '—'}</td>
                        <td className="muted">{entry.room ?? '—'}</td>
                        <td>
                          <Pill tone={entry.class_id ? 'info' : 'muted'}>
                            {targetNames.get((entry.class_id ?? entry.user_id) ?? '') ?? 'Okänt mål'}
                          </Pill>
                        </td>
                        <td className="right">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditing(entry)}
                            >
                              <Pencil size={15} /> Redigera
                            </button>
                            <ConfirmButton
                              label="Ta bort"
                              confirmLabel="Ta bort"
                              question={`Ta bort "${entry.title}"?`}
                              onConfirm={() => void remove(entry)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))
            )}
          </>
        )}
      </SectionCard>

      {targets.length === 0 && !loading && (
        <SectionCard title="Inga mål att schemalägga" subtitle="Schemat behöver en klass eller en elev">
          <EmptyState
            icon={<Calendar size={22} />}
            title="Skapa en klass eller ett elevkonto först"
            description="En schemapost gäller en klass eller en person. Lägg upp en klass eller ett elevkonto, kom sedan tillbaka hit."
            action={
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onNavigate('klasser')}
                >
                  Till klasser och elevgrupper
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onNavigate('create-user')}
                >
                  Skapa konto
                </button>
              </div>
            }
          />
        </SectionCard>
      )}

      {creating && (
        <Modal title="Ny schemapost" onClose={() => setCreating(false)} closeLabel="Stäng schemaposten">
          <ScheduleForm
            targets={targets}
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
          closeLabel="Stäng schemaposten"
        >
          <ScheduleForm
            entry={editing}
            targets={targets}
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

interface FormProps {
  entry?: ScheduleEntry;
  targets: readonly Target[];
  onCancel: () => void;
  onSaved: () => void;
}

/** Formulär för att skapa eller ändra en schemapost. */
const ScheduleForm: React.FC<FormProps> = ({ entry, targets, onCancel, onSaved }) => {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [weekday, setWeekday] = useState(entry?.weekday ?? 1);
  const [start, setStart] = useState(entry ? formatClock(entry.start_time) : '08:00');
  const [end, setEnd] = useState(entry ? formatClock(entry.end_time) : '09:00');
  const [subject, setSubject] = useState(entry?.subject ?? '');
  const [room, setRoom] = useState(entry?.room ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [target, setTarget] = useState(
    entry?.class_id ? `klass:${entry.class_id}` : entry?.user_id ? `elev:${entry.user_id}` : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const classId = target.startsWith('klass:') ? target.slice(6) : null;
    const userId = target.startsWith('elev:') ? target.slice(5) : null;

    const input: NewScheduleInput = {
      title,
      weekday,
      start_time: start,
      end_time: end,
      subject,
      room,
      note,
      class_id: classId,
      user_id: userId,
    };

    const problem = validateScheduleEntry(input);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    const result = entry
      ? await updateScheduleEntry(entry.id, input)
      : await createScheduleEntry(input);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <form className="form" onSubmit={(e) => void submit(e)} data-testid="schedule-form">
      <TextField
        label="Rubrik"
        value={title}
        onChange={setTitle}
        placeholder="T.ex. Matematik"
        maxLength={120}
        required
      />

      <SelectField
        label="Veckodag"
        value={String(weekday)}
        onChange={(value) => setWeekday(Number(value))}
        options={WEEKDAY_OPTIONS}
      />

      <div className="field-row">
        <TextField label="Starttid" type="text" value={start} onChange={setStart} placeholder="08:00" hint="Format HH:MM" />
        <TextField label="Sluttid" type="text" value={end} onChange={setEnd} placeholder="09:00" hint="Format HH:MM" />
      </div>

      <SelectField
        label="Gäller"
        value={target}
        onChange={setTarget}
        options={[
          { value: '', label: 'Välj klass eller elev' },
          ...targets.map((t) => ({ value: targetValue(t), label: t.label })),
        ]}
        hint="En klasspost ser klassens medlemmar. En personpost ser bara personen."
      />

      <div className="field-row">
        <TextField label="Ämne" value={subject} onChange={setSubject} placeholder="T.ex. Matematik" />
        <TextField label="Sal" value={room} onChange={setRoom} placeholder="T.ex. Sal 12" />
      </div>

      <TextAreaField
        label="Anteckning"
        value={note}
        onChange={setNote}
        rows={2}
        placeholder="Frivillig information till schemaposten"
      />

      {error && (
        <p className="field-hint field-hint-error" role="alert" data-testid="schedule-error">
          {error}
        </p>
      )}

      <FormActions
        busy={busy}
        submitLabel={entry ? 'Spara ändringar' : 'Skapa schemapost'}
        onCancel={onCancel}
      />
    </form>
  );
};
