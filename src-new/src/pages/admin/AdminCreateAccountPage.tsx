import React, { useState } from 'react';
import { AlertCircle, Check, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { CREATABLE_ROLES, Role } from '../../lib/auth-types';
import { roleLabel, MIN_PASSWORD_LENGTH, normalizeCreateAccount, validateCreateAccount } from '../../lib/accounts';
import { SectionCard } from '../../components/ui';

interface Props {
  onNavigate: (pageId: string) => void;
}

const ROLE_HINTS: Readonly<Record<Role, string>> = {
  elev: 'Ser elevpanelen',
  'lärare': 'Ser lärarpanelen med egna klasser',
  'speciallärare': 'Ser speciallärarpanelen',
  admin: 'Tilldelas under Roller och behörigheter',
};

/**
 * Rollerna som får skapas här. Administratörsrollen är medvetet utanför: den
 * tilldelas bara genom den separata, loggade åtgärden under Roller och
 * behörigheter, så att ett vanligt kontoformulär aldrig kan skapa en admin.
 */
const ROLE_OPTIONS = CREATABLE_ROLES.map((id) => ({
  id,
  label: roleLabel(id),
  hint: ROLE_HINTS[id],
}));

/**
 * Skapa konto. Behörigheten kontrolleras i den skyddade serverfunktionen
 * `admin-users` mot anroparens JWT — formuläret här är bara första filtret,
 * aldrig säkerhetsgränsen.
 *
 * Lösenordet skickas direkt till Supabase Auth och lagras aldrig i klartext.
 * Väljer administratören att låta servern skapa ett tillfälligt lösenord visas
 * det en enda gång i bekräftelsen.
 */
export const AdminCreateAccountPage: React.FC<Props> = ({ onNavigate }) => {
  const { createAccountWithUsername } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [role, setRole] = useState<Role>('elev');
  const [generatePassword, setGeneratePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    username: string;
    role: Role;
    initialPassword: string | null;
  } | null>(null);

  const reset = () => {
    setUsername('');
    setPassword('');
    setConfirmation('');
    setRole('elev');
    setGeneratePassword(true);
    setError(null);
    setCreated(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const input = { username, password, confirmation, role, generatePassword };
    const problem = validateCreateAccount(input);
    if (problem) {
      setError(problem);
      setCreated(null);
      return;
    }

    setLoading(true);
    setError(null);
    const payload = normalizeCreateAccount(input);
    const result = await createAccountWithUsername(payload);
    setLoading(false);

    if (result.ok) {
      setCreated({
        username: result.username,
        role: result.role,
        // Lösenordet finns bara i det här svaret — det sparas aldrig någonstans.
        initialPassword: result.initialPassword ?? (payload.password ?? null),
      });
      setPassword('');
      setConfirmation('');
    } else {
      setCreated(null);
      setError(result.error);
    }
  };

  return (
    <div className="panel-page" data-testid="page-admin-create-user">
      <SectionCard
        title="Skapa konto"
        subtitle="Kontot skapas av servern — rollen kan inte väljas av användaren själv"
      >
        {error && (
          <div className="login-err" role="alert" data-testid="create-error">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {created && (
          <div className="success-box" role="status" data-testid="create-success">
            <div className="success-icon">
              <Check size={22} />
            </div>
            <div>
              <div className="success-title">
                Kontot <span className="mono">{created.username}</span> är skapat
              </div>
              <p className="card-sub">
                Roll: {roleLabel(created.role)}. Användaren måste byta lösenordet
                vid första inloggningen.
              </p>
              {created.initialPassword && (
                <>
                  <p className="card-sub">
                    Tillfälligt lösenord — det visas bara den här gången:
                  </p>
                  <p className="mono" data-testid="create-initial-password">
                    {created.initialPassword}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="field">
            <label htmlFor="new-username">Användarnamn</label>
            <input
              id="new-username"
              className="input"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              placeholder="T.ex. ejentu01"
              aria-describedby="new-username-hint"
            />
            <p className="field-hint-reg" id="new-username-hint">
              3–32 tecken: små bokstäver, siffror, punkt, bindestreck eller
              understreck.
            </p>
          </div>

          <label className="check-inline">
            <input
              type="checkbox"
              checked={generatePassword}
              onChange={(e) => setGeneratePassword(e.target.checked)}
              disabled={loading}
            />
            <span>Låt servern skapa ett tillfälligt lösenord</span>
          </label>
          <p className="field-hint">
            Lösenordet visas en gång här efteråt och måste bytas vid första
            inloggningen. Vill du i stället bestämma lösenordet själv, ta bort
            bocken och fyll i fälten nedan.
          </p>

          {!generatePassword && (
            <div className="field-row">
              <div className="field">
                <label htmlFor="new-password">
                  <KeyRound size={14} /> Lösenord
                </label>
                <input
                  id="new-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder={`Minst ${MIN_PASSWORD_LENGTH} tecken`}
                />
              </div>

              <div className="field">
                <label htmlFor="new-password-confirm">
                  <ShieldCheck size={14} /> Bekräfta lösenord
                </label>
                <input
                  id="new-password-confirm"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  disabled={loading}
                  placeholder="Skriv samma lösenord igen"
                />
              </div>
            </div>
          )}

          <fieldset className="field role-picker">
            <legend>Roll</legend>
            <div className="grid-3">
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={`role-option ${role === option.id ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.id}
                    checked={role === option.id}
                    onChange={() => setRole(option.id)}
                    disabled={loading}
                  />
                  <span className="role-option-label">{option.label}</span>
                  <span className="role-option-hint">{option.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                loading ||
                !username ||
                (!generatePassword && (!password || !confirmation))
              }
            >
              <UserPlus size={16} />
              {loading ? 'Skapar konto…' : 'Skapa konto'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onNavigate('anvandare')}
            >
              Till kontolistan
            </button>
            {created && (
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Skapa ett till
              </button>
            )}
          </div>

          <p className="security-note">
            <ShieldCheck size={14} aria-hidden="true" />
            Servern kontrollerar att du är administratör och skapar både
            autentiseringskontot och profilen. Användarnamnet är unikt och rollen
            sätts i serverstyrd metadata — administratörsrollen går bara att
            tilldela under Roller och behörigheter.
          </p>
        </form>
      </SectionCard>
    </div>
  );
};
