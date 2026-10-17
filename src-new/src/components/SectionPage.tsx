import React from 'react';
import { Layers, ShieldCheck } from 'lucide-react';
import { EmptyState, SectionCard } from './ui';
import { PanelType, categoryForPage, descriptionForPage, labelForPage } from '../lib/nav';

interface SectionPageProps {
  panel: PanelType;
  pageId: string;
  /** Vad sidan ska innehålla när funktionen byggs. */
  planned?: string[];
}

/**
 * Standardvy för panelernas sektioner. Den visar ett tydligt tomläge i stället
 * för påhittad data, och påminner om att behörigheten ligger på servern.
 */
export const SectionPage: React.FC<SectionPageProps> = ({
  panel,
  pageId,
  planned = [],
}) => {
  const title = labelForPage(panel, pageId) ?? 'Sidan';
  const description = descriptionForPage(panel, pageId);
  const category = categoryForPage(panel, pageId);

  return (
    <div className="panel-page" data-testid={`page-${panel}-${pageId}`}>
      <SectionCard
        title={title}
        subtitle={category ? `Grupp: ${category.label}` : undefined}
      >
        <EmptyState
          icon={<Layers size={22} />}
          title="Inget att visa ännu"
          description={
            description ??
            'Den här delen är förberedd med rutt, menyval och rollskydd. Innehållet visas när det finns data i backend.'
          }
        />
      </SectionCard>

      {planned.length > 0 && (
        <SectionCard title="Planerat innehåll" subtitle="Byggs i kommande steg">
          <ul className="list">
            {planned.map((item) => (
              <li className="list-item list-item-static" key={item}>
                <div className="list-item-content">
                  <div className="list-item-sub">{item}</div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <p className="security-note">
        <ShieldCheck size={14} aria-hidden="true" />
        Åtkomst styrs av din roll på servern. Ruttens skydd är bara ett
        gränssnittsskydd — databasen och serverfunktionerna avgör vad som får
        läsas och ändras.
      </p>
    </div>
  );
};
