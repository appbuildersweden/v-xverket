import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import {
  ASSIGNABLE_ROLES,
  AccountType,
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
  const { user, listAccounts, setAccountRole, setAccountType } = useAuth();
  const [accounts, setAccounts] = useState<AuthAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [newRole, setNewRole] = useState<Role>('elev');
  const [busy, setBusy] = useState(false);
  const [typeTargetId, setTypeTargetId] = useState('');
  const [newType, setNewType] = useState<AccountType>('skola');
  const [typeBusy, setTypeBusy] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [typeNote, setTypeNote] = useState<string | null>(null);

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

  const students = useMemo(() => (accounts ?? []).filter((a) => a.role === 'elev'), [accounts]);
  const typeTarget = students.find((a) => a.id === typeTargetId) ?? null;

  const changeAccountType = async () => {
    if (!typeTarget) {
      setTypeError('Välj ett elevkonto först.');
      return;
    }
    if ((typeTarget.accountType ?? 'skola') === newType) {
      setTypeError('Kontot har redan den kontotypen.');
      return;
    }
    setTypeBusy(true);
    setTypeError(null);
    setTypeNote(null);
    const result = await setAccountType(typeTarget.id, newType);
    setTypeBusy(false);
    if (!result.ok) {
      setTypeError(result.error);
      return;
    }
    setTypeNote(
      `${typeTarget.username} är nu ${newType === 'privat' ? 'privat elev' : 'skolelev'}. Ändringen finns i granskningsloggen.`,
    );
    setTypeTargetId('');
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

      <SectionCard
        title="Kontotyp för elev"
        subtitle="Skolelev har klass; privat elev har en egen panel utan klass, chatt eller kamrater"
      >
        <p className="card-sub">
          En privat elev pluggar på egen hand: egen planering, egna uppgifter,
          dokument, flashcards och framsteg. Klassen, klasschatten och
          lärarschemat är stängda både i menyn och i backend. Ett konto som
          redan är klassmedlem måste tas ur klassen först.
        </p>

        {typeError && (
          <p className="field-hint field-hint-error" role="alert" data-testid="account-type-error">
            {typeError}
          </p>
        )}
        {typeNote && <p className="field-hint" role="status">{typeNote}</p>}

        {students.length === 0 ? (
          <EmptyState
            title="Inga elevkonton"
            description="Det finns inga elevkonton att ändra kontotyp på."
          />
        ) : (
          <>
            <div className="field-row">
              <label className="field">
                <span>Elevkonto</span>
                <select
                  className="input"
                  aria-label="Välj elevkonto"
                  value={typeTargetId}
                  disabled={typeBusy}
                  onChange={(e) => {
                    setTypeTargetId(e.target.value);
                    const next = students.find((a) => a.id === e.target.value);
                    if (next) setNewType(next.accountType === 'privat' ? 'privat' : 'skola');
                  }}
                >
                  <option value="">Välj elevkonto</option>
                  {students.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.username}
                      {displayName(account) ? ` — ${displayName(account)}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Kontotyp</span>
                <select
                  className="input"
                  aria-label="Välj kontotyp"
                  value={newType}
                  disabled={typeBusy}
                  onChange={(e) => setNewType(e.target.value as AccountType)}
                >
                  <option value="skola">Skolelev</option>
                  <option value="privat">Privat elev</option>
                </select>
              </label>
            </div>

            <div className="form-actions">
              <ConfirmButton
                label="Spara kontotyp"
                confirmLabel="Spara kontotyp"
                question={
                  typeTarget
                    ? `Gör ${typeTarget.username} till ${newType === 'privat' ? 'privat elev' : 'skolelev'}?`
                    : 'Spara kontotyp?'
                }
                busy={typeBusy}
                onConfirm={() => void changeAccountType()}
                className="btn btn-primary"
              />
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
};
