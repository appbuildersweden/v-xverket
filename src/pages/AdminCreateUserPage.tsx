import React, { useEffect, useRef, useState } from 'react';
import { Check, User, Shield, AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

type Role = 'elev' | 'lärare' | 'speciallärare' | 'admin';

const roleLabels: Record<Role, string> = {
  elev: 'Elev',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  admin: 'Administratör',
};

/** Tillfälligt lösenord som nya konton får. Måste bytas vid första inloggningen. */
const TEMP_PASSWORD = 'student123';

/**
 * Skapa konto.
 *
 * Administratären anger förnamn och efternamn — användarnamnet genereras
 * automatiskt enligt regeln e + 3 bokstäver av förnamnet + 2 av efternamnet +
 * tvåsiffrigt löpnummer (t.ex. ejentu01). Numret väljs och reserveras
 * serversidigt, så samtidiga skapanden kan aldrig ge dubbletter.
 *
 * Nya konton får automatiskt det tillfälliga lösenordet student123 och måste
 * byta det vid första inloggningen.
 */
export const AdminCreateUserPage: React.FC = () => {
  const { createAccount, suggestUsername } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [role, setRole] = useState<Role>('elev');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ username: string; role: Role } | null>(null);

  const seq = useRef(0);

  // Föreslå ett ledigt användarnamn direkt när namnet ändras. Servern räknar ut
  // förkortningen och nästa lediga löpnummer, så förslaget är alltid giltigt.
  useEffect(() => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first && !last) {
      setUsername('');
      return;
    }

    const ticket = ++seq.current;
    setUsernameBusy(true);

    const timer = setTimeout(async () => {
      const result = await suggestUsername(first, last);
      // Ett äldre svar får aldrig skriva över ett nyare.
      if (ticket !== seq.current) return;
      setUsernameBusy(false);
      if (result.ok) setUsername(result.username);
    }, 250);

    return () => clearTimeout(timer);
  }, [firstName, lastName, suggestUsername]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!firstName.trim() || !lastName.trim()) {
      setError('Ange både förnamn och efternamn.');
      return;
    }
    if (!username) {
      setError('Användarnamnet är inte klart att användas ännu. Vänta en stund och försök igen.');
      return;
    }

    setLoading(true);
    setError(null);

    // Startlösenordet student123 skickas alltid — det är det enda tillfälliga
    // lösenordet och det måste bytas vid första inloggningen.
    const result = await createAccount({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      password: TEMP_PASSWORD,
    });

    setLoading(false);

    if (result.ok) {
      setSuccess({ username: result.username, role: result.role });
    } else {
      setError(result.error);
    }
  };

  const reset = () => {
    setSuccess(null);
    setFirstName('');
    setLastName('');
    setUsername('');
    setRole('elev');
    setError(null);
    seq.current += 1;
  };

  return (
    <div className="admin-create-user">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Skapa nytt konto</div>
            <div className="card-sub">
              Användarnamnet skapas automatiskt från förnamn och efternamn
            </div>
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
              är skapat.
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
              <div className="admin-create-info-row">
                <span className="admin-create-info-label">Tillfälligt lösenord</span>
                <span className="admin-create-info-value">{TEMP_PASSWORD}</span>
              </div>
            </div>

            <p className="admin-create-caveat">
              Det tillfälliga lösenordet är <strong>{TEMP_PASSWORD}</strong>. Användaren loggar in
              med användarnamn och detta lösenord, och måste sedan skapa ett eget lösenord vid
              första inloggningen innan panelerna öppnas. Lösenordet kan inte visas igen efter
              att sidan uppdateras.
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigator.clipboard?.writeText(success.username).catch(() => {})}
              >
                Kopiera användarnamn
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigator.clipboard?.writeText(TEMP_PASSWORD).catch(() => {})}
              >
                Kopiera lösenord
              </button>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              onClick={reset}
              style={{ marginTop: 12 }}
            >
              Skapa ett nytt konto
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="admin-first-name">
                <User size={14} />
                Förnamn
              </label>
              <input
                id="admin-first-name"
                className="input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
                placeholder="T.ex. Jens"
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label htmlFor="admin-last-name">
                <User size={14} />
                Efternamn
              </label>
              <input
                id="admin-last-name"
                className="input"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
                placeholder="T.ex. Turesson"
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label htmlFor="admin-username">
                <Shield size={14} />
                Användarnamn (skapas automatiskt)
              </label>
              <input
                id="admin-username"
                className="input"
                type="text"
                value={username}
                readOnly
                disabled
                placeholder="Fyll i namn först"
                aria-live="polite"
              />
              <p className="field-hint-reg">
                {usernameBusy
                  ? 'Kontrollerar nästa lediga nummer…'
                  : 'Regeln: e + 3 bokstäver av förnamnet + 2 av efternamnet + löpnummer, t.ex. ejentu01. Numret väljs av servern och är unikt.'}
              </p>
            </div>

            <div className="field-hint-reg" style={{ marginTop: 4, padding: '8px 10px', background: 'var(--hover)', borderRadius: 8 }}>
              Nya konton får automatiskt det tillfälliga lösenordet <strong>{TEMP_PASSWORD}</strong>.
              Lösenordet visas inte här, men det visas efter att kontot skapats så att du kan
              ge det till användaren. Användaren måste byta det vid första inloggningen.
            </div>

            <div className="field" style={{ marginTop: 14 }}>
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
                <label className={`role-option ${role === 'lärare' ? 'sel' : ''}`}>
                  <input
                    type="radio"
                    name="admin-role"
                    value="lärare"
                    checked={role === 'lärare'}
                    onChange={() => setRole('lärare')}
                    disabled={loading}
                  />
                  <User size={15} />
                  <span>Lärare</span>
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
              disabled={
                loading || !firstName.trim() || !lastName.trim() || !username
              }
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
              Kontot skapas via en skyddad serverfunktion. Användarnamnet kontrolleras och
              reserveras på servern, och lösenordet hanteras av Supabase Auth — aldrig i
              klartext.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
