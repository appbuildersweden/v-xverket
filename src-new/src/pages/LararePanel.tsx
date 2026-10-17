import React from 'react';
import { HemPage } from './larare/HemPage';
import { KlasserPage } from './larare/KlasserPage';
import { EleverPage } from './larare/EleverPage';
import { UppgifterPage } from './larare/UppgifterPage';
import { KontaktAdminPage } from './larare/KontaktAdminPage';
import { MaterialPage } from './speciallarar/MaterialPage';
import { UppfoljningPage } from './speciallarar/UppfoljningPage';
import { PlaneringPage } from './speciallarar/PlaneringPage';
import { AiAssistentPage } from './speciallarar/AiAssistentPage';
import { SectionPage } from '../components/SectionPage';
import { labelForPage } from '../lib/nav';

interface Props {
  pageId: string;
  onNavigate: (pageId: string) => void;
}

/**
 * Lärarpanelen för rollen 'lärare': egna klasser med klasskod och
 * klassansökningar, egna elever, uppgifter, material, uppföljning och planering.
 *
 * Material, uppföljning, planering och AI-assistenten är samma sidor som
 * personalpanelen använder — de läser och skriver samma databas, och RLS avgör
 * vad varje användare faktiskt får se. Läraren kan därför aldrig nå en annan
 * lärares klass, en privat elevs material eller administratörens funktioner,
 * oavsett vad menyn visar.
 */
export const LararePanel: React.FC<Props> = ({ pageId, onNavigate }) => {
  const renderPage = () => {
    switch (pageId) {
      case 'hem':
        return <HemPage onNavigate={onNavigate} />;
      case 'klasser':
        return <KlasserPage />;
      case 'elever':
        return <EleverPage />;
      case 'uppgifter':
        return <UppgifterPage />;
      case 'material':
        return <MaterialPage />;
      case 'uppfoljning':
        return <UppfoljningPage />;
      case 'planering':
        return <PlaneringPage />;
      case 'kontakt-admin':
        return <KontaktAdminPage />;
      case 'ai-assistent':
        return <AiAssistentPage />;
      default:
        // Ska inte kunna hända: ruttvakten tillåter bara kända sidor.
        return (
          <SectionPage
            panel="larare"
            pageId={pageId}
            planned={[`Sidan "${labelForPage('larare', pageId) ?? pageId}" är inte byggd ännu.`]}
          />
        );
    }
  };

  return <div data-testid="panel-larare">{renderPage()}</div>;
};
