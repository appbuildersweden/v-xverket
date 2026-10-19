import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { listAdminClasses, listSentMessages, sendSchoolMessage } from '../../lib/api';
import type { AdminClass, MessageAudience, SchoolRole, SentMessage } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Spinner } from '../../components/ui';

interface Person {
  id: string;
  username: string;
  role: SchoolRole;
  active: boolean;
  firstName: string | null;
  lastName: string | null;
}

const nameOf = (row: Person) =>
  [row.firstName, row.lastName].filter(Boolean).join(' ') || row.username;

const AUDIENCE_LABEL: Record<MessageAudience, string> = {
  klass: 'En klass',
  larare: 'Alla lärare',
  elever: 'Alla elever',
  anvandare: 'Utvalda personer',
};

export const AdminMessages: React.FC = () => {
  const [sent, setSent] = useState<SentMessage[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<MessageAudience>('klass');
  const [classId, setClassId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [messages, classRows, list] = await Promise.all([
        listSentMessages(),
        listAdminClasses(),
        supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
      ]);
      setSent(messages);
      setClasses(classRows.filter((row) => !row.archived));
      const rows = (list.data as { accounts?: Person[] } | null)?.accounts;
      setPeople(Array.isArray(rows) ? rows.filter((row) => row.active) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta meddelandena.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recipients = useMemo(() => {
    if (audience === 'klass') {
      const row = classes.find((item) => item.id === classId);
      return row ? row.member_count : 0;
    }
    if (audience === 'larare') {
      return people.filter((person) => person.role === 'lärare' || person.role === 'speciallärare').length;
    }
    if (audience === 'elever') {
      return people.filter((person) => person.role === 'elev').length;
    }
    return selected.length;
  }, [audience, classId, classes, people, selected]);

  const send = async () => {
    if (subject.trim().length < 2) {
      setError('Ge meddelandet en rubrik (minst 2 tecken).');
      return;
    }
    if (body.trim().length < 2) {
      setError('Skriv ett meddelande.');
      return;
    }
    if (audience === 'klass' && !classId) {
      setError('Välj vilken klass som ska få meddelandet.');
      return;
    }
    if (audience === 'anvandare' && selected.length === 0) {
      setError('Välj minst en mottagare.');
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const count = await sendSchoolMessage({
        subject,
        body,
        audience,
        classId: audience === 'klass' ? classId : null,
        userIds: audience === 'anvandare' ? selected : [],
      });
      setNotice(`Meddelandet är skickat till ${count} mottagare.`);
      setSubject('');
      setBody('');
      setSelected([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Meddelandet kunde inte skickas.');
    } finally {
      setSending(false);
    }
  };

  const togglePerson = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="stack">
      <Card
        title="Skicka meddelande"
        subtitle="Interna meddelanden som mottagaren ser under Meddelanden i Elda Skola. Ingen e-post skickas."
        action={
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Uppdatera
          </Button>
        }
      >
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert>{error}</Alert>}

        <div className="grid-2">
          <Field label="Mottagare" htmlFor="msg-audience" required>
            <select
              id="msg-audience"
              className="input"
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value as MessageAudience);
                setClassId('');
                setSelected([]);
              }}
            >
              {(Object.keys(AUDIENCE_LABEL) as MessageAudience[]).map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_LABEL[value]}
                </option>
              ))}
            </select>
          </Field>

          {audience === 'klass' && (
            <Field label="Klass" htmlFor="msg-class" required>
              <select
                id="msg-class"
                className="input"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
              >
                <option value="">Välj klass</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.member_count} medlemmar)
                  </option>
                ))}
              </select>
            </Field>
          )}

          {audience === 'anvandare' && (
            <Field label="Personer" htmlFor="msg-people" hint="Sök och markera en eller flera mottagare.">
              <div id="msg-people" style={{ maxHeight: 190, overflowY: 'auto' }}>
                {people.map((person) => (
                  <label key={person.id} className="row small" style={{ gap: 8, padding: '3px 0' }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(person.id)}
                      onChange={() => togglePerson(person.id)}
                    />
                    {nameOf(person)} · @{person.username} ·{' '}
                    {person.role === 'elev' ? 'Elev' : person.role === 'speciallärare' ? 'Speciallärare' : 'Lärare'}
                  </label>
                ))}
              </div>
            </Field>
          )}
        </div>

        <Field label="Rubrik" htmlFor="msg-subject" required>
          <input
            id="msg-subject"
            className="input"
            value={subject}
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        <Field label="Meddelande" htmlFor="msg-body" required>
          <textarea
            id="msg-body"
            className="input"
            rows={5}
            maxLength={8000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>

        <div className="row-between">
          <Button icon={<Send size={15} />} loading={sending} onClick={() => void send()}>
            Skicka meddelande
          </Button>
          <span className="small muted">
            {recipients} mottagare valda. Meddelandet sparas direkt i databasen.
          </span>
        </div>
      </Card>

      <Card title="Skickade meddelanden" subtitle="Mottagargrupp, antal mottagare och hur många som läst.">
        {loading ? (
          <Spinner label="Hämtar skickade meddelanden…" />
        ) : sent.length === 0 ? (
          <EmptyState
            title="Inga meddelanden skickade ännu"
            description="När du skickar ett meddelande visas det här med mottagarantal."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rubrik</th>
                  <th>Mottagare</th>
                  <th>Skickat</th>
                  <th>Läst</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((row) => (
                  <tr key={row.id}>
                    <td>{row.subject}</td>
                    <td>
                      <Badge tone="neutral">{AUDIENCE_LABEL[row.audience] ?? row.audience}</Badge>
                      {row.class_name && <small className="small muted"> {row.class_name}</small>}
                    </td>
                    <td>{new Date(row.created_at).toLocaleString('sv-SE')}</td>
                    <td>
                      {row.read_count} av {row.recipient_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
