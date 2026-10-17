import React, { useRef, useState } from 'react';
import { Download, Eraser, FileSpreadsheet, FileText, Presentation, Send, Sparkles } from 'lucide-react';
import {
  ChatTurn,
  AI_STARTERS,
  DOC_KINDS,
  DOC_KIND_HINTS,
  DOC_KIND_LABELS,
  DocKind,
  aiIntro,
  askAi,
  askAiForDoc,
  isAiServiceError,
  validateQuestion,
} from '../lib/ai';
import { BuiltFile, buildOfficeFile, downloadFile, formatFileSize, officeSummary } from '../lib/office';
import { PanelType } from '../lib/nav';

interface AiChatProps {
  panel: PanelType;
  /** Rubrik ovanför chatten, t.ex. "AI-studiehjälp". */
  title: string;
}

const KIND_ICONS: Readonly<Record<DocKind, React.ReactNode>> = {
  word: <FileText size={15} />,
  excel: <FileSpreadsheet size={15} />,
  powerpoint: <Presentation size={15} />,
  text: <FileText size={15} />,
  pdf: <FileText size={15} />,
};

/**
 * AI-chatten med dokumentgenerering.
 *
 * Svaren kommer från den skyddade serverfunktionen `ai-chat` — det finns ingen
 * inbyggd låtsaschatt: är AI-tjänsten inte konfigurerad visas serverns meddelande
 * om det, i stället för ett påhittat svar.
 *
 * AI:n kan använda text och PDF som kontext bakgrund för svaren. När elever
 * bifogar egna filer skickas endast textinnehållet till AI-tjänsten — inga
 * filer eller metadata skickas vidare förutom det som behövs för att besvara
 * frågan. Elevens privata filer är skyddade av RLS och autentiseringskontroll på
 * servern.
 *
 * Ett dokument skapas i två steg: AI:n får samtalet och formatets schema, och
 * svaret blir en riktig .docx-, .xlsx- eller .pptx-fil som visas för granskning
 * innan användaren laddar ner den. Misslyckas något av stegen visas ett tydligt
 * fel — aldrig en tom fil som ser ut att ha lyckats.
 * Text- och PDF-kontext skickas som ren text till AI-tjänsten.
 */
export const AiChat: React.FC<AiChatProps> = ({ panel, title }) => {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docKind, setDocKind] = useState<DocKind>('word');
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [built, setBuilt] = useState<{ file: BuiltFile; summary: string } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const scrollToEnd = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const send = async (text: string) => {
    if (busy) return;
    const problem = validateQuestion(text);
    if (problem) {
      setError(problem);
      return;
    }

    const next: ChatTurn[] = [...turns, { role: 'user', content: text.trim() }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    setError(null);
    window.setTimeout(scrollToEnd, 0);

    const result = await askAi(next);
    setBusy(false);
    if (result.ok) {
      setTurns((prev) => [...prev, { role: 'assistant', content: result.data }]);
    } else {
      setError(result.error);
    }
    window.setTimeout(scrollToEnd, 0);
  };

  const createDocument = async () => {
    if (docBusy || turns.length === 0) return;
    // Text och PDF får inte byggas till filer - visa bara som konversationstext
    if (docKind === 'text' || docKind === 'pdf') {
      setDocBusy(false);
      setDocError('Text- och PDF-kontext visas som samtal, inte som dokument att ladda ner.');
      return;
    }
    setDocBusy(true);
    setDocError(null);
    setBuilt(null);

    const result = await askAiForDoc(turns, docKind);
    if (!result.ok) {
      setDocBusy(false);
      setDocError(result.error);
      return;
    }

    try {
      const file = await buildOfficeFile(result.data);
      setBuilt({ file, summary: officeSummary(result.data) });
    } catch (buildError) {
      setDocError(
        buildError instanceof Error
          ? buildError.message
          : 'Filen kunde inte skapas. Försök igen.',
      );
    }
    setDocBusy(false);
  };

  return (
    <div className="ai-block">
      <div className="ai-chat" data-testid={`ai-chat-${panel}`}>
        <div className="chat-messages" ref={scroller}>
          <div className="chat-intro">
            <Sparkles size={18} aria-hidden="true" />
            <div>
              <div className="list-item-title">{title}</div>
              <p className="list-item-sub">{aiIntro(panel)}</p>
            </div>
          </div>

          {turns.map((turn, index) => (
            <div
              key={`${index}-${turn.role}`}
              className={`chat-msg ${turn.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}
            >
              {turn.content}
            </div>
          ))}

          {busy && <div className="chat-msg chat-msg-ai chat-typing">Tänker…</div>}

          {error && (
            <div className="chat-msg chat-msg-ai" data-testid="ai-error">
              <div
                className={`chat-error${isAiServiceError(error) ? ' chat-error-service' : ''}`}
                role="alert"
              >
                {/* Ett fel som gäller hela tjänsten märks som ett läge, inte som
                    ett fel eleven har gjort — annars ser det ut som att frågan
                    var fel och eleven skriver om den i onödan. */}
                {isAiServiceError(error) && (
                  <strong className="chat-error-title">AI-hjälpen är tillfälligt otillgänglig</strong>
                )}
                {error}
              </div>
            </div>
          )}
        </div>

        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          {turns.length === 0 && (
            <div className="chip-row">
              {AI_STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="chip"
                  onClick={() => void send(starter)}
                  disabled={busy}
                >
                  {starter}
                </button>
              ))}
            </div>
          )}

          <div className="chat-composer-inner">
            <label className="visually-hidden" htmlFor={`ai-draft-${panel}`}>
              Fråga
            </label>
            <textarea
              id={`ai-draft-${panel}`}
              className="chat-textarea"
              value={draft}
              placeholder="Skriv din fråga…"
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            <button type="submit" className="chat-send" disabled={busy}>
              <Send size={15} /> {busy ? 'Skickar…' : 'Skicka'}
            </button>
          </div>

          {turns.length > 0 && (
            <div className="chat-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setTurns([]);
                  setError(null);
                  setBuilt(null);
                  setDocError(null);
                }}
              >
                <Eraser size={15} /> Rensa chatten
              </button>
            </div>
          )}
        </form>
      </div>

      <section className="ai-doc" data-testid={`ai-doc-${panel}`}>
        <div className="ai-doc-head">
          <FileText size={15} aria-hidden="true" />
          <span>Skapa dokument av samtalet</span>
        </div>

        <div className="chip-row" role="group" aria-label="Filformat">
          {DOC_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${docKind === kind ? 'chip-active' : ''}`}
              aria-pressed={docKind === kind}
              onClick={() => {
                setDocKind(kind);
                setDocError(null);
                setBuilt(null);
              }}
              disabled={docBusy}
            >
              {KIND_ICONS[kind]} {DOC_KIND_LABELS[kind]}
            </button>
          ))}
        </div>

        <p className="field-hint">{DOC_KIND_HINTS[docKind]}</p>

        <div className="row-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void createDocument()}
            disabled={docBusy || turns.length === 0}
          >
            {KIND_ICONS[docKind]} {docBusy ? 'Skapar dokument…' : 'Skapa dokument'}
          </button>
          {built && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => downloadFile(built.file)}
            >
              <Download size={15} /> Ladda ner filen
            </button>
          )}
        </div>

        {turns.length === 0 && (
          <p className="field-hint">
            Ställ en fråga först. Sedan kan du göra ett dokument av svaret.
          </p>
        )}

        {docError && (
          <p className="field-hint field-hint-error" role="alert" data-testid={`ai-doc-error-${panel}`}>
            {docError}
          </p>
        )}

        {built && (
          <div className="ai-doc-file" data-testid={`ai-doc-file-${panel}`}>
            <div className="list-item-title mono">{built.file.fileName}</div>
            <div className="list-item-sub">
              {DOC_KIND_LABELS[built.file.kind]} · {formatFileSize(built.file.bytes)} ·{' '}
              {built.summary}
            </div>
            <p className="field-hint">
              Granska dokumentet och ladda ner det när det ser bra ut. Filen skapas i
              din dator och skickas ingenstans.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
