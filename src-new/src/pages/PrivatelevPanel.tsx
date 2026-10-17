import React from 'react';
import { PlaneringPage } from './elev/PlaneringPage';
import { AmnenPage } from './elev/AmnenPage';
import { UppgifterPage } from './elev/UppgifterPage';
import { DokumentPage } from './elev/DokumentPage';
import { AiHjalpPage } from './elev/AiHjalpPage';
import { FlashcardsPage } from './elev/FlashcardsPage';
import { ProvtraningPage } from './elev/ProvtraningPage';
import { FramstegPage } from './elev/FramstegPage';
import { BelonningarPage } from './shared/BelonningarPage';
import { PrivateStartPage } from './privat/PrivateStartPage';
import { SectionPage } from '../components/SectionPage';
import { labelForPage } from '../lib/nav';

interface Props {
  pageId: string;
  onNavigate: (pageId: string) => void;
}

/**
 * Privatelevens panel.
 *
 * Samma riktiga studieverktyg som elevpanelen använder, men utan klass, klasskod,
 * klasskamrater, klasschatt och klassuppgifter. Ruttvakten nekar dessutom alla
 * klassrutter för ett privat konto, så panelen kan inte nås via en direktadress.
 */
export const PrivatelevPanel: React.FC<Props> = ({ pageId, onNavigate }) => {
  // Studieverktygen är elevpanelens egna sidor. De får panel-id:t 'privat' så
  // att texterna talar om egna studier i stället för om en lärare och en klass.
  const renderPage = () => {
    switch (pageId) {
      case 'start':
        return <PrivateStartPage onNavigate={onNavigate} />;
      case 'planering':
        return <PlaneringPage panel="privat" />;
      case 'amnen':
        return <AmnenPage panel="privat" />;
      case 'uppgifter':
        return <UppgifterPage panel="privat" />;
      case 'dokument':
        return <DokumentPage panel="privat" />;
      case 'ai-hjalp':
        return <AiHjalpPage panel="privat" />;
      case 'flashcards':
        return <FlashcardsPage panel="privat" />;
      case 'provtraning':
        return <ProvtraningPage panel="privat" />;
      case 'framsteg':
        return <FramstegPage panel="privat" />;
      case 'belonningar':
        return <BelonningarPage panel="privat" />;
      default:
        return (
          <SectionPage
            panel="privat"
            pageId={pageId}
            planned={[`Sidan "${labelForPage('privat', pageId) ?? pageId}" är inte byggd ännu.`]}
          />
        );
    }
  };

  return <div data-testid="panel-privat">{renderPage()}</div>;
};
