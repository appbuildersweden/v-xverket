import { describe, expect, it } from 'vitest';
import {
  HALLOWEEN_REWARDS,
  HALLOWEEN_XP_STEPS,
  nextHalloweenReward,
  previousHalloweenStep,
  unlockedHalloweenCount,
  xpToNextHalloweenReward,
} from './halloween-rewards';
import { SEASON_ART_KEYS } from './season';

/**
 * Trösklarna är en del av avtalet mot spelaren: de styr när servern låser upp
 * ett föremål. Testet låser listan så att en ändring alltid är avsiktlig.
 */
describe('Halloween-stegen', () => {
  it('har exakt de tio stegen i stigande XP-ordning', () => {
    expect(HALLOWEEN_REWARDS.map((reward) => [reward.name, reward.xpRequired])).toEqual([
      ['Lysande pumpalykta', 20],
      ['Gulligt spöke', 50],
      ['Svart katt', 100],
      ['Magisk kristall', 175],
      ['Halloween-lykta', 275],
      ['Fladdermusfigur', 400],
      ['Häxkittel', 550],
      ['Förtrollad svamp', 725],
      ['Magisk bok', 925],
      ['Sällsynt månlykta', 1200],
    ]);

    for (let index = 1; index < HALLOWEEN_XP_STEPS.length; index += 1) {
      expect(HALLOWEEN_XP_STEPS[index]).toBeGreaterThan(HALLOWEEN_XP_STEPS[index - 1]);
    }
  });

  it('ger varje belöning ritad grafik och en egen trädgårdsnyckel', () => {
    const names = new Set(HALLOWEEN_REWARDS.map((reward) => reward.name));
    const itemKeys = new Set(HALLOWEEN_REWARDS.map((reward) => reward.itemKey));
    expect(names.size).toBe(HALLOWEEN_REWARDS.length);
    expect(itemKeys.size).toBe(HALLOWEEN_REWARDS.length);

    for (const reward of HALLOWEEN_REWARDS) {
      expect(SEASON_ART_KEYS).toContain(reward.artKey);
      expect(reward.description.length).toBeGreaterThan(10);
    }
  });

  it('räknar nästa mål, kvarvarande XP och upplåsta steg', () => {
    expect(nextHalloweenReward(0)?.name).toBe('Lysande pumpalykta');
    expect(nextHalloweenReward(19)?.name).toBe('Lysande pumpalykta');
    expect(nextHalloweenReward(20)?.name).toBe('Gulligt spöke');
    expect(nextHalloweenReward(1200)).toBeNull();

    expect(xpToNextHalloweenReward(0)).toBe(20);
    expect(xpToNextHalloweenReward(30)).toBe(20);
    expect(xpToNextHalloweenReward(1200)).toBe(0);

    expect(unlockedHalloweenCount(19)).toBe(0);
    expect(unlockedHalloweenCount(20)).toBe(1);
    expect(unlockedHalloweenCount(725)).toBe(8);
    expect(unlockedHalloweenCount(1200)).toBe(10);

    // Startpunkten för förloppsfältet ligger strax under aktuell tröskel.
    expect(previousHalloweenStep(275)).toBe(275);
    expect(previousHalloweenStep(274)).toBe(175);
    expect(previousHalloweenStep(0)).toBe(0);
  });
});
