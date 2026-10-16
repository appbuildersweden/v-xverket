import React, { useState } from 'react';
import { KeyRound, Check, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

/** Det kända tillfälliga lösenordet får inte väljas som sitt eget. */
const TEMP_PASSWORD = 'student123';
const MIN_LENGTH = 8;

/**
 * Obligatoriskt lösenordsbyte vid första inloggningen.
 *
 * Visas i stället för panelerna så länge användarens konto har flaggan
 * must_change_password. Flaggan ägs av servern (profiles.must_change_password)
 * och nollas först när Supabase Auth har sparat det nya lösenordet — därför går
 * steget inte att hoppa över genom att ladda om appen eller byta vy.
 */
export const ChangePasswordPage: React.FC = () => {
  const { changePassword, user } = useAuth();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const validate = (): string | null => {
    if (!pw1 || !pw2) return 'Fyll i båda fälten.';
    if (pw1.length < MIN_LENGTH) {
      return `Lösenordet måste vara minst ${MIN_LENGTH} tecken.`;
    }
    if (pw1.toLowerCase() === TEMP_PASSWORD) {
      return 'Du kan inte använda det tillfälliga lösenordet. Välj ett eget.';
    }
    if (pw1 !== pw2) return 'Lösenorden stämmer inte överens.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await changePassword(pw1);

    setLoading(false);
    if (result.ok) {
      setDone(true);
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-identity">
        <div className="login-banner">
          <img src="/login-banner.png" alt="Vy över Ronneby" />
        </div>
        <h1>Välkommen till Elda</h1>
        <p>Ett sista steg innan du kommer in: välj ett eget lösenord.</p>
      </div>

      <div className="login-form-side">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Skapa nytt lösenord</h2>
          <p className="lead">
            {user?.username ? (
              <>
                Ditt konto <strong>{user.username}</strong> har ett tillfälligt
                lösenord. Välj ett eget för att fortsätta.
              </>
            ) : (
              'Ditt konto har ett tillfälligt lösenord. Välj ett eget för att fortsätta.'
            )}
          </p>

          {error && (
            <div className="login-err" role="alert">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {done ? (
            <div className="admin-create-success">
              <div className="admin-create-success-icon">
                <Check size={26} />
              </div>
              <h3>Lösenordet är sparat</h3>
              <p>Du skickas vidare till din panel.</p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="new-password">
                  <KeyRound size={14} />
                  Nytt lösenord
                </label>
                <input
                  id="new-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  disabled={loading}
                  placeholder={`Minst ${MIN_LENGTH} tecken`}
                />
              </div>

              <div className="field">
                <label htmlFor="confirm-password">
                  <ShieldCheck size={14} />
                  Bekräfta nytt lösenord
                </label>
                <input
                  id="confirm-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  disabled={loading}
                  placeholder="Skriv samma lösenord igen"
                />
                <p className="field-hint-reg">
                  Använd minst {MIN_LENGTH} tecken. Lösenordet sparas krypterat och
                  kan aldrig läsas ut i klartext.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary login-btn"
                disabled={loading || !pw1 || !pw2}
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Sparar…
                  </>
                ) : (
                  'Spara lösenordet'
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
