import React from 'react';
import { BarChart3, Star } from 'lucide-react';
import { AssignedTask, groupTasksBySubject, listMyTasks } from '../../lib/assignments';
import { XpState, fetchXpState } from '../../lib/planner';
import { QuizAttempt, listMyAttempts, scoreLabel, scorePercent } from '../../lib/quiz';
import { FlashcardDeck, listDecks } from '../../lib/flashcards';
import { DocumentRow, listDocuments } from '../../lib/documents';
import { Result } from '../../lib/db';
import { formatDateTime } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
import { Panel } from '../../lib/auth-types';
import { studentCopy, studentPageTestId } from '../../lib/panel-copy';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PartialDataNotice,
  Pill,
  ProgressBar,
  SectionCard,
  StatCard,
} from '../../components/ui';

interface Data {
  tasks: AssignedTask[];
  xp: XpState;
  attempts: QuizAttempt[];
  decks: FlashcardDeck[];
  documents: DocumentRow[];
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

async function loadFramsteg(): Promise<Result<Data>> {
  const [tasks, xp, attempts, decks, documents] = await Promise.all([
    listMyTasks(),
    fetchXpState(),
    listMyAttempts(10),
    listDecks(),
    listDocuments(),
  ]);

  if (!tasks.ok) return tasks;

  // Statistiken får aldrig visa noll för något som i själva verket inte gick att
  // hämta — då namnges källan i stället.
  const missing: string[] = [];
  if (!xp.ok) missing.push('dina poäng');
  if (!attempts.ok) missing.push('dina provresultat');
  if (!decks.ok) missing.push('dina kortlekar');
  if (!documents.ok) missing.push('dina dokument');

  return {
    ok: true,
    data: {
      tasks: tasks.data,
      xp: xp.ok
        ? xp.data
        : { totalXp: 0, level: 1, xpPerLevel: 100, intoLevel: 0, xpToNext: 100 },
      attempts: attempts.ok ? attempts.data : [],
      decks: decks.ok ? decks.data : [],
      documents: documents.ok ? documents.data : [],
      missing,
    },
  };
}

/**
 * Mina framsteg. Allt räknas fram från elevens egna uppgifter, resultat och
 * belöningar — det finns ingen påhittad statistik och inga betyg. Saknas data
 * visas ett tydligt tomt läge i stället.
 */
export const FramstegPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const copy = studentCopy(panel);
  const state: AsyncState<Data> = useAsync(loadFramsteg);

  const tasks = state.data?.tasks ?? [];
  const done = tasks.filter((t) => t.status === 'klar').length;
  const open = tasks.length - done;
  const subjectGroups = groupTasksBySubject(tasks);

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'framsteg')}>
      <SectionCard title="Mina framsteg" subtitle="Din egen utveckling i Elda">
        {state.loading && <LoadingState label="Räknar ihop dina framsteg…" />}
        {!state.loading && state.error && <ErrorState message={state.error} onRetry={state.reload} />}
        {state.data && (
          <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />
        )}

        {state.data && (
          <div className="grid-4">
            <StatCard label="Uppgifter klara" value={done} hint={`av ${tasks.length}`} />
            <StatCard label="Kvar" value={open} />
            <StatCard label="XP" value={state.data.xp.totalXp} hint={`Nivå ${state.data.xp.level}`} />
            <StatCard label="Provträning" value={state.data.attempts.length} hint="genomförda försök" />
          </div>
        )}

        {state.data && (
          <p className="security-note">
            <BarChart3 size={14} aria-hidden="true" />
            {copy.progressNote}
          </p>
        )}
      </SectionCard>

      {state.data && tasks.length === 0 && state.data.attempts.length === 0 && (
        <SectionCard title="Inget att visa ännu" subtitle="Kom igång">
          <EmptyState
            icon={<BarChart3 size={22} />}
            title="Ingen data ännu"
            description={copy.progressEmpty}
          />
        </SectionCard>
      )}

      {state.data && subjectGroups.length > 0 && (
        <SectionCard title="Per ämne" subtitle="Klara uppgifter av tilldelade">
          <ul className="list">
            {subjectGroups.map((group) => {
              const groupDone = group.tasks.filter((t) => t.status === 'klar').length;
              return (
                <li className="list-item list-item-static" key={group.subject}>
                  <div className="list-item-content">
                    <div className="list-item-title">{group.subject}</div>
                    <div className="list-item-sub">
                      {groupDone} av {group.tasks.length} klara
                    </div>
                    <ProgressBar value={groupDone} max={group.tasks.length} />
                  </div>
                  {groupDone === group.tasks.length && <Pill tone="ok">Klart</Pill>}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {state.data && state.data.xp.totalXp > 0 && (
        <SectionCard title="Nivå och XP" subtitle="Från serverns belöningssystem">
          <div className="row-actions">
            <Pill tone="info">
              <Star size={13} aria-hidden="true" /> {state.data.xp.totalXp} XP
            </Pill>
            <Pill tone="muted">Nivå {state.data.xp.level}</Pill>
          </div>
          <ProgressBar
            value={state.data.xp.intoLevel}
            max={state.data.xp.xpPerLevel}
            label="Mot nästa nivå"
            caption={`${state.data.xp.intoLevel} / ${state.data.xp.xpPerLevel} XP`}
          />
        </SectionCard>
      )}

      {state.data && state.data.attempts.length > 0 && (
        <SectionCard title="Provträning" subtitle="Dina senaste resultat">
          <ul className="list">
            {state.data.attempts.map((attempt) => (
              <li className="list-item list-item-static" key={attempt.id}>
                <div className="list-item-content">
                  <div className="list-item-title">{attempt.set_title ?? 'Övning'}</div>
                  <div className="list-item-sub">
                    {formatDateTime(attempt.completed_at)} ·{' '}
                    {scoreLabel(attempt.score, attempt.total)}
                  </div>
                </div>
                <Pill tone={scorePercent(attempt.score, attempt.total) >= 80 ? 'ok' : 'info'}>
                  {scorePercent(attempt.score, attempt.total)} %
                </Pill>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {state.data && (state.data.decks.length > 0 || state.data.documents.length > 0) && (
        <SectionCard title="Material" subtitle="Det du har att arbeta med">
          <div className="grid-3">
            <StatCard label="Kortlekar" value={state.data.decks.length} />
            <StatCard
              label="Kort totalt"
              value={state.data.decks.reduce((sum, deck) => sum + deck.cardCount, 0)}
            />
            <StatCard label="Dokument" value={state.data.documents.length} />
          </div>
        </SectionCard>
      )}
    </div>
  );
};
