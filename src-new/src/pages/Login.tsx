import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useTheme } from '../theme';
import { useAuth } from '../lib/AuthContext';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/password';

/**
 * Hemsidans registreringsbot är den enda publika vägen till ett konto.
 * Appen loggar bara in; hänvisningen nedan är text och en länk, inget formulär.
 * Adressen är samma som PUBLICERING.md anger för Elda-hemsidan.
 */
export const REGISTRATION_URL = 'https://elda-6a9.pages.dev/registrera.html';

/**
 * Inloggning med enbart användarnamn och lösenord.
 *
 * Formuläret validerar bara indata och skickar sedan uppgifterna vidare till
 * AuthContext → Edge Functionen `auth-login`, som kopplar användarnamnet till
 * rätt konto serversidigt och låter Supabase Auth verifiera lösenordet.
 * Inga konton, lösenord eller roller finns i klientkoden, och det finns ingen
 * registrering här: nya konton skapas av registreringsboten på hemsidan.
 *
 * Har kontot kvar sitt tillfälliga lösenord lämnar servern ingen session. Då
 * visar samma vy steget för att välja ett eget lösenord, och inloggningen görs
 * om med det nya lösenordet i samma anrop. Spärren är alltså serverns — den här
 * vyn är bara hur steget blir begripligt för användaren.
 */
export const Login: React.FC = () => {
  const { theme, toggle } = useTheme();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Servern svarade att kontot har ett tillfälligt lösenord kvar.
  const [mustSetNewPassword, setMustSetNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    // Steg 1: användarnamn och lösenord.
    if (!mustSetNewPassword) {
      if (!username.trim() || !password) {
        setError('Fyll i både användarnamn och lösenord.');
        return;
      }

      setLoading(true);
      setError(null);

      // Panelen bestäms efteråt av den betrodda rollen i svaret (se App).
      const result = await login(username.trim(), password);
      setLoading(false);

      if (result.ok) return;
      if (result.mustSetNewPassword) {
        // Ingen session lämnades ut: kontot har kvar sitt tillfälliga lösenord.
        setMustSetNewPassword(true);
        return;
      }
      // Generiskt meddelande från servern — avslöjar aldrig om kontot finns.
      setError(result.error);
      return;
    }

    // Steg 2: eget lösenord. Servern byter det i samma anrop som inloggningen.
    const problem = validateNewPassword(newPassword, confirmPassword, username.trim());
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await login(username.trim(), password, newPassword);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
    }
  };

  /** Tillbaka till inloggningsfälten utan att något skickas till servern. */
  const backToLogin = () => {
    setMustSetNewPassword(false);
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  return (
    <div className="login-wrap">
      {/* Identitetssida med bannern */}
      <div className="login-identity">
        <div className="login-banner">
          <img src="/login-banner.png" alt="Vy över Ronneby" />
        </div>
        <h1>Välkommen till Elda</h1>
        <p>Logga in med ditt användarnamn och lösenord för att fortsätta.</p>
      </div>

      {/* Formulärsida */}
      <div className="login-form-side">
        <div className="login-theme">
          <button
            className="icon-btn"
            type="button"
            onClick={toggle}
            aria-label={theme === 'light' ? 'Växla till mörkt tema' : 'Växla till ljust tema'}
            title={theme === 'light' ? 'Mörkt tema' : 'Ljust tema'}
          >
            {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
          </button>
        </div>

        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <h2>{mustSetNewPassword ? 'Skapa nytt lösenord' : 'Logga in på Elda'}</h2>
          <p className="lead">
            {mustSetNewPassword
              ? 'Ditt konto har ett tillfälligt lösenord. Välj ett eget för att fortsätta.'
              : 'Logga in med kontot du har fått av din administratör.'}
          </p>

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
                <input
                  id="new-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  placeholder={`Minst ${MIN_PASSWORD_LENGTH} tecken`}
                />
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
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  placeholder="Skriv samma lösenord igen"
                />
                <p className="field-hint-reg">
                  Använd minst {MIN_PASSWORD_LENGTH} tecken. Lösenordet sparas
                  krypterat av Supabase Auth och kan aldrig läsas ut i klartext.
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
                  'Spara lösenordet och logga in'
                )}
              </button>

              <div className="field-hint">
                <button className="link-btn" type="button" onClick={backToLogin}>
                  Tillbaka
                </button>
              </div>
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
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  placeholder="T.ex. ejentu01"
                />
              </div>

              <div className="field">
                <label htmlFor="password">Lösenord</label>
                <div className="pw-wrap">
                  <input
                    id="password"
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    placeholder="Ditt lösenord"
                  />
                  <button
                    type="button"
                    className="toggle-pw"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Dölj lösenord' : 'Visa lösenord'}
                  >
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner" /> Loggar in...
                  </>
                ) : (
                  'Logga in'
                )}
              </button>

              <div className="field-hint">
                Har du glömt ditt lösenord? Kontakta administratören.
              </div>

              {/* Diskret hänvisning: konton skapas av registreringsboten på
                  hemsidan, aldrig här. Länken öppnas i systemets webbläsare, som
                  appens övriga externa länkar. */}
              <div className="field-hint">
                Behöver du ett konto? Besök Elda-hemsidan och använd
                registreringsboten.{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    window.open(REGISTRATION_URL, '_blank', 'noopener,noreferrer')
                  }
                >
                  Öppna registreringen
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
