import React from 'react';
import { ArrowRight } from 'lucide-react';
import { labelForPage, PanelType } from '../lib/nav';

interface QuickLinksProps {
  panel: PanelType;
  /** Sid-id:n som ska visas som genvägar. */
  pages: string[];
  onNavigate: (pageId: string) => void;
  title?: string;
  subtitle?: string;
}

/**
 * Genvägar på startsidorna. Bara riktiga länkar till befintliga sidor — inga
 * kort med påhittad statistik.
 */
export const QuickLinks: React.FC<QuickLinksProps> = ({
  panel,
  pages,
  onNavigate,
  title = 'Genvägar',
  subtitle,
}) => {
  const links = pages
    .map((id) => ({ id, label: labelForPage(panel, id) }))
    .filter((l): l is { id: string; label: string } => Boolean(l.label));

  if (links.length === 0) return null;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
      </div>
      <ul className="quick-links">
        {links.map((link) => (
          <li key={link.id}>
            <button type="button" className="quick-link" onClick={() => onNavigate(link.id)}>
              <span>{link.label}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
