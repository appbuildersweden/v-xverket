import React, { useMemo, useState } from 'react';
import { MailOpen, MessageSquare } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import { listAnnouncements, listClasses, markAnnouncementRead } from '../../lib/api';
import { dateTime, truncate } from '../../lib/format';
import type { Announcement } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageIntro, Spinner } from '../../components/ui';
import { InboxMessages } from '../../components/InboxMessages';

export const ElevMeddelanden: React.FC = () => {
  const state = useAsync(async () => {
    const classes = await listClasses();
    const rows = await listAnnouncements(classes.map((row) => row.id));
    return { classes, rows };
  }, []);
  const [active, setActive] = useState<Announcement | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => (state.data?.rows ?? []).filter((row) => (onlyUnread ? !row.read_at : true)),
    [state.data, onlyUnread],
  );
  const unread = (state.data?.rows ?? []).filter((row) => !row.read_at).length;

  const open = async (row: Announcement) => {
    setActive(row);
    if (!row.read_at) {
      try {
        await markAnnouncementRead(row.id);
        await state.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kunde inte markera som läst.');
      }
    }
  };

  if (state.loading) return <Spinner label="Hämtar meddelanden…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Meddelanden" />
        <Card><EmptyState title="Kunde inte hämta meddelanden" description={state.error} action={<Button onClick={() => void state.reload()}>Försök igen</Button>} /></Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Elevpanel"
        title="Meddelanden"
        description="Information från dina lärare. Du ser bara meddelanden för de klasser du är med i."
        actions={
          <Button
            variant={onlyUnread ? 'secondary' : 'ghost'}
            icon={<MailOpen size={16} />}
            onClick={() => setOnlyUnread((value) => !value)}
          >
            {onlyUnread ? 'Visa alla' : `Olästa (${unread})`}
          </Button>
        }
      />
      {error && <Alert>{error}</Alert>}

      <div style={{ marginBottom: 16 }}>
        <InboxMessages />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} />}
            title={onlyUnread ? 'Inga olästa meddelanden' : 'Inga meddelanden ännu'}
            description="När en lärare publicerar information för din klass visas den här."
          />
        ) : (
          <div className="list">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="message-row"
                onClick={() => void open(row)}
                style={{ textAlign: 'left' }}
              >
                <span className={`message-dot ${row.read_at ? 'read' : ''}`} />
                <span className="list-main">
                  <span className="row" style={{ gap: 8, marginBottom: 2 }}>
                    <strong className="list-title" style={{ margin: 0 }}>{row.title}</strong>
                    {!row.read_at && <Badge tone="green">Ny</Badge>}
                  </span>
                  <span className="list-sub" style={{ display: 'block' }}>{truncate(row.body, 150)}</span>
                  <span className="list-sub" style={{ display: 'block' }}>{row.author_name} · {dateTime(row.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {active && (
        <Modal open title={active.title} onClose={() => setActive(null)} footer={<Button onClick={() => setActive(null)}>Stäng</Button>}>
          <div className="row" style={{ marginBottom: 12 }}>
            <Badge tone="green">Information</Badge>
            <span className="small muted">{active.author_name} · {dateTime(active.created_at)}</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{active.body}</p>
        </Modal>
      )}

      <style>{`
        .message-row{display:flex;gap:11px;align-items:flex-start;width:100%;border:0;border-bottom:1px solid var(--border);background:transparent;padding:13px 2px}
        .message-row:last-child{border-bottom:0}
        .message-row:hover{background:var(--surface-2)}
        .message-dot{width:8px;height:8px;border-radius:50%;background:var(--green);margin-top:6px;flex:0 0 8px}
        .message-dot.read{background:var(--border-strong)}
      `}</style>
    </div>
  );
};
