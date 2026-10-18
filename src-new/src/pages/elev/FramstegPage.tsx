import React from 'react';
import { BarChart3, Lock, Sparkles, Star } from 'lucide-react';
import { AssignedTask, groupTasksBySubject, listMyTasks } from '../../lib/assignments';
import {
  PlannerTask,
  RewardDefinition,
  RewardUnlock,
  XpState,
  fetchXpState,
  listRewardDefinitions,
  listTasks,
  listUnlocks,
} from '../../lib/planner';
import { RewardArt } from '../../components/halloween/RewardArt';
import { activeSeason, buildCollection, xpUntilUnlock } from '../../lib/season';
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
  /** Elevens egna att-göra-poster. De ger 10 XP när de bockas av. */
  ownTasks: PlannerTask[];
  xp: XpState;
  definitions: RewardDefinition[];
  unlocks: Map<string, RewardUnlock>;
  attempts: QuizAttempt[];
  decks: FlashcardDeck[];
  documents: DocumentRow[];
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

async function loadFramsteg(): Promise<Result<Data>> {
  const [tasks, ownTasks, xp, definitions, unlocks, attempts, decks, documents] =
    await Promise.all([
      listMyTasks(),
      listTasks(),
      fetchXpState(),
      listRewardDefinitions(),
      listUnlocks(),
      listMyAttempts(10),
      listDecks(),
      listDocuments(),
    ]);

  if (!tasks.ok) return tasks;

  // Statistiken får aldrig visa noll för något som i själva verket inte gick att
  // hämta — då namnges källan i stället.
  const missing: string[] = [];
  if (!ownTasks.ok) missing.push('dina egna poster');
  if (!xp.ok) missing.push('dina poäng');
  if (!definitions.ok || !unlocks.ok) missing.push('dina belöningar');
  if (!attempts.ok) missing.push('dina provresultat');
  if (!decks.ok) missing.push('dina kortlekar');
  if (!documents.ok) missing.push('dina dokument');

  return {
    ok: true,
    data: {
      tasks: tasks.data,
      ownTasks: ownTasks.ok ? ownTasks.data : [],
      xp: xp.ok
        ? xp.data
        : { totalXp: 0, level: 1, xpPerLevel: 100, intoLevel: 0, xpToNext: 100 },
      definitions: definitions.ok ? definitions.data : [],
      unlocks: unlocks.ok ? unlocks.data : new Map<string, RewardUnlock>(),
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
  const ownTasks = state.data?.ownTasks ?? [];
  const assignedDone = tasks.filter((t) => t.status === 'klar').length;
  const ownDone = ownTasks.filter((t) => t.status === 'klar').length;
  const done = assignedDone + ownDone;
  const total = tasks.length + ownTasks.length;
  const open = total - done;
  const subjectGroups = groupTasksBySubject(tasks);

  // Halloween-stegen: bara den aktiva säsongen räknas, och belöningarna kommer
  // från serverns upplåsningar. Trösklarna ligger i lib/halloween-rewards.ts.
  const seasonItems = buildCollection(
    (state.data?.definitions ?? []).filter(
      (definition) =>
        definition.theme === activeSeason.theme && definition.active !== false,
    ),
    state.data?.unlocks ?? new Map<string, RewardUnlock>(),
  );
  const nextReward = seasonItems.find((item) => !item.unlocked) ?? null;
  const unlockedRewards = seasonItems.filter((item) => item.unlocked).length;

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
            <StatCard label="Uppgifter klara" value={done} hint={`av ${total}`} />
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

      {state.data && total === 0 && state.data.attempts.length === 0 && (
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

      {state.data && (
        <SectionCard
          title="Nivå och belöningar"
          subtitle={
            nextReward
              ? `Nästa belöning: ${nextReward.name}`
              : 'Hela Halloween-samlingen är upplåst'
          }
        >
          <div className="row-actions">
            <Pill tone="info">
              <Star size={13} aria-hidden="true" /> {state.data.xp.totalXp} XP
            </Pill>
            <Pill tone="muted">Nivå {state.data.xp.level}</Pill>
            <Pill tone={nextReward ? 'muted' : 'ok'}>
              {unlockedRewards} av {seasonItems.length} belöningar
            </Pill>
          </div>
          <ProgressBar
            value={state.data.xp.intoLevel}
            max={state.data.xp.xpPerLevel}
            label="Mot nästa nivå"
            caption={`${state.data.xp.intoLevel} / ${state.data.xp.xpPerLevel} XP`}
          />

          {nextReward ? (
            <div className="next-goal">
              <div className="reward-popup-illu" aria-hidden="true">
                {nextReward.artKey ? (
                  <RewardArt artKey={nextReward.artKey} size={44} locked />
                ) : (
                  <Lock size={22} aria-hidden="true" />
                )}
              </div>
              <div className="next-goal-body">
                <div className="list-item-title">{nextReward.name}</div>
                {nextReward.description && (
                  <p className="list-item-sub">{nextReward.description}</p>
                )}
                <ProgressBar
                  value={Math.min(state.data.xp.totalXp, nextReward.xpRequired)}
                  max={Math.max(nextReward.xpRequired, 1)}
                  caption={`${state.data.xp.totalXp} / ${nextReward.xpRequired} XP`}
                />
                <div className="row-actions">
                  <Pill tone="info">
                    {xpUntilUnlock(nextReward, state.data.xp.totalXp)} XP kvar
                  </Pill>
                  <Pill tone="muted">
                    <Sparkles size={12} aria-hidden="true" /> 10 XP per avklarad uppgift
                  </Pill>
                </div>
              </div>
            </div>
          ) : (
            <p className="security-note">
              <Sparkles size={14} aria-hidden="true" />
              Du har låst upp alla Halloween-belöningar. Föremålen väntar i trädgården.
            </p>
          )}
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
