import React, { useState } from 'react';
import { BookOpen, KeyRound, MessageSquare, Users } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  listActivities,
  listAnnouncements,
  listClassRoster,
  listClasses,
  listTasks,
  requestClassJoin,
} from '../../lib/api';
import { shortDate, truncate } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageIntro, Spinner } from '../../components/ui';

export const ElevKlass: React.FC = () => {
  const classesState = useAsync(listClasses, []);
  const classes = classesState.data ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const active = classes.find((row) => row.id === activeId) ?? classes[0] ?? null;

  const detail = useAsync(
    async () => {
      if (!active) return { roster: [], announcements: [], activities: [], tasks: [] };
      const [roster, announcements, activities, tasks] = await Promise.all([
        listClassRoster(active.id),
        listAnnouncements([active.id]),
        listActivities(),
        listTasks(),
      ]);
      return {
        roster,
        announcements: announcements.filter((row) => row.class_id === active.id),
        activities: activities.filter((row) => row.class_id === active.id),
        tasks: tasks.filter((row) => row.class_id === active.id),
      };
    },
    [active?.id],
    { enabled: Boolean(active) },
  );

  if (classesState.loading) return <Spinner label="Hämtar din klass…" />;
  if (classesState.error) {
    return (
      <>
        <PageIntro title="Min klass" />
        <Card><EmptyState title="Kunde inte hämta klassen" description={classesState.error} action={<Button onClick={() => void classesState.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  if (classes.length === 0) {
    return (
      <div>
        <PageIntro
          eyebrow="Elevpanel"
          title="Min klass"
          description="Din klass, dina klasskamrater och information från läraren."
          actions={<Button icon={<KeyRound size={16} />} onClick={() => setJoinOpen(true)}>Gå med i klass</Button>}
        />
        {joinMessage && <Alert tone="success">{joinMessage}</Alert>}
        <Card>
          <EmptyState
            icon={<Users size={24} />}
            title="Du är inte kopplad till någon klass ännu"
            description="Har du fått en klasskod av din lärare kan du ansöka om att gå med. Läraren godkänner sedan ansökan. Samma konto och profil används även om du läser flera ämnen."
            action={<Button onClick={() => setJoinOpen(true)}>Ange klasskod</Button>}
          />
        </Card>
        {joinOpen && (
          <JoinClassForm
            onClose={() => setJoinOpen(false)}
            onDone={async (message) => {
              setJoinOpen(false);
              setJoinMessage(message);
            }}
          />
        )}
      </div>
    );
  }

  const data = detail.data;
  const teachers = (data?.roster ?? []).filter((row) => row.member_role === 'larare');
  const students = (data?.roster ?? []).filter((row) => row.member_role === 'elev');

  return (
    <div>
      <PageIntro
        eyebrow="Elevpanel"
        title="Min klass"
        description="Klassinformation, klasskamrater och det läraren har publicerat för klassen."
        actions={<Button variant="ghost" icon={<KeyRound size={16} />} onClick={() => setJoinOpen(true)}>Gå med i fler klasser</Button>}
      />
      {joinMessage && <Alert tone="success">{joinMessage}</Alert>}

      {classes.length > 1 && (
        <div className="filter-bar">
          {classes.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`chip ${active?.id === row.id ? 'chip-active' : ''}`}
              onClick={() => setActiveId(row.id)}
            >
              {row.name}
            </button>
          ))}
        </div>
      )}

      {detail.loading ? (
        <Spinner label="Hämtar klassinformation…" />
      ) : detail.error ? (
        <Card><EmptyState title="Kunde inte hämta klassinformationen" description={detail.error} action={<Button onClick={() => void detail.reload()}>Försök igen</Button>} /></Card>
      ) : (
        <div className="dashboard-grid">
          <div className="stack">
            <Card>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <span className="eyebrow">Klass</span>
                  <h2 style={{ margin: '4px 0', fontSize: 22 }}>{active?.name}</h2>
                  <p className="muted small" style={{ margin: 0 }}>
                    {active?.subject || 'Ämnesklass'} · {students.length} elever ·{' '}
                    {active?.description || 'Ingen klassbeskrivning'}
                  </p>
                </div>
                <div className="row">
                  <Badge tone="green">{active?.member_role === 'larare' ? 'Du är lärare' : 'Elev'}</Badge>
                </div>
              </div>
              <div className="dl" style={{ marginTop: 16 }}>
                <div>
                  <dt>Ansvarig lärare</dt>
                  <dd>{teachers.map((row) => row.display_name).join(', ') || 'Saknas i klasslistan'}</dd>
                </div>
                <div>
                  <dt>Ämne</dt>
                  <dd>{active?.subject || 'Ej angivet'}</dd>
                </div>
                <div>
                  <dt>Uppgifter i klassen</dt>
                  <dd>{data?.tasks.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Aktiviteter</dt>
                  <dd>{data?.activities.length ?? 0}</dd>
                </div>
              </div>
            </Card>

            <Card title="Information från läraren" subtitle="Publicerat för klassen">
              {(data?.announcements.length ?? 0) === 0 ? (
                <EmptyState icon={<MessageSquare size={20} />} title="Ingen information ännu" description="Klassens meddelanden visas här när läraren publicerar dem." />
              ) : (
                <div className="list">
                  {data?.announcements.map((row) => (
                    <div key={row.id} className="list-row">
                      <div className="list-main">
                        <p className="list-title">{row.title}</p>
                        <p className="list-sub">{truncate(row.body, 120)}</p>
                        <p className="list-sub">{row.author_name} · {shortDate(row.created_at)}</p>
                      </div>
                      {!row.read_at && <Badge tone="green">Ny</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Aktiviteter i klassen" subtitle="Publicerade läraktiviteter">
              {(data?.activities.length ?? 0) === 0 ? (
                <EmptyState icon={<BookOpen size={20} />} title="Inga aktiviteter" description="Läraren har inte publicerat några aktiviteter för klassen ännu." />
              ) : (
                <div className="list">
                  {data?.activities.map((row) => (
                    <div key={row.id} className="list-row">
                      <div className="list-main">
                        <p className="list-title">{row.title}</p>
                        <p className="list-sub">{row.subject || 'Övrigt'} · {row.completed ? 'Klar' : 'Att göra'}</p>
                      </div>
                      <Badge tone={row.completed ? 'green' : 'blue'}>{row.completed ? 'Klar' : 'Öppen'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="stack">
            <Card title="Klasskamrater" subtitle={`${students.length} elever`}>
              {students.length === 0 ? (
                <EmptyState icon={<Users size={20} />} title="Inga klasskamrater" description="Klasslistan är tom." />
              ) : (
                <div className="list">
                  {students.map((row) => (
                    <div key={row.id} className="list-row">
                      <span className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>
                        {row.display_name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="list-main">
                        <p className="list-title">{row.display_name}</p>
                        <p className="list-sub">@{row.username}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Lärare" subtitle="Personal kopplad till klassen">
              {teachers.length === 0 ? (
                <EmptyState icon={<Users size={20} />} title="Ingen lärare i listan" description="Klassens lärarkoppling saknas i backend." />
              ) : (
                <div className="list">
                  {teachers.map((row) => (
                    <div key={row.id} className="list-row">
                      <div className="list-main">
                        <p className="list-title">{row.display_name}</p>
                        <p className="list-sub">@{row.username}</p>
                      </div>
                      <Badge tone="green">Lärare</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {joinOpen && (
        <JoinClassForm
          onClose={() => setJoinOpen(false)}
          onDone={async (message) => {
            setJoinOpen(false);
            setJoinMessage(message);
          }}
        />
      )}
    </div>
  );
};

const JoinClassForm: React.FC<{
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}> = ({ onClose, onDone }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!code.trim()) {
      setError('Ange klasskoden från din lärare.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestClassJoin(code);
      await onDone(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skicka ansökan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Gå med i en klass"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Avbryt</Button><Button loading={busy} onClick={() => void send()}>Skicka ansökan</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      <Field
        label="Klasskod"
        htmlFor="join-code"
        required
        hint="Koden får du av din lärare. Den ger inte åtkomst förrän läraren har godkänt ansökan."
      >
        <input
          id="join-code"
          className="input"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          placeholder="T.ex. ABC123"
        />
      </Field>
    </Modal>
  );
};
