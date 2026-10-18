import { describe, expect, it } from 'vitest';
import {
  Collectible,
  RARITY_META,
  buildAchievements,
  buildCollection,
  gardenEffects,
  normalizeRarity,
  placeableItems,
  placementKeyForDefinition,
  seasonArtKey,
  xpUntilUnlock,
} from './season';
import { RewardDefinition, RewardUnlock } from './planner';

function definition(
  overrides: Partial<RewardDefinition> & { id: string; name: string },
): RewardDefinition {
  return {
    description: null,
    theme: 'halloween',
    position: 1,
    xp_required: 30,
    bonus_xp: 0,
    illustration: null,
    unlocks_items: [],
    is_final: false,
    ...overrides,
  };
}

function unlock(rewardId: string, at = '2026-10-14T10:00:00Z'): RewardUnlock {
  return { id: `unlock-${rewardId}`, reward_id: rewardId, bonus_xp_awarded: 0, unlocked_at: at };
}

describe('säsongens föremål', () => {
  it('kopplar belöningen till ritad grafik och rätt placeringsnyckel', () => {
    const pumpa = definition({
      id: 'r1',
      name: 'Glad pumpa',
      xp_required: 30,
      illustration: 'pumpa-glod',
      unlocks_items: ['pumpa-glod'],
    });
    const [item] = buildCollection([pumpa], new Map());

    expect(item.artKey).toBe('pumpa-glod');
    expect(item.placementKey).toBe('pumpa-glod');
    expect(item.rarity).toBe('vanlig');
    expect(item.unlocked).toBe(false);
  });

  it('känner igen äldre nycklar som inte hunnit migreras', () => {
    expect(seasonArtKey('pumpa')).toBe('pumpa-glod');
    expect(seasonArtKey('manskenslykta')).toBe('lykta');
    expect(seasonArtKey('okänd-nyckel')).toBeNull();
    expect(normalizeRarity('legendarisk')).toBe('legendarisk');
    expect(normalizeRarity('påhittad')).toBe('vanlig');
  });

  it('använder föremålsnyckeln före illustrationen och hoppar över andra teman', () => {
    expect(
      placementKeyForDefinition(
        definition({ id: 'r1', name: 'Ett', unlocks_items: ['katt', 'hatt'] }),
      ),
    ).toBe('katt');

    const itReward = definition({
      id: 'r2',
      name: 'IT',
      theme: 'it',
      illustration: 'pumpa-glod',
      unlocks_items: ['pumpa-glod'],
    });
    expect(buildCollection([itReward], new Map())[0].artKey).toBeNull();
  });

  it('räknar upplåsningar, raritet och XP-krav från serverns rader', () => {
    const rows: RewardDefinition[] = [
      definition({
        id: 'r2',
        name: 'Spöke',
        xp_required: 70,
        rarity: 'ovanlig',
        unlocks_items: ['spoke'],
      }),
      definition({ id: 'r1', name: 'Pumpa', xp_required: 30, unlocks_items: ['pumpa-glod'] }),
    ];
    const collection = buildCollection(rows, new Map([['r2', unlock('r2')]]));

    expect(collection.map((item) => item.name)).toEqual(['Pumpa', 'Spöke']);
    expect(collection[1].unlocked).toBe(true);
    expect(collection[1].unlockedAt).toBe('2026-10-14T10:00:00Z');
    expect(collection[1].unlockedBy).toBeNull();
    expect(collection[1].rarity).toBe('ovanlig');
    expect(RARITY_META.ovanlig.label).toBe('Ovanlig');
    expect(xpUntilUnlock(collection[0], 20)).toBe(10);
    expect(xpUntilUnlock(collection[0], 90)).toBe(0);
  });

  it('släpper bara ut upplåsta föremål med grafik och placeringsnyckel', () => {
    const unlocked: Collectible = {
      id: 'r1',
      name: 'Pumpa',
      description: null,
      theme: 'halloween',
      rarity: 'vanlig',
      xpRequired: 30,
      attachedXp: 0,
      unlocked: true,
      unlockedAt: '2026-10-14T10:00:00Z',
      unlockedBy: 'Räkna kapitel 3',
      artKey: 'pumpa-glod',
      placementKey: 'pumpa-glod',
      isFinal: false,
    };

    expect(placeableItems([unlocked])).toHaveLength(1);
    expect(placeableItems([{ ...unlocked, unlocked: false }])).toHaveLength(0);
    expect(placeableItems([{ ...unlocked, artKey: null }])).toHaveLength(0);
    expect(placeableItems([{ ...unlocked, placementKey: null }])).toHaveLength(0);
  });
});

describe('prestationer', () => {
  it('låser inte upp något utan aktivitet', () => {
    const achievements = buildAchievements({
      completedTasks: 0,
      quizAttempts: 0,
      bestQuizPercent: null,
    });

    expect(achievements).toHaveLength(5);
    expect(achievements.every((achievement) => !achievement.unlocked)).toBe(true);
    expect(achievements.every((achievement) => achievement.progress === 0)).toBe(true);
    expect(gardenEffects(achievements)).toEqual([]);
  });

  it('räknar fram progress ur riktiga uppgifter och provresultat', () => {
    const achievements = buildAchievements({
      completedTasks: 6,
      quizAttempts: 2,
      bestQuizPercent: 85,
    });
    const byId = new Map(achievements.map((achievement) => [achievement.id, achievement]));

    expect(byId.get('forsta-uppgiften')?.unlocked).toBe(true);
    expect(byId.get('fem-uppgifter')?.unlocked).toBe(true);
    expect(byId.get('tio-uppgifter')?.unlocked).toBe(false);
    expect(byId.get('tio-uppgifter')?.progress).toBe(6);
    expect(byId.get('forsta-provet')?.unlocked).toBe(true);
    expect(byId.get('skarpskytt')?.unlocked).toBe(true);

    expect(gardenEffects(achievements)).toEqual([
      'eldflugor',
      'dimma',
      'manskensgloria',
      'stjarnfall',
    ]);
  });

  it('kräver 80 procent för skyttemärket', () => {
    const achievements = buildAchievements({
      completedTasks: 0,
      quizAttempts: 1,
      bestQuizPercent: 79,
    });
    expect(achievements.find((a) => a.id === 'skarpskytt')?.unlocked).toBe(false);
    expect(achievements.find((a) => a.id === 'forsta-provet')?.unlocked).toBe(true);
  });
});
