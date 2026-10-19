import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { deleteAdminEvent, listAdminClasses, listAdminEvents, saveAdminEvent } from '../../lib/api';
import type { AdminClass, AdminEvent } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Spinner } from '../../components/ui';

/** datetime-local vill ha "YYYY-MM-DDTHH:mm" utan tidszon. */
function toInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function overlaps(a: AdminEvent, b: AdminEvent): boolean {
  const startA = new Date(a.starts_at).getTime();
  const startB = new Date(b.starts_at).getTime();
  const endA = a.ends_at ? new Date(a.ends_at).getTime() : startA + 60 * 60 * 1000;
  const endB = b.ends_at ? new Date(b.ends_at).getTime() : startB + 60 * 60 * 1000;
  const sameScope = a.class_id === b.class_id;
  return sameScope && startA < endB && startB < endA;
}

export const AdminPlanning: React.FC = () => {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; row: AdminEvent | null }>({ open: false, row: null });
  const [classFilter, setClassFilter] = useState('alla');
  const [statusFilter, setStatusFilter] = useState<'alla' | 'publicerade' | 'utkast'>('alla');
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventRows, classRows] = await Promise.all([listAdminEvents(), listAdminClasses()]);
      setEvents(eventRows);
      setClasses(classRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta planeringen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(
    () =>
      events
        .filter((row) => classFilter === 'alla' || row.class_id === classFilter)
        .filter((row) =>
          statusFilter === 'alla' ? true : statusFilter === 'publicerade' ? row.published : !row.published,
        ),
    [classFilter, events, statusFilter],
  );

  const remove = async (row: AdminEvent) => {
    if (!window.confirm(`Ta bort planeringsposten ”${row.title}”?`)) return;
    setWorking(row.id);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminEvent(row.id);
      setNotice('Planeringsposten är borttagen.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort posten.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <Card
      title="Planering"
      subtitle="Skolans gemensamma planering. Publicerade poster syns för klassens elever och lärare."
      action={
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Uppdatera
          </Button>
          <Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => setForm({ open: true, row: null })}>
            Ny post
          </Button>
        </div>
      }
    >
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && (
        <Alert>
          {error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => void refresh()}>
              Försök igen
            </Button>
          </div>
        </Alert>
      )}

      <div className="filter-bar">
        <select
          className="input"
          aria-label="Filtrera på klass"
          value={classFilter}
          onChange={(event) => setClassFilter(event.target.value)}
        >
          <option value="alla">Alla klasser</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        {(['alla', 'publicerade', 'utkast'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`chip ${statusFilter === value ? 'chip-active' : ''}`}
            onClick={() => setStatusFilter(value)}
          >
            {value === 'alla' ? 'Alla' : value === 'publicerade' ? 'Publicerade' : 'Utkast'}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Hämtar planeringen…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={events.length ? 'Inga träffar' : 'Ingen planering ännu'}
          description="Skapa en post för en klass eller för hela skolan."
        />
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Klass</th>
                <th>Start</th>
                <th>Slut</th>
                <th>Status</th>
                <th>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.title}</strong>
                    <small>{row.description || row.creator_name || ''}</small>
                  </td>
                  <td>{row.class_name || 'Hela skolan'}</td>
                  <td>{new Date(row.starts_at).toLocaleString('sv-SE')}</td>
                  <td>{row.ends_at ? new Date(row.ends_at).toLocaleString('sv-SE') : '—'}</td>
                  <td>
                    <Badge tone={row.published ? 'green' : 'amber'}>
                      {row.published ? 'Publicerad' : 'Utkast'}
                    </Badge>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil size={13} />}
                        onClick={() => setForm({ open: true, row })}
                      >
                        Redigera
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={13} />}
                        loading={working === row.id}
                        onClick={() => void remove(row)}
                      >
                        Ta bort
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form.open && (
        <EventForm
          row={form.row}
          classes={classes}
          events={events}
          onClose={() => setForm({ open: false, row: null })}
          onSaved={async (message) => {
            setForm({ open: false, row: null });
            setNotice(message);
            await refresh();
          }}
        />
      )}
    </Card>
  );
};

const EventForm: React.FC<{
  row: AdminEvent | null;
  classes: AdminClass[];
  events: AdminEvent[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}> = ({ row, classes, events, onClose, onSaved }) => {
  const [title, setTitle] = useState(row?.title ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [classId, setClassId] = useState(row?.class_id ?? '');
  const [startsAt, setStartsAt] = useState(toInput(row?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toInput(row?.ends_at ?? null));
  const [allDay, setAllDay] = useState(row?.all_day ?? false);
  const [published, setPublished] = useState(row?.published ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conflicts = useMemo(() => {
    if (!startsAt) return [];
    const candidate = {
      id: row?.id ?? 'new',
      class_id: classId || null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    } as AdminEvent;
    return events.filter((event) => event.id !== row?.id && overlaps(candidate, event));
  }, [classId, endsAt, events, row?.id, startsAt]);

  const save = async () => {
    if (title.trim().length < 2) {
      setError('Ge planeringsposten en rubrik.');
      return;
    }
    if (!startsAt) {
      setError('Ange ett startdatum.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAdminEvent({
        id: row?.id ?? null,
        classId,
        title,
        description,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : '',
        allDay,
        published,
      });
      await onSaved('Planeringsposten är sparad.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara posten.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={row ? 'Redigera planeringspost' : 'Ny planeringspost'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Spara
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      {conflicts.length > 0 && (
        <Alert tone="success">
          Överlappar med: {conflicts.map((event) => event.title).join(', ')}. Kontrollera tiderna innan du sparar.
        </Alert>
      )}
      <Field label="Rubrik" htmlFor="event-title" required>
        <input
          id="event-title"
          className="input"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label="Klass" htmlFor="event-class" hint="Lämna tom för planering som gäller hela skolan.">
        <select
          id="event-class"
          className="input"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
        >
          <option value="">Hela skolan</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Start" htmlFor="event-start" required>
          <input
            id="event-start"
            className="input"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </Field>
        <Field label="Slut" htmlFor="event-end">
          <input
            id="event-end"
            className="input"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </Field>
      </div>
      <Field label="Beskrivning" htmlFor="event-description">
        <textarea
          id="event-description"
          className="input"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <div className="row" style={{ gap: 18 }}>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
          Heldag
        </label>
        <label className="row small" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
          />
          Publicerad (annars utkast)
        </label>
      </div>
    </Modal>
  );
};
