import React from 'react';
import { SectionCard } from '../../components/ui';
import { AiChat } from '../../components/AiChat';

/**
 * AI-assistent för administratören: administrativ planering, texter, dokument
 * och förklaringar av hur Elda fungerar.
 *
 * Assistenten är en text- och dokumenthjälp — den skapar konton, ändrar roller
 * eller rör behörigheter, och den når varken hemligheter eller service role-nycklar.
 * Sådana ändringar görs i appens skyddade funktioner, och servern avgör vad
 * kontot får göra oavsett vad som skrivs i chatten.
 */
export const AdminAiPage: React.FC = () => (
  <div className="panel-page" data-testid="page-admin-ai-assistent">
    <SectionCard title="AI-assistent" subtitle="Administrativt stöd, texter och dokument">
      <AiChat panel="admin" title="AI-assistent" />
      <p className="security-note">
        Assistenten får bara den text du skriver här. Den kan inte skapa konton,
        ändra roller eller läsa hemligheter — sådant görs under Användare och
        Roller. Skriv inte in personuppgifter eller nycklar i chatten.
      </p>
    </SectionCard>
  </div>
);
