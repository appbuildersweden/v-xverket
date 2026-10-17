import React, { useState } from 'react';
import { Circle, MessageSquare, Plus, Search } from 'lucide-react';
import {
  DirectConversation,
  conversationPreview,
  listDirectConversations,
  openDirectChannel,
} from '../../lib/chat';
import { listMyStudents, listStaffAccounts } from '../../lib/students';
import { formatDateTime } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, SectionCard } from '../../components/ui';
import { Modal } from '../../components/forms';
import { MessageThread } from '../../components/MessageThread';

/**
 * Privata chattar: alla enskilda samtal användaren deltar i, med möjlighet att
 * starta ett nytt. Servern skapar bara samtal där minst en av parterna är
 * personal, och bara deltagarna kan läsa innehållet.
 */
export const PrivataChattarPage: React.FC = () => {
  const conversations = useAsync(listDirectConversations);
  const [selected, setSelected] = useState<DirectConversation | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openConversation = async (otherId: string) => {
    const result = await openDirectChannel(otherId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowNew(false);
    const known = (conversations.data ?? []).find((c) => c.otherId === otherId);
    setSelected(
      known ?? {
        channelId: result.data,
        otherId,
        otherUsername: 'Samtal',
        lastBody: null,
        lastAt: null,
      },
    );
    conversations.reload();
  };

  return (
    <div className="panel-page" data-testid="page-speciallarar-private-chattar">
      <SectionCard
        title="Privata chattar"
        subtitle="Enskilda samtal mellan dig och en annan person"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Nytt samtal
          </button>
        }
      >
        {conversations.loading && <LoadingState label="Hämtar dina samtal…" />}
        {!conversations.loading && conversations.error && (
          <ErrorState message={conversations.error} onRetry={conversations.reload} />
        )}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {conversations.data && conversations.data.length === 0 && (
          <EmptyState
            icon={<Circle size={22} />}
            title="Inga privata samtal ännu"
            description="Starta ett samtal med en elev eller en kollega. Samtalet syns bara för er två."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
                <Plus size={16} /> Nytt samtal
              </button>
            }
          />
        )}

        {conversations.data && conversations.data.length > 0 && (
          <ul className="list">
            {conversations.data.map((conversation) => (
              <li className="list-item list-item-static" key={conversation.channelId}>
                <MessageSquare size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title mono">{conversation.otherUsername}</div>
                  <div className="list-item-sub">{conversationPreview(conversation)}</div>
                </div>
                <span className="muted small">
                  {conversation.lastAt ? formatDateTime(conversation.lastAt) : ''}
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelected(conversation)}
                >
                  Öppna
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {selected && (
        <SectionCard
          title={`Samtal med ${selected.otherUsername}`}
          subtitle="Bara ni två ser konversationen"
        >
          <MessageThread
            channelId={selected.channelId}
            channelLabel={selected.otherUsername}
            emptyText="Inga meddelanden i det här samtalet ännu."
            onAfterSend={() => conversations.reload()}
          />
        </SectionCard>
      )}

      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onPick={(id) => void openConversation(id)}
        />
      )}
    </div>
  );
};

const NewConversationModal: React.FC<{
  onClose: () => void;
  onPick: (id: string) => void;
}> = ({ onClose, onPick }) => {
  const students = useAsync(listMyStudents);
  const staff = useAsync(listStaffAccounts);
  const [query, setQuery] = useState('');

  const people: Array<{ id: string; username: string; kind: string }> = [
    ...(students.data ?? []).map((s) => ({ id: s.id, username: s.username, kind: 'Elev' })),
    ...(staff.data ?? []).map((s) => ({ id: s.id, username: s.username, kind: 'Personal' })),
  ];

  const text = query.trim().toLowerCase();
  const visible = people.filter((p) => !text || p.username.toLowerCase().includes(text));

  return (
    <Modal title="Nytt samtal" onClose={onClose} closeLabel="Stäng nytt samtal">
      <div className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="input"
          placeholder="Sök person"
          aria-label="Sök person"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {(students.loading || staff.loading) && <LoadingState label="Hämtar personer…" />}
      {students.error && <ErrorState message={students.error} onRetry={students.reload} />}
      {staff.error && <ErrorState message={staff.error} onRetry={staff.reload} />}

      {!students.loading && !staff.loading && visible.length === 0 && (
        <EmptyState
          title="Inga personer att skriva till"
          description="Koppla elever under Mina elever, sedan kan du starta samtal här."
        />
      )}

      {visible.length > 0 && (
        <ul className="list">
          {visible.map((person) => (
            <li className="list-item list-item-static" key={person.id}>
              <div className="list-item-content">
                <div className="list-item-title mono">{person.username}</div>
                <div className="list-item-sub">{person.kind}</div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onPick(person.id)}
              >
                Starta
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
