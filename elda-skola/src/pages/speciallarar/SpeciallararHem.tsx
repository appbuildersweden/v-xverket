import React from 'react';
import { ArrowRight, ClipboardCheck, MessageSquare, UserRound } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import { listAdaptations, listConversations, listMyMessages, listSpecialStudents } from '../../lib/api';
import { dateTime, displayName, longDate, shortDate, truncate } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageIntro, Spinner, Stat } from '../../components/ui';
import { SchoolNews } from '../../components/SchoolNews';

interface Props {
  onNavigate: (page: string) => void;
}

/**
 * Speciallärarens översikt. Allt här är verklig data: elever specialläraren är
 * kopplad till, elevstöd som behöver följas upp och olästa meddelanden.
 */
export const SpeciallararHem: React.FC<Props> = ({ onNavigate }) => {
  const { identity, profile } = useAuth();
  const state = useAsync(async () => {
    const [students, adaptations, conversations, inbox] = await Promise.all([
      listSpecialStudents(),
      listAdaptations(),
      listConversations(),
      listMyMessages(),
    ]);
    return { students, adaptations, conversations, inbox };
  }, []);

  if (state.loading) return <Spinner label="Hämtar din översikt…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Startsida" />
        <Card>
          <EmptyState
            title="Kunde inte hämta översikten"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  const students = state.data?.students ?? [];
  const adaptations = state.data?.adaptations ?? [];
  const conversations = state.data?.conversations ?? [];
  const inbox = state.data?.inbox ?? [];

  const openAdaptations = adaptations.filter((row) => row.status === 'aktiv');
  const unreadMessages =
    conversations.reduce((sum, row) => sum + row.unread_count, 0) +
    inbox.filter((row) => !row.read_at).length;
  const name = profile ? displayName(profile) : identity?.username ?? '';

  return (
    <div>
      <PageIntro
        eyebrow="Startsida"
        title={`Hej ${name.split(' ')[0] || ''}`}
        description={`${longDate()} · Dina elever, elevstöd och meddelanden i en samlad vy.`}
      />

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Stat label="Mina elever" value={students.length} hint="Kopplade till dig" />
        <Stat
          label="Aktiva stödinsatser"
          value={openAdaptations.length}
          tone={openAdaptations.length ? 'green' : 'neutral'}
        />
        <Stat
          label="Olästa meddelanden"
          value={unreadMessages}
          tone={unreadMessages ? 'amber' : 'neutral'}
        />
        <Stat label="Konversationer" value={conversations.length} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <SchoolNews />
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <Card
            title="Elever jag arbetar med"
            subtitle="Elever som är kopplade till dig eller går i din klass"
            action={
              <Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={() => onNavigate('elever')}>
                Alla elever
              </Button>
            }
          >
            {students.length === 0 ? (
              <EmptyState
                icon={<UserRound size={22} />}
                title="Inga elever kopplade ännu"
                description="Du ser elever som systemadministratören eller en lärare har kopplat till dig. Kopplingen kräver att ni tillhör samma skola."
              />
            ) : (
              <div className="list">
                {students.slice(0, 5).map((student) => (
                  <div key={student.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{student.display_name}</p>
                      <p className="list-sub">
                        @{student.username}
                        {student.class_name ? ` · ${student.class_name}` : ''}
                      </p>
                    </div>
                    <div className="list-side">
                      <Badge tone={student.open_adaptations > 0 ? 'green' : 'neutral'}>
                        {student.open_adaptations} aktiva stöd
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Elevstöd att följa upp"
            subtitle="Aktiva anpassningar för dina elever"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('elever')}>
                Hantera
              </Button>
            }
          >
            {openAdaptations.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck size={22} />}
                title="Inget elevstöd att följa upp"
                description="När du eller en lärare skapar en anpassning för en av dina elever visas den här."
              />
            ) : (
              <div className="list">
                {openAdaptations.slice(0, 5).map((row) => (
                  <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="list-main">
                      <p className="list-title">{row.title}</p>
                      <p className="list-sub">
                        {row.student_name}
                        {row.subject ? ` · ${row.subject}` : ''} · uppdaterad {shortDate(row.updated_at)}
                      </p>
                      {row.measures && (
                        <p className="list-sub">{truncate(row.measures, 120)}</p>
                      )}
                    </div>
                    <Badge tone="green">{row.status === 'aktiv' ? 'Aktiv' : 'Avslutad'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card
            title="Senaste meddelanden"
            subtitle="Interna meddelanden inom din skola"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('meddelanden')}>
                Öppna
              </Button>
            }
          >
            {conversations.length === 0 && inbox.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={22} />}
                title="Inga meddelanden ännu"
                description="Du kan skriva till elever du arbetar med och till lärare på din skola."
                action={<Button onClick={() => onNavigate('meddelanden')}>Nytt meddelande</Button>}
              />
            ) : (
              <div className="list">
                {conversations.slice(0, 4).map((row) => (
                  <div key={row.channel_id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{row.other_name}</p>
                      <p className="list-sub">{truncate(row.last_body ?? 'Inga meddelanden ännu', 90)}</p>
                      <p className="list-sub">{dateTime(row.last_at)}</p>
                    </div>
                    {row.unread_count > 0 && <Badge tone="green">{row.unread_count}</Badge>}
                  </div>
                ))}
                {inbox.slice(0, 3).map((row) => (
                  <div key={row.id} className="list-row">
                    <div className="list-main">
                      <p className="list-title">{row.subject}</p>
                      <p className="list-sub">
                        Från skolan · {row.sender_name} · {dateTime(row.created_at)}
                      </p>
                    </div>
                    {!row.read_at && <Badge tone="amber">Ny</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Din skola" subtitle="All kommunikation sker inom din skolorganisation">
            <p className="small muted" style={{ margin: 0 }}>
              Du ser bara elever, elevstöd och meddelanden som hör till din skola. Elever kan inte
              läsa interna läraranteckningar, och meddelanden till en annan skola nekas av servern.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
