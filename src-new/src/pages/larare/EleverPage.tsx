import React, { useState } from 'react';
import { MessageSquare, Users } from 'lucide-react';
import { MyStudent, groupStudentsByClass, listMyStudents } from '../../lib/classes';
import { openDirectChannel } from '../../lib/chat';
import { useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, SectionCard } from '../../components/ui';
import { Modal } from '../../components/forms';
import { MessageThread } from '../../components/MessageThread';

/**
 * Mina elever.
 *
 * Listan kommer från `list_my_students`, som bara returnerar elever i klasser
 * där den inloggade själv är lärare. Privata elever som aldrig anslutit till en
 * klass finns därför inte här — läraren ser dem aldrig, och servern skulle inte
 * heller lämna ut dem.
 */
export const EleverPage: React.FC = () => {
  const students = useAsync(listMyStudents);
  const [chat, setChat] = useState<{ id: string; username: string } | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('alla');

  const startChat = async (student: MyStudent) => {
    setError(null);
    setChat({ id: student.id, username: student.username });
    setChannelId(null);
    const result = await openDirectChannel(student.id);
    if (!result.ok) {
      setError(result.error);
      setChat(null);
      return;
    }
    setChannelId(result.data);
  };

  const groups = groupStudentsByClass(students.data ?? []);
  const privateCount = (students.data ?? []).filter((s) => s.account_type === 'privat').length;

  // Klassen visas tillsammans med eleven så att listan kan filtreras per klass.
  const visible = groups
    .filter((group) => selectedClass === 'alla' || group.classId === selectedClass)
    .flatMap((group) =>
      group.students.map((student) => ({ student, className: group.className })),
    );

  return (
    <div className="panel-page" data-testid="page-larare-elever">
      <SectionCard
        title="Mina elever"
        subtitle={
          students.data
            ? `${students.data.length} elever i dina klasser${privateCount > 0 ? ` · ${privateCount} privata elever` : ''}`
            : 'Eleverna i dina egna klasser'
        }
      >
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
            title="Inga elever ännu"
            description="Elever dyker upp här när de har angett din klasskod och du har godkänt deras ansökan."
          />
        )}

        {groups.length > 1 && (
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${selectedClass === 'alla' ? 'chip-active' : ''}`}
              onClick={() => setSelectedClass('alla')}
            >
              Alla ({students.data?.length ?? 0})
            </button>
            {groups.map((group) => (
              <button
                key={group.classId}
                type="button"
                className={`chip ${selectedClass === group.classId ? 'chip-active' : ''}`}
                onClick={() => setSelectedClass(group.classId)}
              >
                {group.className} ({group.students.length})
              </button>
            ))}
          </div>
        )}

        {visible.length > 0 && (
          <ul className="list">
            {visible.map(({ student, className }) => (
              <li className="list-item" key={`${className}:${student.id}`}>
                <Users size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title mono">{student.username}</div>
                  <div className="list-item-sub">
                    {student.account_type === 'privat' ? 'Privat elev' : 'Skolelev'} · {className}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void startChat(student)}
                >
                  <MessageSquare size={15} /> Skicka meddelande
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {chat && (
        <Modal title={`Samtal med ${chat.username}`} onClose={() => setChat(null)}>
          <MessageThread
            channelId={channelId}
            channelLabel={chat.username}
            emptyText="Inga meddelanden ännu. Skriv det första!"
            composePlaceholder="Skriv till eleven…"
          />
        </Modal>
      )}
    </div>
  );
};
