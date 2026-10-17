import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Check } from 'lucide-react';
import type { UpdateCheckResult } from '../lib/update';

interface UpdaterStatusProps {
  /** När användaren manuellt begärt en kontroll visas resultatet här. */
  lastManualResult: UpdateCheckResult | null;
  /** Om en kontroll pågår. */
  checking: boolean;
  /** Datum/tid för senaste kontroll som faktiskt utförts (automatisk eller manuell). */
  lastChecked: Date | null;
}

export const UpdaterStatus: React.FC<UpdaterStatusProps> = ({
  lastManualResult,
  checking,
  lastChecked,
}) => {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    setNow(new Date());
    return () => clearInterval(t);
  }, []);

  const label =
    lastManualResult?.error ??
    (lastManualResult?.available ? 'Ny version tillgänglig' : 'Ingen ny version');

  return (
    <div className="updater-status">
      <div className="updater-status-row">
        <RefreshCw
          size={14}
          className={checking ? 'spin' : ''}
          style={{ flexShrink: 0 }}
        />
        <span className="updater-status-kv-label">Senaste kontrollen</span>
        <span className="updater-status-kv-value">
          {now ? (
            <>
              {lastChecked ? (
                <>
                  {lastChecked.toLocaleString('sv-SE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {checking ? ' (pågår)' : ''}
                </>
              ) : (
                'Aldrig'
              )}
            </>
          ) : (
            '—'
          )}
        </span>
      </div>

      {lastManualResult && (
        <div className="updater-status-row">
          <span className="updater-status-kv-label">Resultat</span>
          <span className="updater-status-kv-value">
            {lastManualResult.error ? (
              <span className="updater-status-error">
                <AlertCircle size={13} /> {lastManualResult.error}
              </span>
            ) : lastManualResult.available ? (
              <span className="updater-status-available">
                <AlertCircle size={13} /> Ny version {lastManualResult.latestVersion}
              </span>
            ) : (
              <span className="updater-status-ok">
                <Check size={13} /> {label}
              </span>
            )}
          </span>
        </div>
      )}

      {lastManualResult?.body && (
        <div className="updater-notes">
          <div className="updater-notes-title">Vad ändrades</div>
          <pre className="updater-notes-body">{lastManualResult.body}</pre>
        </div>
      )}
    </div>
  );
};
