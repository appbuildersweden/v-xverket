import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../../components/ui';
import { AdminHome, type AuditRow } from './AdminHome';
import { AdminPeople } from './AdminPeople';
import { AdminClasses } from './AdminClasses';
import { AdminOrganisations } from './AdminOrganisations';
import { AdminPublications } from './AdminPublications';
import { AdminSystemMessages } from './AdminSystemMessages';
import { AdminPlanning } from './AdminPlanning';
import { AdminAdaptations } from './AdminAdaptations';
import { AdminXp } from './AdminXp';
import { AdminShop } from './AdminShop';
import { AdminFeatures } from './AdminFeatures';
import { Information } from '../Information';


export const AdminPanel: React.FC<{ activePage: string; onNavigate: (page: string) => void }> = ({
  activePage,
  onNavigate,
}) => {
  const { identity, profile, logout } = useAuth();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || identity?.username || 'Administratör';

  return (
    <div className="admin-page">
      {activePage === 'oversikt' && <AdminHome onNavigate={onNavigate} />}

      {activePage === 'organisationer' && <AdminOrganisations />}
      {activePage === 'publiceringar' && <AdminPublications />}
      {activePage === 'information' && <Information mode="admin" />}
      {activePage === 'anvandare' && <AdminPeople filter="alla" />}
      {activePage === 'larare' && <AdminPeople filter="lärare" />}
      {activePage === 'klasser' && <AdminClasses />}
      {activePage === 'xp' && <AdminXp />}
      {activePage === 'butik' && <AdminShop />}
      {activePage === 'funktioner' && <AdminFeatures />}
      {activePage === 'meddelanden' && <AdminSystemMessages />}
      {activePage === 'stod' && <AdminAdaptations />}
      {activePage === 'kalender' && <AdminPlanning />}

      {activePage === 'profil' && (
        <Card title={name} subtitle="Administratörsprofil">
          <div className="dl">
            <div>
              <dt>Användarnamn</dt>
              <dd>@{identity?.username}</dd>
            </div>
            <div>
              <dt>Roll</dt>
              <dd>Administratör</dd>
            </div>
            <div>
              <dt>Kontotyp</dt>
              <dd>Skola</dd>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <Button variant="ghost" icon={<LogOut size={15} />} onClick={() => void logout()}>
              Logga ut
            </Button>
          </div>
        </Card>
      )}

      {activePage === 'logg' && <AdminAuditLog />}

      {['uppgifter', 'material', 'amnen'].includes(activePage) && (
        <AdminContent page={activePage} />
      )}
    </div>
  );
};

interface ContentColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

const visaDatum = (value: unknown) => (value ? new Date(String(value)).toLocaleDateString('sv-SE') : '—');
const visaJaNej = (value: unknown) => (value === true ? 'Ja' : value === false ? 'Nej' : '—');
const visaText = (value: unknown) => (value == null || value === '' ? '—' : String(value));

const ADMIN_TABELLER: Record<
  string,
  { title: string; description: string; table: string; columns: ContentColumn[] }
> = {
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
  material: {
    title: 'Läromaterial',
    description: 'Dokument och material som lärarna har lagt upp.',
    table: 'documents',
    columns: [
      { key: 'title', label: 'Titel', format: visaText },
      { key: 'subject', label: 'Ämne', format: visaText },
      { key: 'created_at', label: 'Upplagt', format: visaDatum },
    ],
  },
};

const AdminContent: React.FC<{ page: string }> = ({ page }) => {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
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
      const result = await (supabase.from(pageInfo.table) as any).select(select).limit(100);
      if (!live) return;
      if (result.error) {
        setRows([]);
        setError('Innehållet kunde inte hämtas med din behörighet.');
      } else {
        setRows((result.data ?? []) as unknown as Array<Record<string, unknown>>);
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [pageInfo, reloadKey]);

  if (page === 'amnen') {
    return (
      <Card title="Ämnen">
        <EmptyState
          title="Ämnen sätts på klasser"
          description="Ämne och undervisning hanteras under Klasser. Här visas inga påhittade ämneslistor."
        />
      </Card>
    );
  }

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

const AdminAuditLog: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void supabase.rpc('list_audit_log', { p_limit: 100 }).then(({ data, error: err }) => {
      if (!live) return;
      if (err) setError('Aktivitetsloggen kunde inte hämtas med din behörighet.');
      else setRows((data ?? []) as AuditRow[]);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Card title="Aktivitetslogg" subtitle="Senaste säkerhets- och administrationshändelserna">
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Spinner label="Hämtar loggen…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Ingen aktivitetslogg ännu"
          description="Loggade administrativa händelser visas här."
        />
      ) : (
        <div className="list">
          {rows.map((row) => (
            <div className="list-row" key={String(row.id)}>
              <div className="list-main">
                <p className="list-title">{String(row.action ?? 'Händelse')}</p>
                <p className="list-sub">
                  {String(row.actor_username ?? 'System')} ·{' '}
                  {row.created_at ? new Date(String(row.created_at)).toLocaleString('sv-SE') : ''}
                </p>
              </div>
              <Badge tone="neutral">{String(row.actor_role ?? '')}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
