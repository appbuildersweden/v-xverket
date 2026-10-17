import React, { useState } from 'react';
import {
  KeyRound,
  Pencil,
  Power,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { AuthAccount, Role } from '../lib/auth-types';
import {
  accountTypeLabel,
  activationQuestion,
  assignableRolesFor,
  displayName,
  roleLabel,
} from '../lib/accounts';
import { ConfirmButton, TextField } from './forms';
import { Pill, RoleBadge, SectionCard, StatusBadge } from './ui';

interface Props {
  account: AuthAccount;
  /** Den inloggade administratörens id — det egna kontot skyddas från ändring. */
  meId: string | null | undefined;
  /** När false visas ingen rolländring (Elever- och Personalsidorna). */
  allowRoleChange?: boolean;
  onClose: () => void;
  /** Anropas efter en lyckad ändring så att listan hämtas om. */
  onChanged: () => void;
}

/**
 * Kontouppgifter med de åtgärder administratören behöver: ändra namn, aktivera
 * eller inaktivera, sätta ett nytt tillfälligt lösenord och — där det är
 * tillåtet — byta roll.
 *
 * Allt går genom den skyddade serverfunktionen `admin-users`, som kontrollerar
 * anroparens roll på serversidan. Rollen kan aldrig ändras på sitt eget konto,
 * och ett nytt lösenord visas en enda gång.
 */
export const AccountActions: React.FC<Props> = ({
  account,
  meId,
  allowRoleChange = false,
  onClose,
  onChanged,
}) => {
  const {
    setAccountActive,
    updateAccountProfile,
    setAccountRole,
    resetAccountPassword,
  } = useAuth();

  const [firstName, setFirstName] = useState(account.firstName ?? '');
  const [lastName, setLastName] = useState(account.lastName ?? '');
  const [roleDraft, setRoleDraft] = useState<Role>(account.role);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const self = account.id === meId;
  const roles = assignableRolesFor(account, meId);
  const nameChanged =
    firstName.trim() !== (account.firstName ?? '') ||
    lastName.trim() !== (account.lastName ?? '');

  const run = async (key: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    setError(null);
    setNote(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? 'Åtgärden misslyckades. Försök igen.');
      return false;
    }
    onChanged();
    return true;
  };

  const saveName = async () => {
    if (firstName.trim().length === 0 && lastName.trim().length === 0) {
      setError('Ange förnamn eller efternamn.');
      return;
    }
    const done = await run('name', () =>
      updateAccountProfile(account.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      }),
    );
    if (done) setNote('Namnet sparades.');
  };

  const toggleActive = async () => {
    const done = await run('active', () => setAccountActive(account.id, !account.active));
    if (done) {
      setNote(account.active ? 'Kontot är inaktiverat.' : 'Kontot är aktiverat igen.');
    }
  };

  const changeRole = async () => {
    if (roleDraft === account.role) {
      setError('Välj en annan roll än den kontot redan har.');
      return;
    }
    const done = await run('role', () => setAccountRole(account.id, roleDraft));
    if (done) setNote(`Rollen ändrades till ${roleLabel(roleDraft).toLowerCase()}.`);
  };

  const resetPassword = async () => {
    setBusy('password');
    setError(null);
    setNote(null);
    const result = await resetAccountPassword(account.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Lösenordet finns bara i det här svaret — därför visas det tydligt här.
    setNewPassword(result.initialPassword);
    setNote('Kontot måste byta lösenordet vid nästa inloggning.');
    onChanged();
  };

  return (
    <div data-testid="account-detail">
    <SectionCard
      title={`Konto: ${account.username}`}
      subtitle="Uppgifter som servern har om kontot"
      action={
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Stäng kontouppgifterna"
        >
          <X size={17} />
        </button>
      }
    >
      {error && (
        <div className="state-note state-note-error" role="alert">
          <TriangleAlert size={15} /> {error}
        </div>
      )}
      {note && (
        <div className="state-note" role="status">
          {note}
        </div>
      )}

      {newPassword && (
        <div className="success-box" role="status" data-testid="new-password">
          <div className="success-icon">
            <KeyRound size={22} />
          </div>
          <div>
            <div className="success-title">Nytt tillfälligt lösenord</div>
            <p className="card-sub">
              Lämna det till kontot. Det visas bara den här gången och sparas
              aldrig i klartext.
            </p>
            <p className="mono" data-testid="new-password-value">
              {newPassword}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setNewPassword(null)}
            >
              Jag har sparat lösenordet
            </button>
          </div>
        </div>
      )}

      <dl className="detail-list">
        <div>
          <dt>Användarnamn</dt>
          <dd className="mono">{account.username}</dd>
        </div>
        <div>
          <dt>Roll</dt>
          <dd>
            <RoleBadge role={account.role} />
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge active={account.active} />
          </dd>
        </div>
        <div>
          <dt>Kontotyp</dt>
          <dd>{accountTypeLabel(account)}</dd>
        </div>
        <div>
          <dt>Namn</dt>
          <dd>{displayName(account) ?? '—'}</dd>
        </div>
        <div>
          <dt>Måste byta lösenord</dt>
          <dd>
            {account.mustChangePassword ? (
              <Pill tone="warn">Ja</Pill>
            ) : (
              <Pill tone="ok">Nej</Pill>
            )}
          </dd>
        </div>
        <div>
          <dt>Skapat</dt>
          <dd>
            {account.createdAt
              ? new Date(account.createdAt).toLocaleString('sv-SE')
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Kontots id</dt>
          <dd className="mono">{account.id}</dd>
        </div>
      </dl>

      {self && (
        <p className="state-note">
          <ShieldCheck size={15} /> Det här är ditt eget konto. Du kan ändra ditt
          namn och lösenord, men varken din roll eller din status — det kräver en
          annan administratör.
        </p>
      )}

      <div className="grid-2">
        <div className="field-row">
          <TextField
            label="Förnamn"
            value={firstName}
            onChange={setFirstName}
            disabled={busy !== null}
          />
          <TextField
            label="Efternamn"
            value={lastName}
            onChange={setLastName}
            disabled={busy !== null}
          />
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void saveName()}
            disabled={busy !== null || !nameChanged}
          >
            <Pencil size={15} /> Spara namn
          </button>
        </div>
      </div>

      <div className="row-actions">
        <ConfirmButton
          label={account.active ? 'Inaktivera konto' : 'Aktivera konto'}
          confirmLabel={account.active ? 'Inaktivera' : 'Aktivera'}
          question={activationQuestion(account)}
          busy={busy === 'active'}
          onConfirm={() => void toggleActive()}
          className={`btn btn-sm ${account.active ? 'btn-outline' : 'btn-primary'}`}
        />
        <ConfirmButton
          label="Nytt tillfälligt lösenord"
          confirmLabel="Skapa lösenord"
          question={`Nytt lösenord till ${account.username}? Det gamla slutar gälla direkt.`}
          busy={busy === 'password'}
          onConfirm={() => void resetPassword()}
        />
        {allowRoleChange && !self && (
          <label className="field field-inline">
            <span>Ny roll</span>
            <select
              className="input"
              aria-label={`Ny roll för ${account.username}`}
              value={roleDraft}
              disabled={busy !== null}
              onChange={(e) => setRoleDraft(e.target.value as Role)}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
            <ConfirmButton
              label="Byt roll"
              confirmLabel="Byt roll"
              question={`Byt roll till ${roleLabel(roleDraft).toLowerCase()}? Behörigheten ändras direkt och loggas.`}
              busy={busy === 'role'}
              onConfirm={() => void changeRole()}
            />
          </label>
        )}
      </div>

      <p className="card-sub">
        Lösenord hanteras av Supabase Auth. Inget lösenord visas i listan och
        inget sparas i klartext — ett nytt lösenord visas bara en gång här.
      </p>

      <p className="card-sub">
        <Power size={14} aria-hidden="true" /> Inaktivering stänger av
        inloggningen men raderar inget: uppgifter, inlämningar och historik finns
        kvar.
      </p>
    </SectionCard>
    </div>
  );
};
