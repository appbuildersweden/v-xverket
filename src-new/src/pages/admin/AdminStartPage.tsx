import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, ShieldCheck, ScrollText, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { countAccounts } from '../../lib/accounts';
import { AuthAccount } from '../../lib/auth-types';
import { AuditRow, listAuditLog } from '../../lib/registration';
import {
  ScheduleEntry,
  listScheduleEntries,
  timeRange,
  upcomingEntries,
  weekdayShort,
} from '../../lib/schedule';
import { formatDateTime } from '../../lib/dates';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  StatCard,
} from '../../components/ui';
import { QuickLinks } from '../../components/QuickLinks';

interface Props {
  onNavigate: (pageId: string) => void;
}

/** Svenska etiketter för händelserna i granskningsloggen. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  'account.created': 'Konto skapat',
  'account.profile_updated': 'Kontouppgifter ändrade',
  'account.password_reset': 'Nytt lösenord',
  'account.role_changed': 'Roll ändrad',
  'account.godkand': 'Konto godkänt',
  'account.begransad': 'Konto begränsat',
  'account.nekad': 'Konto avstängt',
  'schedule.created': 'Schemapost skapad',
  'schedule.updated': 'Schemapost ändrad',
  'schedule.deleted': 'Schemapost borttagen',
  'class.created': 'Klass skapad',
  'class.code_rotated': 'Klasskod bytt',
  'class.join_requested': 'Klassansökan skickad',
  'class.join_approved': 'Klassansökan godkänd',
  'class.join_denied': 'Klassansökan nekad',
  'application.auto_approved': 'Ansökan godkändes automatiskt',
  'application.needs_review': 'Ansökan skickades till granskning',
  'application.godkand': 'Ansökan godkänd',
  'application.begransad': 'Ansökan godkänd med begränsning',
  'application.nekad': 'Ansökan avslagen',
};

/**
 * Adminpanelens startsida.
 *
 * Allt på sidan kommer från backend: nyckeltalen från kontolistan, schemat från
 * `schedule_entries` och händelserna från granskningsloggen. Saknas data visas
 * ett tydligt tomt läge — aldrig påhittade siffror. Varje kort har eget
 * laddningsläge och eget felmeddelande, så att ett fel inte döljer resten.
 */
export const AdminStartPage: React.FC<Props> = ({ onNavigate }) => {
  const { user, listAccounts } = useAuth();
  const [accounts, setAccounts] = useState<AuthAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [events, setEvents] = useState<AuditRow[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    const result = await listAccounts();
    if (result.ok) setAccounts(result.accounts);
    else {
      setAccounts(null);
      setAccountsError(result.error);
    }
    setAccountsLoading(false);
  }, [listAccounts]);

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError(null);
    const result = await listScheduleEntries();
    if (result.ok) setSchedule(result.data);
    else {
      setSchedule(null);
      setScheduleError(result.error);
    }
    setScheduleLoading(false);
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    const result = await listAuditLog(5);
    if (result.ok) setEvents(result.data);
    else {
      setEvents(null);
      setEventsError(result.error);
    }
    setEventsLoading(false);
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadSchedule();
    void loadEvents();
  }, [loadAccounts, loadSchedule, loadEvents]);

  const counts = accounts ? countAccounts(accounts) : null;
  const upcoming = schedule ? upcomingEntries(schedule).slice(0, 5) : [];

  return (
    <div className="panel-page" data-testid="page-admin-start">
      <SectionCard
        title={`Välkommen, ${user?.username ?? 'admin'}`}
        subtitle="Administrativ översikt för Elda"
      >
        <p className="card-sub">
          Härifrån hanterar du konton, roller, scheman och uppgifter. Allt som rör
          konton sker via skyddade serverfunktioner — inga privilegierade nycklar
          finns i appen.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate('create-user')}
          >
            <UserPlus size={16} /> Skapa konto
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onNavigate('anvandare')}
          >
            <Users size={16} /> Konton
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onNavigate('roller')}
          >
            <ShieldCheck size={16} /> Roller och behörigheter
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onNavigate('ansokningar')}
          >
            <ShieldCheck size={16} /> Registreringsansökningar
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Konton just nu" subtitle="Hämtat från kontolistan">
        {accountsLoading && <LoadingState label="Hämtar konton…" />}
        {!accountsLoading && accountsError && (
          <ErrorState message={accountsError} onRetry={() => void loadAccounts()} />
        )}
        {!accountsLoading && counts && (
          <>
            <div className="grid-4">
              <StatCard label="Elever" value={counts.elev} />
              <StatCard
                label="Personal"
                value={counts.larare + counts.speciallarare + counts.admin}
                hint={`${counts.larare} lärare · ${counts.speciallarare} speciallärare`}
              />
              <StatCard label="Aktiva konton" value={counts.active} hint={`${counts.inactive} inaktiva`} />
              <StatCard label="Konton totalt" value={counts.total} />
            </div>
            {counts.utanRoll > 0 && (
              <p className="state-note state-note-error" role="alert">
                <TriangleAlert size={15} /> {counts.utanRoll} konto(n) saknar en
                giltig roll och kan inte logga in i någon panel.
              </p>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Kommande i schemat"
        subtitle="Schemaposter för den här veckan"
        action={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onNavigate('amnen')}
          >
            Hantera scheman
          </button>
        }
      >
        {scheduleLoading && <LoadingState label="Hämtar schemat…" />}
        {!scheduleLoading && scheduleError && (
          <ErrorState message={scheduleError} onRetry={() => void loadSchedule()} />
        )}
        {!scheduleLoading && schedule && schedule.length === 0 && (
          <EmptyState
            icon={<Calendar size={22} />}
            title="Inget schema ännu"
            description="Schemat är tomt. Skapa den första schemaposten och koppla den till en klass eller en elev."
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('amnen')}
              >
                Till scheman
              </button>
            }
          />
        )}
        {!scheduleLoading && upcoming.length > 0 && (
          <ul className="list">
            {upcoming.map((entry) => (
              <li className="list-item list-item-static" key={entry.id}>
                <Pill tone="info">{weekdayShort(entry.weekday)}</Pill>
                <div className="list-item-content">
                  <div className="list-item-title">{entry.title}</div>
                  <div className="list-item-sub">
                    {timeRange(entry)}
                    {entry.room ? ` · ${entry.room}` : ''}
                    {entry.subject ? ` · ${entry.subject}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Senaste administrativa händelser"
        subtitle="Från granskningsloggen"
        action={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onNavigate('granskningslogg')}
          >
            Hela loggen
          </button>
        }
      >
        {eventsLoading && <LoadingState label="Hämtar händelser…" />}
        {!eventsLoading && eventsError && (
          <ErrorState message={eventsError} onRetry={() => void loadEvents()} />
        )}
        {!eventsLoading && events && events.length === 0 && (
          <EmptyState
            icon={<ScrollText size={22} />}
            title="Inga händelser ännu"
            description="Händelser dyker upp här när konton skapas, roller ändras, scheman redigeras eller klassansökningar avgörs."
          />
        )}
        {!eventsLoading && events && events.length > 0 && (
          <ul className="list">
            {events.map((row) => (
              <li className="list-item list-item-static" key={row.id}>
                <ScrollText size={15} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </div>
                  <div className="list-item-sub">
                    {row.actor_username ?? 'Systemet'} · {formatDateTime(row.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <QuickLinks
        panel="admin"
        onNavigate={onNavigate}
        pages={['anv-elever', 'anv-personal', 'roller', 'amnen', 'uppgifter', 'klasser', 'installningar']}
        subtitle="Fortsätt där du var"
      />
    </div>
  );
};
