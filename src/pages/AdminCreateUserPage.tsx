import React, { useState } from 'react';
import { Check, User, Shield, AlertCircle, KeyRound } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

type Role = 'elev' | 'speciallärare' | 'admin';

const roleLabels: Record<Role, string> = {
  elev: 'Elev',
  speciallärare: 'Speciallärare',
  admin: 'Administratör',
};

export const AdminCreateUserPage: React.FC = () => {
  const { createAccount } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('elev');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ username: string; role: Role } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!username.trim()) {
      setError('Ange ett användarnamn.');
      return;
    }
    if (password.length < 8) {
      setError('Lösenordet måste vara minst 8 tecken.');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createAccount({ username: username.trim(), password, role });

    setLoading(false);

    if (result.ok) {
      setSuccess({ username: result.username, role: result.role });
    } else {
      setError(result.error);
    }
  };

  const reset = () => {
    setSuccess(null);
    setUsername('');
    setPassword('');
    setRole('elev');
    setError(null);
  };

  return (
    <div className="admin-create-user">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Skapa nytt konto</div>
            <div className="card-sub">Konton skapas och hanteras endast av administratörer</div>
          </div>
          {success && (
            <button className="btn btn-outline btn-sm" onClick={reset}>
              Nytt konto
            </button>
          )}
        </div>

        {error && (
          <div className="login-err" role="alert">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {success ? (
          <div className="admin-create-success">
            <div className="admin-create-success-icon">
              <Check size={26} />
            </div>
            <h3>Kontot skapat</h3>
            <p>
              Kontot för <strong>{success.username}</strong> ({roleLabels[success.role]})
              är skapat. Användaren loggar in med användarnamn och lösenord.
            </p>

            <div className="admin-create-info">
              <div className="admin-create-info-row">
                <span className="admin-create-info-label">Användarnamn</span>
                <span className="admin-create-info-value">{success.username}</span>
              </div>
              <div className="admin-create-info-row">
                <span className="admin-create-info-label">Roll</span>
                <span className="admin-create-info-value">{roleLabels[success.role]}</span>
              </div>
            </div>

            <p className="admin-create-caveat">
              Lösenordet sparas inte och kan inte visas igen. Dela det med användaren på
              ett säkert sätt — användaren kan sedan be administratören att byta det.
            </p>

            <button
              type="button"
              className="btn btn-outline"
              onClick={reset}
              style={{ marginTop: 8 }}
            >
              Skapa ett nytt konto
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="admin-username">
                <User size={14} />
                Användarnamn
              </label>
              <input
                id="admin-username"
                className="input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                disabled={loading}
                placeholder="T.ex. klass7a_elev1"
                autoComplete="off"
              />
              <p className="field-hint-reg">
                3–32 tecken: små bokstäver, siffror, punkt, bindestreck eller understreck.
                Måste vara unikt.
              </p>
            </div>

            <div className="field">
              <label htmlFor="admin-password">
                <KeyRound size={14} />
                Tillfälligt lösenord
              </label>
              <input
                id="admin-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="Minst 8 tecken"
                autoComplete="new-password"
              />
              <p className="field-hint-reg">
                Ange ett startlösenord som användaren byter vid första inloggningen.
                Lösenordet kan inte visas igen efter att kontot skapats.
              </p>
            </div>

            <div className="field">
              <label className="field-label-top">Tilldela roll</label>
              <div className="role-chooser">
                <label className={`role-option ${role === 'elev' ? 'sel' : ''}`}>
                  <input
                    type="radio"
                    name="admin-role"
                    value="elev"
                    checked={role === 'elev'}
                    onChange={() => setRole('elev')}
                    disabled={loading}
                  />
                  <User size={15} />
                  <span>Elev</span>
                </label>
                <label className={`role-option ${role === 'speciallärare' ? 'sel' : ''}`}>
                  <input
                    type="radio"
                    name="admin-role"
                    value="speciallärare"
                    checked={role === 'speciallärare'}
                    onChange={() => setRole('speciallärare')}
                    disabled={loading}
                  />
                  <Shield size={15} />
                  <span>Speciallärare</span>
                </label>
                <label className={`role-option ${role === 'admin' ? 'sel' : ''}`}>
                  <input
                    type="radio"
                    name="admin-role"
                    value="admin"
                    checked={role === 'admin'}
                    onChange={() => setRole('admin')}
                    disabled={loading}
                  />
                  <Shield size={15} />
                  <span>Admin</span>
                </label>
              </div>
              <p className="field-hint-reg">
                Välj vilken roll användaren ska ha. Rollen kan inte ändras av användaren själv.
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !username.trim() || !password}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Skapar…
                </>
              ) : (
                'Skapa konto'
              )}
            </button>

            <p className="admin-create-note">
              Kontot skapas via en skyddad serverfunktion. Lösenordet hanteras av Supabase
              Auth och sparas aldrig i klartext.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
