import React from 'react';
import { Megaphone } from 'lucide-react';
import { MessageCenter } from '../../components/MessageCenter';
import { InboxMessages } from '../../components/InboxMessages';
import { PageIntro } from '../../components/ui';

/**
 * Speciallärarens meddelanden. Samma gemensamma meddelandekomponent som elev-
 * och lärarpanelen använder, plus skolans systemmeddelanden.
 */
export const SpeciallararMeddelanden: React.FC = () => (
  <div className="stack">
    <PageIntro
      eyebrow="Speciallärarpanel"
      title="Meddelanden"
      description="Skriv till elever du arbetar med och till lärare och speciallärare på din egen skola. Meddelanden till andra skolor nekas av servern."
      actions={<Megaphone size={20} color="var(--green)" />}
    />
    <MessageCenter
      title="Konversationer"
      subtitle="Interna meddelanden inom din skolorganisation."
    />
    <InboxMessages />
  </div>
);
