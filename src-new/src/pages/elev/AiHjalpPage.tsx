import React from 'react';
import { SectionCard } from '../../components/ui';
import { AiChat } from '../../components/AiChat';
import { Panel } from '../../lib/auth-types';

/**
 * AI-studiehjälp för eleven. Svaren kommer från den skyddade serverfunktionen
 * `ai-chat`, som hjälper eleven att förstå — inte att fuska. Nyckeln till
 * AI-tjänsten finns bara på servern.
 *
 * Underlag: den konfigurerade modellen tar emot text. Bilder, PDF:er och
 * uppladdade Office-filer kan alltså inte läsas in — det står tydligt här i
 * stället för att knappen ska låtsas fungera. Eleven kan i stället klistra in
 * den text hen vill ha hjälp med.
 *
 * Panelen skickas vidare: en privat elev får privatelevens instruktioner och
 * ska inte hänvisas till material som en lärare har delat i en klass.
 */
export const AiHjalpPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const privat = panel === 'privat';

  return (
    <div className="panel-page" data-testid={`page-${panel}-ai-hjalp`}>
      <SectionCard title="AI-studiehjälp" subtitle="Fråga om skolarbetet">
        <AiChat panel={panel} title="AI-studiehjälp" />
        <p className="security-note" data-testid={`ai-underlag-${privat ? 'privat' : 'elev'}`}>
          AI:n får bara den text du skriver här. Bilder, PDF:er och Word-filer kan
          inte läsas in — klistra i stället in texten du vill ha hjälp med. Skriv
          aldrig personnummer eller annat känsligt.
        </p>
      </SectionCard>
    </div>
  );
};
