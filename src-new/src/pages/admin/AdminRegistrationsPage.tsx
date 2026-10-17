import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Inbox,
  RefreshCw,
  ShieldOff,
  ShieldQuestion,
  X,
} from 'lucide-react';
import {
  ApplicationDecision,
  ApplicationStatus,
  KIND_LABELS,
  RegistrationApplicationRow,
  STATUS_LABELS,
  countApplications,
  decideRegistrationApplication,
  listRegistrationApplications,
} from '../../lib/registration';
import { formatDateTime } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  StatCard,
} from '../../components/ui';

const FILTERS: ReadonlyArray<{ id: ApplicationStatus | 'alla'; label: string }> = [
  { id: 'alla', label: 'Alla' },
  { id: 'vantar', label: 'Väntar på granskning' },
  { id: 'skapad', label: 'Skapade konton' },
  { id: 'godkand', label: 'Godkända' },
  { id: 'nekad', label: 'Avslagna' },
  { id: 'misslyckad', label: 'Misslyckade' },
  { id: 'borttagen', label: 'Borttagna konton' },
];

/**
 * Registreringsansökningar.
 *
 * Här granskar admin det registreringsboten har skapat automatiskt. En
 * AI-bedömning är ingen verifiering av yrkesidentitet — därför kan varje konto
 * som skapades på det sättet begränsas eller stängas av här, och alla beslut
 * hamnar i granskningsloggen. Allt går via skyddade serverfunktioner; en elev
 * eller lärare får 403 av databasen och ser aldrig sidan.
 */
export const AdminRegistrationsPage: React.FC = () => {
  const [filter, setFilter] = useState<ApplicationStatus | 'alla'>('vantar');
  const state = useAsync(
    () => listRegistrationApplications(filter === 'alla' ? null : filter),
    [filter],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const decide = async (
    row: RegistrationApplicationRow,
    decision: ApplicationDecision,
  ) => {
    if (decision === 'nekad') {
      const confirmed = window.confirm(
        `Avslå ansökan från ${row.full_name ?? row.created_username ?? 'kontot'}? Kontot stängs av.`,
      );
      if (!confirmed) return;
    }
    setBusyId(row.id);
    setError(null);
    const result = await decideRegistrationApplication(row.id, decision, notes[row.id] ?? '');
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    state.reload();
  };

  const counts = countApplications(state.data ?? []);

  return (
    <div className="panel-page" data-testid="page-admin-ansokningar">
      <SectionCard
        title="Registreringsansökningar"
        subtitle="Konton som skapats via registreringsboten — och de som väntar på granskning"
        action={
          <button type="button" className="btn btn-outline btn-sm" onClick={state.reload}>
            <RefreshCw size={15} /> Uppdatera
          </button>
        }
      >
        <div className="grid-4">
          <StatCard label="I urvalet" value={counts.total} />
          <StatCard label="Väntar" value={counts.pending} hint="Behöver ett beslut" />
          <StatCard label="Med varningssignal" value={counts.withFlags} />
          <StatCard label="Skapade konton" value={counts.created} />
        </div>

        <div className="chip-row">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chip ${filter === option.id ? 'chip-active' : ''}`}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {state.loading && <LoadingState label="Hämtar ansökningar…" />}
        {!state.loading && state.error && (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {state.data && state.data.length === 0 && (
          <EmptyState
            icon={<Inbox size={22} />}
            title="Inga ansökningar här"
            description="Byt urval ovan, eller vänta tills någon registrerar sig via boten."
          />
        )}

        {state.data && state.data.length > 0 && (
          <ul className="list">
            {state.data.map((row) => (
              <li className="list-item list-item-static" key={row.id}>
                <ShieldQuestion size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">
                    {row.full_name ?? row.created_username ?? 'Namnlös ansökan'}{' '}
                    <Pill tone="muted">{KIND_LABELS[row.kind]}</Pill>{' '}
                    <Pill tone={row.status === 'vantar' ? 'warn' : 'info'}>
                      {STATUS_LABELS[row.status]}
                    </Pill>
                  </div>
                  <div className="list-item-sub">
                    {row.created_username ? `Användarnamn: ${row.created_username} · ` : ''}
                    {row.created_class_code ? `Klasskod: ${row.created_class_code} · ` : ''}
                    skapad {formatDateTime(row.created_at)}
                    {row.bot_decision ? ` · botens beslut: ${row.bot_decision}` : ''}
                  </div>
                  {row.summary && <div className="list-item-sub">{row.summary}</div>}
                  {(row.risk_flags?.length ?? 0) > 0 && (
                    <div className="list-item-sub">
                      <AlertTriangle size={14} /> Varningssignaler: {row.risk_flags?.join(', ')}
                    </div>
                  )}
                  {row.review_note && (
                    <div className="list-item-sub">Anteckning: {row.review_note}</div>
                  )}

                  <div className="field">
                    <label className="field-label" htmlFor={`note-${row.id}`}>
                      Anteckning till loggen
                    </label>
                    <input
                      id={`note-${row.id}`}
                      className="input"
                      type="text"
                      maxLength={300}
                      value={notes[row.id] ?? ''}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder="Frivillig motivering"
                    />
                  </div>
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void decide(row, 'godkand')}
                  >
                    <Check size={15} /> Godkänn
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void decide(row, 'begransad')}
                  >
                    <ShieldOff size={15} /> Begränsa
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void decide(row, 'nekad')}
                  >
                    <X size={15} /> Avslå
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Vad besluten gör" subtitle="Samma regler som i databasen">
        <ul className="list">
          <li className="list-item list-item-static">
            <Check size={15} aria-hidden="true" /> Godkänn: kontot är aktivt och utan begränsning.
            Ansökan märks som godkänd.
          </li>
          <li className="list-item list-item-static">
            <ShieldOff size={15} aria-hidden="true" /> Begränsa: kontot får logga in men kan inte
            skapa klasser eller ansöka om klassmedlemskap.
          </li>
          <li className="list-item list-item-static">
            <X size={15} aria-hidden="true" /> Avslå: kontot stängs av och kan inte logga in.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
};
