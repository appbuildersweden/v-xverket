import { describe, expect, it } from 'vitest';
import {
  HALLOWEEN_ICONS,
  HALLOWEEN_ICON_KEYS,
  halloweenIconFile,
  isHalloweenIconKey,
} from './halloween-icons';
import { RARITY_ORDER, SEASON_ART_KEYS, seasonArtKey } from './season';

/**
 * Ikonerna kommer från ett ark som delades upp i enskilda bilder. Testet
 * kontrollerar att varje ikon har en egen fil och en egen nyckel — och att
 * ingenting pekar på en bild som inte finns.
 */
describe('Halloween-ikonerna', () => {
  it('har 48 unika ikoner och en bildfil till var och en', () => {
    expect(HALLOWEEN_ICONS).toHaveLength(48);
    expect(new Set(HALLOWEEN_ICON_KEYS).size).toBe(48);

    const files = new Set<string>();
    for (const icon of HALLOWEEN_ICONS) {
      const file = halloweenIconFile(icon.key);
      expect(file, `saknar bildfil för ${icon.key}`).toBeTruthy();
      expect(file).toContain(icon.key);
      files.add(file as string);
    }
    expect(files.size).toBe(48);
  });

  it('ger varje ikon ett eget namn, en egen XP-gräns och en raritet', () => {
    const names = new Set(HALLOWEEN_ICONS.map((icon) => icon.name));
    const steps = HALLOWEEN_ICONS.map((icon) => icon.xpRequired);
    expect(names.size).toBe(48);
    expect(new Set(steps).size).toBe(48);

    for (let index = 0; index < HALLOWEEN_ICONS.length; index += 1) {
      const icon = HALLOWEEN_ICONS[index];
      expect(icon.key.startsWith('ikon-')).toBe(true);
      expect(icon.description.length).toBeGreaterThan(10);
      expect(RARITY_ORDER).toContain(icon.rarity);
      if (index > 0) expect(icon.xpRequired).toBeGreaterThan(HALLOWEEN_ICONS[index - 1].xpRequired);
    }
  });

  it('krockar aldrig med nycklarna för den ritade grafiken', () => {
    for (const icon of HALLOWEEN_ICONS) {
      expect(SEASON_ART_KEYS).not.toContain(icon.key);
      // Nyckeln får inte skrivas om av alias-tabellen — då skulle bilden aldrig
      // visas, utan den ritade grafiken i stället.
      expect(seasonArtKey(icon.key)).toBe(icon.key);
    }

    expect(isHalloweenIconKey('ikon-katt')).toBe(true);
    expect(isHalloweenIconKey('katt')).toBe(false);
    expect(isHalloweenIconKey('ikon-finns-inte')).toBe(false);
    expect(halloweenIconFile('ikon-finns-inte')).toBeNull();
  });
});
