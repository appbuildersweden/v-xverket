import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { AssignmentStage, STAGE_LABELS } from '../lib/assignments';

/**
 * Gemensamma byggstenar för Eldas gränssnitt. De håller panelerna visuellt
 * enhetliga och ser till att nya sidor inte behöver hitta på egna varianter av
 * kort, rubriker, tabeller och tomlägen.
 */

// ----------------------------------------------------------------
// Kort med rubrik
// ----------------------------------------------------------------

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  /** Knappar eller liknande uppe till höger. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  subtitle,
  action,
  children,
  className,
}) => (
  <section className={`card ${className ?? ''}`.trim()}>
    {(title || action) && (
      <div className="card-head">
        <div>
          {title && <h2 className="card-title">{title}</h2>}
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {action && <div className="card-action">{action}</div>}
      </div>
    )}
    {children}
  </section>
);

// ----------------------------------------------------------------
// Tomt läge
// ----------------------------------------------------------------

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Visas i stället för innehåll som ännu inte finns. Vi visar aldrig påhittad
 * data för att fylla ytan — ett tydligt tomt läge är alltid bättre.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="empty-state" data-testid="empty-state">
    {icon && <div className="empty-state-icon">{icon}</div>}
    <div className="empty-state-title">{title}</div>
    {description && <p className="empty-state-desc">{description}</p>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>
);

// ----------------------------------------------------------------
// Nyckeltal
// ----------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
}

/** Visar ett enskilt nyckeltal från en verklig datakälla. */
export const StatCard: React.FC<StatCardProps> = ({ label, value, hint }) => (
  <div className="stat-card">
    <div className="lbl">{label}</div>
    <div className="val">{value}</div>
    {hint && <div className="det">{hint}</div>}
  </div>
);

// ----------------------------------------------------------------
// Laddnings- och fellägen
// ----------------------------------------------------------------

interface LoadingStateProps {
  label?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Hämtar…',
}) => (
  <div className="state-note" role="status" data-testid="loading-state">
    <span className="spinner spinner-dark" /> {label}
  </div>
);

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <div className="state-note state-note-error" role="alert" data-testid="error-state">
    <span>{message}</span>
    {onRetry && (
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        Försök igen
      </button>
    )}
  </div>
);

// ----------------------------------------------------------------
// Etiketter
// ----------------------------------------------------------------

export const RoleBadge: React.FC<{ role: string }> = ({ role }) => (
  <span className="badge" data-role={role}>
    {role}
  </span>
);

export const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <span className={`badge ${active ? 'badge-ok' : 'badge-off'}`}>
    {active ? 'Aktiv' : 'Inaktiv'}
  </span>
);

// ----------------------------------------------------------------
// Etiketter och status
// ----------------------------------------------------------------

/** Liten etikett med ton — används för status, ämnen och räknare. */
export const Pill: React.FC<{
  tone?: 'ok' | 'warn' | 'info' | 'muted';
  children: React.ReactNode;
}> = ({ tone = 'muted', children }) => (
  <span className={`pill pill-${tone}`}>{children}</span>
);

/** Status för en uppgift: klar, pågår eller ej påbörjad. */
export const TaskStatusPill: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'klar') return <Pill tone="ok">Klar</Pill>;
  if (status === 'pagar') return <Pill tone="info">Pågår</Pill>;
  return <Pill tone="muted">Ej påbörjad</Pill>;
};

/**
 * Etikett för var uppgiften står i flödet (ny, pågående, klar, inlämnad,
 * bedömd). Läget räknas fram ur uppgiftens egna fält så att samma text visas
 * överallt.
 */
export const TaskStagePill: React.FC<{ stage: AssignmentStage }> = ({ stage }) => {
  const tone = stage === 'bedomd' || stage === 'klar' ? 'ok' : stage === 'ny' ? 'muted' : 'info';
  return <Pill tone={tone}>{STAGE_LABELS[stage]}</Pill>;
};

// ----------------------------------------------------------------
// Förlopp
// ----------------------------------------------------------------

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  /** Visar texten till höger om mätaren (t.ex. "120 / 175 XP"). */
  caption?: string;
}

/** Enkel förloppsmätare för XP, repetition och framsteg. */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  label,
  caption,
}) => {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(Math.max((value / safeMax) * 100, 0), 100);
  return (
    <div className="progress-block">
      {(label || caption) && (
        <div className="progress-row">
          <span>{label}</span>
          <span className="muted">{caption}</span>
        </div>
      )}
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Förlopp'}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

// ----------------------------------------------------------------
// Tabell
// ----------------------------------------------------------------

interface TableProps {
  head: React.ReactNode;
  children: React.ReactNode;
  caption?: string;
}

export const Toolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="toolbar">{children}</div>
);

// ----------------------------------------------------------------
// Delvis hämtad data
// ----------------------------------------------------------------

/**
 * Visas när en sida bygger på flera hämtningar och en av dem misslyckades.
 *
 * Sidan kan då fortfarande visa det som kom fram, men aldrig som om siffrorna
 * vore fullständiga: en misslyckad hämtning får inte se ut som en nolla. Det
 * som saknas namnges, och användaren kan ladda om.
 */
export const PartialDataNotice: React.FC<{ missing: string[]; onRetry?: () => void }> = ({
  missing,
  onRetry,
}) => {
  if (missing.length === 0) return null;

  return (
    <div className="state-note state-note-error" role="status" data-testid="partial-data">
      <AlertTriangle size={15} aria-hidden="true" />
      <span>
        Kunde inte hämta {missing.join(', ')} just nu. Det som saknas visas inte, så siffrorna
        ovan kan vara ofullständiga.
        {onRetry && (
          <>
            {' '}
            <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
              Försök igen
            </button>
          </>
        )}
      </span>
    </div>
  );
};

/** Enkel, tillgänglig tabell. Används av kontolistan. */
export const Table: React.FC<TableProps> = ({ head, children, caption }) => (
  <div className="table-wrap">
    <table className="table">
      {caption && <caption className="table-caption">{caption}</caption>}
      <thead>{head}</thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
