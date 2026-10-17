import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  RefreshCw,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import type { AdminOverview } from '../../lib/auth';

interface Props {
  onNavigate: (pageId: string) => void;
}

const StatCard: React.FC<{
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ label, value, detail, icon, onClick }) => (
  <button type="button" className="stat-card admin-stat-button" onClick={onClick}>
    <div>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      <div className="det">{detail}</div>
    </div>
    <div className="stat-icon">{icon}</div>
  </button>
);

export const AdminOverviewPage: React.FC<Props> = ({ onNavigate }) => {
  const { getAdminOverview } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (foreground = false) => {
      if (foreground) setRefreshing(true);
      else setLoading(true);
      const result = await getAdminOverview();
      if (result.ok) {
        setOverview(result.overview);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [getAdminOverview],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const counts = overview?.counts;

  return (
    <div className="admin-page">
      <div className="banner">
        <h2>Administrativ översikt</h2>
        <p>
          Verkliga siffror från Eldas databas. Konton, roller och väntande
          registreringar uppdateras när du laddar om vyn.
        </p>
      </div>

      {error && (
        <div className="login-err" role="alert" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} />
          <span>{error}</span>
          <button className="view-link" onClick={() => void load(true)}>
            Försök igen
          </button>
        </div>
      )}

      {loading && !counts && !error && (
        <div className="admin-stat-grid" aria-busy="true" aria-live="polite">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div className="admin-skeleton admin-skeleton-card" key={n}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      )}

      {counts && (
        <>
          <div className="admin-section-head">
            <div>
              <h2 className="admin-section-title">Konton och roller</h2>
              <p className="admin-section-sub">
                Alla siffror är räknade direkt i databasen — inga exempelvärden.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
              {refreshing ? 'Uppdaterar…' : 'Uppdatera'}
            </button>
          </div>

          <div className="admin-stat-grid">
            <StatCard
              label="Konton totalt"
              value={counts.accounts}
              detail={`${counts.active} aktiva · ${counts.inactive} inaktiva`}
              icon={<Users size={18} />}
              onClick={() => onNavigate('anvandare')}
            />
            <StatCard
              label="Elever"
              value={counts.students}
              detail="Skolelever och privata elever"
              icon={<GraduationCap size={18} />}
              onClick={() => onNavigate('anvandare')}
            />
            <StatCard
              label="Lärare"
              value={counts.teachers}
              detail="Lärarkonton med egna klasser"
              icon={<BookOpen size={18} />}
              onClick={() => onNavigate('anvandare')}
            />
            <StatCard
              label="Speciallärare"
              value={counts.specialTeachers}
              detail="Konton med specialpedagogisk roll"
              icon={<UserCog size={18} />}
              onClick={() => onNavigate('anvandare')}
            />
            <StatCard
              label="Väntande registreringar"
              value={counts.pendingApplications}
              detail="Ansökningar som väntar på granskning"
              icon={<Clock size={18} />}
              onClick={() => onNavigate('anvandare')}
            />
            <StatCard
              label="Begränsade konton"
              value={counts.limited}
              detail="Aktiva men med begränsad åtkomst"
              icon={<AlertCircle size={18} />}
              onClick={() => onNavigate('anvandare')}
            />
          </div>

          <div className="grid-2" style={{ marginTop: 18, marginBottom: 0 }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Snabbåtgärder</div>
                  <div className="card-sub" style={{ marginBottom: 0 }}>
                    Det som används oftast i kontohanteringen
                  </div>
                </div>
              </div>
              <div className="admin-quick-actions">
                <button
                  type="button"
                  className="admin-quick-action"
                  onClick={() => onNavigate('create-user')}
                >
                  <span className="stat-icon" style={{ width: 34, height: 34 }}>
                    <UserPlus size={15} />
                  </span>
                  <span>
                    <b>Skapa konto</b>
                    <small>Nytt konto med rätt roll direkt</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="admin-quick-action"
                  onClick={() => onNavigate('anvandare')}
                >
                  <span className="stat-icon" style={{ width: 34, height: 34 }}>
                    <Users size={15} />
                  </span>
                  <span>
                    <b>Användare och konton</b>
                    <small>Sök, redigera, begränsa eller radera</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Väntande registreringar</div>
              {counts.pendingApplications > 0 ? (
                <>
                  <div className="admin-callout admin-callout--info">
                    <Clock size={16} />
                    <div>
                      <b>
                        {counts.pendingApplications} ansökan
                        {counts.pendingApplications === 1 ? '' : 'ar'} väntar
                      </b>
                      <p>
                        Godkänn, begränsa eller avslå dem i Användare och konton.
                        Besluten påverkar kontots status direkt.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onNavigate('anvandare')}
                  >
                    Granska ansökningarna
                  </button>
                </>
              ) : (
                <div className="admin-callout admin-callout--ok">
                  <Clock size={16} />
                  <div>
                    <b>Inga väntande registreringar</b>
                    <p>Alla ansökningar är redan hanterade.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
