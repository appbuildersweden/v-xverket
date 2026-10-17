import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import {
  checkForUpdate,
  fetchPublishedUpdate,
  isTauri,
  loadCurrentVersion,
  updateNow,
  type PublishedUpdate,
  type UpdateCheckResult,
} from '../../lib/update';

const formatDate = (value: string | null): string => {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString('sv-SE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Uppdateringar – verklig status från uppdateringsflödet.
 *
 * I den installerade appen används Tauri-uppdateraren (samma kontroll som
 * uppdateringsrutan). I webbläsaren finns ingen uppdaterare, så då visas i
 * stället den version som faktiskt ligger publicerad i update.json.
 */
export const AdminUpdatesPage: React.FC = () => {
  const [installed, setInstalled] = useState<string>('');
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [published, setPublished] = useState<PublishedUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refresh = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setError(null);
    setInstalled(await loadCurrentVersion());

    if (isTauri()) {
      const check = await checkForUpdate();
      setResult(check);
      if (check.error) setError(check.error);
    } else {
      const { info, error: fetchError } = await fetchPublishedUpdate();
      setPublished(info);
      if (fetchError) setError(fetchError);
    }

    setCheckedAt(new Date());
    setChecking(false);
  }, [checking]);

  useEffect(() => {
    void refresh();
    // Körs en gång när vyn öppnas; knappen finns för att kontrollera igen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runUpdate = async () => {
    setUpdating(true);
    setUpdateError(null);
    setProgress(null);
    let total = 0;
    let received = 0;
    try {
      await updateNow((event) => {
        if (event.event === 'Started') {
          total = event.data?.contentLength ?? 0;
          setProgress(0);
        } else if (event.event === 'Progress') {
          received += event.data?.chunkLength ?? 0;
          if (total > 0) {
            setProgress(Math.min(100, Math.round((received / total) * 100)));
          }
        } else if (event.event === 'Finished') {
          setProgress(100);
        }
      });
      setDone(true);
    } catch (err) {
      setUpdateError(
        err instanceof Error && err.message
          ? err.message
          : 'Uppdateringen misslyckades. Försök igen.',
      );
    }
    setUpdating(false);
  };

  const latestVersion = isTauri()
    ? result?.latestVersion ?? null
    : published?.version ?? null;
  const notes = isTauri() ? result?.body ?? null : published?.notes ?? null;
  const available = isTauri() ? result?.available === true : false;

  const status = (() => {
    if (checking && !checkedAt) return 'Kontrollerar…';
    if (error) return 'Kunde inte kontrollera';
    if (!isTauri()) {
      return published ? `Publicerad version ${published.version}` : 'Ingen publicerad version';
    }
    if (result?.available) return `Ny version ${result.latestVersion} finns`;
    return 'Appen är uppdaterad';
  })();

  return (
    <div className="admin-page">
      <div className="card">
        <div className="admin-section-head">
          <div>
            <div className="card-title">Uppdateringar</div>
            <div className="card-sub">
              Verklig status från appens uppdateringsflöde — inga exempelvärden.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void refresh()}
            disabled={checking || updating}
          >
            <RefreshCw size={14} className={checking ? 'spin' : undefined} />
            {checking ? 'Kontrollerar…' : 'Sök efter uppdateringar'}
          </button>
        </div>

        {error && (
          <div className="login-err" role="alert" style={{ marginBottom: 14 }}>
            <AlertCircle size={15} />
            <span>{error}</span>
            <button className="view-link" onClick={() => void refresh()}>
              Försök igen
            </button>
          </div>
        )}

        <dl className="admin-meta">
          <div>
            <dt>Installerad version</dt>
            <dd>{isTauri() ? installed || '…' : 'Endast i den installerade appen'}</dd>
          </div>
          <div>
            <dt>Senaste version</dt>
            <dd>{latestVersion ?? '–'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span
                className={`badge ${available ? 'badge-solid' : ''}`}
                aria-live="polite"
              >
                {status}
              </span>
            </dd>
          </div>
          <div>
            <dt>Senast kontrollerad</dt>
            <dd>{checkedAt ? formatDate(checkedAt.toISOString()) : 'Aldrig'}</dd>
          </div>
          <div>
            <dt>Publicerad</dt>
            <dd>{formatDate(isTauri() ? result?.date ?? null : published?.date ?? null)}</dd>
          </div>
          <div>
            <dt>Kanal</dt>
            <dd>Stabil (Windows x64)</dd>
          </div>
        </dl>

        {notes && (
          <div className="admin-update-notes">
            <div className="admin-update-notes-title">Vad ändrades</div>
            <p>{notes}</p>
          </div>
        )}

        {updating && (
          <div className="admin-update-progress" aria-live="polite">
            <div className="admin-update-progress-row">
              <Download size={14} className="spin" />
              <span>
                {progress != null ? `Laddar ner… ${progress}%` : 'Laddar ner uppdateringen…'}
              </span>
            </div>
            <div className="admin-update-bar" aria-hidden="true">
              <div
                className="admin-update-fill"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {done && (
          <div className="admin-update-ok" role="status">
            <CheckCircle2 size={15} />
            Uppdateringen är nerladdad och installeras. Appen startar om automatiskt.
          </div>
        )}

        {updateError && (
          <div className="login-err" role="alert" style={{ marginTop: 12 }}>
            <AlertCircle size={15} />
            <span>{updateError}</span>
          </div>
        )}

        <div className="admin-update-actions">
          {isTauri() && available && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void runUpdate()}
              disabled={updating || done}
            >
              <Download size={14} />
              {updating ? 'Uppdaterar…' : 'Uppdatera nu'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void refresh()}
            disabled={checking || updating}
          >
            <RefreshCw size={14} className={checking ? 'spin' : undefined} />
            Kontrollera igen
          </button>
        </div>

        {!isTauri() && (
          <p className="admin-muted admin-update-hint">
            Uppdateringar installeras i den installerade Windows-appen. Här visas
            versionen som ligger publicerad och som appen erbjuds vid nästa
            kontroll.
          </p>
        )}
      </div>
    </div>
  );
};
