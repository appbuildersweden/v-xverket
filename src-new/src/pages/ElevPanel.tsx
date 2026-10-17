import React from 'react';
import { ElevStartPage } from './elev/ElevStartPage';
import { PlaneringPage } from './elev/PlaneringPage';
import { AmnenPage } from './elev/AmnenPage';
import { UppgifterPage } from './elev/UppgifterPage';
import { DokumentPage } from './elev/DokumentPage';
import { AiHjalpPage } from './elev/AiHjalpPage';
import { FlashcardsPage } from './elev/FlashcardsPage';
import { ProvtraningPage } from './elev/ProvtraningPage';
import { KlassPage } from './elev/KlassPage';
import { KlasschattPage } from './elev/KlasschattPage';
import { MeddelandenPage } from './elev/MeddelandenPage';
import { FramstegPage } from './elev/FramstegPage';
import { BelonningarPage } from './shared/BelonningarPage';
import { SectionPage } from '../components/SectionPage';
import { labelForPage } from '../lib/nav';

interface Props {
  pageId: string;
  onNavigate: (pageId: string) => void;
}

/**
 * Elevpanelen. Varje menyval leder till en sida som hämtar och sparar riktig
 * data i backend. Sidor som ännu inte är byggda visas med ett tydligt tomläge —
 * aldrig med påhittat innehåll.
 */
export const ElevPanel: React.FC<Props> = ({ pageId, onNavigate }) => {
  const renderPage = () => {
    switch (pageId) {
      case 'start':
        return <ElevStartPage onNavigate={onNavigate} />;
      case 'planering':
        return <PlaneringPage />;
      case 'amnen':
        return <AmnenPage />;
      case 'uppgifter':
        return <UppgifterPage />;
      case 'dokument':
        return <DokumentPage />;
      case 'ai-hjalp':
        return <AiHjalpPage />;
      case 'flashcards':
        return <FlashcardsPage />;
      case 'provtraning':
        return <ProvtraningPage />;
      case 'klass':
        return <KlassPage />;
      case 'klasschatt':
        return <KlasschattPage onNavigate={onNavigate} />;
      case 'meddelanden':
        return <MeddelandenPage />;
      case 'framsteg':
        return <FramstegPage />;
      case 'belonningar':
        return <BelonningarPage panel="elev" />;
      default:
        // Ska inte kunna hända: ruttvakten tillåter bara kända sidor. Skulle det
        // ändå ske visas ett tydligt tomt läge i stället för en krasch.
        return (
          <SectionPage
            panel="elev"
            pageId={pageId}
            planned={[`Sidan "${labelForPage('elev', pageId) ?? pageId}" är inte byggd ännu.`]}
          />
        );
    }
  };

  return <div data-testid="panel-elev">{renderPage()}</div>;
};
