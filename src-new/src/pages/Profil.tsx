import React, { useState } from 'react';
import { AlertCircle, Check, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../theme';
import { ROLE_LABELS, PanelType, PANEL_LABELS } from '../lib/nav';
import { isKnownRole } from '../lib/auth-types';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/password';
import { UpdateSettings } from '../components/UpdateSettings';

interface ProfilProps {
  panel: PanelType;
  onClose: () => void;
}

/**
 * Profil & inställningar. Visar den serverstyrda kontoinformationen (användarnamn
 * och roll — inget som går att ändra härifrån), temaväljare, uppdateringar,
 * frivilligt lösenordsbyte och utloggning som avslutar sessionen på riktigt.
 *
 * Sidan är gemensam för alla roller: admin, elev, privat elev, lärare och
 * speciallärare når den via kontomenyn och sidomenyn, och alla kan därför söka
 * efter uppdateringar själva.
 */
export const Profil: React.FC<ProfilProps> = ({ panel, onClose }) => {
  const { user, changePassword, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const roleLabel = user && isKnownRole(user.role) ? ROLE_LABELS[user.role] : 'Ingen roll';

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const problem = validateNewPassword(pw1, pw2, user?.username);
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
      setPw1('');
      setPw2('');
    } else {
      setError(result.error);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
  };

  return (
    <div className="profil-page" data-testid="profil-page">
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Konto</h2>
          <span className="card-sub">Uppgifterna sätts av en administratör</span>
        </div>
        <div className="list-item">
          <div className="list-item-content">
            <div className="list-item-title">Användarnamn</div>
            <div className="list-item-sub">{user?.username ?? '—'}</div>
          </div>
        </div>
        <div className="list-item">
          <div className="list-item-content">
            <div className="list-item-title">Roll</div>
            <div className="list-item-sub">
              {roleLabel} <span className="badge">{PANEL_LABELS[panel]}</span>
            </div>
          </div>
        </div>
        <div className="list-item">
          <div className="list-item-content">
            <div className="list-item-title">Status</div>
            <div className="list-item-sub">
              {user?.active === false ? 'Inaktiverat' : 'Aktivt'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Utseende</h2>
          <span className="card-sub">Temat sparas på den här datorn</span>
        </div>
        <div className="grid-2">
          <button
            type="button"
            className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
          >
            <Sun size={16} /> Ljust
          </button>
          <button
            type="button"
            className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
          >
            <Moon size={16} /> Mörkt
          </button>
        </div>
      </div>

      <UpdateSettings />

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Byt lösenord</h2>
          <span className="card-sub">
            Lösenordet hanteras av autentiseringstjänsten
          </span>
        </div>

        {error && (
          <div className="login-err" role="alert">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        {done && (
          <div className="chat-notice" role="status">
            <Check size={15} /> Lösenordet är uppdaterat.
          </div>
        )}

        <form onSubmit={handlePassword}>
          <div className="field">
            <label htmlFor="profil-pw1">Nytt lösenord</label>
            <input
              id="profil-pw1"
              className="input"
              type="password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              disabled={loading}
              placeholder={`Minst ${MIN_PASSWORD_LENGTH} tecken`}
            />
          </div>
          <div className="field">
            <label htmlFor="profil-pw2">Bekräfta nytt lösenord</label>
            <input
              id="profil-pw2"
              className="input"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              disabled={loading}
              placeholder="Skriv samma lösenord igen"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !pw1 || !pw2}
          >
            {loading ? 'Sparar…' : 'Spara nytt lösenord'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Session</h2>
          <span className="card-sub">Logga ut avslutar sessionen</span>
        </div>
        <div className="grid-2">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Tillbaka
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut size={16} /> {loggingOut ? 'Loggar ut…' : 'Logga ut'}
          </button>
        </div>
      </div>
    </div>
  );
};
