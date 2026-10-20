import React, { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useAsync } from '../lib/useAsync';
import { listMyMessages, markMessageRead } from '../lib/api';
import { refreshUnread } from '../lib/unread';
import { dateTime, truncate } from '../lib/format';
import type { InboxMessage } from '../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Modal, Spinner } from './ui';

/**
 * Meddelanden som skolan har skickat direkt till den inloggade.
 *
 * Mottagaren är den enda som kan markera ett meddelande som läst; det görs via
 * en serverfunktion som bara rör den egna raden.
 */
export const InboxMessages: React.FC = () => {
  const state = useAsync(listMyMessages, []);
  const [active, setActive] = useState<InboxMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = state.data ?? [];
  const unread = rows.filter((row) => !row.read_at).length;

  const open = async (row: InboxMessage) => {
    setActive(row);
    if (row.read_at) return;
    try {
      await markMessageRead(row.id);
      await Promise.all([state.reload(), refreshUnread()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte markera meddelandet som läst.');
    }
  };

  return (
    <Card
      title="Från skolan"
      subtitle={unread > 0 ? `${unread} olästa av ${rows.length}` : `${rows.length} meddelanden`}
      action={<Inbox size={18} color="var(--green)" />}
    >
      {error && <Alert>{error}</Alert>}
      {state.loading ? (
        <Spinner label="Hämtar meddelanden…" />
      ) : state.error ? (
        <Alert>
          {state.error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => void state.reload()}>
              Försök igen
            </Button>
          </div>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Inga meddelanden från skolan"
          description="Meddelanden som administratören skickar till dig eller din klass visas här."
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
                  <strong className="list-title" style={{ margin: 0 }}>
                    {row.subject}
                  </strong>
                  {!row.read_at && <Badge tone="green">Ny</Badge>}
                </span>
                <span className="list-sub" style={{ display: 'block' }}>
                  {truncate(row.body, 150)}
                </span>
                <span className="list-sub" style={{ display: 'block' }}>
                  {row.sender_name} · {dateTime(row.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {active && (
        <Modal
          open
          title={active.subject}
          onClose={() => setActive(null)}
          footer={<Button onClick={() => setActive(null)}>Stäng</Button>}
        >
          <div className="row" style={{ marginBottom: 12 }}>
            <Badge tone="green">Från skolan</Badge>
            <span className="small muted">
              {active.sender_name} · {dateTime(active.created_at)}
            </span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{active.body}</p>
        </Modal>
      )}
    </Card>
  );
};
