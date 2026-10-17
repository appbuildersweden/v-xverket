import React, { useEffect, useRef, useState } from 'react';
import { Moon, Sun, AlertCircle, Check, LogOut, KeyRound, RefreshCw } from 'lucide-react';
import { UpdaterStatus } from '../components/UpdaterStatus';
import { checkForUpdate, type UpdateCheckResult } from '../lib/update';

import { useTheme } from '../theme';
import { useAuth } from '../lib/AuthContext';
import { TEACHER_FEATURES } from '../lib/features';

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
  const { user, logout, changePassword, updateFeatures } = useAuth();

  // Rollens riktiga namn — panelen är gemensam för lärare och speciallärare,
  // men etiketten ska visa kontots roll.
  const roleNames: Record<string, string> = {
    admin: 'Administratör',
    lärare: 'Lärare',
    speciallärare: 'Speciallärare',
    elev: 'Elev',
  };
  const roleName = roleNames[user?.role ?? ''] ?? roleLabels[role];
  const isStaffTeacher = user?.role === 'lärare' || user?.role === 'speciallärare';

  // Funktionsvalen kommer från profilen (sparade vid registreringen).
  const [featureSel, setFeatureSel] = useState<string[]>(user?.features ?? []);
  const [featureBusy, setFeatureBusy] = useState(false);
  const [featureMsg, setFeatureMsg] = useState<string | null>(null);
  const [featureOk, setFeatureOk] = useState(false);

  useEffect(() => {
    setFeatureSel(user?.features ?? []);
  }, [user?.features]);

  const toggleFeature = (value: string) => {
    setFeatureOk(false);
    setFeatureMsg(null);
    setFeatureSel((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  const saveFeatures = async () => {
    if (featureBusy) return;
    setFeatureBusy(true);
    setFeatureMsg(null);
    const result = await updateFeatures(featureSel);
    setFeatureBusy(false);
    if (result.ok) {
      setFeatureOk(true);
    } else {
      setFeatureMsg(result.error);
    }
  };

  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  const [lastManualResult, setLastManualResult] = useState<UpdateCheckResult | null>(null);
  const [updaterChecking, setUpdaterChecking] = useState(false);
  const [updaterCheckedAt, setUpdaterCheckedAt] = useState<Date | null>(null);
  const updaterCheckRef = useRef(false);

  // Kontrollera efter uppdatering enligt ett rimligt intervall. Detta körs aldrig
  // innan inloggningen är klar, och användaren kan alltid välja att kontrollera
  // igen manuellt i samma vy.
  useEffect(() => {
    if (!user || updaterCheckRef.current) return;
    updaterCheckRef.current = true;

    const timer = setTimeout(async () => {
      setUpdaterChecking(true);
      const r = await checkForUpdate();
      setUpdaterChecking(false);
      setUpdaterCheckedAt(new Date());
      if (r.error) {
        // Fel vid kontroll visas inte som en avisering, men sparas så att
        // användaren kan se att kontrollen försökt.
        setLastManualResult({ ...r, error: r.error });
      } else if (r.available) {
        setLastManualResult(r);
      } else {
        setLastManualResult(r);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [user]);

  const handleManualUpdateCheck = async () => {
    setUpdaterChecking(true);
    const r = await checkForUpdate();
    setUpdaterChecking(false);
    setUpdaterCheckedAt(new Date());
    setLastManualResult(r);
  };

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
              {roleName} • Elda
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Stäng
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="profile-row">
            <span className="k">Roll</span>
            <span className="v">{roleName}</span>
          </div>
          {isStaffTeacher && (
            <div className="profile-row">
              <span className="k">Granskning</span>
              <span className="v">
                {user?.limited ? 'Väntar på granskning (begränsad åtkomst)' : 'Godkänd'}
              </span>
            </div>
          )}
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
        </form>        {/* Funktionsval — samma val som gjordes i registreringen, ändringsbara. */}
        {isStaffTeacher && (
          <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>Funktioner i panelen</div>
            <div className="card-sub">
              Valen sparas på kontot och styr menyn på alla enheter.
            </div>
            {featureMsg && (
              <div className="login-err" role="alert">
                <AlertCircle size={15} />
                {featureMsg}
              </div>
            )}
            {featureOk && (
              <div
                className="login-err"
                role="status"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Check size={15} /> Valen har sparats.
              </div>
            )}
            <div style={{ display: 'grid', gap: 8, margin: '10px 0 14px' }}>
              {TEACHER_FEATURES.map((feature) => (
                <label
                  key={feature}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={featureSel.includes(feature)}
                    onChange={() => toggleFeature(feature)}
                    disabled={featureBusy}
                  />
                  {feature}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveFeatures()}
              disabled={featureBusy || featureSel.length === 0}
            >
              {featureBusy ? (
                <>
                  <span className="spinner" /> Sparar…
                </>
              ) : (
                'Spara funktioner'
              )}
            </button>
          </div>
        )}

        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button className="btn btn-outline" onClick={() => void logout()}>
            <LogOut size={15} /> Logga ut
          </button>
        </div>

        {/* Uppdateringsstatus och manuell kontroll */}
        <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              <RefreshCw size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
              Uppdateringar
            </div>
            <button className="btn btn-outline btn-sm" onClick={handleManualUpdateCheck} disabled={updaterChecking}>
              {updaterChecking ? 'Kontrollerar…' : 'Sök efter uppdateringar'}
            </button>
          </div>

          <UpdaterStatus
            lastManualResult={lastManualResult}
            checking={updaterChecking}
            lastChecked={updaterCheckedAt}
          />
        </div>
      </div >
    </div>
  );
};
