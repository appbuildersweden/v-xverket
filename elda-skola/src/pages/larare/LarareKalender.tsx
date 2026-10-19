import React, { useMemo, useState } from 'react';
import { CalendarPlus, Clock, Trash2 } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  createEvent,
  deleteEvent,
  listClasses,
  listEvents,
  listTasks,
} from '../../lib/api';
import { longDate, shortDate, timeOnly, todayIso } from '../../lib/format';
import type { SchoolClass, SchoolEvent, Task } from '../../lib/types';
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
import { groupCalendarItems, MonthCalendar } from '../../components/Calendar';

export const LarareKalender: React.FC = () => {
  const state = useAsync(async () => {
    const [events, tasks, classes] = await Promise.all([
      listEvents(),
      listTasks({ createdByMe: true }),
      listClasses(),
    ]);
    return { events, tasks, classes };
  }, []);
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(todayIso());
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const events = state.data?.events ?? [];
  const tasks = state.data?.tasks ?? [];
  const classes = state.data?.classes ?? [];
  const items = useMemo(() => groupCalendarItems(tasks, events), [tasks, events]);

  const dayTasks = selected ? tasks.filter((row) => row.due_date === selected) : [];
  const dayEvents = selected ? events.filter((row) => row.starts_at.slice(0, 10) === selected) : [];

  const remove = async (row: SchoolEvent) => {
    if (!window.confirm(`Ta bort händelsen ”${row.title}”?`)) return;
    try {
      await deleteEvent(row.id);
      setMessage('Händelsen är borttagen.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort händelsen.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar kalendern…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Kalender och planering" />
        <Card><EmptyState title="Kunde inte hämta kalendern" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title="Kalender och planering"
        description="Se deadlines för dina uppgifter och planera händelser för klasserna. Allt sparas i skolans databas."
        actions={<Button icon={<CalendarPlus size={16} />} onClick={() => setOpen(true)}>Ny händelse</Button>}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="dashboard-grid">
        <Card>
          <MonthCalendar month={month} items={items} selected={selected} onSelect={setSelected} onMonthChange={setMonth} />
        </Card>

        <Card
          title={selected ? longDate(selected) : 'Välj en dag'}
          subtitle="Händelser och deadlines"
          action={selected && <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Lägg till</Button>}
        >
          {!selected ? (
            <EmptyState title="Ingen dag vald" description="Klicka på en dag för att se planeringen." />
          ) : dayEvents.length === 0 && dayTasks.length === 0 ? (
            <EmptyState title="Inget planerat" description="Lägg till en händelse för klassen om du vill planera något den här dagen." />
          ) : (
            <div className="list">
              {dayEvents.map((event) => (
                <div key={event.id} className="list-row">
                  <div className="list-main">
                    <p className="list-title">{event.title}</p>
                    <p className="list-sub"><Clock size={11} /> {event.all_day ? 'Heldag' : timeOnly(event.starts_at)} · {event.class_name || 'Alla klasser'}</p>
                    {event.description && <p className="list-sub">{event.description}</p>}
                  </div>
                  <div className="list-side">
                    <Badge tone="blue">Händelse</Badge>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove(event)}>Ta bort</Button>
                  </div>
                </div>
              ))}
              {dayTasks.map((task) => (
                <div key={task.id} className="list-row">
                  <div className="list-main">
                    <p className="list-title">{task.title}</p>
                    <p className="list-sub">{task.class_name || 'Enskild elev'} · {task.subject || 'Övrigt'}</p>
                  </div>
                  <Badge tone="amber">Deadline</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Kommande händelser" subtitle="Planering för dina klasser" className="">
        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarPlus size={22} />}
            title="Inga händelser ännu"
            description="Lägg in prov, utflykter eller andra aktiviteter så syns de även för eleverna."
            action={<Button onClick={() => setOpen(true)}>Skapa händelse</Button>}
          />
        ) : (
          <div className="list">
            {events.slice(0, 10).map((event) => (
              <div key={event.id} className="list-row">
                <div className="list-main">
                  <p className="list-title">{event.title}</p>
                  <p className="list-sub">{shortDate(event.starts_at)} · {event.all_day ? 'Heldag' : timeOnly(event.starts_at)} · {event.class_name || 'Alla klasser'}</p>
                </div>
                <Badge tone="blue">Händelse</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {open && (
        <EventForm
          classes={classes}
          tasks={tasks}
          defaultDate={selected}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            setMessage('Händelsen är sparad.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const EventForm: React.FC<{
  classes: SchoolClass[];
  tasks: Task[];
  defaultDate: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ classes, defaultDate, onClose, onSaved }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate ?? todayIso());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError('Ge händelsen en titel.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Skicka med tidszonen så att en händelse kl. 09:00 i klassrummet visas
      // kl. 09:00 även om databasen lagrar tiden i UTC.
      const startDate = new Date(`${date}T${allDay ? '00:00' : start}:00`);
      const endDate = new Date(`${date}T${end}:00`);
      if (Number.isNaN(startDate.getTime()) || (!allDay && Number.isNaN(endDate.getTime()))) {
        setError('Kontrollera datum och tid.');
        setBusy(false);
        return;
      }
      await createEvent({
        classId: classId || null,
        title,
        description,
        startsAt: startDate.toISOString(),
        endsAt: allDay ? '' : endDate.toISOString(),
        allDay,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara händelsen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Ny händelse"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Avbryt</Button><Button loading={busy} onClick={() => void save()}>Spara</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Titel" htmlFor="event-title" required>
        <input id="event-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Klass" htmlFor="event-class" hint="Lämna tomt för en händelse som gäller alla dina klasser.">
        <select id="event-class" className="input" value={classId} onChange={(event) => setClassId(event.target.value)}>
          <option value="">Alla klasser</option>
          {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Datum" htmlFor="event-date" required>
          <input id="event-date" className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Heldag" htmlFor="event-allday">
          <select id="event-allday" className="input" value={allDay ? 'ja' : 'nej'} onChange={(event) => setAllDay(event.target.value === 'ja')}>
            <option value="nej">Bestämd tid</option>
            <option value="ja">Heldag</option>
          </select>
        </Field>
        {!allDay && (
          <>
            <Field label="Start" htmlFor="event-start">
              <input id="event-start" className="input" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
            </Field>
            <Field label="Slut" htmlFor="event-end">
              <input id="event-end" className="input" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
            </Field>
          </>
        )}
      </div>
      <Field label="Beskrivning" htmlFor="event-description">
        <textarea id="event-description" className="input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
    </Modal>
  );
};
