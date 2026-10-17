import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Plus, XCircle } from 'lucide-react';
import {
  AnswerInput,
  MAX_OPTIONS,
  MIN_OPTIONS,
  NewQuestionInput,
  OwnerQuestion,
  QuizQuestion,
  QuizResult,
  QuizSet,
  addQuestion,
  createQuizSet,
  deleteQuestion,
  deleteQuizSet,
  getQuizQuestions,
  listMyAttempts,
  listOwnQuestions,
  listQuizSets,
  scoreLabel,
  scorePercent,
  submitQuizAttempt,
  validateQuestion,
  validateQuizSet,
} from '../../lib/quiz';
import { formatDateTime } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import { Panel } from '../../lib/auth-types';
import { studentCopy, studentPageTestId } from '../../lib/panel-copy';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  ProgressBar,
  SectionCard,
  Toolbar,
} from '../../components/ui';
import { ConfirmButton, Modal, TextAreaField, TextField } from '../../components/forms';

/**
 * Provträning. Frågorna (och facit) ligger i databasen, men eleven får dem utan
 * rätt svar — rättningen sker på servern i `submit_quiz_attempt`. Därför kan
 * resultatet inte påverkas från klienten, och eleven kan skapa egna övningar att
 * träna på när läraren inte har delat något material.
 */
export const ProvtraningPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const copy = studentCopy(panel);
  const sets = useAsync(listQuizSets);
  const attempts = useAsync(() => listMyAttempts(5));
  const [openSet, setOpenSet] = useState<QuizSet | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeSet = async (set: QuizSet) => {
    const result = await deleteQuizSet(set.id);
    if (result.ok) sets.reload();
    else setError(result.error);
  };

  if (openSet) {
    return (
      <QuizSetView
        set={openSet}
        panel={panel}
        emptyText={copy.quizNoQuestions}
        onBack={() => {
          setOpenSet(null);
          sets.reload();
          attempts.reload();
        }}
      />
    );
  }

  const mine = (sets.data ?? []).filter((set) => set.isMine);
  const shared = (sets.data ?? []).filter((set) => !set.isMine);

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'provtraning')}>
      <SectionCard
        title="Provträning"
        subtitle="Öva på frågor och se hur det går"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Ny övning
          </button>
        }
      >
        {sets.loading && <LoadingState label="Hämtar övningar…" />}
        {!sets.loading && sets.error && <ErrorState message={sets.error} onRetry={sets.reload} />}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {sets.data && sets.data.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="Inga övningar ännu"
            description={copy.quizEmptyDescription}
            action={
              <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
                <Plus size={16} /> Ny övning
              </button>
            }
          />
        )}
      </SectionCard>

      {mine.length > 0 && (
        <SectionCard title="Mina övningar" subtitle="Skapade av dig">
          <ul className="list">
            {mine.map((set) => (
              <QuizRow
                key={set.id}
                set={set}
                onOpen={() => setOpenSet(set)}
                onDelete={() => void removeSet(set)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {shared.length > 0 && (
        <SectionCard title="Delade övningar" subtitle={copy.quizSharedSubtitle}>
          <ul className="list">
            {shared.map((set) => (
              <QuizRow key={set.id} set={set} onOpen={() => setOpenSet(set)} />
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Senaste resultat" subtitle="Dina genomförda försök">
        {attempts.loading && <LoadingState label="Hämtar resultat…" />}
        {!attempts.loading && attempts.error && (
          <ErrorState message={attempts.error} onRetry={attempts.reload} />
        )}
        {attempts.data && attempts.data.length === 0 && (
          <EmptyState
            title="Inga resultat ännu"
            description="Genomför en övning så sparas resultatet här."
          />
        )}
        {attempts.data && attempts.data.length > 0 && (
          <ul className="list">
            {attempts.data.map((attempt) => (
              <li className="list-item list-item-static" key={attempt.id}>
                <div className="list-item-content">
                  <div className="list-item-title">{attempt.set_title ?? 'Övning'}</div>
                  <div className="list-item-sub">{formatDateTime(attempt.completed_at)}</div>
                </div>
                <Pill tone={scorePercent(attempt.score, attempt.total) >= 80 ? 'ok' : 'info'}>
                  {attempt.score} / {attempt.total} rätt
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {showNew && (
        <NewQuizModal
          onClose={() => setShowNew(false)}
          onCreated={(set) => {
            setShowNew(false);
            sets.reload();
            setOpenSet(set);
          }}
        />
      )}
    </div>
  );
};

const QuizRow: React.FC<{ set: QuizSet; onOpen: () => void; onDelete?: () => void }> = ({
  set,
  onOpen,
  onDelete,
}) => (
  <li className="list-item list-item-static">
    <ClipboardList size={16} aria-hidden="true" />
    <div className="list-item-content">
      <div className="list-item-title">{set.title}</div>
      <div className="list-item-sub">
        {set.subject ? `${set.subject} · ` : ''}
        {set.questionCount > 0 ? `${set.questionCount} frågor` : 'Frågor hämtas när du övar'}
      </div>
    </div>
    <button type="button" className="btn btn-outline btn-sm" onClick={onOpen}>
      Öppna
    </button>
    {onDelete && (
      <ConfirmButton
        label="Ta bort"
        confirmLabel="Ta bort"
        question="Ta bort övningen?"
        onConfirm={onDelete}
      />
    )}
  </li>
);

const QuizSetView: React.FC<{
  set: QuizSet;
  panel: Panel;
  onBack: () => void;
  emptyText: string;
}> = ({ set, panel, onBack, emptyText }) => (
  <div className="panel-page" data-testid={studentPageTestId(panel, 'provtraning-set')}>
    <QuizRunner set={set} onBack={onBack} emptyText={emptyText} />
    {set.isMine && <OwnerQuestions set={set} />}
  </div>
);

/** Själva övningen: fråga för fråga, sedan serverrättat resultat. */
const QuizRunner: React.FC<{ set: QuizSet; onBack: () => void; emptyText: string }> = ({
  set,
  onBack,
  emptyText,
}) => {
  const questions = useAsync(() => getQuizQuestions(set.id), [set.id]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list: QuizQuestion[] = questions.data ?? [];
  const current = list[index];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload: AnswerInput[] = list.map((q) => ({
      question_id: q.id,
      choice: answers[q.id] ?? -1,
    }));
    const res = await submitQuizAttempt(set.id, payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
  };

  const restart = () => {
    setResult(null);
    setAnswers({});
    setIndex(0);
  };

  if (result) {
    return (
      <SectionCard
        title={`Resultat: ${set.title}`}
        subtitle={`${scoreLabel(result.score, result.total)} · ${scorePercent(result.score, result.total)} %`}
        action={
          <div className="row-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
              <ArrowLeft size={15} /> Tillbaka
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={restart}>
              Försök igen
            </button>
          </div>
        }
      >
        <ProgressBar
          value={result.score}
          max={result.total}
          label="Rätt svar"
          caption={`${result.score} / ${result.total}`}
        />

        <ul className="list">
          {result.results.map((item, i) => (
            <li className="list-item list-item-static" key={item.question_id}>
              {item.correct ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : (
                <XCircle size={16} aria-hidden="true" />
              )}
              <div className="list-item-content">
                <div className="list-item-title">
                  {i + 1}. {item.prompt}
                </div>
                <div className="list-item-sub">
                  Rätt svar: {item.options[item.correct_index] ?? '—'}
                  {item.choice === null || item.choice < 0
                    ? ' · du svarade inte'
                    : item.correct
                      ? ''
                      : ` · du svarade: ${item.options[item.choice] ?? '—'}`}
                </div>
                {item.explanation && <div className="list-item-sub">{item.explanation}</div>}
              </div>
              <Pill tone={item.correct ? 'ok' : 'warn'}>{item.correct ? 'Rätt' : 'Fel'}</Pill>
            </li>
          ))}
        </ul>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={set.title}
      subtitle={set.description ?? 'Provträning'}
      action={
        <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
          <ArrowLeft size={15} /> Tillbaka
        </button>
      }
    >
      {questions.loading && <LoadingState label="Hämtar frågor…" />}
      {!questions.loading && questions.error && (
        <ErrorState message={questions.error} onRetry={questions.reload} />
      )}
      {error && (
        <div className="state-note state-note-error" role="alert">
          {error}
        </div>
      )}

      {questions.data && list.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={22} />}
          title="Övningen har inga frågor ännu"
          description={
            set.isMine
              ? 'Lägg till frågor längre ner på sidan, sedan kan du öva.'
              : emptyText
          }
        />
      )}

      {current && (
        <>
          <Toolbar>
            <span className="muted">
              Fråga {index + 1} av {list.length}
            </span>
          </Toolbar>

          <ProgressBar value={index} max={list.length} label="Framåt i övningen" />

          <div className="quiz-question">
            <h3>{current.prompt}</h3>
            <div className="quiz-options">
              {current.options.map((option, optionIndex) => (
                <label
                  key={`${current.id}-${optionIndex}`}
                  className={`quiz-option ${
                    answers[current.id] === optionIndex ? 'quiz-option-selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${current.id}`}
                    checked={answers[current.id] === optionIndex}
                    onChange={() => setAnswers((prev) => ({ ...prev, [current.id]: optionIndex }))}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
            >
              Föregående
            </button>
            {index < list.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => setIndex((i) => i + 1)}>
                Nästa fråga
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
                {busy ? 'Rättar…' : 'Rätta och visa resultat'}
              </button>
            )}
          </div>

          <p className="security-note">
            Rättningen sker på servern — facit lämnar aldrig ut sig förrän du har svarat klart.
          </p>
        </>
      )}
    </SectionCard>
  );
};

/** Ägarens frågelista, med facit, plus formulär för nya frågor. */
const OwnerQuestions: React.FC<{ set: QuizSet }> = ({ set }) => {
  const questions = useAsync(() => listOwnQuestions(set.id), [set.id]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (question: OwnerQuestion) => {
    const result = await deleteQuestion(question.id);
    if (result.ok) questions.reload();
    else setError(result.error);
  };

  return (
    <SectionCard
      title="Frågor"
      subtitle="Facit syns bara för dig"
      action={
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Ny fråga
        </button>
      }
    >
      {questions.loading && <LoadingState label="Hämtar frågor…" />}
      {!questions.loading && questions.error && (
        <ErrorState message={questions.error} onRetry={questions.reload} />
      )}
      {error && (
        <div className="state-note state-note-error" role="alert">
          {error}
        </div>
      )}

      {questions.data && questions.data.length === 0 && (
        <EmptyState
          title="Inga frågor ännu"
          description={`Lägg till minst ${MIN_OPTIONS} svarsalternativ per fråga och markera rätt svar.`}
        />
      )}

      {questions.data && questions.data.length > 0 && (
        <ul className="list">
          {questions.data.map((question, i) => (
            <li className="list-item list-item-static" key={question.id}>
              <div className="list-item-content">
                <div className="list-item-title">
                  {i + 1}. {question.prompt}
                </div>
                <div className="list-item-sub">
                  Rätt svar: {question.options[question.correct_index] ?? '—'}
                  {question.explanation ? ` · ${question.explanation}` : ''}
                </div>
              </div>
              <ConfirmButton
                label="Ta bort"
                confirmLabel="Ta bort"
                question="Ta bort frågan?"
                onConfirm={() => void remove(question)}
              />
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <NewQuestionModal
          setId={set.id}
          position={questions.data?.length ?? 0}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            questions.reload();
          }}
        />
      )}
    </SectionCard>
  );
};

const NewQuizModal: React.FC<{
  onClose: () => void;
  onCreated: (set: QuizSet) => void;
}> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateQuizSet(title);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createQuizSet({ title, subject, description, is_shared: shared });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.data);
  };

  return (
    <Modal title="Ny övning" onClose={onClose} closeLabel="Stäng ny övning">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <TextField
          label="Titel"
          value={title}
          onChange={setTitle}
          placeholder="T.ex. Provträning: geometri"
          required
        />
        <TextField label="Ämne" value={subject} onChange={setSubject} placeholder="T.ex. Matematik" />
        <TextAreaField
          label="Beskrivning"
          value={description}
          onChange={setDescription}
          rows={2}
          placeholder="Vad övningen handlar om"
        />
        <label className="check-inline">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>Dela övningen med alla i Elda</span>
        </label>

        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="quiz-error">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Skapar…' : 'Skapa övning'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const NewQuestionModal: React.FC<{
  setId: string;
  position: number;
  onClose: () => void;
  onSaved: () => void;
}> = ({ setId, position, onClose, onSaved }) => {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Tomma alternativ i slutet tas bort, så att det går att spara en fråga med
    // två eller tre alternativ. Ett tomt alternativ mitt i listan är däremot ett
    // fel som användaren ska få hjälp att rätta.
    const trimmed = [...options];
    let correctIndex = correct;
    while (trimmed.length > MIN_OPTIONS && !trimmed[trimmed.length - 1].trim()) {
      trimmed.pop();
      if (correctIndex >= trimmed.length) correctIndex = trimmed.length - 1;
    }

    const input: NewQuestionInput = {
      prompt,
      options: trimmed,
      correct_index: correctIndex,
      explanation,
    };

    const problem = validateQuestion(input);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await addQuestion(setId, input, position);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <Modal title="Ny fråga" onClose={onClose} closeLabel="Stäng ny fråga">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <TextAreaField
          label="Fråga"
          value={prompt}
          onChange={setPrompt}
          rows={2}
          required
          placeholder="T.ex. Hur många grader är en rät vinkel?"
        />

        <fieldset className="fieldset">
          <legend>Svarsalternativ</legend>
          {options.map((option, index) => (
            <div className="option-row" key={index}>
              <label className="quiz-option">
                <input
                  type="radio"
                  name="correct-option"
                  checked={correct === index}
                  onChange={() => setCorrect(index)}
                  aria-label={`Rätt svar är alternativ ${index + 1}`}
                />
                <input
                  className="input"
                  type="text"
                  value={option}
                  aria-label={`Alternativ ${index + 1}`}
                  placeholder={`Alternativ ${index + 1}`}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                  }
                />
              </label>
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setOptions((prev) => [...prev, ''])}
            >
              <Plus size={15} /> Fler alternativ
            </button>
          )}
          <p className="field-hint">Markera cirkeln vid rätt svar. Minst {MIN_OPTIONS} alternativ.</p>
        </fieldset>

        <TextAreaField
          label="Förklaring (valfri)"
          value={explanation}
          onChange={setExplanation}
          rows={2}
          placeholder="Visas efter svaret, t.ex. varför svaret är rätt"
        />

        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="question-error">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sparar…' : 'Spara fråga'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
