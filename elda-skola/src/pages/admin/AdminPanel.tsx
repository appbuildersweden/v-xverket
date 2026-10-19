import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, LogOut, Save, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { AdaptationStats, SchoolRole } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageIntro, Spinner, Stat } from '../../components/ui';
import { ADMIN_NAV } from '../../components/AppShell';
import { getAdaptationStats, getSchoolSettings, saveSchoolSettings } from '../../lib/api';
import {
  applySchoolSettings,
  validateSchoolSettings,
  type SchoolSettingsErrors,
} from '../../lib/school-settings';

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

interface OverviewCounts {
  accounts: number;
  active: number;
  inactive: number;
  students: number;
  teachers: number;
  specialTeachers: number;
  admins: number;
  limited: number;
  pendingApplications: number;
}

const roleLabel: Record<string, string> = {
  admin: 'Administratör', lärare: 'Lärare', speciallärare: 'Speciallärare', elev: 'Elev', okand: 'Okänd',
};

export const AdminPanel: React.FC<{ activePage: string; onNavigate: (page: string) => void }> = ({ activePage }) => {
  const { identity, profile, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordDialog, setPasswordDialog] = useState<{ username: string; password: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, list] = await Promise.all([
        supabase.functions.invoke('admin-users', { body: { action: 'overview' } }),
        supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
      ]);
      if (overview.error || list.error) {
        setCounts(null);
        setAccounts([]);
        setError('Kunde inte hämta administrationsdata. Kontrollera att adminfunktionen är publicerad och försök igen.');
      } else {
        const nextCounts = (overview.data as { counts?: OverviewCounts } | null)?.counts;
        const nextAccounts = (list.data as { accounts?: Account[] } | null)?.accounts;
        if (!nextCounts || !Array.isArray(nextAccounts)) {
          setCounts(null);
          setAccounts([]);
          setError('Administrationsfunktionen returnerade ett ogiltigt svar.');
        } else {
          setCounts(nextCounts);
          setAccounts(nextAccounts);
        }
      }
    } catch {
      setCounts(null);
      setAccounts([]);
      setError('Anslutningen till administrationen misslyckades. Försök igen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Rollfördelning för "Roller och behörigheter" – räknas ur samma lista. */
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { admin: 0, lärare: 0, speciallärare: 0, elev: 0 };
    for (const account of accounts) counts[account.role] = (counts[account.role] ?? 0) + 1;
    return counts;
  }, [accounts]);

  const visibleAccounts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('sv');
    return accounts.filter((account) =>
      !needle || `${account.username} ${account.firstName ?? ''} ${account.lastName ?? ''} ${roleLabel[account.role] ?? account.role}`
        .toLocaleLowerCase('sv').includes(needle),
    );
  }, [accounts, query]);

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
          setError('Lösenordet återställdes men engångsuppgifterna kunde inte läsas. Kontakta administratören.');
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

  const title = ADMIN_NAV.find((item) => item.id === activePage)?.label ?? 'Översikt';
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || identity?.username || 'Administratör';

  if (loading && !counts && !error) return <Spinner label="Hämtar administrationen…" />;

  return (
    <div className="admin-page">
      <PageIntro eyebrow="Administratörspanel" title={title} description="Skolans konton och struktur. Åtgärder verifieras av den skyddade adminfunktionen." />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}<div><Button size="sm" variant="ghost" onClick={() => void refresh()}>Försök igen</Button></div></Alert>}

      {activePage === 'oversikt' && counts && (
        <div className="stack">
          <div className="grid-4">
            <Stat label="Konton" value={counts.accounts} hint={`${counts.active} aktiva · ${counts.inactive} inaktiva`} />
            <Stat label="Lärare" value={counts.teachers} />
            <Stat label="Elever" value={counts.students} />
            <Stat label="Administratörer" value={counts.admins} />
          </div>
          <Card title="Översikt" subtitle="Aktuella serverräknade kontostatusar">
            <div className="dl">
              <div><dt>Speciallärare</dt><dd>{counts.specialTeachers}</dd></div>
              <div><dt>Begränsade konton</dt><dd>{counts.limited}</dd></div>
              <div><dt>Väntande ansökningar</dt><dd>{counts.pendingApplications}</dd></div>
            </div>
          </Card>
          <Card title="Administratörens säkerhetsramar">
            <p className="small muted" style={{ margin: 0 }}>Roller, lösenord och kontostatus ändras endast via Edge Functionen <code>admin-users</code>. Den verifierar adminrollen från signerad session och loggar administrativa åtgärder. Skapa inte en första administratör från den här klienten.</p>
          </Card>
        </div>
      )}

      {activePage === 'roller' && !loading && (
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <Stat label="Administratörer" value={roleCounts.admin ?? 0} />
          <Stat label="Lärare" value={roleCounts['lärare'] ?? 0} />
          <Stat label="Speciallärare" value={roleCounts['speciallärare'] ?? 0} />
          <Stat label="Elever" value={roleCounts.elev ?? 0} />
        </div>
      )}

      {(activePage === 'anvandare' || activePage === 'roller') && (
        <Card title={activePage === 'roller' ? 'Roller och behörigheter' : 'Användare'} subtitle={`${visibleAccounts.length} av ${accounts.length} konton`} action={<Button size="sm" variant="ghost" onClick={() => void refresh()}>Uppdatera</Button>}>
          <div className="filter-bar">
            <label className="admin-search"><Search size={16} aria-hidden="true" /><input className="input" aria-label="Sök användare" placeholder="Sök namn, användarnamn eller roll" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          </div>
          {loading ? <Spinner label="Uppdaterar konton…" /> : visibleAccounts.length === 0 ? (
            <EmptyState title={accounts.length ? 'Inga träffar' : 'Inga konton att visa'} description={accounts.length ? 'Ändra sökningen och försök igen.' : 'När skolan får konton visas de här.'} />
          ) : (
            <div className="table-wrap"><table className="table admin-table">
              <thead><tr><th>Användare</th><th>Roll</th><th>Typ / status</th><th>Skapad</th><th>Åtgärder</th></tr></thead>
              <tbody>{visibleAccounts.map((account) => {
                const isSelf = account.id === identity?.id;
                const fullName = [account.firstName, account.lastName].filter(Boolean).join(' ');
                return <tr key={account.id}>
                  <td><strong>{fullName || account.username}</strong><small>@{account.username}</small></td>
                  <td><Badge tone={account.role === 'admin' ? 'blue' : account.role === 'lärare' ? 'green' : 'neutral'}>{roleLabel[account.role] ?? account.role}</Badge></td>
                  <td><Badge tone={account.active ? 'green' : 'red'}>{account.active ? 'Aktiv' : 'Inaktiv'}</Badge><small>{account.accountType === 'privat' ? 'Privat' : 'Skola'}{account.limited ? ' · Begränsad' : ''}{account.mustChangePassword ? ' · Lösenordsbyte krävs' : ''}</small></td>
                  <td>{account.createdAt ? new Date(account.createdAt).toLocaleDateString('sv-SE') : '—'}</td>
                  <td><div className="admin-actions">
                    <Button size="sm" variant="ghost" disabled={workingId === account.id || isSelf} onClick={() => void adminAction({ action: 'set-active', userId: account.id, active: !account.active }, account.active ? 'Kontot är inaktiverat.' : 'Kontot är aktiverat.')}>{account.active ? 'Inaktivera' : 'Aktivera'}</Button>
                    <select aria-label={`Ändra roll för ${account.username}`} className="input admin-role-select" value={account.role} disabled={workingId === account.id || isSelf} onChange={(event) => {
                      const role = event.target.value as SchoolRole;
                      if (role !== account.role) {
                        if (window.confirm(`Ändra rollen för ${account.username} till ${roleLabel[role]}?`)) {
                          void adminAction({ action: 'set-role', userId: account.id, role }, 'Rollen är uppdaterad.');
                        } else {
                          void refresh();
                        }
                      }
                    }}><option value="admin">Administratör</option><option value="lärare">Lärare</option><option value="speciallärare">Speciallärare</option><option value="elev">Elev</option></select>
                    <Button size="sm" variant="ghost" icon={<KeyRound size={13} />} disabled={workingId === account.id || isSelf} onClick={() => { if (window.confirm(`Skapa ett nytt engångslösenord för ${account.username}?`)) void adminAction({ action: 'reset-password', userId: account.id }, ''); }}>Återställ lösenord</Button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table></div>
          )}
          <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>Din egen roll kan inte ändras här. Administratörsåtgärder skriver inte lösenord till loggar.</p>
        </Card>
      )}

      {activePage === 'profil' && (
        <Card title={name} subtitle="Administratörsprofil">
          <div className="dl"><div><dt>Användarnamn</dt><dd>@{identity?.username}</dd></div><div><dt>Roll</dt><dd>Administratör</dd></div><div><dt>Kontotyp</dt><dd>Skola</dd></div></div>
          <div style={{ marginTop: 18 }}><Button variant="ghost" icon={<LogOut size={15} />} onClick={() => void logout()}>Logga ut</Button></div>
        </Card>
      )}

      {!['oversikt', 'anvandare', 'roller', 'profil'].includes(activePage) && <AdminUnavailable page={activePage} />}

      {passwordDialog && <Modal open title="Engångslösenord" onClose={() => setPasswordDialog(null)} footer={<Button onClick={() => setPasswordDialog(null)}>Klart</Button>}>
        <Alert tone="success">Lösenordet visas endast i den här dialogen. Dela det säkert med användaren.</Alert>
        <p><strong>Användarnamn:</strong> {passwordDialog.username}</p>
        <p><strong>Tillfälligt lösenord:</strong> <code>{passwordDialog.password}</code></p>
        <p className="small muted">Användaren måste välja ett nytt lösenord vid nästa inloggning.</p>
      </Modal>}
    </div>
  );
};

interface AdminColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

const visaDatum = (value: unknown) => (value ? new Date(String(value)).toLocaleDateString('sv-SE') : '—');
const visaTid = (value: unknown) => (value ? new Date(String(value)).toLocaleString('sv-SE') : '—');
const visaJaNej = (value: unknown) => (value === true ? 'Ja' : value === false ? 'Nej' : '—');
const visaText = (value: unknown) => (value == null || value === '' ? '—' : String(value));

/**
 * De adminvyer som läser en befintlig tabell. Kolumnerna är namngivna på
 * svenska i stället för att råa fältnamn visas, och varje vy kan laddas om.
 */
const ADMIN_TABELLER: Record<
  string,
  { title: string; description: string; table: string; columns: AdminColumn[] }
> = {
  klasser: {
    title: 'Klasser och grupper',
    description: 'Klasserna som lärarna arbetar i. Behörigheten styrs av RLS-policyerna på classes.',
    table: 'classes',
    columns: [
      { key: 'name', label: 'Klass', format: visaText },
      { key: 'subject', label: 'Ämne', format: visaText },
      { key: 'archived', label: 'Arkiverad', format: visaJaNej },
      { key: 'created_at', label: 'Skapad', format: visaDatum },
    ],
  },
  material: {
    title: 'Material och innehåll',
    description: 'Dokument och material som lärarna har lagt upp.',
    table: 'documents',
    columns: [
      { key: 'title', label: 'Titel', format: visaText },
      { key: 'subject', label: 'Ämne', format: visaText },
      { key: 'created_at', label: 'Upplagt', format: visaDatum },
    ],
  },
  uppgifter: {
    title: 'Uppgifter och inlämningar',
    description: 'Uppgifterna som finns i skolan. Elevsvar visas aldrig här.',
    table: 'student_tasks',
    columns: [
      { key: 'title', label: 'Uppgift', format: visaText },
      { key: 'subject', label: 'Ämne', format: visaText },
      { key: 'published', label: 'Publicerad', format: visaJaNej },
      { key: 'due_date', label: 'Deadline', format: visaDatum },
      { key: 'created_at', label: 'Skapad', format: visaDatum },
    ],
  },
  kalender: {
    title: 'Kalender och planering',
    description: 'Schemahändelser för skolan.',
    table: 'school_events',
    columns: [
      { key: 'title', label: 'Händelse', format: visaText },
      { key: 'starts_at', label: 'Start', format: visaTid },
      { key: 'all_day', label: 'Heldag', format: visaJaNej },
    ],
  },
  meddelanden: {
    title: 'Meddelanden',
    description: 'Skolans gemensamma meddelanden.',
    table: 'school_announcements',
    columns: [
      { key: 'title', label: 'Rubrik', format: visaText },
      { key: 'created_at', label: 'Publicerad', format: visaTid },
    ],
  },
};

const AdminUnavailable: React.FC<{ page: string }> = ({ page }) => {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const pageInfo = ADMIN_TABELLER[page];

  useEffect(() => {
    let live = true;
    void (async () => {
      if (!pageInfo) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const select = ['id', ...pageInfo.columns.map((column) => column.key)].join(', ');
      const result = await (supabase.from(pageInfo.table) as any)
        .select(select)
        .limit(100);
      if (!live) return;
      if (result.error) {
        setRows([]);
        setError(
          'Innehållet kunde inte hämtas med din behörighet. Privata elevsvar och anpassningar visas aldrig i adminlistan.',
        );
      } else {
        setRows((result.data ?? []) as unknown as Array<Record<string, unknown>>);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [pageInfo, reloadKey]);

  if (page === 'logg') return <AdminAuditLog />;
  if (page === 'amnen') return <AdminSubjects />;

  if (page === 'stod') return <AdminAdaptationStats />;
  if (page === 'installningar') return <AdminSchoolSettings />;

  if (!pageInfo) {
    return (
      <Card title="Administration">
        <EmptyState title="Sidan finns inte" description="Välj en kategori i menyn." />
      </Card>
    );
  }

  return (
    <Card
      title={pageInfo.title}
      subtitle={`${pageInfo.description} ${rows.length ? `${rows.length} poster visas.` : ''}`.trim()}
      action={
        <Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
          Uppdatera
        </Button>
      }
    >
      {error && (
        <Alert>
          {error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
              Försök igen
            </Button>
          </div>
        </Alert>
      )}
      {loading ? (
        <Spinner label="Hämtar skolans data…" />
      ) : rows.length === 0 ? (
        !error && (
          <EmptyState
            title="Inget innehåll att visa"
            description="Det finns inga synliga poster, eller så har du inte åtkomst till den här datan."
          />
        )
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {pageInfo.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.id ?? index)}>
                  {pageInfo.columns.map((column) => (
                    <td key={column.key}>{(column.format ?? visaText)(row[column.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

/**
 * Ämnen finns inte som egen tabell – de lagras på klasser, uppgifter och
 * material. Vyn sammanställer därför de ämnen som faktiskt används i stället
 * för att visa klasslistan en gång till.
 */
const AdminSubjects: React.FC = () => {
  const [rows, setRows] = useState<Array<{ subject: string | null; name: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await (supabase.from('classes') as any)
        .select('id, name, subject, archived')
        .order('subject', { ascending: true })
        .limit(200);
      if (!live) return;
      if (result.error) {
        setRows([]);
        setError('Ämnena kunde inte hämtas med din behörighet.');
      } else {
        setRows((result.data ?? []) as Array<{ subject: string | null; name: string | null }>);
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const subjects = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const subject = (row.subject ?? '').trim() || 'Ämne saknas';
      const list = map.get(subject) ?? [];
      if (row.name) list.push(row.name);
      map.set(subject, list);
    }
    return [...map.entries()]
      .map(([subject, classes]) => ({ subject, classes: [...new Set(classes)] }))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'sv'));
  }, [rows]);

  return (
    <Card
      title="Ämnen och undervisning"
      subtitle="Ämnena som används på skolans klasser. Ämnet sätts på klassen och följer med uppgifterna."
      action={
        <Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
          Uppdatera
        </Button>
      }
    >
      {error && (
        <Alert>
          {error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
              Försök igen
            </Button>
          </div>
        </Alert>
      )}
      {loading ? (
        <Spinner label="Hämtar ämnen…" />
      ) : subjects.length === 0 ? (
        !error && (
          <EmptyState
            title="Inga ämnen ännu"
            description="När lärare skapar klasser med ämne visas sammanställningen här."
          />
        )
      ) : (
        <div className="list">
          {subjects.map((row) => (
            <div className="list-row" key={row.subject}>
              <div className="list-main">
                <p className="list-title">{row.subject}</p>
                <p className="list-sub">
                  {row.classes.length ? row.classes.join(', ') : 'Ingen klass angiven'}
                </p>
              </div>
              <Badge tone="neutral">{row.classes.length} klasser</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

/**
 * Anpassningar är känsliga. Admin får se att flödet används, men aldrig
 * elevens namn eller innehållet i anpassningen – det styrs av RLS och av att
 * serverfunktionen bara returnerar aggregat.
 */
const AdminAdaptationStats: React.FC = () => {
  const [stats, setStats] = useState<AdaptationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await getAdaptationStats();
        if (live) setStats(next);
      } catch (err) {
        if (!live) return;
        setStats(null);
        setError(err instanceof Error ? err.message : 'Kunde inte hämta statistiken.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [reloadKey]);

  return (
    <Card
      title="Anpassningar och elevstöd"
      subtitle="Sammanställning av skolans anpassningar. Innehållet är begränsat till de lärare som undervisar eleven."
      action={
        <Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
          Uppdatera
        </Button>
      }
    >
      {error && (
        <Alert>
          {error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
              Försök igen
            </Button>
          </div>
        </Alert>
      )}
      {loading ? (
        <Spinner label="Hämtar sammanställningen…" />
      ) : !stats ? (
        <EmptyState
          title="Endast för administratörer"
          description="Kontot saknar administratörsbehörighet, eller så kunde sammanställningen inte läsas."
        />
      ) : (
        <div className="stack">
          <div className="grid-4">
            <Stat label="Anpassningar" value={stats.total} hint="Totalt registrerade" />
            <Stat label="Aktiva" value={stats.active} hint="Pågående stöd" />
            <Stat label="Avslutade" value={stats.completed} />
            <Stat label="Elever" value={stats.students} hint="Berörda elever" />
          </div>
          {stats.total === 0 && (
            <EmptyState
              title="Inga anpassningar registrerade"
              description="Lärare registrerar anpassningar under Elevstöd i lärarpanelen. De visas här som antal, aldrig med elevinnehåll."
            />
          )}
          <div className="notice">
            <ShieldCheck size={17} />
            <span>
              Elevnamn, rubriker och stödinsatser visas aldrig i adminpanelen. De kan bara
              läsas av lärare som undervisar eleven, enligt databasens RLS-policyer.
              {stats.last_updated
                ? ` Senaste ändringen gjordes ${new Date(stats.last_updated).toLocaleString('sv-SE')}.`
                : ''}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};

/** Skolövergripande inställningar. Endast admin kan spara – kontrolleras i databasen. */
const AdminSchoolSettings: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<SchoolSettingsErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const settings = await getSchoolSettings();
        if (!live) return;
        setName(settings.school_name);
        setEmail(settings.contact_email ?? '');
        setUpdatedAt(settings.updated_at);
        applySchoolSettings(settings);
      } catch (err) {
        if (live) {
          setError(err instanceof Error ? err.message : 'Kunde inte hämta inställningarna.');
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const save = async () => {
    const check = validateSchoolSettings({ schoolName: name, contactEmail: email });
    setErrors(check.errors);
    setNotice(null);
    if (!check.ok) return;

    setSaving(true);
    setError(null);
    try {
      const saved = await saveSchoolSettings({ schoolName: name, contactEmail: email });
      applySchoolSettings(saved);
      setName(saved.school_name);
      setEmail(saved.contact_email ?? '');
      setUpdatedAt(saved.updated_at);
      setNotice('Inställningarna är sparade.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara inställningarna.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Systeminställningar"
      subtitle="Skolövergripande värden som delas av alla inloggade. Personliga val ligger kvar under Profil och inställningar."
    >
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && (
        <Alert>
          {error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>
              Läs om
            </Button>
          </div>
        </Alert>
      )}
      {loading ? (
        <Spinner label="Hämtar inställningarna…" />
      ) : (
        <div className="stack">
          <div className="grid-2">
            <Field
              label="Skolans namn"
              htmlFor="school-name"
              required
              hint="Visas i sidopanelen och i toppfältet. 2–80 tecken."
            >
              <input
                id="school-name"
                className="input"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
              {errors.schoolName && <p className="field-error">{errors.schoolName}</p>}
            </Field>
            <Field
              label="Kontaktadress"
              htmlFor="school-email"
              hint="Frivillig. Visas för inloggade användare under Profil och inställningar."
            >
              <input
                id="school-email"
                className="input"
                type="email"
                value={email}
                maxLength={160}
                placeholder="skolan@exempel.se"
                onChange={(event) => setEmail(event.target.value)}
              />
              {errors.contactEmail && <p className="field-error">{errors.contactEmail}</p>}
            </Field>
          </div>
          <div className="row-between">
            <Button icon={<Save size={16} />} loading={saving} onClick={() => void save()}>
              Spara inställningar
            </Button>
            <span className="small muted">
              {updatedAt
                ? `Senast ändrad ${new Date(updatedAt).toLocaleString('sv-SE')}`
                : 'Ingen ändring har sparats ännu.'}
            </span>
          </div>
          <div className="notice">
            <ShieldCheck size={17} />
            <span>
              Ändringar sparas i databasen och kontrolleras av en serverfunktion som
              kräver administratörsroll. Varje sparande loggas i aktivitetsloggen.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};

const AdminAuditLog: React.FC = () => {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void supabase.rpc('list_audit_log', { p_limit: 100 }).then(({ data, error: err }) => {
      if (!live) return;
      if (err) setError('Aktivitetsloggen kunde inte hämtas med din behörighet.');
      else setRows((data ?? []) as Array<Record<string, unknown>>);
      setLoading(false);
    });
    return () => { live = false; };
  }, []);
  return <Card title="Aktivitetslogg" subtitle="Senaste säkerhets- och administrationshändelserna">
    {error && <Alert>{error}</Alert>}
    {loading ? <Spinner label="Hämtar loggen…" /> : rows.length === 0 ? <EmptyState title="Ingen aktivitetslogg ännu" description="Loggade administrativa händelser visas här." /> : <div className="list">{rows.map((row) => <div className="list-row" key={String(row.id)}><div className="list-main"><p className="list-title">{String(row.action ?? 'Händelse')}</p><p className="list-sub">{String(row.actor_username ?? 'System')} · {row.created_at ? new Date(String(row.created_at)).toLocaleString('sv-SE') : ''}</p></div><Badge tone="neutral">{String(row.actor_role ?? '')}</Badge></div>)}</div>}
  </Card>;
};
