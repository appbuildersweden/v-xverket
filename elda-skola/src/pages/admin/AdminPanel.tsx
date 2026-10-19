import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BookOpen, CalendarDays, ClipboardList, FileText, KeyRound,
  LayoutDashboard, LogOut, MessageSquare, Search, Settings, ShieldCheck,
  UserRound, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { SchoolRole } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageIntro, Spinner, Stat } from '../../components/ui';
import type { NavItem } from '../../components/AppShell';

const NAV: NavItem[] = [
  { id: 'oversikt', label: 'Översikt', icon: <LayoutDashboard size={19} /> },
  { id: 'anvandare', label: 'Användare och konton', icon: <Users size={19} /> },
  { id: 'roller', label: 'Roller och behörigheter', icon: <ShieldCheck size={19} /> },
  { id: 'klasser', label: 'Klasser och grupper', icon: <BookOpen size={19} /> },
  { id: 'amnen', label: 'Ämnen och undervisning', icon: <BookOpen size={19} /> },
  { id: 'material', label: 'Material och innehåll', icon: <FileText size={19} /> },
  { id: 'uppgifter', label: 'Uppgifter och inlämningar', icon: <ClipboardList size={19} /> },
  { id: 'kalender', label: 'Kalender och planering', icon: <CalendarDays size={19} /> },
  { id: 'stod', label: 'Anpassningar och elevstöd', icon: <UserRound size={19} /> },
  { id: 'logg', label: 'Aktivitetslogg', icon: <Activity size={19} /> },
  { id: 'meddelanden', label: 'Meddelanden', icon: <MessageSquare size={19} /> },
  { id: 'installningar', label: 'Systeminställningar', icon: <Settings size={19} /> },
  { id: 'profil', label: 'Min administratörsprofil', icon: <Settings size={19} /> },
];

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

export const ADMIN_NAV = NAV;

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

  const title = NAV.find((item) => item.id === activePage)?.label ?? 'Översikt';
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

      {(activePage === 'anvandare' || activePage === 'roller') && (
        <Card title="Användare" subtitle={`${visibleAccounts.length} av ${accounts.length} konton`} action={<Button size="sm" variant="ghost" onClick={() => void refresh()}>Uppdatera</Button>}>
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

const AdminUnavailable: React.FC<{ page: string }> = ({ page }) => {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const cfg: Record<string, { title: string; table: string; columns: string }> = {
    klasser: { title: 'Klasser och grupper', table: 'classes', columns: 'id, name, subject, archived, created_at' },
    amnen: { title: 'Ämnen och undervisning', table: 'classes', columns: 'id, name, subject, archived, created_at' },
    material: { title: 'Material och innehåll', table: 'documents', columns: 'id, title, subject, created_at' },
    uppgifter: { title: 'Uppgifter och inlämningar', table: 'student_tasks', columns: 'id, title, subject, published, due_date, created_at' },
    kalender: { title: 'Kalender och planering', table: 'school_events', columns: 'id, title, starts_at, all_day' },
    stod: { title: 'Anpassningar och elevstöd', table: '', columns: '' },
    logg: { title: 'Aktivitetslogg', table: '', columns: '' },
    meddelanden: { title: 'Meddelanden', table: 'school_announcements', columns: 'id, title, created_at' },
    installningar: { title: 'Systeminställningar', table: '', columns: '' },
  };
  const pageInfo = cfg[page];

  useEffect(() => {
    let live = true;
    void (async () => {
      if (!pageInfo?.table) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await (supabase.from(pageInfo.table) as any).select(pageInfo.columns).limit(100);
      if (!live) return;
      if (result.error) {
        setRows([]);
        setError('Du saknar behörighet eller innehållet kunde inte hämtas. Privata elevsvar och anpassningar visas inte i adminlistan.');
      } else {
        setRows((result.data ?? []) as unknown as Array<Record<string, unknown>>);
        setError(null);
      }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [pageInfo?.table, pageInfo?.columns]);

  if (page === 'logg') return <AdminAuditLog />;
  if (page === 'stod') return <Card title={pageInfo?.title ?? 'Anpassningar och elevstöd'}><EmptyState title="Skyddat elevinnehåll" description="Anpassningar och individuellt stöd kräver uttryckligt lärarbehörighetsflöde. Adminpanelen visar inte känsliga elevuppgifter." /></Card>;
  if (page === 'installningar') return <Card title={pageInfo?.title ?? 'Systeminställningar'}><EmptyState title="Inga systeminställningar har konfigurerats" description="Skolinställningar kräver en separat backendmodell och ska inte visas som fungerande innan den finns." /></Card>;
  return <Card title={pageInfo?.title ?? 'Administration'} subtitle="Endast information som din aktuella roll får läsa visas.">
    {error && <Alert>{error}</Alert>}
    {loading ? <Spinner label="Hämtar skolans data…" /> : rows.length === 0 ? <EmptyState title="Inget innehåll att visa" description="Det finns inga synliga poster, eller så har du inte åtkomst till den här datan." /> : (
      <div className="table-wrap"><table className="table"><thead><tr>{Object.keys(rows[0]).map((key) => <th key={key}>{key.replace(/_/g, ' ')}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={String(row.id ?? i)}>{Object.entries(row).map(([key, value]) => <td key={key}>{value == null ? '—' : typeof value === 'boolean' ? value ? 'Ja' : 'Nej' : String(value)}</td>)}</tr>)}</tbody></table></div>
    )}
  </Card>;
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
