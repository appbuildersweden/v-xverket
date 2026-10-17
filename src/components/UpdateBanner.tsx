import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, RotateCcw, X } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import {
  checkForUpdateResource,
  downloadUpdate,
  installUpdate,
  isTauri,
} from '../lib/update';

type Phase = 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'error';

/** Kontrollera igen efter sex timmar om appen står öppen länge. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Första kontrollen några sekunder efter start, så att inloggningen hinner först. */
const FIRST_CHECK_DELAY_MS = 6_000;
/** En avvisad version visas inte igen förrän efter ett dygn. */
const DISMISS_MS = 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'elda-update-dismissed';

interface Dismissed {
  version: string;
  at: number;
}

function readDismissed(): Dismissed | null {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Dismissed;
    if (!parsed?.version || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isDismissed(version: string): boolean {
  const dismissed = readDismissed();
  if (!dismissed || dismissed.version !== version) return false;
  return Date.now() - dismissed.at < DISMISS_MS;
}

/**
 * Global uppdateringsruta.
 *
 * Ligger utanför panelerna och kontrollerar automatiskt efter nya versioner vid
 * start och därefter var sjätte timme. När en version hittas laddas den ner i
 * bakgrunden (signaturen verifieras av Tauri), varefter användaren får en
 * tydlig uppmaning att starta om och installera. Nätverksfel ger ett synligt
 * fel med möjlighet att försöka igen – appen fortsätter att fungera.
 */
export const UpdateBanner: React.FC = () => {
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const updateRef = useRef<Update | null>(null);
  const bytesRef = useRef(0);
  const totalRef = useRef(0);

  const download = useCallback(async (update: Update, show: boolean) => {
    setPhase('downloading');
    setError(null);
    setProgress(null);
    bytesRef.current = 0;
    totalRef.current = 0;
    try {
      await downloadUpdate(update, (event) => {
        if (event.event === 'Started') {
          totalRef.current = event.data?.contentLength ?? 0;
          setProgress(0);
        } else if (event.event === 'Progress') {
          bytesRef.current += event.data?.chunkLength ?? 0;
          if (totalRef.current > 0) {
            setProgress(
              Math.min(100, Math.round((bytesRef.current / totalRef.current) * 100)),
            );
          }
        } else if (event.event === 'Finished') {
          setProgress(100);
        }
      });
      setPhase('ready');
      if (show && !isDismissed(update.version)) setVisible(true);
    } catch (err) {
      setPhase('error');
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Uppdateringen kunde inte laddas ner.',
      );
      if (show) setVisible(true);
    }
  }, []);

  const runCheck = useCallback(async () => {
    if (!supported) return;
    setPhase('checking');
    const { result, update } = await checkForUpdateResource();
    if (result.error || !update || !result.available || !result.latestVersion) {
      setPhase('idle');
      return;
    }

    updateRef.current = update;
    setVersion(result.latestVersion);
    setNotes(result.body ?? null);
    const show = !isDismissed(result.latestVersion);
    await download(update, show);
  }, [download, supported]);

  useEffect(() => {
    const tauri = isTauri();
    setSupported(tauri);
    if (!tauri) return;

    const first = window.setTimeout(() => void runCheck(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void runCheck(), CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [runCheck]);

  const dismiss = () => {
    if (version) {
      try {
        window.localStorage.setItem(
          DISMISS_KEY,
          JSON.stringify({ version, at: Date.now() } satisfies Dismissed),
        );
      } catch {
        /* localStorage kan vara avstängt – rutan får då visas igen */
      }
    }
    setVisible(false);
  };

  const install = async () => {
    const update = updateRef.current;
    if (!update) return;
    setPhase('installing');
    setError(null);
    try {
      await installUpdate(update);
    } catch (err) {
      setPhase('error');
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Uppdateringen kunde inte installeras.',
      );
      setVisible(true);
    }
  };

  const retry = () => {
    const update = updateRef.current;
    if (update) {
      void download(update, true);
    } else {
      void runCheck();
    }
  };

  if (!supported || !visible) return null;

  return (
    <aside
      className="update-banner"
      role="status"
      aria-live="polite"
      aria-label="Uppdatering av Elda"
    >
      <button className="update-banner-close" onClick={dismiss} aria-label="Stäng">
        <X size={15} />
      </button>

      <div className="update-banner-head">
        {phase === 'ready' ? (
          <CheckCircle2 size={17} />
        ) : phase === 'error' ? (
          <AlertCircle size={17} />
        ) : (
          <Download size={17} />
        )}
        <div>
          <div className="update-banner-title">
            {phase === 'ready'
              ? `Version ${version} är klar`
              : phase === 'error'
                ? 'Uppdateringen misslyckades'
                : `Ny version ${version} hittades`}
          </div>
          <div className="update-banner-sub">
            {phase === 'downloading'
              ? progress != null
                ? `Laddar ner… ${progress}%`
                : 'Laddar ner uppdateringen…'
              : phase === 'installing'
                ? 'Installerar och startar om…'
                : phase === 'ready'
                  ? 'Starta om Elda för att slutföra uppdateringen.'
                  : phase === 'error'
                    ? error
                    : 'Uppdateringen förbereds.'}
          </div>
        </div>
      </div>

      {phase === 'downloading' && (
        <div className="update-banner-bar" aria-hidden="true">
          <div
            className="update-banner-fill"
            style={{ width: `${progress ?? 0}%` }}
          />
        </div>
      )}

      {notes && phase === 'ready' && (
        <pre className="update-banner-notes">{notes}</pre>
      )}

      <div className="update-banner-actions">
        {phase === 'ready' && (
          <button className="btn btn-primary btn-sm" onClick={() => void install()}>
            <RotateCcw size={14} /> Starta om och installera
          </button>
        )}
        {phase === 'error' && (
          <button className="btn btn-primary btn-sm" onClick={retry}>
            <RotateCcw size={14} /> Försök igen
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={dismiss}>
          Senare
        </button>
      </div>
    </aside>
  );
};
