import React from 'react';
import { ChevronRight } from 'lucide-react';
import { PanelType, PANEL_LABELS } from '../lib/nav';

interface PageHeaderProps {
  panel: PanelType;
  title: string;
  subtitle?: string;
  /** Kortgrupp eller gruppnamn som visas i brödsmulan. */
  group?: string | null;
  /** Sidans primära åtgärder (t.ex. "Skapa konto"). */
  actions?: React.ReactNode;
}

/**
 * Sidhuvudet visar var i appen användaren är och vad sidan heter. Det ligger
 * under den fasta toppraden och används av alla paneler.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  panel,
  title,
  subtitle,
  group,
  actions,
}) => (
  <header className="page-head">
    <div className="page-head-main">
      <nav className="breadcrumb" aria-label="Du är här">
        <span className="crumb-root">Elda</span>
        <ChevronRight size={13} aria-hidden="true" />
        <span>{PANEL_LABELS[panel]}</span>
        {group && (
          <>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{group}</span>
          </>
        )}
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{title}</span>
      </nav>
      <h1>{title}</h1>
      {subtitle && <p className="page-sub">{subtitle}</p>}
    </div>
    {actions && <div className="page-head-actions">{actions}</div>}
  </header>
);
