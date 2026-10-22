import React, { useEffect, useRef, useState } from 'react';
import {
  Activity as ActivityIcon,
  Building2,
  ClipboardList,
  GraduationCap,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AdaptationStats } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, PageIntro, Spinner, Stat } from '../../components/ui';
import { getAdaptationStats, listAdminClasses, listOrganisations } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

/** Kontosammanställningen som serverfunktionen `admin-users` räknar fram. */
export interface OverviewCounts {
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

/** En rad ur aktivitetsloggen, som servern returnerar den. */
export interface AuditRow {
  id: string | number;
  action?: string | null;
  actor_username?: string | null;
  actor_role?: string | null;
  created_at?: string | null;
}

/**
 * Administratörens startsida.
 *
 * Allt som visas räknas fram på servern: kontosammanställningen kommer från
 * serverfunktionen `admin-users`, skolorna och klasserna från samma funktioner
 * som sidorna använder, och händelserna ur aktivitetsloggen. Inga exempelvärden
 * fylls i när något saknas – då visas ett fel med en ny försök-knapp.
 */
export const AdminHome: React.FC<{ onNavigate: (page: string) => void }> = ({ onNavigate }) => {
  const accounts = useAsync(async () => {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'overview' },
    });
    const counts = (data as { counts?: OverviewCounts } | null)?.counts;
    if (error || !counts) {
      throw new Error(
        'Kontosammanställningen kunde inte hämtas. Kontrollera att adminfunktionen är publicerad.',
      );
    }
    return counts;
  }, []);

  const school = useAsync(async () => {
    const [organisations, classes] = await Promise.all([listOrganisations(), listAdminClasses()]);
    return {
      organisations: organisations.length,
      activeOrganisations: organisations.filter((row) => row.active).length,
      classes: classes.length,
      activeClasses: classes.filter((row) => !row.archived).length,
    };
  }, []);

  const events = useAsync(async () => {
    const { data, error } = await supabase.rpc('list_audit_log', { p_limit: 6 });
    if (error) throw new Error('Aktivitetsloggen kunde inte hämtas med din behörighet.');
    return (data ?? []) as AuditRow[];
  }, []);

  const reloadAll = () => {
    void accounts.reload();
    void school.reload();
    void events.reload();
  };

  const failure = accounts.error ?? school.error ?? events.error;
  const counts = accounts.data;

  return (
    <>
      <PageIntro
        eyebrow="Administratörspanel"
        title="Startsida"
        description="Läget i hela Elda Skola: skolor, klasser, konton och den senaste aktiviteten. Siffrorna räknas på servern."
        actions={
          <Button size="sm" variant="ghost" onClick={reloadAll}>
            Uppdatera
          </Button>
        }
      />

      {failure && (
        <Alert>
          {failure}
          <div>
            <Button size="sm" variant="ghost" onClick={reloadAll}>
              Försök igen
            </Button>
          </div>
        </Alert>
      )}

      {accounts.loading && !counts && school.loading && !school.data ? (
        <Spinner label="Hämtar sammanställningen…" />
      ) : (
        <div className="stat-strip">
          <Stat
            label="Skolorganisationer"
            value={school.data?.organisations ?? '—'}
            hint={school.data ? `${school.data.activeOrganisations} aktiva` : 'Hämtas…'}
          />
          <Stat
            label="Klasser"
            value={school.data?.classes ?? '—'}
            hint={school.data ? `${school.data.activeClasses} aktiva` : 'Hämtas…'}
          />
          <Stat label="Elever" value={counts?.students ?? '—'} />
          <Stat
            label="Lärare"
            value={counts?.teachers ?? '—'}
            hint={counts ? `${counts.specialTeachers} speciallärare` : undefined}
          />
          <Stat
            label="Konton"
            value={counts?.accounts ?? '—'}
            hint={counts ? `${counts.active} aktiva · ${counts.inactive} inaktiva` : undefined}
          />
          <Stat
            label="Väntande ansökningar"
            value={counts?.pendingApplications ?? '—'}
            tone={counts && counts.pendingApplications > 0 ? 'amber' : 'neutral'}
          />
        </div>
      )}

      <div className="admin-home-grid">
        <Card
          title="Senaste systemhändelser"
          subtitle="De sex senaste posterna i aktivitetsloggen"
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('logg')}>
              Visa alla
            </Button>
          }
        >
          {events.loading ? (
            <Spinner label="Hämtar händelser…" />
          ) : events.data && events.data.length > 0 ? (
            <div className="list">
              {events.data.map((row) => (
                <div className="list-row" key={String(row.id)}>
                  <div className="list-main">
                    <p className="list-title">{row.action ?? 'Händelse'}</p>
                    <p className="list-sub">
                      {row.actor_username ?? 'System'}
                      {row.created_at
                        ? ` · ${new Date(row.created_at).toLocaleString('sv-SE')}`
                        : ''}
                    </p>
                  </div>
                  {row.actor_role && <Badge tone="neutral">{row.actor_role}</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Inga händelser ännu"
              description="Administrativa händelser loggas här när de inträffar."
            />
          )}
        </Card>

        <Card title="Snabba genvägar" subtitle="Vanliga arbetsuppgifter i administrationen">
          <div className="quick-links">
            <QuickLink
              icon={<Users size={18} />}
              title="Alla konton"
              hint="Sök konton, ändra roll och status"
              onClick={() => onNavigate('anvandare')}
            />
            <QuickLink
              icon={<Building2 size={18} />}
              title="Skolor och medlemskap"
              hint="Skapa skolor och koppla konton"
              onClick={() => onNavigate('organisationer')}
            />
            <QuickLink
              icon={<GraduationCap size={18} />}
              title="Klasser och medlemmar"
              hint="Klasser, lärare och arkivering"
              onClick={() => onNavigate('klasser')}
            />
            <QuickLink
              icon={<ClipboardList size={18} />}
              title="Uppgifter"
              hint="Uppgifterna som finns i skolan"
              onClick={() => onNavigate('uppgifter')}
            />
            <QuickLink
              icon={<SlidersHorizontal size={18} />}
              title="Funktionshantering"
              hint="Slå på eller av elevfunktioner"
              onClick={() => onNavigate('funktioner')}
            />
            <QuickLink
              icon={<ActivityIcon size={18} />}
              title="Aktivitetslogg"
              hint="Alla loggade administrativa händelser"
              onClick={() => onNavigate('logg')}
            />
          </div>
        </Card>
      </div>

      <AdaptationSummary />

      <Card title="Administratörens säkerhetsramar">
        <p className="small muted" style={{ margin: 0 }}>
          Roller, lösenord och kontostatus ändras endast via serverfunktionen{' '}
          <code>admin-users</code>. Den verifierar adminrollen från den signerade sessionen och
          loggar varje åtgärd. Inga service role-nycklar finns i webbläsaren.
        </p>
      </Card>
    </>
  );
};

/** Genväg på startsidan. En knapp, inte en länk, så att navigeringen går
 *  genom appens egen routing och bakåtknappen fungerar som vanligt. */
const QuickLink: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}> = ({ icon, title, hint, onClick }) => (
  <button type="button" className="quick-link" onClick={onClick}>
    <span className="quick-link-icon">{icon}</span>
    <span className="quick-link-text">
      <strong>{title}</strong>
      <small>{hint}</small>
    </span>
  </button>
);

/** Liten sammanfattning av elevstödet på översikten. */
const AdaptationSummary: React.FC = () => {
  const [stats, setStats] = useState<AdaptationStats | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void getAdaptationStats()
      .then((next) => {
        if (mounted.current) setStats(next);
      })
      .catch(() => {
        if (mounted.current) setFailed(true);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  if (failed || !stats) return null;

  return (
    <Card title="Elevstöd" subtitle="Aggregat – inga elevuppgifter visas här">
      <div className="grid-4">
        <Stat label="Anpassningar" value={stats.total} />
        <Stat label="Aktiva" value={stats.active} />
        <Stat label="Avslutade" value={stats.completed} />
        <Stat label="Elever" value={stats.students} />
      </div>
      <p className="small muted" style={{ marginBottom: 0, marginTop: 10 }}>
        <ShieldCheck size={13} /> Innehållet kan bara läsas av lärare som undervisar eleven.
      </p>
    </Card>
  );
};
