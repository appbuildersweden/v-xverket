import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { addStudentByUsername, listAdminClassMembers, listAdminClasses } from '../../lib/api';
import type { AdminClass, AdminClassMember, SchoolRole } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Spinner } from '../../components/ui';

interface Account {
  id: string;
  username: string;
  role: SchoolRole;
  active: boolean;
  createdAt: string | null;
  firstName: string | null;
  lastName: string | null;
  accountType: 'skola' | 'privat';
  limited: boolean;
  mustChangePassword: boolean;
}

const roleLabel: Record<string, string> = {
  admin: 'Administratör',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  elev: 'Elev',
  okand: 'Okänd',
};

const CREATABLE: Array<{ value: SchoolRole; label: string }> = [
  { value: 'elev', label: 'Elev' },
  { value: 'lärare', label: 'Lärare' },
  { value: 'speciallärare', label: 'Speciallärare' },
];

type SortKey = 'namn' | 'användarnamn' | 'roll' | 'skapad';

const fullName = (account: Account) =>
  [account.firstName, account.lastName].filter(Boolean).join(' ') || account.username;

/**
 * Kontohantering för administratören. Samma komponent används för hela
 * kontolistan och för lärarlistan, så att åtgärderna bara finns på ett ställe.
 */
export const AdminPeople: React.FC<{ filter: 'alla' | 'lärare' | 'elev' }> = ({ filter }) => {
  const { identity } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [memberships, setMemberships] = useState<AdminClassMember[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('namn');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [passwordDialog, setPasswordDialog] = useState<{ username: string; password: string } | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string | null; className?: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, memberRows, classRows] = await Promise.all([
        supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
        listAdminClassMembers(),
        listAdminClasses(),
      ]);
      if (list.error) {
        setError('Kunde inte hämta kontona. Kontrollera att adminfunktionen är publicerad.');
        setAccounts([]);
      } else {
        const rows = (list.data as { accounts?: Account[] } | null)?.accounts;
        setAccounts(Array.isArray(rows) ? rows : []);
      }
      setMemberships(memberRows);
      setClasses(classRows);
    } catch {
      setError('Anslutningen till administrationen misslyckades. Försök igen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const classesFor = useCallback(
    (userId: string) =>
      memberships.filter((row) => row.user_id === userId).map((row) => row.class_name),
    [memberships],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('sv');
    const roleFilter = filter === 'alla' ? null : filter === 'lärare' ? ['lärare', 'speciallärare'] : ['elev'];
    const filtered = accounts.filter((account) => {
      if (roleFilter && !roleFilter.includes(account.role)) return false;
      if (!needle) return true;
      const classesText = classesFor(account.id).join(' ');
      return `${fullName(account)} ${account.username} ${roleLabel[account.role] ?? ''} ${classesText}`
        .toLocaleLowerCase('sv')
        .includes(needle);
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === 'användarnamn') return a.username.localeCompare(b.username, 'sv');
      if (sort === 'roll') return (roleLabel[a.role] ?? '').localeCompare(roleLabel[b.role] ?? '', 'sv');
      if (sort === 'skapad') return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
      return fullName(a).localeCompare(fullName(b), 'sv');
    });
    return sorted;
  }, [accounts, classesFor, filter, query, sort]);

  const adminAction = async (body: Record<string, unknown>, success: string) => {
    setError(null);
    setNotice(null);
    setWorkingId(String(body.userId ?? ''));
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-users', { body });
      if (invokeError) {
        setError('Åtgärden kunde inte genomföras. Kontrollera behörighet och försök igen.');
        return;
      }
      if (body.action === 'reset-password') {
        const payload = data as { username?: string; initialPassword?: string };
        if (!payload.initialPassword || !payload.username) {
          setError('Lösenordet återställdes men engångsuppgifterna kunde inte läsas.');
          return;
        }
        setPasswordDialog({ username: payload.username, password: payload.initialPassword });
      } else {
        setNotice(success);
      }
      await refresh();
    } catch {
      setError('Anslutningen misslyckades. Försök igen.');
    } finally {
      setWorkingId(null);
    }
  };

  const title = filter === 'lärare' ? 'Lärare' : filter === 'elev' ? 'Elever' : 'Användare och konton';
  const description =
    filter === 'lärare'
      ? 'Lärarkonton och vilka klasser de undervisar i. Koppla lärare till klasser under Klasser.'
      : filter === 'elev'
        ? 'Elevkonton och deras klasser.'
        : 'Skapa konton, ändra roll och status samt återställ lösenord. Åtgärderna verifieras av den skyddade adminfunktionen.';

  if (loading && accounts.length === 0 && !error) return <Spinner label="Hämtar konton…" />;

  return (
    <Card
      title={title}
      subtitle={`${visible.length} av ${accounts.length} konton. ${description}`}
      action={
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Uppdatera
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            Nytt konto
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
            aria-label="Sök konto"
            placeholder="Sök namn, användarnamn, roll eller klass"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="input"
          aria-label="Sortera konton"
          style={{ width: 'auto' }}
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
        >
          <option value="namn">Sortera: namn</option>
          <option value="användarnamn">Sortera: användarnamn</option>
          <option value="roll">Sortera: roll</option>
          <option value="skapad">Sortera: senast skapad</option>
        </select>
      </div>

      {loading ? (
        <Spinner label="Uppdaterar konton…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={accounts.length ? 'Inga träffar' : 'Inga konton att visa'}
          description={accounts.length ? 'Ändra sökningen och försök igen.' : 'Skapa det första kontot med knappen Nytt konto.'}
        />
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Användare</th>
                <th>Roll</th>
                <th>Klass</th>
                <th>Status</th>
                <th>Skapad</th>
                <th>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => {
                const isSelf = account.id === identity?.id;
                const accountClasses = classesFor(account.id);
                return (
                  <tr key={account.id}>
                    <td>
                      <strong>{fullName(account)}</strong>
                      <small>@{account.username}</small>
                    </td>
                    <td>
                      <Badge
                        tone={account.role === 'admin' ? 'blue' : account.role === 'lärare' ? 'green' : 'neutral'}
                      >
                        {roleLabel[account.role] ?? account.role}
                      </Badge>
                    </td>
                    <td>
                      {accountClasses.length > 0 ? (
                        <span className="small">{accountClasses.join(', ')}</span>
                      ) : (
                        <span className="small muted">—</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={account.active ? 'green' : 'red'}>
                        {account.active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                      <small>
                        {account.accountType === 'privat' ? 'Privat' : 'Skola'}
                        {account.limited ? ' · Begränsad' : ''}
                        {account.mustChangePassword ? ' · Lösenordsbyte krävs' : ''}
                      </small>
                    </td>
                    <td>
                      {account.createdAt ? new Date(account.createdAt).toLocaleDateString('sv-SE') : '—'}
                    </td>
                    <td>
                      <div className="admin-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil size={13} />}
                          onClick={() => setEditing(account)}
                        >
                          Redigera
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={workingId === account.id || isSelf}
                          onClick={() =>
                            void adminAction(
                              { action: 'set-active', userId: account.id, active: !account.active },
                              account.active ? 'Kontot är inaktiverat.' : 'Kontot är aktiverat.',
                            )
                          }
                        >
                          {account.active ? 'Inaktivera' : 'Aktivera'}
                        </Button>
                        <select
                          aria-label={`Ändra roll för ${account.username}`}
                          className="input admin-role-select"
                          value={account.role}
                          disabled={workingId === account.id}
                          onChange={(event) => {
                            const role = event.target.value as SchoolRole;
                            if (role === account.role) return;
                            if (window.confirm(`Ändra rollen för ${account.username} till ${roleLabel[role]}?`)) {
                              void adminAction({ action: 'set-role', userId: account.id, role }, 'Rollen är uppdaterad.');
                            } else {
                              void refresh();
                            }
                          }}
                        >
                          <option value="admin">Administratör</option>
                          <option value="lärare">Lärare</option>
                          <option value="speciallärare">Speciallärare</option>
                          <option value="elev">Elev</option>
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<KeyRound size={13} />}
                          disabled={workingId === account.id || isSelf}
                          onClick={() => {
                            if (window.confirm(`Skapa ett nytt engångslösenord för ${account.username}?`)) {
                              void adminAction({ action: 'reset-password', userId: account.id }, '');
                            }
                          }}
                        >
                          Återställ lösenord
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
        Din egen roll kan inte ändras här. Klasskopplingar görs under Klasser.
      </p>

      {createOpen && (
        <CreateAccount
          classes={classes}
          onClose={() => setCreateOpen(false)}
          onCreated={async (result) => {
            setCreateOpen(false);
            setCreated(result);
            await refresh();
          }}
        />
      )}

      {editing && (
        <EditAccount
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice('Uppgifterna är sparade.');
            await refresh();
          }}
        />
      )}

      {passwordDialog && (
        <Modal
          open
          title="Engångslösenord"
          onClose={() => setPasswordDialog(null)}
          footer={<Button onClick={() => setPasswordDialog(null)}>Klart</Button>}
        >
          <Alert tone="success">
            Lösenordet visas endast i den här dialogen. Dela det säkert med användaren.
          </Alert>
          <p>
            <strong>Användarnamn:</strong> {passwordDialog.username}
          </p>
          <p>
            <strong>Tillfälligt lösenord:</strong> <code>{passwordDialog.password}</code>
          </p>
          <p className="small muted">Användaren måste välja ett nytt lösenord vid nästa inloggning.</p>
        </Modal>
      )}

      {created && (
        <Modal
          open
          title="Kontot är skapat"
          onClose={() => setCreated(null)}
          footer={<Button onClick={() => setCreated(null)}>Klart</Button>}
        >
          <Alert tone="success">
            Kontot kan logga in i Elda Skola direkt
            {created.className ? ` och är kopplat till ${created.className}` : ''}.
          </Alert>
          <p>
            <strong>Användarnamn:</strong> {created.username}
          </p>
          {created.password ? (
            <p>
              <strong>Tillfälligt lösenord:</strong> <code>{created.password}</code>
            </p>
          ) : (
            <p className="small muted">Lösenordet sattes av dig och visas därför inte igen.</p>
          )}
          <p className="small muted">
            Lösenordet visas bara en gång. Användaren måste byta det vid första inloggningen.
          </p>
        </Modal>
      )}
    </Card>
  );
};

const CreateAccount: React.FC<{
  classes: AdminClass[];
  onClose: () => void;
  onCreated: (result: { username: string; password: string | null; className?: string }) => Promise<void>;
}> = ({ classes, onClose, onCreated }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<SchoolRole>('elev');
  const [classId, setClassId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Ange förnamn och efternamn.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'create', firstName, lastName, role },
      });
      if (invokeError) {
        setError('Kontot kunde inte skapas. Kontrollera uppgifterna och försök igen.');
        return;
      }
      const payload = data as { username?: string; initialPassword?: string | null };
      if (!payload.username) {
        setError('Kontot skapades men svaret kunde inte läsas.');
        return;
      }
      let className: string | undefined;
      if (role === 'elev' && classId) {
        await addStudentByUsername(classId, payload.username);
        className = classes.find((row) => row.id === classId)?.name;
      }
      await onCreated({ username: payload.username, password: payload.initialPassword ?? null, className });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kontot kunde inte skapas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Nytt konto"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Skapa konto
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <Field label="Förnamn" htmlFor="new-first" required>
          <input
            id="new-first"
            className="input"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            maxLength={80}
          />
        </Field>
        <Field label="Efternamn" htmlFor="new-last" required>
          <input
            id="new-last"
            className="input"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            maxLength={80}
          />
        </Field>
        <Field label="Roll" htmlFor="new-role" required>
          <select
            id="new-role"
            className="input"
            value={role}
            onChange={(event) => setRole(event.target.value as SchoolRole)}
          >
            {CREATABLE.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
        </Field>
        {role === 'elev' && (
          <Field
            label="Klass"
            htmlFor="new-class"
            hint="Frivilligt. Eleven kan flyttas eller läggas till senare under Klasser."
          >
            <select
              id="new-class"
              className="input"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="">Ingen klass ännu</option>
              {classes
                .filter((row) => !row.archived)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Användarnamnet skapas automatiskt av skolans namnregel. Ett tillfälligt lösenord visas en gång.
      </p>
    </Modal>
  );
};

const EditAccount: React.FC<{
  account: Account;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ account, onClose, onSaved }) => {
  const [firstName, setFirstName] = useState(account.firstName ?? '');
  const [lastName, setLastName] = useState(account.lastName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      setError('Ange minst ett namn.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: invokeError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'update-profile', userId: account.id, firstName, lastName },
      });
      if (invokeError) {
        setError('Uppgifterna kunde inte sparas.');
        return;
      }
      await onSaved();
    } catch {
      setError('Anslutningen misslyckades. Försök igen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Redigera ${account.username}`}
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
      <div className="grid-2">
        <Field label="Förnamn" htmlFor="edit-first">
          <input
            id="edit-first"
            className="input"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            maxLength={80}
          />
        </Field>
        <Field label="Efternamn" htmlFor="edit-last">
          <input
            id="edit-last"
            className="input"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            maxLength={80}
          />
        </Field>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Användarnamn, roll och klass ändras på annat håll: roll i listan och klass under Klasser.
      </p>
    </Modal>
  );
};
