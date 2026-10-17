import React from 'react';
import { SectionCard } from '../../components/ui';
import { AiChat } from '../../components/AiChat';

/**
 * AI-assistent för specialläraren: planering, lektionsidéer, arbetsblad och
 * anpassning av material. Svaren kommer från den skyddade serverfunktionen
 * `ai-chat` — API-nyckeln finns bara på servern.
 */
export const AiAssistentPage: React.FC = () => (
  <div className="panel-page" data-testid="page-speciallarar-ai-assistent">
    <SectionCard title="AI-assistent" subtitle="Hjälp med planering och material">
      <AiChat panel="speciallarar" title="AI-assistent" />
      <p className="security-note">
        AI:n får bara den text du skriver här. Lägg inte in personuppgifter eller
        känsliga uppgifter om elever i chatten.
      </p>
    </SectionCard>
  </div>
);
