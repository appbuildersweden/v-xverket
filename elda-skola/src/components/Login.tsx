import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/password';
import { isConfigured } from '../lib/supabase';

/** Inloggning med samma konto, användarnamn och serverflöde som Elda. */
export const Login: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mustSetNewPassword, setMustSetNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!mustSetNewPassword) {
      if (!username.trim() || !password) {
        setError('Fyll i både användarnamn och lösenord.');
        return;
      }
      setLoading(true);
      setError(null);
      const result = await login(username.trim(), password);
      setLoading(false);
      if (result.ok) return;
      if (result.mustSetNewPassword) {
        setMustSetNewPassword(true);
        setError(null);
        return;
      }
      setError(result.error ?? 'Inloggningen misslyckades.');
      return;
    }

    const problem = validateNewPassword(newPassword, confirmPassword, username.trim());
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await login(username.trim(), password, newPassword);
    setLoading(false);
    if (!result.ok) setError(result.error ?? 'Lösenordet kunde inte sparas.');
  };

  return (
    <div className="login-wrap">
      <div className="login-identity">
        <div className="login-banner">
          <img src="/ronneby.webp" alt="Ronnebyån" />
          <div className="login-banner-shade" />
          <img className="login-banner-mark" src="/elda-icon.png" alt="Elda" />
          <span className="login-banner-caption">En trygg plats för lärande</span>
        </div>
        <h1>Välkommen till Elda Skola</h1>
        <p>
          Logga in med ditt Elda-konto för att komma till din skolmiljö.
        </p>
      </div>

      <div className="login-form-side">
        <form className="login-card" onSubmit={submit} noValidate>
          <img className="login-card-logo" src="/elda-icon.png" alt="Elda" />
          <span className="login-pill">Skolplattform</span>
          <h2>{mustSetNewPassword ? 'Skapa nytt lösenord' : 'Logga in'}</h2>
          <p className="lead">
            {mustSetNewPassword
              ? 'Ditt konto har ett tillfälligt lösenord. Välj ett eget för att fortsätta till Elda Skola.'
              : 'Använd kontot du har fått av skolan.'}
          </p>

          {!isConfigured && (
            <div className="login-err" role="alert">
              Appen saknar Supabase-konfiguration. Lägg till VITE_SUPABASE_URL och
              VITE_SUPABASE_ANON_KEY i projektets .env.
            </div>
          )}

          {error && (
            <div className="login-err" role="alert">
              {error}
            </div>
          )}

          {mustSetNewPassword ? (
            <>
              <div className="field">
                <label htmlFor="new-password">
                  <KeyRound size={14} /> Nytt lösenord
                </label>
                <div className="pw-wrap">
                  <input
                    id="new-password"
                    className="input"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    disabled={loading}
                    placeholder={`Minst ${MIN_PASSWORD_LENGTH} tecken`}
                  />
                  <button
                    type="button"
                    className="toggle-pw"
                    onClick={() => setShowNew((value) => !value)}
                    aria-label={showNew ? 'Dölj lösenord' : 'Visa lösenord'}
                  >
                    {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="confirm-password">
                  <ShieldCheck size={14} /> Bekräfta nytt lösenord
                </label>
                <input
                  id="confirm-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  placeholder="Skriv samma lösenord igen"
                />
                <p className="field-hint">
                  Lösenordet sparas krypterat av Supabase Auth och kan aldrig läsas ut.
                </p>
              </div>
              <button
                type="submit"
                className="btn btn-primary login-btn"
                disabled={loading || !newPassword || !confirmPassword}
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Sparar…
                  </>
                ) : (
                  'Spara och logga in'
                )}
              </button>
              <button
                type="button"
                className="link-btn login-back"
                onClick={() => {
                  setMustSetNewPassword(false);
                  setNewPassword('');
                  setConfirmPassword('');
                  setError(null);
                }}
              >
                Tillbaka till inloggningen
              </button>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="username">Användarnamn</label>
                <input
                  id="username"
                  className="input"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={loading}
                  placeholder="Ditt användarnamn"
                />
              </div>

              <div className="field">
                <label htmlFor="password">Lösenord</label>
                <div className="pw-wrap">
                  <input
                    id="password"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={loading}
                    placeholder="Ditt lösenord"
                  />
                  <button
                    type="button"
                    className="toggle-pw"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Dölj lösenord' : 'Visa lösenord'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner" /> Loggar in…
                  </>
                ) : (
                  'Logga in'
                )}
              </button>

              <p className="field-hint login-help">
                Glömt lösenordet? Kontakta skolans administratör. Nya skolelever
                skapas av en lärare – det finns ingen egen registrering här.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
