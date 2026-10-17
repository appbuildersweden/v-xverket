import React, { useState } from 'react';
import { ArrowLeft, Layers, Plus, RotateCw, Trash2 } from 'lucide-react';
import {
  Flashcard,
  FlashcardDeck,
  addCard,
  createDeck,
  deckStats,
  deleteCard,
  deleteDeck,
  knownRatio,
  listCards,
  listDecks,
  nextCardIndex,
  saveCardResult,
  updateDeck,
  validateCard,
  validateDeck,
} from '../../lib/flashcards';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  ProgressBar,
  SectionCard,
  StatCard,
} from '../../components/ui';
import { ConfirmButton, Modal, TextAreaField, TextField } from '../../components/forms';
import { Panel } from '../../lib/auth-types';
import { studentCopy, studentPageTestId } from '../../lib/panel-copy';

/**
 * Flashcards och repetition. Kortlekarna sparas i databasen, så korten och
 * repetitionsstatusen finns kvar efter omladdning. Delade kortlekar (t.ex. en
 * lärares ordlistor) kan övas men bara ändras av den som äger dem.
 */
export const FlashcardsPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const copy = studentCopy(panel);
  const decks = useAsync(listDecks);
  const [openDeck, setOpenDeck] = useState<FlashcardDeck | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeDeck = async (deck: FlashcardDeck) => {
    const result = await deleteDeck(deck.id);
    if (result.ok) decks.reload();
    else setError(result.error);
  };

  if (openDeck) {
    return (
      <DeckView
        deck={openDeck}
        panel={panel}
        onBack={() => {
          setOpenDeck(null);
          decks.reload();
        }}
      />
    );
  }

  const mine = (decks.data ?? []).filter((deck) => deck.isMine);
  const shared = (decks.data ?? []).filter((deck) => !deck.isMine);

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'flashcards')}>
      <SectionCard
        title="Flashcards och repetition"
        subtitle="Öva på kort och följ vad du kan"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Ny kortlek
          </button>
        }
      >
        {decks.loading && <LoadingState label="Hämtar dina kortlekar…" />}
        {!decks.loading && decks.error && <ErrorState message={decks.error} onRetry={decks.reload} />}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {decks.data && decks.data.length === 0 && (
          <EmptyState
            icon={<Layers size={22} />}
            title="Inga kortlekar ännu"
            description="Skapa en kortlek med frågor och svar. Korten sparas och du kan fortsätta öva precis där du slutade."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
                <Plus size={16} /> Ny kortlek
              </button>
            }
          />
        )}
      </SectionCard>

      {mine.length > 0 && (
        <SectionCard title="Mina kortlekar" subtitle="Bara du kan ändra dem">
          <ul className="list">
            {mine.map((deck) => (
              <DeckRow
                key={deck.id}
                deck={deck}
                onOpen={() => setOpenDeck(deck)}
                onDelete={() => void removeDeck(deck)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {shared.length > 0 && (
        <SectionCard title="Delade kortlekar" subtitle={copy.sharedDecksSubtitle}>
          <ul className="list">
            {shared.map((deck) => (
              <DeckRow key={deck.id} deck={deck} onOpen={() => setOpenDeck(deck)} />
            ))}
          </ul>
        </SectionCard>
      )}

      {showNew && (
        <NewDeckModal
          onClose={() => setShowNew(false)}
          onCreated={(deck) => {
            setShowNew(false);
            decks.reload();
            setOpenDeck(deck);
          }}
        />
      )}
    </div>
  );
};

const DeckRow: React.FC<{
  deck: FlashcardDeck;
  onOpen: () => void;
  onDelete?: () => void;
}> = ({ deck, onOpen, onDelete }) => (
  <li className="list-item list-item-static">
    <Layers size={16} aria-hidden="true" />
    <div className="list-item-content">
      <div className="list-item-title">{deck.title}</div>
      <div className="list-item-sub">
        {deck.subject ? `${deck.subject} · ` : ''}
        {deck.cardCount} kort
        {deck.is_shared ? ' · delad' : ''}
      </div>
    </div>
    <button type="button" className="btn btn-outline btn-sm" onClick={onOpen}>
      Öva
    </button>
    {onDelete && (
      <ConfirmButton
        label="Ta bort"
        confirmLabel="Ta bort"
        question="Ta bort kortleken?"
        onConfirm={onDelete}
      />
    )}
  </li>
);

const NewDeckModal: React.FC<{
  onClose: () => void;
  onCreated: (deck: FlashcardDeck) => void;
}> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateDeck(title);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createDeck({ title, subject, is_shared: shared });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.data);
  };

  return (
    <Modal title="Ny kortlek" onClose={onClose} closeLabel="Stäng ny kortlek">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <TextField
          label="Titel"
          value={title}
          onChange={setTitle}
          placeholder="T.ex. Glosor engelska vecka 42"
          required
        />
        <TextField label="Ämne" value={subject} onChange={setSubject} placeholder="T.ex. Engelska" />

        <label className="check-inline">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>Dela kortleken med alla i Elda</span>
        </label>

        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="deck-error">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Skapar…' : 'Skapa kortlek'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const DeckView: React.FC<{ deck: FlashcardDeck; panel: Panel; onBack: () => void }> = ({
  deck,
  panel,
  onBack,
}) => {
  const cards = useAsync(() => listCards(deck.id), [deck.id]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shared, setShared] = useState(deck.is_shared);

  const list = cards.data ?? [];
  const stats = deckStats(list);
  const current = list[index];

  const answer = async (known: boolean) => {
    if (!current) return;
    const result = await saveCardResult(current.id, known);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFlipped(false);
    const updated = list.map((c) =>
      c.id === current.id
        ? {
            ...c,
            known_count: c.known_count + (known ? 1 : 0),
            repeat_count: c.repeat_count + (known ? 0 : 1),
            last_result: known,
          }
        : c,
    );
    cards.setData(updated);
    setIndex(nextCardIndex(updated, index));
  };

  const removeCard = async (card: Flashcard) => {
    const result = await deleteCard(card.id);
    if (result.ok) cards.reload();
    else setError(result.error);
  };

  const toggleShared = async () => {
    const next = !shared;
    const result = await updateDeck(deck.id, { is_shared: next });
    if (result.ok) {
      setShared(next);
      setNotice(next ? 'Kortleken delas nu med alla.' : 'Kortleken delas inte längre.');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'flashcards-deck')}>
      <SectionCard
        title={deck.title}
        subtitle={deck.subject ?? 'Kortlek'}
        action={
          <div className="row-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
              <ArrowLeft size={15} /> Tillbaka
            </button>
            {deck.isMine && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void toggleShared()}
              >
                {shared ? 'Sluta dela' : 'Dela kortleken'}
              </button>
            )}
          </div>
        }
      >
        {notice && (
          <div className="state-note" role="status">
            {notice}
          </div>
        )}
        {cards.loading && <LoadingState label="Hämtar korten…" />}
        {!cards.loading && cards.error && <ErrorState message={cards.error} onRetry={cards.reload} />}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {cards.data && (
          <div className="grid-4">
            <StatCard label="Kort" value={stats.total} />
            <StatCard label="Kan nu" value={stats.known} />
            <StatCard label="Repetera" value={stats.repeat} />
            <StatCard label="Inte övat" value={stats.unseen} />
          </div>
        )}

        {cards.data && stats.total > 0 && (
          <ProgressBar
            value={stats.known}
            max={stats.total}
            label="Kort du kan"
            caption={`${Math.round(knownRatio(stats) * 100)} %`}
          />
        )}

        {cards.data && stats.total === 0 && (
          <EmptyState
            icon={<Layers size={22} />}
            title="Inga kort i leken ännu"
            description={
              deck.isMine
                ? 'Lägg till ditt första kort med en fråga och ett svar.'
                : 'Läraren har inte lagt till några kort i den här leken ännu.'
            }
            action={
              deck.isMine ? (
                <button type="button" className="btn btn-primary" onClick={() => setShowCardForm(true)}>
                  <Plus size={16} /> Nytt kort
                </button>
              ) : undefined
            }
          />
        )}
      </SectionCard>

      {current && (
        <SectionCard title="Öva" subtitle={`Kort ${index + 1} av ${list.length}`}>
          <div
            className={`flashcard ${flipped ? 'flashcard-flipped' : ''}`}
            onClick={() => setFlipped((v) => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFlipped((v) => !v);
              }
            }}
            aria-label={flipped ? 'Visa frågan' : 'Visa svaret'}
          >
            <div className="flashcard-side">{flipped ? 'Svar' : 'Fråga'}</div>
            <div className="flashcard-text">{flipped ? current.answer : current.question}</div>
            <div className="flashcard-hint">
              <RotateCw size={14} aria-hidden="true" /> Klicka för att vända
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIndex(nextCardIndex(list, index))}
            >
              Nästa kort
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void answer(true)}>
              Jag kunde det
            </button>
            <button type="button" className="btn btn-outline" onClick={() => void answer(false)}>
              Repetera
            </button>
          </div>

          <div className="row-actions">
            <Pill tone="muted">Kan: {current.known_count} gånger</Pill>
            <Pill tone="muted">Repeterat: {current.repeat_count} gånger</Pill>
          </div>
        </SectionCard>
      )}

      {deck.isMine && (
        <SectionCard
          title="Korten i leken"
          subtitle="Lägg till, ändra eller ta bort kort"
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCardForm(true)}
            >
              <Plus size={16} /> Nytt kort
            </button>
          }
        >
          {list.length === 0 ? (
            <EmptyState title="Inga kort ännu" description="Lägg till det första kortet." />
          ) : (
            <ul className="list">
              {list.map((card) => (
                <li className="list-item list-item-static" key={card.id}>
                  <div className="list-item-content">
                    <div className="list-item-title">{card.question}</div>
                    <div className="list-item-sub">{card.answer}</div>
                  </div>
                  <Pill tone={card.last_result === true ? 'ok' : card.last_result === false ? 'warn' : 'muted'}>
                    {card.last_result === true
                      ? 'Kan'
                      : card.last_result === false
                        ? 'Repetera'
                        : 'Inte övat'}
                  </Pill>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => void removeCard(card)}
                    aria-label={`Ta bort kortet ${card.question}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {showCardForm && (
        <NewCardModal
          deckId={deck.id}
          position={list.length}
          onClose={() => setShowCardForm(false)}
          onSaved={() => {
            setShowCardForm(false);
            cards.reload();
          }}
        />
      )}
    </div>
  );
};

const NewCardModal: React.FC<{
  deckId: string;
  position: number;
  onClose: () => void;
  onSaved: () => void;
}> = ({ deckId, position, onClose, onSaved }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateCard(question, answer);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await addCard(deckId, question, answer, position);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <Modal title="Nytt kort" onClose={onClose} closeLabel="Stäng nytt kort">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <TextAreaField
          label="Fråga"
          value={question}
          onChange={setQuestion}
          rows={2}
          placeholder="T.ex. Vad heter huvudstaden i Norge?"
          required
        />
        <TextAreaField
          label="Svar"
          value={answer}
          onChange={setAnswer}
          rows={2}
          placeholder="T.ex. Oslo"
          required
        />
        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="card-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sparar…' : 'Spara kort'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
