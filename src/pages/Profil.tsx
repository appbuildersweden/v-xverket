import React, { useState } from 'react';
import { Moon, Sun, AlertCircle, Check, LogOut, KeyRound } from 'lucide-react';
import { useTheme } from '../theme';
import { useAuth } from '../lib/AuthContext';

interface ProfilProps {
  role: 'elev' | 'speciallarar' | 'admin';
  onClose: () => void;
}

const roleLabels: Record<ProfilProps['role'], string> = {
  elev: 'Elev',
  speciallarar: 'Speciallärare',
  admin: 'Administratör',
};

export const Profil: React.FC<ProfilProps> = ({ role, onClose }) => {
  const { theme, setTheme } = useTheme();
  const { user, logout, changePassword } = useAuth();

  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwBusy) return;
    if (newPw.length < 8) {
      setPwError('Lösenordet måste vara minst 8 tecken.');
      setPwOk(false);
      return;
    }
    setPwBusy(true);
    setPwError(null);
    setPwOk(false);
    const result = await changePassword(newPw);
    setPwBusy(false);
    if (result.ok) {
      setPwOk(true);
      setNewPw('');
    } else {
      setPwError(result.error);
    }
  };

  return (
    <div className="content">
      <div className="card profile-card">
        <div className="card-head">
          <div>
            <div className="card-title">Profil & inställningar</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              {roleLabels[role]} • Växverket
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Stäng
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="profile-row">
            <span className="k">Roll</span>
            <span className="v">{roleLabels[role]}</span>
          </div>
          <div className="profile-row">
            <span className="k">Användarnamn</span>
            <span className="v">{user?.username ?? '—'}</span>
          </div>
          <div className="profile-row">
            <span className="k">Kontostatus</span>
            <span className="v">{user?.active ? 'Aktiv' : 'Inaktiv'}</span>
          </div>
          <div className="profile-row">
            <span className="k">Tema</span>
            <span className="theme-choice">
              <button
                className={theme === 'light' ? 'sel' : ''}
                onClick={() => setTheme('light')}
                type="button"
              >
                <Sun size={15} /> Ljust
              </button>
              <button
                className={theme === 'dark' ? 'sel' : ''}
                onClick={() => setTheme('dark')}
                type="button"
              >
                <Moon size={15} /> Mörkt
              </button>
            </span>
          </div>
        </div>

        {/* Lösenordsbyte via autentiseringssystemet */}
        <form onSubmit={handlePassword} style={{ marginTop: 22 }}>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <KeyRound size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            Byt lösenord
          </div>
          <div className="card-sub">Lösenordet hanteras av autentiseringssystemet (Supabase Auth).</div>

          {pwError && (
            <div className="login-err" role="alert">
              <AlertCircle size={15} />
              {pwError}
            </div>
          )}
          {pwOk && (
            <div className="login-err" role="status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={15} />
              Lösenordet har uppdaterats.
            </div>
          )}

          <div className="field">
            <label htmlFor="new-password">Nytt lösenord</label>
            <input
              id="new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              disabled={pwBusy}
              placeholder="Minst 8 tecken"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pwBusy || !newPw}>
            {pwBusy ? (
              <>
                <span className="spinner" /> Sparar…
              </>
            ) : (
              'Spara lösenord'
            )}
          </button>
        </form>

        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button className="btn btn-outline" onClick={() => void logout()}>
            <LogOut size={15} /> Logga ut
          </button>
        </div>
      </div>
    </div>
  );
};
