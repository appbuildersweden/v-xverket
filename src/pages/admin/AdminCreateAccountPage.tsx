import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Shield,
  ShieldAlert,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { ROLE_LABELS, ROLE_OPTIONS, type AccountRole } from './account-utils';

interface Props {
  onNavigate: (pageId: string) => void;
}

/** Standardlösenordet som nya skolkonton får. Måste bytas vid första inloggningen. */
const TEMP_PASSWORD = 'student123';
const MIN_PASSWORD_LENGTH = 8;

interface CreatedAccount {
  username: string;
  role: AccountRole;
  password: string;
  usedTemporaryPassword: boolean;
}

export const AdminCreateAccountPage: React.FC<Props> = ({ onNavigate }) => {
  const { createAccount, suggestUsername } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [role, setRole] = useState<AccountRole>('elev');
  const [useTemporaryPassword, setUseTemporaryPassword] = useState(true);
  const [customPassword, setCustomPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [copied, setCopied] = useState<'username' | 'password' | null>(null);

  const requestSeq = useRef(0);

  // Användarnamnet föreslås av servern (e + 3 + 2 + löpnummer) och är alltid
  // ledigt när det visas. Ett äldre svar får aldrig skriva över ett nyare.
  useEffect(() => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first && !last) {
      setUsername('');
      setUsernameBusy(false);
      return;
    }

    const ticket = ++requestSeq.current;
    setUsernameBusy(true);
    // Det gamla namnet får inte kunna skickas in medan det nya beräknas.
    setUsername('');

    const timer = window.setTimeout(async () => {
      const result = await suggestUsername(first, last);
      if (ticket !== requestSeq.current) return;
      setUsernameBusy(false);
      setUsername(result.ok ? result.username : '');
    }, 250);

    return () => window.clearTimeout(timer);
  }, [firstName, lastName, suggestUsername]);

  const password = useTemporaryPassword ? TEMP_PASSWORD : customPassword;

  const reset = () => {
    setCreated(null);
    setFirstName('');
    setLastName('');
    setUsername('');
    setRole('elev');
    setUseTemporaryPassword(true);
    setCustomPassword('');
    setShowPassword(false);
    setError(null);
    setCopied(null);
    requestSeq.current += 1;
  };

  const copy = async (value: string, field: 'username' | 'password') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!firstName.trim() || !lastName.trim()) {
      setError('Ange både förnamn och efternamn.');
      return;
    }
    if (!username) {
      setError('Användarnamnet är inte klart ännu. Vänta en kort stund och försök igen.');
      return;
    }
    if (!useTemporaryPassword && customPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createAccount({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      password,
    });

    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCreated({
      username: result.username,
      role: result.role,
      password,
      usedTemporaryPassword: useTemporaryPassword,
    });
  };

  return (
    <div className="admin-page admin-create-page">
      <div className="admin-section-head">
        <p className="admin-section-sub">
          Kontot skapas i Supabase Auth av en skyddad serverfunktion.
          Användarnamnet reserveras på servern och profilen skrivs i samma steg.
        </p>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onNavigate('anvandare')}
        >
          <UserPlus size={14} /> Till kontolistan
        </button>
      </div>

      <div className="admin-create-card card">
        {created ? (
          <div className="admin-create-success">
            <div className="admin-create-success-icon">
              <Check size={26} />
            </div>
            <h3>Kontot är skapat</h3>
            <p>
              <strong>{created.username}</strong> har rollen{' '}
              <strong>{ROLE_LABELS[created.role]}</strong> och finns nu i
              kontolistan. Uppgifterna ligger kvar efter omladdning.
            </p>

            <div className="admin-create-info">
              <div className="admin-create-info-row">
                <span>Användarnamn</span>
                <b>{created.username}</b>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void copy(created.username, 'username')}
                >
                  <Copy size={13} />
                  {copied === 'username' ? 'Kopierat' : 'Kopiera'}
                </button>
              </div>
              <div className="admin-create-info-row">
                <span>Roll</span>
                <b>{ROLE_LABELS[created.role]}</b>
              </div>
              <div className="admin-create-info-row">
                <span>
                  {created.usedTemporaryPassword ? 'Tillfälligt lösenord' : 'Lösenord'}
                </span>
                <b>{created.password}</b>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void copy(created.password, 'password')}
                >
                  <Copy size={13} />
                  {copied === 'password' ? 'Kopierat' : 'Kopiera'}
                </button>
              </div>
            </div>

            <p className="admin-caveat">
              {created.usedTemporaryPassword
                ? 'Lösenordet är tillfälligt och måste bytas vid första inloggningen innan panelerna öppnas.'
                : 'Användaren måste byta lösenordet vid första inloggningen.'}{' '}
              Lösenordet visas bara här — det sparas aldrig i klartext.
            </p>

            <div className="admin-create-success-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('anvandare')}
              >
                Öppna kontolistan
              </button>
              <button type="button" className="btn btn-outline" onClick={reset}>
                Skapa ett till konto
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="login-err" role="alert" style={{ marginBottom: 14 }}>
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            <div className="admin-form-row">
              <label className="field" htmlFor="admin-first-name">
                <span className="field-label-top">
                  <User size={14} /> Förnamn
                </span>
                <input
                  id="admin-first-name"
                  className="input"
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={loading}
                  placeholder="T.ex. Jens"
                  autoComplete="off"
                  maxLength={80}
                />
              </label>

              <label className="field" htmlFor="admin-last-name">
                <span className="field-label-top">
                  <User size={14} /> Efternamn
                </span>
                <input
                  id="admin-last-name"
                  className="input"
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={loading}
                  placeholder="T.ex. Turesson"
                  autoComplete="off"
                  maxLength={80}
                />
              </label>
            </div>

            <label className="field" htmlFor="admin-username">
              <span className="field-label-top">
                <Shield size={14} /> Användarnamn (skapas automatiskt)
              </span>
              <input
                id="admin-username"
                className="input"
                type="text"
                value={username}
                readOnly
                aria-live="polite"
                placeholder="Fyll i namn först"
              />
              <span className="admin-field-hint">
                {usernameBusy
                  ? 'Kontrollerar nästa lediga nummer…'
                  : 'Regeln: e + 3 bokstäver av förnamnet + 2 av efternamnet + löpnummer. Numret väljs och reserveras av servern.'}
              </span>
            </label>

            <div className="field">
              <span className="field-label-top">Roll</span>
              <div className="role-chooser">
                {ROLE_OPTIONS.map((option) => (
                  <label
                    className={`role-option${role === option.value ? ' sel' : ''}`}
                    key={option.value}
                  >
                    <input
                      type="radio"
                      name="admin-role"
                      value={option.value}
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      disabled={loading}
                    />
                    {option.value === 'admin' ? <Shield size={15} /> : <User size={15} />}
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <span className="admin-field-hint">
                Rollen sätts serversidigt och kan inte ändras av användaren själv.
              </span>
            </div>

            {role === 'admin' && (
              <div className="admin-callout admin-callout--warning">
                <ShieldAlert size={16} />
                <div>
                  <b>Administratörsrollen ger full åtkomst</b>
                  <p>
                    Kontot kan hantera alla andra konton, roller och status. Ge
                    rollen bara till någon du litar på.
                  </p>
                </div>
              </div>
            )}

            <div className="field">
              <span className="field-label-top">
                <KeyRound size={14} /> Lösenord
              </span>
              <div className="admin-password-options">
                <label className={`role-option${useTemporaryPassword ? ' sel' : ''}`}>
                  <input
                    type="radio"
                    name="password-mode"
                    checked={useTemporaryPassword}
                    onChange={() => setUseTemporaryPassword(true)}
                    disabled={loading}
                  />
                  <span>Tillfälligt standardlösenord</span>
                </label>
                <label className={`role-option${!useTemporaryPassword ? ' sel' : ''}`}>
                  <input
                    type="radio"
                    name="password-mode"
                    checked={!useTemporaryPassword}
                    onChange={() => setUseTemporaryPassword(false)}
                    disabled={loading}
                  />
                  <span>Eget lösenord</span>
                </label>
              </div>

              {useTemporaryPassword ? (
                <p className="admin-field-hint">
                  Nya konton får <strong>{TEMP_PASSWORD}</strong>. Det visas efter
                  att kontot skapats och måste bytas vid första inloggningen.
                </p>
              ) : (
                <div className="admin-password-wrap">
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={customPassword}
                    onChange={(event) => setCustomPassword(event.target.value)}
                    disabled={loading}
                    placeholder={`Minst ${MIN_PASSWORD_LENGTH} tecken`}
                    autoComplete="new-password"
                    aria-label="Eget lösenord"
                  />
                  <button
                    type="button"
                    className="admin-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Dölj lösenordet' : 'Visa lösenordet'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary admin-create-submit"
              disabled={
                loading ||
                !firstName.trim() ||
                !lastName.trim() ||
                !username ||
                (!useTemporaryPassword && customPassword.length < MIN_PASSWORD_LENGTH)
              }
            >
              {loading ? (
                <>
                  <span className="spinner" /> Skapar…
                </>
              ) : (
                <>
                  <UserPlus size={15} /> Skapa konto
                </>
              )}
            </button>

            <p className="admin-caveat">
              Kontot skapas via en skyddad serverfunktion. Användarnamnet
              kontrolleras och reserveras på servern, och lösenordet hanteras av
              Supabase Auth — aldrig i klartext i databasen.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
