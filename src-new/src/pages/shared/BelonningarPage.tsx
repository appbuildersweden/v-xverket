import React from 'react';
import { Lock, Star, Trophy } from 'lucide-react';
import {
  XpState,
  RewardDefinition,
  RewardUnlock,
  gardenSummary,
  listRewardDefinitions,
  listUnlocks,
  listXpHistory,
  fetchXpState,
  rewardProgress,
} from '../../lib/planner';
import { RewardGarden } from '../../components/RewardGarden';
import { Result } from '../../lib/db';
import { formatDateTime } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
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
  /** Källor som inte kunde hämtas — de får aldrig se ut som en nolla. */
  missing: string[];
}

async function loadBelonningar(): Promise<Result<BeloningsData>> {
  const [xp, definitions, unlocks, history] = await Promise.all([
    fetchXpState(),
    listRewardDefinitions(),
    listUnlocks(),
    listXpHistory(10),
  ]);

  if (!xp.ok) return xp;
  if (!definitions.ok) return definitions;
  if (!unlocks.ok) return unlocks;

  return {
    ok: true,
    data: {
      xp: xp.data,
      definitions: definitions.data,
      unlocks: unlocks.data,
      history: history.ok ? history.data : [],
      missing: history.ok ? [] : ['din poänghistorik'],
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

/**
 * Belöningar och nivåer. All data kommer från servern: XP-saldot, vilka
 * belöningar som är upplåsta och historiken. Ingenting kan manipuleras från
 * klienten — därför kan samma uppgift aldrig ge poäng två gånger.
 */
export const BelonningarPage: React.FC<{ panel: PanelType }> = ({ panel }) => {
  const state: AsyncState<BeloningsData> = useAsync(loadBelonningar);

  return (
    <div className="panel-page" data-testid={`page-${panel}-belonningar`}>
      <SectionCard title="Belöningar och nivåer" subtitle="Din utveckling i Elda">
        {state.loading && <LoadingState label="Hämtar belöningar…" />}
        {!state.loading && state.error && (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}
        {state.data && (
          <PartialDataNotice missing={state.data.missing} onRetry={state.reload} />
        )}

        {state.data && (
          <>
            <div className="grid-4">
              <StatCard label="XP totalt" value={state.data.xp.totalXp} />
              <StatCard label="Nivå" value={state.data.xp.level} />
              <StatCard
                label="Upplåsta"
                value={rewardProgress(state.data.definitions, state.data.unlocks, state.data.xp.totalXp).unlockedCount}
                hint={`av ${state.data.definitions.length}`}
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
          <RewardGarden
            garden={gardenSummary(state.data.definitions, state.data.unlocks, state.data.xp.totalXp)}
            totalXp={state.data.xp.totalXp}
          />

          <NextGoal
            definitions={state.data.definitions}
            unlocks={state.data.unlocks}
            totalXp={state.data.xp.totalXp}
          />

          <SectionCard title="Belöningar" subtitle="Lås upp genom att samla XP">
            {state.data.definitions.length === 0 ? (
              <EmptyState
                icon={<Trophy size={22} />}
                title="Inga belöningar i biblioteket"
                description="Belöningarna skapas av en administratör i databasen. Fråga om de är på plats."
              />
            ) : (
              <div className="reward-grid">
                {state.data.definitions.map((definition) => {
                  const unlocked = state.data?.unlocks.has(definition.id) ?? false;
                  return (
                    <div
                      key={definition.id}
                      className={`reward-tile ${unlocked ? 'unlocked' : ''}`}
                      data-testid={unlocked ? 'reward-unlocked' : 'reward-locked'}
                    >
                      <div className="reward-tile-illu" aria-hidden="true">
                        {unlocked ? (definition.illustration ?? '🏅') : <Lock size={20} />}
                      </div>
                      <div className="reward-tile-name">{definition.name}</div>
                      <div className="reward-tile-req">
                        {unlocked ? 'Upplåst' : `${definition.xp_required} XP`}
                      </div>
                      {definition.description && (
                        <div className="reward-tile-desc">{definition.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
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
  const progress = rewardProgress(definitions, unlocks, totalXp);
  if (!progress.next) return null;

  return (
    <SectionCard title="Nästa mål" subtitle="Belöningen du är närmast">
      <div className="next-goal">
        <div className="reward-popup-illu" aria-hidden="true">
          {progress.next.illustration ?? '🏅'}
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
