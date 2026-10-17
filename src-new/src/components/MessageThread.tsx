import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import {
  ChatMessage,
  POLL_INTERVAL_MS,
  REALTIME_DEBOUNCE_MS,
  listMessages,
  mergeMessages,
  messageStamp,
  sendMessage,
  subscribeToChannel,
  validateMessage,
} from '../lib/chat';
import { useAuth } from '../lib/AuthContext';
import { EmptyState, ErrorState, LoadingState } from './ui';

interface MessageThreadProps {
  /** Kanalen som visas. Null betyder att ingen kanal valts ännu. */
  channelId: string | null;
  channelLabel?: string;
  emptyText?: string;
  composePlaceholder?: string;
  /** Hur ofta nya meddelanden hämtas. 0 stänger av automatisk uppdatering. */
  pollMs?: number;
  /** Anropas efter att ett meddelande skickats (t.ex. för att uppdatera en lista). */
  onAfterSend?: () => void;
  children?: React.ReactNode;
}

/**
 * Visar en kanals meddelanden och låter användaren skriva nya.
 *
 * Meddelandena hämtas från servern — vid öppning, vid sändning, när ett nytt
 * meddelande signaleras via realtid och med jämna mellanrum. Allt som visas går
 * genom serverns åtkomstkontroll, och dubbletter filtreras bort på meddelande-id,
 * så att en händelse och en hämtning aldrig ger två rader.
 */
export const MessageThread: React.FC<MessageThreadProps> = ({
  channelId,
  channelLabel,
  emptyText = 'Inga meddelanden ännu. Skriv det första!',
  composePlaceholder = 'Skriv ett meddelande…',
  pollMs = POLL_INTERVAL_MS,
  onAfterSend,
  children,
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    const result = await listMessages(channelId);
    if (result.ok) {
      setError(null);
      setMessages((prev) => mergeMessages(prev, result.data));
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setSendError(null);
    if (!channelId) return;
    void load();
  }, [channelId, load]);

  useEffect(() => {
    if (!channelId || pollMs <= 0) return;
    const timer = window.setInterval(() => {
      void load();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [channelId, pollMs, load]);

  // Nya meddelanden via realtid. Hämtningen sker med en kort paus emellan, så
  // att en livlig klasschatt inte ger en hämtning per meddelande.
  useEffect(() => {
    if (!channelId) return;
    let last = 0;
    const unsubscribe = subscribeToChannel(channelId, () => {
      const now = Date.now();
      if (now - last < REALTIME_DEBOUNCE_MS) return;
      last = now;
      void load();
    });
    return unsubscribe;
  }, [channelId, load]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId) return;

    const problem = validateMessage(draft);
    if (problem) {
      setSendError(problem);
      return;
    }

    setSending(true);
    setSendError(null);
    const result = await sendMessage(channelId, draft);
    setSending(false);

    if (!result.ok) {
      setSendError(result.error);
      return;
    }

    setDraft('');
    setMessages((prev) => mergeMessages(prev, [result.data]));
    onAfterSend?.();
  };

  if (children && !channelId) {
    return <>{children}</>;
  }

  return (
    <div className="chat-panel" data-testid="message-thread">
      <div className="chat-head">
        <div>
          <div className="chat-head-title">{channelLabel ?? 'Konversation'}</div>
          <div className="chat-head-sub">
            {messages.length > 0
              ? `${messages.length} meddelanden`
              : 'Inga meddelanden ännu'}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void load()}
          disabled={loading || !channelId}
        >
          <RefreshCw size={15} /> Uppdatera
        </button>
      </div>

      {loading && messages.length === 0 && <LoadingState label="Hämtar meddelanden…" />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!error && !loading && messages.length === 0 && (
        <div className="chat-empty">
          <EmptyState title="Tomt i konversationen" description={emptyText} />
        </div>
      )}

      <div className="chat-messages" ref={listRef} aria-live="polite">
        {messages.map((message) => {
          const mine = user?.id === message.sender_id;
          return (
            <div
              key={message.id}
              className={`chat-line ${mine ? 'chat-line-own' : ''}`}
            >
              <div className="chat-bubble">
                <div className="chat-sender">
                  {mine ? 'Du' : message.sender_username}
                  <span className="chat-stamp">{messageStamp(message.created_at)}</span>
                </div>
                <div className="chat-text">{message.body}</div>
              </div>
            </div>
          );
        })}
      </div>

      <form className="chat-composer" onSubmit={(e) => void handleSend(e)}>
        {sendError && (
          <p className="field-hint field-hint-error" role="alert" data-testid="send-error">
            {sendError}
          </p>
        )}
        <div className="chat-composer-inner">
          <label className="visually-hidden" htmlFor="chat-draft">
            Meddelande
          </label>
          <textarea
            id="chat-draft"
            className="chat-textarea"
            value={draft}
            placeholder={composePlaceholder}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend(e);
              }
            }}
          />
          <button type="submit" className="chat-send" disabled={sending || !channelId}>
            <Send size={15} /> {sending ? 'Skickar…' : 'Skicka'}
          </button>
        </div>
      </form>
    </div>
  );
};
