import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import {
  checkForUpdateResource,
  currentBuiltVersion,
  downloadUpdate,
  fetchPublishedUpdate,
  installUpdate,
  isNewerVersion,
  isTauri,
  loadCurrentVersion,
} from '../lib/update';

/**
 * Status för en kontroll. Varje läge har sin egen text, så att användaren
 * aldrig behöver tolka en knapp som inte gör något.
 */
type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; version: string }
  | { kind: 'available'; version: string; notes: string | null; installable: boolean }
  | { kind: 'downloading'; percent: number | null }
  | { kind: 'installing' }
  | { kind: 'error'; message: string };

/** Lägen där en ny kontroll inte får startas ovanpå den pågående. */
const BUSY: ReadonlySet<Status['kind']> = new Set(['checking', 'downloading', 'installing']);

/**
 * Uppdateringar i inställningarna.
 *
 * Finns på profilsidan, som alla roller når — admin, elev, privat elev, lärare
 * och speciallärare. Appen kontrollerar nya versioner automatiskt vid start och
 * var sjätte timme; den här rutan är den manuella vägen, för den som själv vill
 * se efter.
 *
 * I den installerade appen frågar rutan Tauri-uppdateraren, och kan då ladda ner
 * och installera versionen direkt. I en webbläsare finns ingen uppdaterare: då
 * läses det publicerade manifestet i stället och rutan berättar vilken version
 * som ligger ute, utan att låtsas kunna installera den.
 */
export const UpdateSettings: React.FC = () => {
  const [version, setVersion] = useState<string>(currentBuiltVersion);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const updateRef = useRef<Update | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadCurrentVersion().then((value) => {
      // getVersion() är den enda källan som vet vad som faktiskt är installerat.
      if (mounted.current && value) setVersion(value);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = async () => {
    if (BUSY.has(status.kind)) return;
    setStatus({ kind: 'checking' });
    updateRef.current = null;

    // Installerad app: Tauri kan både svara och installera.
    if (isTauri()) {
      const { result, update } = await checkForUpdateResource();
      if (!mounted.current) return;
      if (result.error) {
        setStatus({ kind: 'error', message: result.error });
        return;
      }
      if (result.available && update && result.latestVersion) {
        updateRef.current = update;
        setStatus({
          kind: 'available',
          version: result.latestVersion,
          notes: result.body ?? null,
          installable: true,
        });
        return;
      }
      setStatus({ kind: 'current', version: result.currentVersion || version });
      return;
    }

    // Webbläsare: jämför byggets version med den publicerade.
    const { info, error } = await fetchPublishedUpdate();
    if (!mounted.current) return;
    if (error || !info) {
      setStatus({
        kind: 'error',
        message: error ?? 'Kunde inte läsa den publicerade versionen.',
      });
      return;
    }
    if (isNewerVersion(info.version, version)) {
      setStatus({
        kind: 'available',
        version: info.version,
        notes: info.notes,
        installable: false,
      });
      return;
    }
    setStatus({ kind: 'current', version });
  };

  const install = async () => {
    const update = updateRef.current;
    if (!update || BUSY.has(status.kind)) return;

    setStatus({ kind: 'downloading', percent: null });
    let received = 0;
    let total = 0;

    try {
      await downloadUpdate(update, (event) => {
        if (!mounted.current) return;
        if (event.event === 'Started') {
          total = event.data?.contentLength ?? 0;
          setStatus({ kind: 'downloading', percent: 0 });
        } else if (event.event === 'Progress') {
          received += event.data?.chunkLength ?? 0;
          setStatus({
            kind: 'downloading',
            percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null,
          });
        } else if (event.event === 'Finished') {
          setStatus({ kind: 'downloading', percent: 100 });
        }
      });
      if (!mounted.current) return;
      setStatus({ kind: 'installing' });
      await installUpdate(update);
    } catch (err) {
      if (!mounted.current) return;
      setStatus({
        kind: 'error',
        message:
          err instanceof Error && err.message
            ? err.message
            : 'Uppdateringen kunde inte installeras.',
      });
    }
  };

  const busy = BUSY.has(status.kind);

  const message = () => {
    switch (status.kind) {
      case 'checking':
        return 'Söker efter uppdateringar…';
      case 'current':
        return `Du har den senaste versionen (${status.version}).`;
      case 'available':
        return status.installable
          ? `Ny version ${status.version} finns. Ladda ner den och starta om Elda för att slutföra uppdateringen.`
          : `Ny version ${status.version} finns. Den installeras i desktopappen – öppna Elda på datorn och gör samma sak där.`;
      case 'downloading':
        return status.percent != null
          ? `Laddar ner uppdateringen… ${status.percent} %`
          : 'Laddar ner uppdateringen…';
      case 'installing':
        return 'Installerar och startar om Elda…';
      case 'error':
        return status.message;
      default:
        return 'Kontrollera om det finns en nyare version av Elda.';
    }
  };

  // Fel visas som appens vanliga felruta, allt annat som en neutral notis.
  const failed = status.kind === 'error';

  return (
    <div className="card" data-testid="update-settings">
      <div className="card-head">
        <h2 className="card-title">Uppdateringar</h2>
        <span className="card-sub">
          Nya versioner kontrolleras automatiskt vid start – du kan också söka själv
        </span>
      </div>

      <div className="list-item">
        <div className="list-item-content">
          <div className="list-item-title">Installerad version</div>
          <div className="list-item-sub" data-testid="update-current-version">
            {version}
          </div>
        </div>
      </div>

      <div
        className={failed ? 'login-err' : 'chat-notice'}
        role={failed ? 'alert' : 'status'}
        aria-live="polite"
        data-testid="update-status"
      >
        {status.kind === 'current' && <CheckCircle2 size={15} aria-hidden="true" />}
        {status.kind === 'error' && <AlertCircle size={15} aria-hidden="true" />}
        {status.kind === 'available' && <Download size={15} aria-hidden="true" />}
        {(status.kind === 'checking' ||
          status.kind === 'downloading' ||
          status.kind === 'installing') && <RefreshCw size={15} aria-hidden="true" />}
        <span>{message()}</span>
      </div>

      {status.kind === 'available' && status.notes && (
        <p className="update-notes">{status.notes}</p>
      )}

      {status.kind === 'downloading' && (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${status.percent ?? 0}%` }} />
        </div>
      )}

      <div className="grid-2 update-settings-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => void check()}
          disabled={busy}
          data-testid="update-check"
        >
          <RefreshCw size={16} aria-hidden="true" />
          {status.kind === 'checking' ? 'Söker…' : 'Sök efter uppdateringar'}
        </button>
        {status.kind === 'available' && status.installable && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void install()}
            data-testid="update-install"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Ladda ner och installera
          </button>
        )}
      </div>
    </div>
  );
};
