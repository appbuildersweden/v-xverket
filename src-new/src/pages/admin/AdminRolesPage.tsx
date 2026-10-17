import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import {
  ASSIGNABLE_ROLES,
  AuthAccount,
  ROLE_PERMISSIONS,
  Role,
  isKnownRole,
} from '../../lib/auth-types';
import {
  displayName,
  roleLabel,
  sortAccounts,
} from '../../lib/accounts';
import { PANEL_LABELS, PanelType } from '../../lib/nav';
import { ConfirmButton } from '../../components/forms';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  RoleBadge,
  SectionCard,
  StatusBadge,
  Table,
} from '../../components/ui';

const PANEL_ORDER: readonly PanelType[] = ['elev', 'larare', 'speciallarar', 'admin'];

/** Vad varje roll får göra i Elda. Rollen kommer alltid från servern. */
const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  admin:
    'Administrerar konton, roller, klasser, scheman och uppgifter. Ser alla paneler och är den enda rollen som får hantera behörigheter.',
  'lärare':
    'Har egen klass med klasskod, egna elever, uppgifter och material. Ser aldrig en annan lärares klass eller administratörens funktioner.',
  'speciallärare':
    'Har sina egna kopplade elever, uppgifter, uppföljning och meddelanden. Får inte obegränsad åtkomst bara för att rollen är speciallärare.',
  elev:
    'Ser sina egna uppgifter, sin planering, sina dokument och sin klass. Når aldrig andra elevers privata uppgifter.',
};

/**
 * Roller och behörigheter.
 *
 * Sidan visar rollmodellen så som den faktiskt ser ut i appen och i databasen,
 * och innehåller den enda vägen till att ändra en roll. Rollbytet går genom den
 * skyddade serverfunktionen `admin-users` (action: set-role), som kontrollerar
 * anroparens roll, nekar ändring av det egna kontot, skyddar den sista
 * administratören och loggar ändringen.
 */
export const AdminRolesPage: React.FC<{ onNavigate?: (pageId: string) => void }> = () => {
  const { user, listAccounts, setAccountRole } = useAuth();
  const [accounts, setAccounts] = useState<AuthAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [newRole, setNewRole] = useState<Role>('elev');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listAccounts();
    if (result.ok) setAccounts(sortAccounts(result.accounts));
    else {
      setAccounts(null);
      setError(result.error);
    }
    setLoading(false);
  }, [listAccounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const choosable = useMemo(
    () => (accounts ?? []).filter((a) => a.id !== user?.id),
    [accounts, user?.id],
  );
  const target = choosable.find((a) => a.id === targetId) ?? null;

  const changeRole = async () => {
    if (!target) {
      setActionError('Välj ett konto först.');
      return;
    }
    if (target.role === newRole) {
      setActionError('Kontot har redan den rollen.');
      return;
    }
    setBusy(true);
    setActionError(null);
    setNote(null);
    const result = await setAccountRole(target.id, newRole);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setNote(
      `${target.username} är nu ${roleLabel(newRole).toLowerCase()}. Ändringen finns i granskningsloggen.`,
    );
    setTargetId('');
    await load();
  };

  return (
    <div className="panel-page" data-testid="page-admin-roller">
      <SectionCard title="Roller" subtitle="Eldas rollmodell — rollen sätts alltid på servern">
        <Table
          caption="Vilka paneler varje roll får öppna"
          head={
            <tr>
              <th scope="col">Roll</th>
              {PANEL_ORDER.map((panel) => (
                <th scope="col" key={panel}>
                  {PANEL_LABELS[panel]}
                </th>
              ))}
            </tr>
          }
        >
          {ASSIGNABLE_ROLES.map((role) => (
            <tr key={role}>
              <td>
                {roleLabel(role)} <RoleBadge role={role} />
              </td>
              {PANEL_ORDER.map((panel) => {
                const allowed =
                  isKnownRole(role) &&
                  ROLE_PERMISSIONS[role].allowedPanels.includes(panel);
                return (
                  <td key={panel}>
                    {allowed ? <Pill tone="ok">Ja</Pill> : <Pill tone="muted">Nej</Pill>}
                  </td>
                );
              })}
            </tr>
          ))}
        </Table>

        <ul className="list">
          {ASSIGNABLE_ROLES.map((role) => (
            <li className="list-item list-item-static" key={role}>
              <div className="list-item-content">
                <div className="list-item-title">{roleLabel(role)}</div>
                <div className="list-item-sub">{ROLE_DESCRIPTIONS[role]}</div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Var behörigheten kontrolleras" subtitle="Fyra lager — alla på serversidan">
        <ul className="list">
          <li className="list-item list-item-static">
            <ShieldCheck size={15} aria-hidden="true" /> Rollen läses ur JWT:ns
            app_metadata, som bara servern kan skriva. Att ändra något i webbläsaren
            ger ingen behörighet.
          </li>
          <li className="list-item list-item-static">
            Rutterna i appen visar bara paneler som rollen får öppna — men det är
            bara första hindret.
          </li>
          <li className="list-item list-item-static">
            Row Level Security i databasen avgör vilka rader rollen får läsa och
            skriva.
          </li>
          <li className="list-item list-item-static">
            Edge Functions och databasfunktioner kontrollerar anroparens roll vid
            varje känslig åtgärd, till exempel kontoskapande och rollbyte.
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Byt roll"
        subtitle="Den enda vägen till administratörsrollen — och den loggas"
      >
        {actionError && (
          <div className="state-note state-note-error" role="alert">
            <AlertCircle size={15} /> {actionError}
          </div>
        )}
        {note && (
          <div className="state-note" role="status">
            {note}
          </div>
        )}

        {loading && <LoadingState label="Hämtar konton…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && choosable.length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title="Inga andra konton"
            description="Det finns inget annat konto att ändra rollen på. Rollbytet kräver alltid ett annat konto — du kan aldrig ändra din egen roll."
          />
        )}

        {!loading && !error && choosable.length > 0 && (
          <>
            <div className="field-row">
              <label className="field">
                <span>Konto</span>
                <select
                  className="input"
                  aria-label="Välj konto"
                  value={targetId}
                  disabled={busy}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    const next = choosable.find((a) => a.id === e.target.value);
                    if (next) setNewRole(next.role);
                  }}
                >
                  <option value="">Välj konto</option>
                  {choosable.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.username}
                      {displayName(account) ? ` — ${displayName(account)}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Ny roll</span>
                <select
                  className="input"
                  aria-label="Välj ny roll"
                  value={newRole}
                  disabled={busy}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                >
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {target && (
              <p className="card-sub">
                <RoleBadge role={target.role} /> <StatusBadge active={target.active} />{' '}
                {target.username} byter från {roleLabel(target.role).toLowerCase()} till{' '}
                {roleLabel(newRole).toLowerCase()}. Sessionen uppdateras vid nästa
                förnyelse och behörigheten ändras direkt i databasen.
              </p>
            )}

            <div className="form-actions">
              <ConfirmButton
                label="Byt roll"
                confirmLabel="Byt roll"
                question={
                  target
                    ? `Byt roll för ${target.username} till ${roleLabel(newRole).toLowerCase()}?`
                    : 'Byt roll?'
                }
                busy={busy}
                onConfirm={() => void changeRole()}
                className="btn btn-primary"
              />
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
};
