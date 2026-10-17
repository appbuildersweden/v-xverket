import React from 'react';
import { HemPage } from './speciallarar/HemPage';
import { EleverPage } from './speciallarar/EleverPage';
import { MeddelandeEleverPage } from './speciallarar/MeddelandeEleverPage';
import { GlobalChattPage } from './speciallarar/GlobalChattPage';
import { PrivataChattarPage } from './speciallarar/PrivataChattarPage';
import { MaterialPage } from './speciallarar/MaterialPage';
import { UppfoljningPage } from './speciallarar/UppfoljningPage';
import { PlaneringPage } from './speciallarar/PlaneringPage';
import { AiAssistentPage } from './speciallarar/AiAssistentPage';
import { BelonningarPage } from './shared/BelonningarPage';
import { SectionPage } from '../components/SectionPage';
import { labelForPage } from '../lib/nav';

interface Props {
  pageId: string;
  onNavigate: (pageId: string) => void;
}

/**
 * Speciallärarpanelen. Varje menyval leder till en sida med riktig funktionalitet
 * — planering, elever, uppgifter, meddelanden, material och belöningar hämtar
 * och sparar data i databasen.
 */
export const SpeciallararPanel: React.FC<Props> = ({ pageId, onNavigate }) => {
  const renderPage = () => {
    switch (pageId) {
      case 'hem':
        return <HemPage onNavigate={onNavigate} />;
      case 'elever':
        return <EleverPage onNavigate={onNavigate} />;
      case 'meddelande-elever':
        return <MeddelandeEleverPage onNavigate={onNavigate} />;
      case 'global-chatt':
        return <GlobalChattPage />;
      case 'private-chattar':
        return <PrivataChattarPage />;
      case 'material':
        return <MaterialPage />;
      case 'uppfoljning':
        return <UppfoljningPage />;
      case 'planering':
        return <PlaneringPage />;
      case 'belonningar':
        return <BelonningarPage panel="speciallarar" />;
      case 'ai-assistent':
        return <AiAssistentPage />;
      default:
        return (
          <SectionPage
            panel="speciallarar"
            pageId={pageId}
            planned={[`Sidan "${labelForPage('speciallarar', pageId) ?? pageId}" är inte byggd ännu.`]}
          />
        );
    }
  };

  return <div data-testid="panel-speciallarar">{renderPage()}</div>;
};
