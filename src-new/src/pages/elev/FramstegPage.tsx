import React from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  Flame,
  Lock,
  Sparkles,
  Star,
  Target,
  Trophy,
} from 'lucide-react';
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
import {
  activeSeason,
  buildAchievements,
  buildCollection,
  xpUntilUnlock,
} from '../../lib/season';
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

/** Omkretsen för nivåringen (r = 52). */
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

/** Hur många föremål som visas i översiktens samlingsvägg. */
const COLLECTION_PREVIEW = 8;

/**
 * Mina framsteg. Allt räknas fram från elevens egna uppgifter, resultat och
 * belöningar — det finns ingen påhittad statistik och inga betyg.
 *
 * Sidan är byggd uppifrån och ned: först var eleven står just nu (nivå, XP och
 * nästa belöning), sedan vad som är gjort, därefter samlingen och milstolparna
 * och sist detaljerna per ämne, provresultat och material.
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

  const xp = state.data?.xp;
  const totalXp = xp?.totalXp ?? 0;
  const levelRatio = xp && xp.xpPerLevel > 0 ? Math.min(xp.intoLevel / xp.xpPerLevel, 1) : 0;

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
  const unlockedItems = seasonItems.filter((item) => item.unlocked);
  const unlockedRewards = unlockedItems.length;

  const attempts = state.data?.attempts ?? [];
  const bestPercent =
    attempts.length > 0
      ? attempts.reduce(
          (max, attempt) => Math.max(max, scorePercent(attempt.score, attempt.total)),
          0,
        )
      : null;
  const achievements = state.data
    ? buildAchievements({
        completedTasks: done,
        quizAttempts: attempts.length,
        bestQuizPercent: bestPercent,
      })
    : [];
  const achievementsDone = achievements.filter((achievement) => achievement.unlocked).length;

  const previewItems = [
    ...unlockedItems.slice(-COLLECTION_PREVIEW),
    ...seasonItems.filter((item) => !item.unlocked).slice(0, COLLECTION_PREVIEW),
  ].slice(0, COLLECTION_PREVIEW + 4);

  return (
    <div className="panel-page framsteg-page" data-testid={studentPageTestId(panel, 'framsteg')}>
      {state.loading && (
        <SectionCard title="Mina framsteg" subtitle="Din egen utveckling i Elda">
          <LoadingState label="Räknar ihop dina framsteg…" />
        </SectionCard>
      )}
      {!state.loading && state.error && (
        <SectionCard title="Mina framsteg" subtitle="Din egen utveckling i Elda">
          <ErrorState message={state.error} onRetry={state.reload} />
        </SectionCard>
      )}
      {state.data && <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />}

      {state.data && xp && (
        <section className="framsteg-hero" data-testid="framsteg-hero">
          <div className="framsteg-level" aria-label={`Nivå ${xp.level}`}>
            <svg viewBox="0 0 120 120" className="framsteg-ring" aria-hidden="true">
              <circle className="framsteg-ring-track" cx="60" cy="60" r="52" />
              <circle
                className="framsteg-ring-value"
                cx="60"
                cy="60"
                r="52"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - levelRatio)}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="framsteg-level-inner">
              <span className="framsteg-level-label">Nivå</span>
              <strong>{xp.level}</strong>
              <span className="framsteg-level-xp">
                {xp.intoLevel}/{xp.xpPerLevel} XP
              </span>
            </div>
          </div>

          <div className="framsteg-hero-body">
            <p className="framsteg-kicker">
              <Sparkles size={14} aria-hidden="true" /> {activeSeason.label} i Elda
            </p>
            <h1 className="framsteg-title">Dina framsteg</h1>
            <p className="framsteg-hero-sub">
              {nextReward
                ? `${xp.xpToNext} XP kvar till nivå ${xp.level + 1}, och ${
                    xpUntilUnlock(nextReward, totalXp)
                  } XP kvar till ${nextReward.name}.`
                : 'Du har låst upp hela säsongens samling. Njut av trädgården.'}
            </p>

            <div className="framsteg-chips">
              <span className="framsteg-chip">
                <Star size={13} aria-hidden="true" /> {totalXp} XP totalt
              </span>
              <span className="framsteg-chip">
                <CheckCircle2 size={13} aria-hidden="true" /> {done} av {total} uppgifter
                klara
              </span>
              <span className="framsteg-chip">
                <Trophy size={13} aria-hidden="true" /> {unlockedRewards} av{' '}
                {seasonItems.length} belöningar
              </span>
            </div>

            <div className="framsteg-level-bar">
              <ProgressBar
                value={xp.intoLevel}
                max={Math.max(xp.xpPerLevel, 1)}
                label={`Mot nivå ${xp.level + 1}`}
                caption={`${xp.intoLevel} / ${xp.xpPerLevel} XP`}
              />
            </div>
          </div>

          <div className={`framsteg-next${nextReward ? '' : ' is-complete'}`}>
            {nextReward ? (
              <>
                <span className="framsteg-next-label">
                  <Target size={13} aria-hidden="true" /> Nästa belöning
                </span>
                <div className="framsteg-next-art" aria-hidden="true">
                  {nextReward.artKey ? (
                    <RewardArt artKey={nextReward.artKey} size={76} locked />
                  ) : (
                    <Lock size={26} />
                  )}
                </div>
                <strong className="framsteg-next-name">{nextReward.name}</strong>
                <span className="framsteg-next-left">
                  {xpUntilUnlock(nextReward, totalXp)} XP kvar
                </span>
                <ProgressBar
                  value={Math.min(totalXp, nextReward.xpRequired)}
                  max={Math.max(nextReward.xpRequired, 1)}
                  caption={`${totalXp} / ${nextReward.xpRequired} XP`}
                />
              </>
            ) : (
              <>
                <span className="framsteg-next-label">
                  <Award size={13} aria-hidden="true" /> Hela samlingen
                </span>
                <div className="framsteg-next-art" aria-hidden="true">
                  <RewardArt artKey="kristall" size={76} />
                </div>
                <strong className="framsteg-next-name">Allt är upplåst</strong>
                <span className="framsteg-next-left">Säsongen är klar</span>
              </>
            )}
            <a className="framsteg-garden-link" href={`#/${panel}/belonningar`}>
              Öppna trädgården <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </section>
      )}

      {state.data && (
        <div className="grid-4 framsteg-stats">
          <StatCard label="Uppgifter klara" value={done} hint={`av ${total}`} />
          <StatCard label="Kvar" value={open} />
          <StatCard label="XP" value={totalXp} hint={`Nivå ${xp?.level ?? 1}`} />
          <StatCard label="Provträning" value={attempts.length} hint="genomförda försök" />
        </div>
      )}

      {state.data && (
        <p className="security-note">
          <BarChart3 size={14} aria-hidden="true" />
          {copy.progressNote}
        </p>
      )}

      {state.data && total === 0 && attempts.length === 0 && (
        <SectionCard title="Inget att visa ännu" subtitle="Kom igång">
          <EmptyState
            icon={<BarChart3 size={22} />}
            title="Ingen data ännu"
            description={copy.progressEmpty}
          />
        </SectionCard>
      )}

      {state.data && seasonItems.length > 0 && (
        <SectionCard
          title="Samlingen"
          subtitle={`${unlockedRewards} av ${seasonItems.length} föremål upplåsta`}
        >
          <div className="framsteg-collection">
            {previewItems.map((item) => (
              <div
                key={item.id}
                className={`framsteg-collectible${item.unlocked ? ' is-unlocked' : ''}`}
                title={item.unlocked ? item.name : `${item.name} — låses upp vid ${item.xpRequired} XP`}
              >
                <RewardArt
                  artKey={item.artKey ?? undefined}
                  size={62}
                  locked={!item.unlocked}
                  title={item.name}
                />
                <span className="framsteg-collectible-name">{item.name}</span>
                {!item.unlocked && (
                  <span className="framsteg-collectible-xp">
                    {xpUntilUnlock(item, totalXp)} XP kvar
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="framsteg-collection-foot">
            <Sparkles size={13} aria-hidden="true" /> Varje avklarad uppgift ger 10 XP. Vid
            varje gräns låses nästa föremål upp — och ställs i trädgården.
          </p>
        </SectionCard>
      )}

      {state.data && achievements.length > 0 && (
        <SectionCard
          title="Milstolpar"
          subtitle={`${achievementsDone} av ${achievements.length} uppnådda`}
        >
          <ul className="framsteg-milestones">
            {achievements.map((achievement) => (
              <li
                key={achievement.id}
                className={`framsteg-milestone${achievement.unlocked ? ' is-done' : ''}`}
              >
                <span className="framsteg-milestone-icon" aria-hidden="true">
                  {achievement.unlocked ? <Flame size={16} /> : <Lock size={15} />}
                </span>
                <div className="framsteg-milestone-body">
                  <div className="framsteg-milestone-head">
                    <strong>{achievement.name}</strong>
                    <span className="framsteg-milestone-count">
                      {achievement.progress} / {achievement.target}
                    </span>
                  </div>
                  <p>{achievement.description}</p>
                  <ProgressBar
                    value={achievement.progress}
                    max={Math.max(achievement.target, 1)}
                  />
                  <span className="framsteg-milestone-reward">
                    <Sparkles size={12} aria-hidden="true" /> {achievement.reward}
                  </span>
                </div>
              </li>
            ))}
          </ul>
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

      {state.data && attempts.length > 0 && (
        <SectionCard title="Provträning" subtitle="Dina senaste resultat">
          <ul className="list">
            {attempts.map((attempt) => (
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
