import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Info, Loader2, FileDown, RotateCcw } from 'lucide-react';
import { askAi, askAiForDoc, type ChatTurn } from '../lib/ai';
import { downloadDocx } from '../lib/word';

type ChatPanel = 'elev' | 'speciallarar' | 'admin';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Sätt markeras som misslyckade och kan skickas igen. */
  failed?: boolean;
}

interface AiChatPageProps {
  panel: ChatPanel;
}

const TITLES: Record<ChatPanel, string> = {
  elev: 'AI-studiehjälp',
  speciallarar: 'AI-assistent',
  admin: 'AI-chat',
};

const INTRO: Record<ChatPanel, string> = {
  elev: 'Ställ en fråga om skolämnen. Jag förklarar steg för steg och hjälper dig att förstå — fråga gärna följdfrågor.',
  speciallarar: 'Jag hjälper med planering, lektionsidéer, arbetsblad och anpassat material. Be mig också skapa ett Word-dokument.',
  admin: 'Jag hjälper med administrativ planering, information och dokument. Ändringar av konton och roller görs i appens egna funktioner.',
};

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

/**
 * AI-chattens gränssnitt.
 *
 * Skickar konversationen till den skyddade Edge Functionen `ai-chat`, som
 * verifierar roll serversidigt och anropar OpenRouter. Här finns inga
 * API-nycklar. När AI:n arbetar visas en tydlig indikator, och ett fel ger
 * möjlighet att försöka igen utan att tappa konversationen.
 */
export const AiChatPage: React.FC<AiChatPageProps> = ({ panel }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [lastDoc, setLastDoc] = useState<{ name: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Textfältet växer med innehållet (upp till en gräns).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  // Håll konversationen rullad till botten när nya meddelanden läggs till.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const canSend = draft.trim().length > 0 && !busy && !docBusy;

  // Bygg en ren konversationstråd att skicka till AI:n (utan id och fel).
  const toHistory = (list: ChatMessage[]): ChatTurn[] =>
    list
      .filter((m) => !m.failed)
      .map((m) => ({ role: m.role, content: m.content }));

  /** Skicka frågan till AI-backenden. */
  const sendToAi = async (history: ChatTurn[]) => {
    setBusy(true);
    setError(null);
    setStatus('AI:n tänker…');

    const pendingId = nextMessageId();
    setMessages((prev) => [
      ...prev,
      { id: pendingId, role: 'assistant', content: '' },
    ]);

    const result = await askAi(history);
    setBusy(false);
    setStatus(null);

    setMessages((prev) => {
      const next = [...prev];
      const idx = next.findIndex((m) => m.id === pendingId);
      if (idx === -1) return prev;
      if (result.ok) {
        next[idx] = {
          id: pendingId,
          role: 'assistant',
          content: result.content,
        };
      } else {
        next[idx] = {
          id: pendingId,
          role: 'assistant',
          content: result.error,
          failed: true,
        };
        setError(result.error);
      }
      return next;
    });
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || busy || docBusy) return;

    const userMsg: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      content: text,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setDraft('');
    setLastDoc(null);
    setDocError(null);
    void sendToAi(toHistory(next));
  };

  /** Försök igen med hittills varande konversation. */
  const handleRetry = () => {
    const clean = messages.filter((m) => !m.failed);
    setMessages(clean);
    void sendToAi(toHistory(clean));
  };

  /** Be AI:n skapa ett Word-dokument av konversationen och ladda ner det. */
  const handleDoc = async () => {
    if (busy || docBusy) return;
    const history = toHistory(messages);
    if (history.length === 0) {
      setError('Skriv vad du vill ha i dokumentet först.');
      return;
    }
    setDocBusy(true);
    setError(null);
    setDocError(null);
    setStatus('Skapar dokument…');

    const result = await askAiForDoc(history);
    setDocBusy(false);
    setStatus(null);

    if (!result.ok) {
      setDocError(result.error);
      return;
    }

    try {
      const name = await downloadDocx(result.doc);
      setLastDoc({ name });
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          content: `📄 **Dokumentet är klart** — *${name}*.\n\nDet har sparats till din nedladdningsmapp. Fråga gärna om du vill ändra något i innehållet, så skapar jag en ny version.`,
        },
      ]);
    } catch {
      setError('Dokumentet kunde inte laddas ner. Försök igen.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-notice" role="note">
        <Info size={15} />
        <span>
          {TITLES[panel]} är ansluten. Svar kommer från AI-tjänsten via
          Eldas server. Dela aldrig känsliga personuppgifter här.
        </span>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        <div className="chat-thread">
          {messages.length === 0 ? (
            <div className="chat-intro">
              <img src="/elda-icon.png" alt="Elda" />
              <h2>{TITLES[panel]}</h2>
              <p>{INTRO[panel]}</p>
            </div>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <div className="chat-msg chat-msg-user" key={m.id}>
                  <div className="chat-bubble">{m.content}</div>
                </div>
              ) : m.failed ? (
                <div className="chat-msg chat-msg-ai" key={m.id}>
                  <div className="chat-error" role="alert">
                    <span>{m.content}</span>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={handleRetry}
                      disabled={busy}
                    >
                      <RotateCcw size={13} /> Försök igen
                    </button>
                  </div>
                </div>
              ) : m.content === '' ? (
                <div className="chat-msg chat-msg-ai" key={m.id}>
                  <div className="chat-typing" aria-live="polite">
                    <Loader2 size={15} className="spin" />
                    <span>AI:n skriver…</span>
                  </div>
                </div>
              ) : (
                <div className="chat-msg chat-msg-ai" key={m.id}>
                  <div className="chat-rich">{renderRichText(m.content)}</div>
                </div>
              ),
            )
          )}
        </div>
      </div>

      <div className="chat-composer">
        {error && !messages.some((m) => m.failed) && (
          <div className="chat-error-inline" role="alert">
            <span>{error}</span>
            <button className="view-link" onClick={handleRetry} disabled={busy}>
              Försök igen
            </button>
          </div>
        )}
        {docError && (
          <div className="chat-error-inline" role="alert">
            <span>{docError}</span>
            <button
              className="view-link"
              onClick={() => void handleDoc()}
              disabled={busy || docBusy}
            >
              Försök igen
            </button>
          </div>
        )}
        <div className="chat-composer-inner">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              busy || docBusy ? 'AI:n arbetar…' : 'Skriv ett meddelande…'
            }
            aria-label="Meddelande"
            disabled={busy || docBusy}
          />
          <button
            type="button"
            className="chat-doc"
            onClick={() => void handleDoc()}
            disabled={busy || docBusy || messages.length === 0}
            aria-label="Skapa Word-dokument"
            title="Skapa ett Word-dokument av konversationen"
          >
            {docBusy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <FileDown size={16} />
            )}
          </button>
          <button
            type="button"
            className="chat-send"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Skicka meddelande"
            title="Skicka"
          >
            {busy ? <Loader2 size={17} className="spin" /> : <ArrowUp size={17} />}
          </button>
        </div>
        <div className="chat-status" role="status" aria-live="polite">
          {status ??
            (lastDoc
              ? `Senaste dokument: ${lastDoc.name}`
              : 'Enter skickar • Shift+Enter ger ny rad')}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------
// Rich text-renderer för AI-svar
// ----------------------------------------------------------------
// Hanterar rubriker (#, ##, ###), listor (• och numrerade), fetstil
// (**fetstil**), `kod i text` och kodblock (```...`).

function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(<strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>);
    } else {
      parts.push(
        <code className="chat-inline-code" key={`${keyBase}-c${i}`}>
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderRichText(text: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Kodblock
    if (line.trimStart().startsWith('```')) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={`k${key}`}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      key += 1;
      continue;
    }

    // Rubriker
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(
        <h4 key={`k${key}`}>{inline(h[2], `h${key}`)}</h4>,
      );
      key += 1;
      i += 1;
      continue;
    }

    // Punktlistor
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`k${key}`}>
          {items.map((t, ix) => (
            <li key={ix}>{inline(t, `u${key}-${ix}`)}</li>
          ))}
        </ul>,
      );
      key += 1;
      continue;
    }

    // Numrerade listor
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`k${key}`}>
          {items.map((t, ix) => (
            <li key={ix}>{inline(t, `o${key}-${ix}`)}</li>
          ))}
        </ol>,
      );
      key += 1;
      continue;
    }

    // Tomma rader
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Brödtext
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s|\s*[-*]\s+|\s*\d+\.\s+|\s*```)/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={`k${key}`}>{inline(para.join(' '), `p${key}`)}</p>);
    key += 1;
  }

  return blocks;
}
