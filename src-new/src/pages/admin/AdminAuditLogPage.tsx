import React from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { listAuditLog } from '../../lib/registration';
import { formatDateTime } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, Pill, SectionCard } from '../../components/ui';

/** Svenska etiketter för händelserna i loggen. Okända visas som de är. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  'application.auto_approved': 'Ansökan godkändes automatiskt',
  'application.needs_review': 'Ansökan skickades till granskning',
  'application.godkand': 'Ansökan godkänd',
  'application.begransad': 'Ansökan godkänd med begränsning',
  'application.nekad': 'Ansökan avslagen',
  'account.created': 'Konto skapat',
  'account.godkand': 'Konto godkänt',
  'account.begransad': 'Konto begränsat',
  'account.nekad': 'Konto avstängt',
  'account.disabled': 'Konto avstängt',
  'account.restricted': 'Konto begränsat',
  'account.role_changed': 'Roll ändrad',
  'class.created': 'Klass skapad',
  'class.code_rotated': 'Klasskod bytt',
  'class.join_requested': 'Klassansökan skickad',
  'class.join_approved': 'Klassansökan godkänd',
  'class.join_denied': 'Klassansökan nekad',
  'class.student_removed': 'Elev borttagen ur klass',
};

/**
 * Granskningsloggen.
 *
 * Loggen innehåller händelser och beslut — aldrig lösenord, API-nycklar eller
 * konversationsinnehåll. Endast administratörer får läsa den; funktionen nekar
 * alla andra anrop på serversidan.
 */
export const AdminAuditLogPage: React.FC = () => {
  const state = useAsync(() => listAuditLog(150));

  return (
    <div className="panel-page" data-testid="page-admin-granskningslogg">
      <SectionCard
        title="Granskningslogg"
        subtitle="Registreringar, konton, roller och klassbeslut — utan känsliga uppgifter"
        action={
          <button type="button" className="btn btn-outline btn-sm" onClick={state.reload}>
            <RefreshCw size={15} /> Uppdatera
          </button>
        }
      >
        {state.loading && <LoadingState label="Hämtar loggen…" />}
        {!state.loading && state.error && (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}

        {state.data && state.data.length === 0 && (
          <EmptyState
            icon={<ScrollText size={22} />}
            title="Loggen är tom"
            description="Händelser dyker upp här när konton skapas, roller ändras eller klassansökningar avgörs."
          />
        )}

        {state.data && state.data.length > 0 && (
          <ul className="list">
            {state.data.map((row) => (
              <li className="list-item list-item-static" key={row.id}>
                <ScrollText size={15} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">
                    {ACTION_LABELS[row.action] ?? row.action}{' '}
                    <Pill tone="muted">{row.subject_type ?? 'system'}</Pill>
                  </div>
                  <div className="list-item-sub">
                    {row.actor_username ?? 'Registreringsboten'}
                    {row.actor_role ? ` (${row.actor_role})` : ''} ·{' '}
                    {formatDateTime(row.created_at)}
                  </div>
                  {row.subject_id && (
                    <div className="list-item-sub mono">{row.subject_id}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};
