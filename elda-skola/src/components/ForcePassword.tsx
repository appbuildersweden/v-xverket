import React, { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/password';

export const ForcePassword: React.FC = () => {
  const { identity, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = validateNewPassword(next, confirm, identity?.username);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await changePassword(current, next);
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'Lösenordet kunde inte bytas.');
  };

  return (
    <div className="login-wrap">
      <div className="login-identity">
        <div className="login-banner">
          <img src="ronneby.webp" alt="Ronnebyån" />
          <div className="login-banner-shade" />
          <img className="login-banner-mark" src="elda-icon.png" alt="Elda" />
          <span className="login-banner-caption">En trygg plats för lärande</span>
        </div>
        <h1>Ett sista steg</h1>
        <p>Ditt konto har ett tillfälligt lösenord. Välj ett eget för att komma in i Elda Skola.</p>
      </div>
      <div className="login-form-side">
        <form className="login-card" onSubmit={submit}>
          <h2>Skapa nytt lösenord</h2>
          <p className="lead">Kontot {identity?.username ? <strong>{identity.username}</strong> : ''} behöver ett eget lösenord.</p>
          {error && (
            <div className="login-err" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="current-password">Nuvarande lösenord</label>
            <input
              id="current-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="force-new">
              <KeyRound size={14} /> Nytt lösenord
            </label>
            <input
              id="force-new"
              className="input"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              disabled={busy}
              placeholder={`Minst ${MIN_PASSWORD_LENGTH} tecken`}
            />
          </div>
          <div className="field">
            <label htmlFor="force-confirm">
              <ShieldCheck size={14} /> Bekräfta nytt lösenord
            </label>
            <input
              id="force-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              disabled={busy}
            />
          </div>
          <button type="submit" className="btn btn-primary login-btn" disabled={busy}>
            {busy ? 'Sparar…' : 'Spara lösenord'}
          </button>
          <button type="button" className="link-btn login-back" onClick={() => void logout()}>
            Logga ut
          </button>
        </form>
      </div>
    </div>
  );
};
