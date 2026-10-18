import React, { useEffect, useRef } from 'react';
import { Award, CalendarClock, Lock, Sparkles, Star, Trophy } from 'lucide-react';
import {
  XpState,
  RewardDefinition,
  RewardUnlock,
  listRewardDefinitions,
  listTasks,
  listUnlocks,
  listXpHistory,
  fetchXpState,
  rewardProgress,
} from '../../lib/planner';
import { listMyTasks } from '../../lib/assignments';
import { listMyAttempts, scorePercent } from '../../lib/quiz';
import { HalloweenGarden } from '../../components/halloween/HalloweenGarden';
import { RewardArt } from '../../components/halloween/RewardArt';
import { Result } from '../../lib/db';
import { formatDateTime } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
import { useGardenPlacements } from '../../lib/useGardenPlacements';
import { nextFreeSlot } from '../../lib/garden';
import {
  Collectible,
  GARDEN_SLOT_COUNT,
  RARITY_META,
  activeSeason,
  buildAchievements,
  buildCollection,
  gardenEffects,
  xpUntilUnlock,
} from '../../lib/season';
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
import { PanelType } from '../../lib/nav';

interface BeloningsData {
  xp: XpState;
  definitions: RewardDefinition[];
  unlocks: Map<string, RewardUnlock>;
  history: Array<{ id: string; amount: number; note: string | null; created_at: string }>;
  /** Uppgifter och prov som prestationerna räknas från. */
  completedTasks: number;
  quizAttempts: number;
  bestQuizPercent: number | null;
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

async function loadBelonningar(): Promise<Result<BeloningsData>> {
  const [xp, definitions, unlocks, history, ownTasks, assignedTasks, attempts] =
    await Promise.all([
      fetchXpState(),
      listRewardDefinitions(),
      listUnlocks(),
      listXpHistory(10),
      listTasks(),
      listMyTasks(),
      listMyAttempts(20),
    ]);

  if (!xp.ok) return xp;
  if (!definitions.ok) return definitions;
  if (!unlocks.ok) return unlocks;

  const missing: string[] = [];
  if (!history.ok) missing.push('din poänghistorik');
  if (!ownTasks || !ownTasks.ok) missing.push('dina planeringsposter');
  if (!assignedTasks || !assignedTasks.ok) missing.push('dina uppgifter');
  if (!attempts || !attempts.ok) missing.push('dina provresultat');

  const ownDone = ownTasks?.ok
    ? ownTasks.data.filter((task) => task.status === 'klar').length
    : 0;
  const assignedDone = assignedTasks?.ok
    ? assignedTasks.data.filter((task) => task.status === 'klar').length
    : 0;
  const attemptList = attempts?.ok ? attempts.data : [];
  const best =
    attemptList.length > 0
      ? attemptList.reduce(
          (max, attempt) => Math.max(max, scorePercent(attempt.score, attempt.total)),
          0,
        )
      : null;

  return {
    ok: true,
    data: {
      xp: xp.data,
      definitions: definitions.data,
      unlocks: unlocks.data,
      history: history.ok ? history.data : [],
      completedTasks: ownDone + assignedDone,
      quizAttempts: attemptList.length,
      bestQuizPercent: best,
      missing,
    },
  };
}

const ROLE_EXPLANATION: Record<PanelType, string> = {
  elev: 'Du får XP när du slutför en uppgift som din lärare har gett dig. Servern betalar ut poängen en gång per uppgift.',
  privat:
    'Du får XP när du slutför en egen uppgift eller en post i din planering. Servern betalar ut poängen en gång per post.',
  larare:
    'Du får XP när du markerar en post i din planering som klar. Servern betalar ut poängen en gång per post.',
  speciallarar:
    'Du får XP när du markerar en post i din planering som klar. Servern betalar ut poängen en gång per post.',
  admin: 'Belöningar följer samma regler för alla roller och räknas ut på servern.',
};

/** En belöning i Halloween-samlingen. Låsta föremål går inte att ställa ut. */
const CollectibleCard: React.FC<{
  item: Collectible;
  totalXp: number;
  placed: boolean;
  busy: boolean;
  onPlace: () => void;
  onRemove: () => void;
}> = ({ item, totalXp, placed, busy, onPlace, onRemove }) => (
  <article
    className={`hh-item ${item.unlocked ? 'is-unlocked' : 'is-locked'}`}
    data-testid={item.unlocked ? 'hh-item-unlocked' : 'hh-item-locked'}
  >
    <div className="hh-item-art">
      <RewardArt
        artKey={item.artKey ?? undefined}
        size={96}
        locked={!item.unlocked}
        title={item.name}
      />
      {!item.unlocked && (
        <span className="hh-item-lock">
          <Lock size={11} aria-hidden="true" /> Låst
        </span>
      )}
    </div>

    <span className={`hh-rarity hh-rarity-${item.rarity}`}>
      {RARITY_META[item.rarity].label}
    </span>
    <h3 className="hh-item-name">{item.name}</h3>
    {item.description && <p className="hh-item-desc">{item.description}</p>}

    <div className="hh-item-req">
      {item.unlocked ? (
        <>
          <strong>Upplåst</strong>
          {item.unlockedBy && (
            <span>Genom uppgiften ”{item.unlockedBy}”</span>
          )}
          <span>
            {item.unlockedAt
              ? `Tilldelad ${formatDateTime(item.unlockedAt)}`
              : 'Finns i din samling'}
          </span>
        </>
      ) : (
        <>
          <strong>Låses upp vid {item.xpRequired} XP</strong>
          <ProgressBar
            value={Math.min(totalXp, item.xpRequired)}
            max={Math.max(item.xpRequired, 1)}
          />
          <span>
            {xpUntilUnlock(item, totalXp)} XP kvar · du har {totalXp} XP
          </span>
        </>
      )}
      {item.attachedXp > 0 && (
        <span>Ger {item.attachedXp} bonus-XP när det låses upp.</span>
      )}
    </div>

    {item.unlocked && item.placementKey && item.artKey && (
      <div className="hh-item-actions">
        {placed ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onRemove}
            disabled={busy}
          >
            Ta bort från trädgården
          </button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onPlace} disabled={busy}>
            Ställ i trädgården
          </button>
        )}
      </div>
    )}
  </article>
);

/**
 * Belöningar, nivåer och den levande Halloween-trädgården.
 *
 * All data kommer från servern: XP-saldot, vilka belöningar som är upplåsta,
 * historiken och elevens faktiska aktiviteter. Ingenting kan manipuleras från
 * klienten — därför kan samma uppgift aldrig ge poäng två gånger.
 */
export const BelonningarPage: React.FC<{ panel: PanelType }> = ({ panel }) => {
  const state: AsyncState<BeloningsData> = useAsync(loadBelonningar);
  const garden = useGardenPlacements();

  const season = activeSeason;
  // Bara den aktiva säsongen visas. Övriga teman ligger kvar i databasen men är
  // avstängda (`active = false`), så de ritas aldrig i gränssnittet.
  const definitions = (state.data?.definitions ?? []).filter(
    (definition) => definition.theme === season.theme && definition.active !== false,
  );
  const unlocks = state.data?.unlocks ?? new Map<string, RewardUnlock>();
  const totalXp = state.data?.xp.totalXp ?? 0;
  const collection = buildCollection(definitions, unlocks);
  const halloweenItems = collection;
  const halloweenUnlocked = halloweenItems.filter((item) => item.unlocked).length;

  const achievements = state.data
    ? buildAchievements({
        completedTasks: state.data.completedTasks,
        quizAttempts: state.data.quizAttempts,
        bestQuizPercent: state.data.bestQuizPercent,
      })
    : [];
  const effects = gardenEffects(achievements);
  const unlockedHistory = [...collection]
    .filter((item) => item.unlocked)
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));

  const placementFor = (item: Collectible) =>
    item.placementKey
      ? garden.placements.find((placement) => placement.item_key === item.placementKey) ?? null
      : null;

  /**
   * När en ny belöning låses upp ska dekorationen synas i trädgården direkt.
   * Den senast upplåsta dekorationen ställs därför på första lediga plats en
   * gång. Eleven kan alltid ta bort eller flytta den efteråt, och klick på en
   * dekoration ger aldrig XP — bara slutförda uppgifter gör det.
   */
  const autoPlaced = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (garden.loading || garden.busyKey) return;
    const placedKeys = new Set(garden.placements.map((placement) => placement.item_key));
    const newest = [...halloweenItems]
      .filter((item) => item.unlocked && item.placementKey && item.artKey)
      .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
      .find(
        (item) =>
          !placedKeys.has(item.placementKey as string) &&
          !autoPlaced.current.has(item.placementKey as string),
      );
    if (!newest || !newest.placementKey) return;
    if (nextFreeSlot(garden.placements, GARDEN_SLOT_COUNT) === null) return;

    autoPlaced.current.add(newest.placementKey);
    void garden.place(newest.placementKey);
  }, [halloweenItems, garden]);

  return (
    <div className="panel-page" data-testid={`page-${panel}-belonningar`}>
      <SectionCard title="Belöningar och nivåer" subtitle={`${season.label} i Elda`}>
        {state.loading && <LoadingState label="Hämtar belöningar…" />}
        {!state.loading && state.error && (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
        {state.data && (
          <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />
        )}

        {state.data && (
          <>
            <p className="card-sub">{season.intro}</p>

            <div className="grid-4">
              <StatCard label="XP totalt" value={state.data.xp.totalXp} />
              <StatCard label="Nivå" value={state.data.xp.level} />
              <StatCard
                label="Upplåsta"
                value={
                  rewardProgress(definitions, state.data.unlocks, state.data.xp.totalXp)
                    .unlockedCount
                }
                hint={`av ${definitions.length}`}
              />
              <StatCard
                label="Kvar till nästa nivå"
                value={`${state.data.xp.xpToNext} XP`}
              />
            </div>

            <ProgressBar
              value={state.data.xp.intoLevel}
              max={state.data.xp.xpPerLevel}
              label={`Nivå ${state.data.xp.level}`}
              caption={`${state.data.xp.intoLevel} / ${state.data.xp.xpPerLevel} XP`}
            />

            <p className="security-note">
              <Star size={14} aria-hidden="true" />
              {ROLE_EXPLANATION[panel]}
            </p>
          </>
        )}
      </SectionCard>

      {state.data && (
        <>
          <HalloweenGarden
            season={season}
            items={halloweenItems}
            placements={garden.placements}
            effects={effects}
            totalXp={totalXp}
            placementError={garden.loadError ?? garden.actionError}
            busyKey={garden.busyKey}
            onPlace={(itemKey, slot) => void garden.place(itemKey, slot)}
            onMove={(itemKey, slot) => void garden.move(itemKey, slot)}
            onRemove={(itemKey) => void garden.remove(itemKey)}
            onRetryPlacements={() => void garden.reload()}
          />

          <SectionCard
            title="Milstolpar"
            subtitle="Prestationer som räknas från dina riktiga aktiviteter"
          >
            <p className="card-sub">
              Milstolparna tittar på det du faktiskt har gjort — avklarade uppgifter
              och genomförda provträningar. De kan inte låsas upp med ett klick, och
              samma siffror ger alltid samma resultat.
            </p>
            <div className="hh-achievements">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`hh-achievement${achievement.unlocked ? ' is-unlocked' : ''}`}
                  data-testid={achievement.unlocked ? 'achievement-unlocked' : 'achievement-locked'}
                >
                  <div className="hh-achievement-head">
                    <span className="hh-achievement-name">{achievement.name}</span>
                    <Pill tone={achievement.unlocked ? 'ok' : 'muted'}>
                      {achievement.unlocked ? 'Uppnådd' : `${achievement.progress} av ${achievement.target}`}
                    </Pill>
                  </div>
                  <p className="hh-achievement-desc">{achievement.description}</p>
                  <div className="hh-achievement-progress">
                    <ProgressBar value={achievement.progress} max={achievement.target} />
                  </div>
                  <p className="hh-achievement-reward">
                    <Sparkles size={12} aria-hidden="true" /> {achievement.reward}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={`${season.label}-samlingen`}
            subtitle={`${halloweenUnlocked} av ${halloweenItems.length} föremål upplåsta`}
          >
            <p className="card-sub">
              Varje avklarad uppgift ger 10 XP, och vid varje XP-gräns låses nästa
              föremål upp. Rariteten visar hur långt in i säsongen föremålet hör
              hemma — den ändrar inte XP:n. Det senast upplåsta föremålet ställs
              automatiskt på en ledig plats. Vill du bestämma själv klickar du på
              den plats i trädgården där föremålet ska stå, eller drar dit det.
            </p>

            {halloweenItems.length === 0 ? (
              <EmptyState
                icon={<Trophy size={22} />}
                title="Inga Halloween-föremål i biblioteket ännu"
                description="Föremålen skapas i databasen. Kör migreringen för Halloween-trädgården och ladda om sidan."
              />
            ) : (
              <div className="hh-collection-grid">
                {halloweenItems.map((item) => {
                  const placement = placementFor(item);
                  return (
                    <CollectibleCard
                      key={item.id}
                      item={item}
                      totalXp={totalXp}
                      placed={Boolean(placement)}
                      busy={garden.busyKey === item.placementKey}
                      onPlace={() => item.placementKey && void garden.place(item.placementKey)}
                      onRemove={() => item.placementKey && void garden.remove(item.placementKey)}
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>

          <NextGoal
            definitions={definitions}
            unlocks={state.data.unlocks}
            totalXp={state.data.xp.totalXp}
          />

          <SectionCard
            title="Upplåsta belöningar"
            subtitle="Historik över det du har tjänat ihop"
          >
            {unlockedHistory.length === 0 ? (
              <EmptyState
                icon={<Trophy size={22} />}
                title="Inga belöningar upplåsta ännu"
                description="Den första belöningen låses upp vid 20 XP. Varje avklarad uppgift ger 10 XP."
              />
            ) : (
              <ul className="list">
                {unlockedHistory.map((item) => (
                  <li className="list-item list-item-static" key={item.id}>
                    {item.artKey ? (
                      <RewardArt artKey={item.artKey} size={34} title={item.name} />
                    ) : (
                      <Trophy size={15} aria-hidden="true" />
                    )}
                    <div className="list-item-content">
                      <div className="list-item-title">{item.name}</div>
                      <div className="list-item-sub">
                        <CalendarClock size={12} aria-hidden="true" />{' '}
                        {item.unlockedAt
                          ? formatDateTime(item.unlockedAt)
                          : 'Upplåst'}
                        {item.unlockedBy ? ` · ${item.unlockedBy}` : ''}
                      </div>
                    </div>
                    <Pill tone="info">{RARITY_META[item.rarity].label}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Senaste XP" subtitle="Varje rad kommer från servern">
            {state.data.history.length === 0 ? (
              <EmptyState
                title="Ingen XP-historik ännu"
                description="När du slutför din första uppgift visas den här."
              />
            ) : (
              <ul className="list">
                {state.data.history.map((entry) => (
                  <li className="list-item list-item-static" key={entry.id}>
                    <Star size={15} aria-hidden="true" />
                    <div className="list-item-content">
                      <div className="list-item-title">
                        +{entry.amount} XP{entry.note ? ` · ${entry.note}` : ''}
                      </div>
                      <div className="list-item-sub">{formatDateTime(entry.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
};

const NextGoal: React.FC<{
  definitions: readonly RewardDefinition[];
  unlocks: ReadonlyMap<string, RewardUnlock>;
  totalXp: number;
}> = ({ definitions, unlocks, totalXp }) => {
  const seasonTheme = activeSeason.theme;
  const progress = rewardProgress(definitions, unlocks, totalXp);
  if (!progress.next) return null;

  return (
    <SectionCard title="Nästa mål" subtitle="Belöningen du är närmast">
      <div className="next-goal">
        <div className="reward-popup-illu" aria-hidden="true">
          {progress.next.theme === seasonTheme && progress.next.illustration ? (
            <RewardArt artKey={progress.next.illustration} size={44} />
          ) : (
            <Award size={22} />
          )}
        </div>
        <div className="next-goal-body">
          <div className="list-item-title">{progress.next.name}</div>
          {progress.next.description && (
            <p className="list-item-sub">{progress.next.description}</p>
          )}
          <ProgressBar
            value={Math.min(totalXp, progress.next.xp_required)}
            max={progress.next.xp_required}
            caption={`${totalXp} / ${progress.next.xp_required} XP`}
          />
          <div className="row-actions">
            <Pill tone="info">{progress.toNext} XP kvar</Pill>
            {progress.next.bonus_xp > 0 && (
              <Pill tone="ok">Bonus {progress.next.bonus_xp} XP</Pill>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
