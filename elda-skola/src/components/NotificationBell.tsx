import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import {
  type AppNotification,
  type NotificationKind,
  useNotifications,
} from '../lib/notifications';

const KIND_LABEL: Record<NotificationKind, string> = {
  new_message: 'Meddelande',
  new_assignment: 'Uppgift',
  assignment_feedback: 'Återkoppling',
  announcement_published: 'Information',
};

export function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('sv-SE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  /** Sidnycklarna i den inloggade rollens meny. Klick navigerar bara dit. */
  pages: string[];
  onNavigate: (page: string) => void;
  enabled?: boolean;
}

export const NotificationBell: React.FC<Props> = ({ pages, onNavigate, enabled = true }) => {
  const { items, unread, loading, error, live, refresh, markRead, markAllRead } =
    useNotifications(enabled);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Stäng panelen vid klick utanför eller Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = async (item: AppNotification) => {
    if (!item.readAt) await markRead(item.id);
    // Navigera bara till sidor som finns i användarens egen meny.
    if (pages.includes(item.targetPage)) {
      setOpen(false);
      onNavigate(item.targetPage);
    }
  };

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <div className="notify-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notify-btn"
        aria-label={unread > 0 ? `Notifikationer, ${unread} olästa` : 'Notifikationer'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        title="Notifikationer"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="notify-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="notify-panel" id={panelId} role="dialog" aria-label="Notifikationer">
          <div className="notify-head">
            <div>
              <strong>Notifikationer</strong>
              <span className="small muted">
                {unread === 0 ? 'Inga olästa' : `${unread} olästa`}
                {live ? '' : ' · uppdateras vid fokus'}
              </span>
            </div>
            <div className="notify-head-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => void refresh()}
                aria-label="Uppdatera notifikationer"
                title="Uppdatera"
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void markAllRead()}
                disabled={unread === 0}
              >
                <CheckCheck size={15} /> Markera alla som lästa
              </button>
            </div>
          </div>

          {error && (
            <p className="notify-error" role="alert">
              {error}
            </p>
          )}

          {loading && items.length === 0 ? (
            <p className="notify-empty muted small" role="status">
              Hämtar notifikationer…
            </p>
          ) : items.length === 0 ? (
            <p className="notify-empty muted small">
              {error ? 'Kunde inte visa notifikationer just nu.' : 'Inga notifikationer ännu.'}
            </p>
          ) : (
            <ul className="notify-list">
              {items.map((item) => {
                const actionable = pages.includes(item.targetPage);
                return (
                  <li key={item.id} className={`notify-item ${item.readAt ? '' : 'notify-unread'}`}>
                    <button
                      type="button"
                      className="notify-item-btn"
                      onClick={() => void openItem(item)}
                      aria-label={`${item.title}${item.readAt ? '' : ' (oläst)'}`}
                    >
                      <span className="notify-kind">{KIND_LABEL[item.kind]}</span>
                      <span className="notify-title">{item.title}</span>
                      {item.body && <span className="notify-body">{item.body}</span>}
                      <span className="small muted">
                        {formatNotificationTime(item.createdAt)}
                        {actionable ? '' : ' · öppnas från menyn'}
                      </span>
                    </button>
                    {!item.readAt && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm notify-mark"
                        onClick={() => void markRead(item.id)}
                      >
                        Markera som läst
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
