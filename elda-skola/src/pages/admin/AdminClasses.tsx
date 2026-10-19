import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Search, UserMinus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  addClassMember,
  createClass,
  listAdminClassMembers,
  listAdminClasses,
  removeClassMember,
  setClassArchived,
  updateClass,
} from '../../lib/api';
import type { AdminClass, AdminClassMember, SchoolRole } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Spinner } from '../../components/ui';

interface Account {
  id: string;
  username: string;
  role: SchoolRole;
  active: boolean;
  firstName: string | null;
  lastName: string | null;
}

const nameOf = (row: { firstName: string | null; lastName: string | null; username: string }) =>
  [row.firstName, row.lastName].filter(Boolean).join(' ') || row.username;

export const AdminClasses: React.FC = () => {
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [members, setMembers] = useState<AdminClassMember[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; row: AdminClass | null }>({ open: false, row: null });
  const [roster, setRoster] = useState<AdminClass | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classRows, memberRows, list] = await Promise.all([
        listAdminClasses(),
        listAdminClassMembers(),
        supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
      ]);
      setClasses(classRows);
      setMembers(memberRows);
      const rows = (list.data as { accounts?: Account[] } | null)?.accounts;
      setAccounts(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta klasserna.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('sv');
    return classes
      .filter((row) => showArchived || !row.archived)
      .filter((row) =>
        !needle
          ? true
          : `${row.name} ${row.subject ?? ''} ${row.teacher_names}`
              .toLocaleLowerCase('sv')
              .includes(needle),
      );
  }, [classes, query, showArchived]);

  const toggleArchive = async (row: AdminClass) => {
    const next = !row.archived;
    if (!window.confirm(next ? `Arkivera ${row.name}? Elever och historik finns kvar.` : `Återaktivera ${row.name}?`)) {
      return;
    }
    setWorking(row.id);
    setError(null);
    setNotice(null);
    try {
      await setClassArchived(row.id, next);
      setNotice(next ? `${row.name} är arkiverad.` : `${row.name} är återaktiverad.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ändra klassen.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <Card
      title="Klasser"
      subtitle="Skapa klasser, koppla elever och lärare och arkivera klasser utan att radera historik."
      action={
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Uppdatera
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setForm({ open: true, row: null })}>
            Ny klass
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
        <label className="admin-search">
          <Search size={16} aria-hidden="true" />
          <input
            className="input"
            aria-label="Sök klass"
            placeholder="Sök klass, ämne eller lärare"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="row small" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Visa arkiverade
        </label>
      </div>

      {loading ? (
        <Spinner label="Hämtar klasser…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={classes.length ? 'Inga träffar' : 'Inga klasser ännu'}
          description={
            classes.length
              ? 'Ändra sökningen eller visa arkiverade klasser.'
              : 'Skapa den första klassen med knappen Ny klass.'
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Klass</th>
                <th>Ämne</th>
                <th>Lärare</th>
                <th>Elever</th>
                <th>Status</th>
                <th>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.description || 'Ingen beskrivning'}</small>
                  </td>
                  <td>{row.subject || '—'}</td>
                  <td>
                    <span className="small">{row.teacher_names || 'Ingen lärare'}</span>
                  </td>
                  <td>{row.student_count}</td>
                  <td>
                    <Badge tone={row.archived ? 'neutral' : 'green'}>
                      {row.archived ? 'Arkiverad' : 'Aktiv'}
                    </Badge>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <Button size="sm" variant="ghost" icon={<Users size={13} />} onClick={() => setRoster(row)}>
                        Medlemmar
                      </Button>
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
                        icon={row.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                        loading={working === row.id}
                        onClick={() => void toggleArchive(row)}
                      >
                        {row.archived ? 'Återaktivera' : 'Arkivera'}
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
        <ClassForm
          row={form.row}
          onClose={() => setForm({ open: false, row: null })}
          onSaved={async (message) => {
            setForm({ open: false, row: null });
            setNotice(message);
            await refresh();
          }}
        />
      )}

      {roster && (
        <RosterDialog
          row={roster}
          members={members.filter((member) => member.class_id === roster.id)}
          accounts={accounts}
          onClose={() => setRoster(null)}
          onChanged={refresh}
        />
      )}
    </Card>
  );
};

const ClassForm: React.FC<{
  row: AdminClass | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}> = ({ row, onClose, onSaved }) => {
  const [name, setName] = useState(row?.name ?? '');
  const [subject, setSubject] = useState(row?.subject ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) {
      setError('Ge klassen ett namn (minst 2 tecken).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (row) {
        await updateClass({ id: row.id, name, subject, description });
        await onSaved('Klassen är uppdaterad.');
      } else {
        const created = await createClass({ name, subject, description });
        await onSaved(`Klassen ${created.id ? name : ''} är skapad med klasskod ${created.join_code}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara klassen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={row ? `Redigera ${row.name}` : 'Ny klass'}
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
      <Field label="Klassnamn" htmlFor="class-name" required>
        <input
          id="class-name"
          className="input"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Ämne" htmlFor="class-subject">
        <input
          id="class-subject"
          className="input"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </Field>
      <Field label="Beskrivning" htmlFor="class-description">
        <textarea
          id="class-description"
          className="input"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Du läggs automatiskt till som lärare i klassen. Fler lärare och elever kopplas under Medlemmar.
      </p>
    </Modal>
  );
};

const RosterDialog: React.FC<{
  row: AdminClass;
  members: AdminClassMember[];
  accounts: Account[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}> = ({ row, members, accounts, onClose, onChanged }) => {
  const [addId, setAddId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const students = members.filter((member) => member.member_role === 'elev');
  const teachers = members.filter((member) => member.member_role === 'larare');
  const memberIds = new Set(members.map((member) => member.user_id));
  const candidates = accounts.filter((account) => account.active && !memberIds.has(account.id));

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={`${row.name} – medlemmar`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Klart</Button>}
    >
      {error && <Alert>{error}</Alert>}

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <select
          className="input"
          aria-label="Välj person att lägga till"
          style={{ flex: 1 }}
          value={addId}
          onChange={(event) => setAddId(event.target.value)}
        >
          <option value="">Välj person att lägga till…</option>
          {candidates.map((account) => (
            <option key={account.id} value={account.id}>
              {nameOf(account)} · {account.role === 'elev' ? 'Elev' : account.role === 'speciallärare' ? 'Speciallärare' : 'Lärare'}
            </option>
          ))}
        </select>
        <Button
          disabled={!addId || busy}
          onClick={() => {
            const account = accounts.find((item) => item.id === addId);
            if (!account) return;
            const role = account.role === 'elev' ? 'elev' : 'larare';
            void run(async () => {
              await addClassMember(row.id, account.id, role);
              setAddId('');
            }, 'Kunde inte lägga till personen.');
          }}
        >
          Lägg till
        </Button>
      </div>

      {[
        { label: 'Elever', rows: students },
        { label: 'Lärare', rows: teachers },
      ].map((group) => (
        <div key={group.label} style={{ marginBottom: 14 }}>
          <h3 className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.6px' }}>
            {group.label} ({group.rows.length})
          </h3>
          {group.rows.length === 0 ? (
            <p className="small muted">Inga {group.label.toLowerCase()} i klassen ännu.</p>
          ) : (
            <div className="list">
              {group.rows.map((member) => (
                <div className="list-row" key={member.user_id}>
                  <div className="list-main">
                    <p className="list-title">{member.display_name}</p>
                    <p className="list-sub">@{member.username}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<UserMinus size={13} />}
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Ta bort ${member.display_name} från ${row.name}?`)) return;
                      void run(
                        () => removeClassMember(row.id, member.user_id),
                        'Kunde inte ta bort personen.',
                      );
                    }}
                  >
                    Ta bort
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <p className="small muted" style={{ marginBottom: 0 }}>
        Eleven och dess inlämningar finns kvar även om eleven tas bort från klassen.
      </p>
    </Modal>
  );
};
