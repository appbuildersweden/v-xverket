import React from 'react';
import { Megaphone } from 'lucide-react';
import { Button, PageIntro } from '../../components/ui';
import { MessageCenter } from '../../components/MessageCenter';
import { InboxMessages } from '../../components/InboxMessages';

/**
 * Lärarens meddelanden. Sidan innehåller bara konversationer – information till
 * klasser ligger på den egna informationssidan, så att läsning och utskick av
 * information inte blandas ihop med chattarna.
 */
export const LarareMeddelanden: React.FC<{ onNavigate?: (page: string) => void }> = ({
  onNavigate,
}) => (
  <div>
    <PageIntro
      eyebrow="Lärarpanel"
      title="Meddelanden"
      description="Interna meddelanden inom din skola – med elever du undervisar och med kollegor."
      actions={
        <Button
          icon={<Megaphone size={16} />}
          onClick={() => onNavigate?.('information')}
        >
          Till information
        </Button>
      }
    />
    <MessageCenter
      title="Konversationer"
      subtitle="Interna meddelanden inom din skola – med elever du undervisar och med kollegor."
    />
    <div style={{ marginTop: 16 }}>
      <InboxMessages />
    </div>
  </div>
);
