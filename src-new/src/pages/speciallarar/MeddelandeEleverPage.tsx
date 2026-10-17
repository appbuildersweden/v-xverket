import React, { useState } from 'react';
import { MessageSquare, Search, Users } from 'lucide-react';
import { StudentSummary, filterStudents, listMyStudents, sortStudents } from '../../lib/students';
import { DirectConversation, listDirectConversations, openDirectChannel } from '../../lib/chat';
import { useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, SectionCard, Toolbar } from '../../components/ui';
import { MessageThread } from '../../components/MessageThread';

interface Props {
  onNavigate: (pageId: string) => void;
}

/**
 * Meddelande-elever: välj en elev och skriv. Samtalet är privat och skapas av
 * servern bara mellan dig och eleven.
 */
export const MeddelandeEleverPage: React.FC<Props> = ({ onNavigate }) => {
  const students = useAsync(listMyStudents);
  const conversations = useAsync(listDirectConversations);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const conversationByStudent = new Map<string, DirectConversation>(
    (conversations.data ?? []).map((c) => [c.otherId, c]),
  );

  const open = async (student: StudentSummary) => {
    setBusyId(student.id);
    setError(null);
    const result = await openDirectChannel(student.id);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelected(student);
    setChannelId(result.data);
    conversations.reload();
  };

  const visible = sortStudents(filterStudents(students.data ?? [], query));

  return (
    <div className="panel-page" data-testid="page-speciallarar-meddelande-elever">
      <SectionCard title="Meddelande-elever" subtitle="Privata samtal med dina elever">
        {students.loading && <LoadingState label="Hämtar dina elever…" />}
        {!students.loading && students.error && (
          <ErrorState message={students.error} onRetry={students.reload} />
        )}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {students.data && students.data.length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title="Inga elever kopplade ännu"
            description="Koppla en elev under Mina elever, sedan kan ni skriva till varandra här."
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('elever')}
              >
                Öppna Mina elever
              </button>
            }
          />
        )}

        {students.data && students.data.length > 0 && (
          <>
            <Toolbar>
              <div className="search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  className="input"
                  placeholder="Sök elev"
                  aria-label="Sök elev"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </Toolbar>

            <ul className="list">
              {visible.map((student) => {
                const conversation = conversationByStudent.get(student.id);
                return (
                  <li className="list-item list-item-static" key={student.id}>
                    <MessageSquare size={16} aria-hidden="true" />
                    <div className="list-item-content">
                      <div className="list-item-title mono">{student.username}</div>
                      <div className="list-item-sub">
                        {conversation?.lastBody
                          ? conversation.lastBody.slice(0, 60)
                          : 'Ingen konversation ännu'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => void open(student)}
                      disabled={busyId === student.id}
                    >
                      {busyId === student.id ? 'Öppnar…' : 'Skriv'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SectionCard>

      {selected && channelId && (
        <SectionCard
          title={`Konversation med ${selected.username}`}
          subtitle="Bara ni två ser den här konversationen"
        >
          <MessageThread
            channelId={channelId}
            channelLabel={selected.username}
            emptyText={`Inga meddelanden med ${selected.username} ännu. Skriv det första.`}
            onAfterSend={() => conversations.reload()}
          />
        </SectionCard>
      )}
    </div>
  );
};
