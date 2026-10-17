import React, { useState } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { listAdminAccounts } from '../../lib/classes';
import { openDirectChannel } from '../../lib/chat';
import { useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, SectionCard } from '../../components/ui';
import { MessageThread } from '../../components/MessageThread';

/**
 * Kontakta administratören.
 *
 * Samtalet öppnas av servern (`open_direct_channel`), som bara tillåter lärare
 * att starta ett samtal med en administratör — eller med en elev i sin egen
 * klass. Eleven kan aldrig starta ett samtal med en annan elev.
 */
export const KontaktAdminPage: React.FC = () => {
  const admins = useAsync(listAdminAccounts);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [openWith, setOpenWith] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (id: string, username: string) => {
    setError(null);
    setOpenWith(username);
    setChannelId(null);
    const result = await openDirectChannel(id);
    if (!result.ok) {
      setError(result.error);
      setOpenWith(null);
      return;
    }
    setChannelId(result.data);
  };

  return (
    <div className="panel-page" data-testid="page-larare-kontakt-admin">
      <SectionCard
        title="Kontakta administratören"
        subtitle="Frågor om konton, klasser eller behörigheter"
        action={
          <button type="button" className="btn btn-outline btn-sm" onClick={admins.reload}>
            <RefreshCw size={15} /> Uppdatera
          </button>
        }
      >
        {admins.loading && <LoadingState label="Hämtar administratörer…" />}
        {!admins.loading && admins.error && (
          <ErrorState message={admins.error} onRetry={admins.reload} />
        )}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {admins.data && admins.data.length === 0 && (
          <EmptyState
            icon={<MessageSquare size={22} />}
            title="Ingen administratör finns ännu"
            description="När ett adminkonto är aktivt kan du skriva direkt till det härifrån."
          />
        )}

        {admins.data && admins.data.length > 0 && (
          <ul className="list">
            {admins.data.map((admin) => (
              <li className="list-item" key={admin.id}>
                <MessageSquare size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title mono">{admin.username}</div>
                  <div className="list-item-sub">Administratör</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void start(admin.id, admin.username)}
                >
                  Skriv
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {openWith && (
        <SectionCard title={`Samtal med ${openWith}`} subtitle="Endast ni två ser meddelandena">
          <MessageThread
            channelId={channelId}
            channelLabel={openWith}
            emptyText="Inga meddelanden ännu. Beskriv kort vad du behöver hjälp med."
            composePlaceholder="Skriv till administratören…"
          />
        </SectionCard>
      )}
    </div>
  );
};
