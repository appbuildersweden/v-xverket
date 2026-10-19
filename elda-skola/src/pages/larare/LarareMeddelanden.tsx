import React, { useMemo, useState } from 'react';
import { Megaphone, Plus, Send } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import { createAnnouncement, listAnnouncements, listClasses } from '../../lib/api';
import { dateTime, truncate } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageIntro, Spinner } from '../../components/ui';

export const LarareMeddelanden: React.FC = () => {
  const state = useAsync(async () => {
    const [classes, rows] = await Promise.all([
      listClasses(),
      listAnnouncements([]),
    ]);
    return { classes, rows };
  }, []);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const classes = state.data?.classes ?? [];
  const rows = state.data?.rows ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      map.set(row.class_id, [...(map.get(row.class_id) ?? []), row]);
    }
    return map;
  }, [rows]);

  if (state.loading) return <Spinner label="Hämtar information…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Meddelanden och information" />
        <Card><EmptyState title="Kunde inte hämta informationen" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title="Meddelanden och information"
        description="Publicera information till en klass. Eleverna ser den i sin meddelandesida med lässtatus."
        actions={<Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>Nytt meddelande</Button>}
      />

      {message && <Alert tone="success">{message}</Alert>}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone size={24} />}
            title="Ingen information publicerad"
            description="Skriv ett meddelande till en klass – det syns direkt i elevpanelen."
            action={<Button onClick={() => setOpen(true)}>Skriv information</Button>}
          />
        </Card>
      ) : (
        <div className="stack">
          {classes.map((classRow) => {
            const list = grouped.get(classRow.id) ?? [];
            if (list.length === 0) return null;
            return (
              <Card key={classRow.id} title={classRow.name} subtitle={`${list.length} publicerade meddelanden`}>
                <div className="list">
                  {list.map((row) => (
                    <div key={row.id} className="list-row">
                      <div className="list-main">
                        <p className="list-title">{row.title}</p>
                        <p className="list-sub">{truncate(row.body, 160)}</p>
                        <p className="list-sub">
                          {dateTime(row.created_at)} ·{' '}
                          {typeof row.read_count === 'number'
                            ? `${row.read_count} av ${row.recipient_count ?? 0} elever har läst`
                            : 'Lässtatus saknas'}
                        </p>
                      </div>
                      <Badge tone="green">Information</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {rows.filter((row) => !classes.some((c) => c.id === row.class_id)).length > 0 && (
            <Card title="Andra mottagare" subtitle="Meddelanden utanför dina klasser">
              <div className="list">
                {rows
                  .filter((row) => !classes.some((c) => c.id === row.class_id))
                  .map((row) => (
                    <div key={row.id} className="list-row">
                      <div className="list-main">
                        <p className="list-title">{row.title}</p>
                        <p className="list-sub">{truncate(row.body, 120)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {open && (
        <MessageForm
          classes={classes}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            setMessage('Meddelandet är publicerat för klassen.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const MessageForm: React.FC<{
  classes: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ classes, onClose, onSaved }) => {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!classId) {
      setError('Välj en klass.');
      return;
    }
    if (!title.trim() || !body.trim()) {
      setError('Fyll i både rubrik och meddelande.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAnnouncement({ classId, title, body });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte publicera meddelandet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title="Publicera information"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Avbryt</Button><Button icon={<Send size={16} />} loading={busy} onClick={() => void save()}>Publicera</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Klass" htmlFor="message-class" required>
        <select id="message-class" className="input" value={classId} onChange={(event) => setClassId(event.target.value)}>
          <option value="">Välj klass</option>
          {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </Field>
      <Field label="Rubrik" htmlFor="message-title" required>
        <input id="message-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Meddelande" htmlFor="message-body" required hint="Bara elever i den valda klassen kan läsa meddelandet.">
        <textarea id="message-body" className="input" rows={7} value={body} onChange={(event) => setBody(event.target.value)} />
      </Field>
    </Modal>
  );
};
