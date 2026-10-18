import { describe, expect, it } from 'vitest';
import {
  HALLOWEEN_REWARDS,
  HALLOWEEN_XP_STEPS,
  nextHalloweenReward,
  previousHalloweenStep,
  unlockedHalloweenCount,
  xpToNextHalloweenReward,
} from './halloween-rewards';
import { HALLOWEEN_ICONS, isHalloweenIconKey } from './halloween-icons';
import { isSeasonArtKey } from './season';

/**
 * Trösklarna är en del av avtalet mot spelaren: de styr när servern låser upp
 * ett föremål. Testet låser listan så att en ändring alltid är avsiktlig.
 */
describe('Halloween-stegen', () => {
  it('har alla 58 belöningar i stigande XP-ordning utan dubbla trösklar', () => {
    expect(HALLOWEEN_REWARDS).toHaveLength(58);
    expect(new Set(HALLOWEEN_XP_STEPS).size).toBe(58);

    for (let index = 1; index < HALLOWEEN_XP_STEPS.length; index += 1) {
      expect(HALLOWEEN_XP_STEPS[index]).toBeGreaterThan(HALLOWEEN_XP_STEPS[index - 1]);
    }
  });

  it('behåller de tio första belöningarna med ritad grafik och samma trösklar', () => {
    const drawn = HALLOWEEN_REWARDS.filter((reward) => !isHalloweenIconKey(reward.artKey));

    expect(drawn.map((reward) => [reward.name, reward.xpRequired])).toEqual([
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
  });

  it('ger varje ikon en egen belöning med samma namn, tröskel och nyckel', () => {
    for (const icon of HALLOWEEN_ICONS) {
      const reward = HALLOWEEN_REWARDS.find((candidate) => candidate.artKey === icon.key);
      expect(reward, `saknar belöning för ${icon.key}`).toBeTruthy();
      expect(reward?.name).toBe(icon.name);
      expect(reward?.xpRequired).toBe(icon.xpRequired);
      expect(reward?.itemKey).toBe(icon.key);
    }
  });

  it('ger varje belöning grafik, en egen nyckel och en egen beskrivning', () => {
    const names = new Set(HALLOWEEN_REWARDS.map((reward) => reward.name));
    const itemKeys = new Set(HALLOWEEN_REWARDS.map((reward) => reward.itemKey));
    const artKeys = new Set(HALLOWEEN_REWARDS.map((reward) => reward.artKey));
    expect(names.size).toBe(HALLOWEEN_REWARDS.length);
    expect(itemKeys.size).toBe(HALLOWEEN_REWARDS.length);
    expect(artKeys.size).toBe(HALLOWEEN_REWARDS.length);

    for (const reward of HALLOWEEN_REWARDS) {
      expect(isSeasonArtKey(reward.artKey)).toBe(true);
      expect(reward.description.length).toBeGreaterThan(10);
    }
  });

  it('räknar nästa mål, kvarvarande XP och upplåsta steg', () => {
    expect(nextHalloweenReward(0)?.name).toBe('Lysande pumpalykta');
    expect(nextHalloweenReward(19)?.name).toBe('Lysande pumpalykta');
    expect(nextHalloweenReward(20)?.name).toBe('Majsgodis');
    expect(nextHalloweenReward(34)?.name).toBe('Majsgodis');
    expect(nextHalloweenReward(1999)?.name).toBe('Måne');
    expect(nextHalloweenReward(2000)).toBeNull();

    expect(xpToNextHalloweenReward(0)).toBe(20);
    expect(xpToNextHalloweenReward(30)).toBe(5);
    expect(xpToNextHalloweenReward(2000)).toBe(0);

    expect(unlockedHalloweenCount(19)).toBe(0);
    expect(unlockedHalloweenCount(20)).toBe(1);
    expect(unlockedHalloweenCount(35)).toBe(2);
    expect(unlockedHalloweenCount(1999)).toBe(57);
    expect(unlockedHalloweenCount(2000)).toBe(58);

    // Startpunkten för förloppsfältet ligger strax under aktuell tröskel.
    expect(previousHalloweenStep(275)).toBe(275);
    expect(previousHalloweenStep(274)).toBe(250);
    expect(previousHalloweenStep(0)).toBe(0);
  });
});
