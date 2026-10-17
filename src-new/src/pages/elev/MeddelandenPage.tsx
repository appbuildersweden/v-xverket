import React, { useState } from 'react';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import { DirectConversation, conversationPreview, listDirectConversations } from '../../lib/chat';
import { useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, Pill, SectionCard } from '../../components/ui';
import { MessageThread } from '../../components/MessageThread';

/**
 * Elevens meddelanden: de privata samtalen med lärare och speciallärare.
 *
 * Servern avgör vem som får läsa och skriva: `list_my_direct_channels` visar bara
 * samtal där eleven själv är deltagare, och `list_messages`/`send_message` nekar
 * alla andra kanaler. Eleven kan svara i ett samtal som läraren har startat men
 * kan inte starta nya privata samtal — det följer av behörighetsmodellen.
 */
export const MeddelandenPage: React.FC = () => {
  const conversations = useAsync(listDirectConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list: DirectConversation[] = conversations.data ?? [];
  const selected = list.find((c) => c.channelId === selectedId) ?? list[0];

  return (
    <div className="panel-page" data-testid="page-elev-meddelanden">
      <SectionCard title="Meddelanden" subtitle="Privata samtal med din lärare">
        {conversations.loading && <LoadingState label="Hämtar dina meddelanden…" />}
        {!conversations.loading && conversations.error && (
          <ErrorState message={conversations.error} onRetry={conversations.reload} />
        )}

        {conversations.data && list.length === 0 && (
          <EmptyState
            icon={<MessageSquare size={22} />}
            title="Inga meddelanden ännu"
            description="När en lärare skriver till dig dyker samtalet upp här. Då kan du svara direkt i samtalet."
          />
        )}

        {list.length > 0 && (
          <ul className="list">
            {list.map((conversation) => {
              const active = selected?.channelId === conversation.channelId;
              return (
                <li className="list-item list-item-static" key={conversation.channelId}>
                  <MessageSquare size={16} aria-hidden="true" />
                  <div className="list-item-content">
                    <div className="list-item-title mono">{conversation.otherUsername}</div>
                    <div className="list-item-sub">{conversationPreview(conversation)}</div>
                  </div>
                  {active ? (
                    <Pill tone="info">Öppen</Pill>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setSelectedId(conversation.channelId)}
                    >
                      Öppna
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {selected && (
        <SectionCard
          title={`Samtal med ${selected.otherUsername}`}
          subtitle="Bara du och din lärare ser det här"
        >
          <MessageThread
            channelId={selected.channelId}
            channelLabel={selected.otherUsername}
            emptyText={`Inga meddelanden med ${selected.otherUsername} ännu. Skriv det första.`}
            composePlaceholder="Svara din lärare…"
            onAfterSend={() => conversations.reload()}
          />
          <p className="security-note">
            <ShieldCheck size={14} aria-hidden="true" />
            Samtalet är privat. Bara du och den du skriver med kan läsa det — det
            kontrolleras av servern vid varje hämtning och sändning.
          </p>
        </SectionCard>
      )}
    </div>
  );
};
