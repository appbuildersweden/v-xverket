import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from '../router';

export const Login: React.FC = () => {
  const { theme, toggle } = useTheme();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!username.trim() || !password) {
      setError('Fyll i både användarnamn och lösenord.');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await login(username.trim(), password);
    setLoading(false);

    if (result.ok) {
      // Login lyckades, nu omdirigeras användaren automatiskt till rätt panel
      // (AppContenthanterar detta).
      navigate.setShowProfile(false);
      // Försök navigera till standardpanelen direkt — auth-lagren omdirigerar
      // men vi vill inte vänta på nästa render för att visa något.
      const panel =
        result.user.role === 'admin'
          ? 'admin'
          : result.user.role === 'speciallärare'
          ? 'speciallarar'
          : 'elev';
      navigate.setActivePanel(panel);
      navigate.setActivePage('start');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-wrap">
      {/* Identitetssida med bannern */}
      <div className="login-identity">
        <div className="login-banner">
          <img src="/login-banner.png" alt="Växverket — vy över Ronneby" />
        </div>
        <h1>Välkommen tillbaka</h1>
        <p>Din plats för lärande, planering och utveckling.</p>
      </div>

      {/* Formulärsida */}
      <div className="login-form-side">
        <div className="login-theme">
          <button
            className="icon-btn"
            onClick={toggle}
            aria-label={
              theme === 'light' ? 'Växla till mörkt tema' : 'Växla till ljust tema'
            }
            title={theme === 'light' ? 'Mörkt tema' : 'Ljust tema'}
          >
            {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
          </button>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Logga in på Växverket</h2>
          <p className="lead">
            Logga in med kontot du har fått av din administratör.
          </p>

          {error && <div className="login-err" role="alert">{error}</div>}

          <div className="field">
            <label htmlFor="username">Användarnamn</label>
            <input
              id="username"
              className="input"
              type="text"
              autoComplete="username"
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
                placeholder=" ******************"
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

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading}
          >
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
        </form>
      </div>
    </div>
  );
};
