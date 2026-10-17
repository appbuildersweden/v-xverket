import React from 'react';
import { Globe } from 'lucide-react';
import { getGlobalChannelId } from '../../lib/chat';
import { useAsync } from '../../lib/useAsync';
import { ErrorState, LoadingState, SectionCard } from '../../components/ui';
import { MessageThread } from '../../components/MessageThread';

/**
 * Global chatt: en gemensam kanal för alla inloggade i skolan. Kanalen skapas av
 * migreringen och åtkomsten kontrolleras av servern.
 */
export const GlobalChattPage: React.FC = () => {
  const channel = useAsync(getGlobalChannelId);

  return (
    <div className="panel-page" data-testid="page-speciallarar-global-chatt">
      <SectionCard
        title="Global chatt"
        subtitle="Gemensam kanal för alla inloggade"
      >
        <p className="security-note">
          <Globe size={14} aria-hidden="true" />
          Alla som är inloggade i Elda kan läsa och skriva här. Skriv inget privat
          om en elev — använd Meddelande-elever eller Privata chattar i stället.
        </p>

        {channel.loading && <LoadingState label="Öppnar den globala chatten…" />}
        {!channel.loading && channel.error && (
          <ErrorState message={channel.error} onRetry={channel.reload} />
        )}
        {channel.data && (
          <MessageThread
            channelId={channel.data}
            channelLabel="Global chatt"
            emptyText="Ingen har skrivit här ännu. Börja med en hälsning!"
          />
        )}
      </SectionCard>
    </div>
  );
};
