import React, { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  createActivity,
  deleteActivity,
  listActivities,
  listClasses,
  updateActivity,
} from '../../lib/api';
import { KIND_LABEL, truncate } from '../../lib/format';
import type { Activity, SchoolClass } from '../../lib/types';
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

const KINDS = ['uppgift', 'diskussion', 'reflektion', 'grupparbete', 'quiz', 'ovning'];

export const LarareAktiviteter: React.FC = () => {
  const state = useAsync(async () => {
    const [activities, classes] = await Promise.all([listActivities(), listClasses()]);
    return { activities, classes };
  }, []);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [duplicate, setDuplicate] = useState<Activity | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activities = state.data?.activities ?? [];
  const classes = state.data?.classes ?? [];
  const bySubject = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const row of activities) {
      const key = row.subject?.trim() || 'Övrigt';
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'));
  }, [activities]);

  const toggle = async (row: Activity) => {
    setError(null);
    try {
      await updateActivity(row.id, { published: !row.published });
      setMessage(row.published ? 'Aktiviteten är flyttad till utkast.' : 'Aktiviteten är publicerad.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ändra aktiviteten.');
    }
  };

  const remove = async (row: Activity) => {
    if (!window.confirm(`Ta bort aktiviteten ”${row.title}”?`)) return;
    setError(null);
    try {
      await deleteActivity(row.id);
      setMessage('Aktiviteten är borttagen.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort aktiviteten.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar aktiviteter…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Skapa läraktiviteter" />
        <Card><EmptyState title="Kunde inte hämta aktiviteterna" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Lärarpanel"
        title="Skapa läraktiviteter"
        description="Bygg enkla, tydliga aktiviteter som eleverna kan arbeta med och bocka av. Publicera till en klass när den är klar."
        actions={<Button icon={<Plus size={16} />} onClick={() => { setEditing(null); setDuplicate(null); setOpen(true); }}>Ny aktivitet</Button>}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      {activities.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={24} />}
            title="Inga läraktiviteter ännu"
            description="Skapa en aktivitet med instruktioner och välj vilken klass som ska se den."
            action={classes.length > 0 ? <Button onClick={() => setOpen(true)}>Skapa aktivitet</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="stack">
          {bySubject.map(([subject, rows]) => (
            <Card key={subject} title={subject} subtitle={`${rows.length} aktivitet${rows.length === 1 ? '' : 'er'}`}>
              <div className="item-grid">
                {rows.map((row) => (
                  <article key={row.id} className="item-card">
                    <div className="item-card-head">
                      <div>
                        <h3>{row.title}</h3>
                        <p>{KIND_LABEL[row.kind] || row.kind} · {row.class_name || 'Klass'}</p>
                      </div>
                      <Badge tone={row.published ? 'green' : 'amber'}>{row.published ? 'Publicerad' : 'Utkast'}</Badge>
                    </div>
                    <p>{truncate(row.description, 130) || 'Ingen beskrivning'}</p>
                    <div className="item-actions">
                      <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => { setEditing(row); setDuplicate(null); setOpen(true); }}>Redigera</Button>
                      <Button size="sm" variant="ghost" icon={<Send size={14} />} onClick={() => void toggle(row)}>
                        {row.published ? 'Gör till utkast' : 'Publicera'}
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => { setEditing(null); setDuplicate(row); setOpen(true); }}>Återanvänd</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove(row)}>Ta bort</Button>
                    </div>
                  </article>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <ActivityForm
          activity={editing}
          template={duplicate}
          classes={classes}
          onClose={() => setOpen(false)}
          onSaved={async (text) => {
            setOpen(false);
            setMessage(text);
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const ActivityForm: React.FC<{
  activity: Activity | null;
  template: Activity | null;
  classes: SchoolClass[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}> = ({ activity, template, classes, onClose, onSaved }) => {
  const source = activity ?? template;
  const [title, setTitle] = useState(source ? `${source.title}${template ? ' (kopia)' : ''}` : '');
  const [classId, setClassId] = useState(source?.class_id ?? classes[0]?.id ?? '');
  const [subject, setSubject] = useState(source?.subject ?? '');
  const [kind, setKind] = useState(source?.kind ?? 'uppgift');
  const [description, setDescription] = useState(source?.description ?? '');
  const [instructions, setInstructions] = useState(source?.instructions ?? '');
  const [published, setPublished] = useState(source?.published ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError('Ge aktiviteten en titel.');
      return;
    }
    if (!classId) {
      setError('Välj en klass.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (activity) {
        await updateActivity(activity.id, {
          title: title.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
          subject: subject.trim() || null,
          published,
        });
      } else {
        await createActivity({
          classId,
          subject,
          title,
          description,
          instructions,
          kind,
          published,
        });
      }
      await onSaved(activity ? 'Aktiviteten är sparad.' : 'Aktiviteten är skapad.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara aktiviteten.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={activity ? 'Redigera aktivitet' : 'Ny läraktivitet'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button loading={busy} icon={<Send size={16} />} onClick={() => void save()}>
            {published ? 'Spara och publicera' : 'Spara utkast'}
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <div className="span-2">
          <Field label="Titel" htmlFor="activity-title" required>
            <input id="activity-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
        </div>
        <Field label="Klass" htmlFor="activity-class" required>
          <select id="activity-class" className="input" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Välj klass</option>
            {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </Field>
        <Field label="Ämne" htmlFor="activity-subject">
          <input id="activity-subject" className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="T.ex. Samhällskunskap" />
        </Field>
        <Field label="Typ" htmlFor="activity-kind">
          <select id="activity-kind" className="input" value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map((item) => <option key={item} value={item}>{KIND_LABEL[item]}</option>)}
          </select>
        </Field>
        <Field label="Publicering" htmlFor="activity-published">
          <select id="activity-published" className="input" value={published ? 'ja' : 'nej'} onChange={(event) => setPublished(event.target.value === 'ja')}>
            <option value="nej">Utkast – syns bara för dig</option>
            <option value="ja">Publicerad – syns för klassen</option>
          </select>
        </Field>
      </div>
      <Field label="Kort beskrivning" htmlFor="activity-description">
        <textarea id="activity-description" className="input" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </Field>
      <Field label="Instruktioner" htmlFor="activity-instructions" hint="Det här ser eleven när aktiviteten öppnas.">
        <textarea id="activity-instructions" className="input" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={6} />
      </Field>
      {template && (
        <div className="notice">
          <Copy size={17} />
          <span>Innehållet är kopierat från ”{template.title}”. Ändra det som ska skilja sig innan du sparar.</span>
        </div>
      )}
    </Modal>
  );
};
