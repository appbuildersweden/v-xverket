import React, { useState } from 'react';
import { GraduationCap, MessageCircle, Users } from 'lucide-react';
import { ClassInfo, getClassChannelId, listClasses } from '../../lib/classes';
import { useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, SectionCard } from '../../components/ui';
import { MessageThread } from '../../components/MessageThread';

/**
 * Klasschatt. Kanalen hör till klassen och servern kontrollerar medlemskapet vid
 * varje läsning och sändning — den som inte går i klassen kommer inte åt den.
 */
export const KlasschattPage: React.FC<{ onNavigate?: (pageId: string) => void }> = ({
  onNavigate = () => undefined,
}) => {
  const classes = useAsync(listClasses);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mine = (classes.data ?? []).filter((c) => c.member_role === 'elev');
  const selected: ClassInfo | undefined = mine.find((c) => c.id === selectedId) ?? mine[0];

  return (
    <div className="panel-page" data-testid="page-elev-klasschatt">
      <SectionCard title="Klasschatt" subtitle="Bara du och din klass ser den">
        {classes.loading && <LoadingState label="Hämtar din klass…" />}
        {!classes.loading && classes.error && (
          <ErrorState message={classes.error} onRetry={classes.reload} />
        )}

        {classes.data && mine.length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title="Du är inte med i någon klass ännu"
            description="Klasschatten öppnas först när din lärare har godkänt att du är med i klassen. Har du en klasskod? Ansök under Min klass."
            action={
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onNavigate('klass')}
              >
                Till Min klass
              </button>
            }
          />
        )}

        {mine.length > 1 && (
          <div className="row-actions">
            {mine.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${selected?.id === c.id ? 'chip-active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selected && <ClassChannel classInfo={selected} />}
    </div>
  );
};

const ClassChannel: React.FC<{ classInfo: ClassInfo }> = ({ classInfo }) => {
  const channel = useAsync(() => getClassChannelId(classInfo.id), [classInfo.id]);

  return (
    <SectionCard
      title={`Klasschatt: ${classInfo.name}`}
      subtitle="Meddelanden sparas och visas för klassens medlemmar"
    >
      {channel.loading && <LoadingState label="Öppnar klasschatten…" />}
      {!channel.loading && channel.error && (
        <ErrorState message={channel.error} onRetry={channel.reload} />
      )}
      {channel.data && (
        <MessageThread
          channelId={channel.data}
          channelLabel={classInfo.name}
          emptyText="Ingen har skrivit i klasschatten ännu. Säg hej!"
          composePlaceholder="Skriv till klassen…"
        />
      )}
      <p className="security-note">
        <MessageCircle size={14} aria-hidden="true" />
        Tänk på att allt du skriver här kan läsas av alla i klassen och av din lärare.
      </p>
      {!channel.data && !channel.loading && (
        <EmptyState
          icon={<GraduationCap size={22} />}
          title="Klasschatten kunde inte öppnas"
          description="Försök igen om en stund, eller kontakta din lärare."
        />
      )}
    </SectionCard>
  );
};
