import React from 'react';
import { Megaphone } from 'lucide-react';
import { Button, PageIntro } from '../../components/ui';
import { MessageCenter } from '../../components/MessageCenter';
import { InboxMessages } from '../../components/InboxMessages';

/**
 * Elevens meddelanden. Bara konversationer – information från lärare och skola
 * ligger på den egna informationssidan.
 */
export const ElevMeddelanden: React.FC<{ onNavigate?: (page: string) => void }> = ({
  onNavigate,
}) => (
  <div>
    <PageIntro
      eyebrow="Elevpanel"
      title="Meddelanden"
      description="Skriv till lärare och speciallärare på din skola. Information från skolan hittar du under Information."
      actions={
        <Button icon={<Megaphone size={16} />} onClick={() => onNavigate?.('information')}>
          Till information
        </Button>
      }
    />
    <MessageCenter
      title="Konversationer"
      subtitle="Interna meddelanden inom din skola. Du kan skriva till lärare och speciallärare som undervisar dig."
    />
    <div style={{ marginTop: 16 }}>
      <InboxMessages />
    </div>
  </div>
);
