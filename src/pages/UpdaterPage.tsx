import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Download, Check, AlertCircle } from 'lucide-react';
import {
  checkForUpdate,
  updateNow,
  currentBuiltVersion,
  loadCurrentVersion,
  type UpdateCheckResult,
} from '../lib/update';
import { type Update } from '@tauri-apps/plugin-updater';

interface UpdaterPageProps {
  onClose: () => void;
  lastManualResult: UpdateCheckResult | null;
}

const STAGE_IDLE = 'idle';
const STAGE_CHECKING = 'checking';
const STAGE_DOWNLOADING = 'downloading';
const STAGE_INSTALLING = 'installing';
const STAGE_DONE = 'done';
const STAGE_ERROR = 'error';

export const UpdaterPage: React.FC<UpdaterPageProps> = ({
  onClose,
  lastManualResult,
}) => {
  const [stage, setStage] = useState<
    (typeof STAGE_IDLE | typeof STAGE_CHECKING | typeof STAGE_DOWNLOADING | typeof STAGE_INSTALLING | typeof STAGE_DONE | typeof STAGE_ERROR)
  >(STAGE_IDLE);
  const [currentVersion, setCurrentVersion] = useState(currentBuiltVersion());
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [downloadTotal, setDownloadTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const updateRef = useRef<Update | null>(null);
  const progressBytes = useRef(0);
  const progressTotal = useRef(0);

  // Den installerade versionen läses asynkront från Tauri; innan svaret
  // kommer visas det värde som redan cachats (eller 0.0.0 i webbläsaren).
  useEffect(() => {
    let cancelled = false;
    void loadCurrentVersion().then((version) => {
      if (!cancelled) setCurrentVersion(version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (lastManualResult) {
      setResult(lastManualResult);
      if (lastManualResult.body) setNotes(lastManualResult.body);
      if (lastManualResult.latestVersion) setInstalledVersion(lastManualResult.latestVersion);
    }
  }, [lastManualResult]);

  const doCheck = async () => {
    setStage(STAGE_CHECKING);
    setError(null);
    setResult(null);
    setNotes(null);
    setDownloadPct(null);
    setDownloadTotal(null);
    setInstalledVersion(null);

    try {
      const r = await checkForUpdate();
      setResult(r);

      if (r.error) {
        setError(r.error);
        setStage(STAGE_ERROR);
        return;
      }

      if (r.available && r.latestVersion) {
        setInstalledVersion(r.latestVersion);
        setNotes(r.body ?? null);
      }
      setStage(STAGE_IDLE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte kontrollera.');
      setStage(STAGE_ERROR);
    }
  };

  const doUpdateNow = async () => {
    setStage(STAGE_CHECKING);
    setError(null);
    try {
      await updateNow((event) => {
        if (!event) return;
        if (event.event === 'Started') {
          progressTotal.current = 0;
          setDownloadTotal(0);
        } else if (event.event === 'Progress' && event.data?.chunkLength != null) {
          progressBytes.current += event.data.chunkLength;
          setDownloadPct(progressTotal.current > 0 ? Math.round((progressBytes.current / progressTotal.current) * 100) : 0);
        } else if (event.event === 'Finished') {
          setDownloadPct(100);
          setDownloadTotal(progressBytes.current);
        }
      });
      setStage(STAGE_DONE);
      setInstalledVersion(currentBuiltVersion());
      updateRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uppdateringen misslyckades.');
      setStage(STAGE_ERROR);
    }
  };

  return (
    <div className="updater-page">
      <div className="updater-card">
        <div className="updater-head">
          <div>
            <h2 className="updater-title">Uppdatera Elda</h2>
            <p className="updater-sub">
              Håll appen aktuell för att få de senaste funktionerna och förbättringarna.
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Stäng">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="updater-version-row">
          <div className="updater-version-item">
            <span className="updater-version-label">Installerad version</span>
            <span className="updater-version-value">{currentVersion}</span>
          </div>
          <div className="updater-version-item">
            <span className="updater-version-label">Senaste version</span>
            <span className="updater-version-value">
              {installedVersion ?? '—'}
            </span>
          </div>
        </div>

        {(stage === STAGE_DOWNLOADING || stage === STAGE_INSTALLING) && (
          <div className="updater-progress">
            {stage === STAGE_DOWNLOADING && (
              <div className="updater-progress-row">
                <Download size={15} className="spin" />
                <span>Laddar ner uppdateringen…</span>
                {downloadPct != null && downloadPct > 0 && (
                  <span className="updater-progress-pct">{downloadPct}%</span>
                )}
              </div>
            )}
            {stage === STAGE_INSTALLING && (
              <div className="updater-progress-row">
                <Check size={15} className="spin" />
                <span>Installerar uppdatering…</span>
              </div>
            )}
            {downloadPct != null && downloadPct > 0 && (
              <div className="updater-progress-bar">
                <div
                  className="updater-progress-fill"
                  style={{ width: `${downloadPct}%` }}
                />
              </div>
            )}
            {downloadTotal != null && downloadTotal > 0 && (
              <div className="updater-progress-size">
                {Math.round(downloadTotal / 1024)} KB
              </div>
            )}
          </div>
        )}

        {stage === STAGE_ERROR && error && (
          <div className="updater-err">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {stage === STAGE_DONE && (
          <div className="updater-ok">
            <Check size={15} />
            Uppdateringen installeras. Appen kommer att startas om automatiskt.
          </div>
        )}

        {notes && stage !== STAGE_DOWNLOADING && stage !== STAGE_INSTALLING && (
          <div className="updater-notes">
            <div className="updater-notes-title">Vad ändrades</div>
            <pre className="updater-notes-body">{notes}</pre>
          </div>
        )}

        <div className="updater-actions">
          {stage === STAGE_IDLE && result?.available && (
            <>
              <button className="btn btn-primary" onClick={doUpdateNow}>
                <Download size={15} /> Uppdatera nu
              </button>
              <button className="btn btn-outline" onClick={onClose}>
                Påminn mig senare
              </button>
            </>
          )}

          {stage === STAGE_IDLE && !result?.available && (
            <button className="btn btn-outline" onClick={doCheck}>
              <RefreshCw size={15} /> Sök efter uppdateringar
            </button>
          )}

          {stage === STAGE_DOWNLOADING && (
            <button className="btn btn-outline" disabled>
              {downloadPct != null ? `${downloadPct}% nerladdad` : 'Laddar ner…'}
            </button>
          )}

          {stage === STAGE_INSTALLING && (
            <button className="btn btn-primary" disabled>
              Installerar…
            </button>
          )}

          {stage === STAGE_DONE && (
            <button className="btn btn-primary" disabled>
              <Check size={15} /> Updateringen pågår
            </button>
          )}
        </div>

        {result?.error && stage === STAGE_IDLE && (
          <div className="updater-err">
            <AlertCircle size={15} />
            {result.error}
          </div>
        )}
      </div>
    </div>
  );
};
