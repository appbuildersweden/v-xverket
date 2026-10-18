/**
 * Halloween-belöningarnas stege — en enda källa för XP-gränserna.
 *
 * Trösklarna styr tre saker samtidigt och ligger därför på ett ställe:
 *   * upplåsningen på servern (raden `reward_definitions.xp_required`),
 *   * demolägets exempeldata,
 *   * texterna och ritad grafik i gränssnittet.
 *
 * Ändra en siffra här och kör migreringen `halloween_stegen` — då följer
 * servern, demoläget och gränssnittet med. Ingen annan fil räknar ut gränser.
 *
 * `artKey` pekar på ritad SVG i `components/halloween/RewardArt.tsx` och
 * `itemKey` är nyckeln servern kontrollerar när föremålet ställs i trädgården.
 */
import { Rarity, SeasonArtKey } from './season';

export interface HalloweenReward {
  /** Belöningens namn. Används som nyckel mot databasen (`unique (name)`). */
  name: string;
  /** Total XP som krävs för att låsa upp belöningen. */
  xpRequired: number;
  /** Ritad grafik i trädgården och samlingen. */
  artKey: SeasonArtKey;
  /** Föremålsnyckeln som sparas i `unlocked_decorations` och får ställas ut. */
  itemKey: string;
  rarity: Rarity;
  description: string;
  /** Ordningen i samlingen. Halloween-stegen ligger efter övriga teman. */
  position: number;
}

export const HALLOWEEN_REWARDS: readonly HalloweenReward[] = [
  {
    name: 'Lysande pumpalykta',
    xpRequired: 20,
    artKey: 'pumpa-glod',
    itemKey: 'pumpa-glod',
    rarity: 'vanlig',
    description: 'En pumpalykta som brinner hela natten. Det första du tänder i trädgården.',
    position: 11,
  },
  {
    name: 'Gulligt spöke',
    xpRequired: 50,
    artKey: 'spoke',
    itemKey: 'spoke',
    rarity: 'vanlig',
    description: 'Ett litet spöke som svävar över gräset och håller dig sällskap när du pluggar.',
    position: 12,
  },
  {
    name: 'Svart katt',
    xpRequired: 100,
    artKey: 'katt',
    itemKey: 'katt',
    rarity: 'ovanlig',
    description: 'En svart katt med gula ögon. Hon väljer sin egen plats i trädgården.',
    position: 13,
  },
  {
    name: 'Magisk kristall',
    xpRequired: 175,
    artKey: 'kristall',
    itemKey: 'kristall',
    rarity: 'ovanlig',
    description: 'En kristall som samlar månljus och lyser upp hela grusgången.',
    position: 14,
  },
  {
    name: 'Halloween-lykta',
    xpRequired: 275,
    artKey: 'lykta',
    itemKey: 'lykta',
    rarity: 'sallsynt',
    description: 'En gammal lykta med levande låga. Den slocknar aldrig, hur det än blåser.',
    position: 15,
  },
  {
    name: 'Fladdermusfigur',
    xpRequired: 400,
    artKey: 'fladdermus',
    itemKey: 'fladdermus',
    rarity: 'sallsynt',
    description: 'En fladdermus som hänger i trädet och sträcker på vingarna när du går förbi.',
    position: 16,
  },
  {
    name: 'Häxkittel',
    xpRequired: 550,
    artKey: 'kittel',
    itemKey: 'kittel',
    rarity: 'sallsynt',
    description: 'Kitteln bubblar av grön dryck. Receptet är hemligt och byts varje natt.',
    position: 17,
  },
  {
    name: 'Förtrollad svamp',
    xpRequired: 725,
    artKey: 'svamp',
    itemKey: 'svamp',
    rarity: 'legendarisk',
    description: 'En svamp som lyser i turkost. Den växer bara där någon har pluggat flitigt.',
    position: 18,
  },
  {
    name: 'Magisk bok',
    xpRequired: 925,
    artKey: 'bok',
    itemKey: 'bok',
    rarity: 'legendarisk',
    description: 'En bok som skriver egna anteckningar. Sidorna glöder svagt i mörkret.',
    position: 19,
  },
  {
    name: 'Sällsynt månlykta',
    xpRequired: 1200,
    artKey: 'manlykta',
    itemKey: 'manlykta',
    rarity: 'legendarisk',
    description: 'En lykta fylld av månsken. Den sista och ovanligaste dekorationen i trädgården.',
    position: 20,
  },
];

/** Alla trösklar i stigande ordning — praktiskt för texter och tester. */
export const HALLOWEEN_XP_STEPS: readonly number[] = HALLOWEEN_REWARDS.map(
  (reward) => reward.xpRequired,
);

/**
 * Nästa belöning i stegen utifrån användarens XP, eller null när allt är
 * upplåst. Ren funktion: läser samma siffror som servern använder.
 */
export function nextHalloweenReward(totalXp: number): HalloweenReward | null {
  return HALLOWEEN_REWARDS.find((reward) => totalXp < reward.xpRequired) ?? null;
}

/** Hur många belöningar XP-summan har nått. */
export function unlockedHalloweenCount(totalXp: number): number {
  return HALLOWEEN_REWARDS.filter((reward) => totalXp >= reward.xpRequired).length;
}

/** XP som återstår till nästa belöning (0 när allt är upplåst). */
export function xpToNextHalloweenReward(totalXp: number): number {
  const next = nextHalloweenReward(totalXp);
  return next ? Math.max(next.xpRequired - totalXp, 0) : 0;
}

/** Tröskeln strax under den aktuella, så att förloppsfältet får en startpunkt. */
export function previousHalloweenStep(totalXp: number): number {
  let step = 0;
  for (const reward of HALLOWEEN_REWARDS) {
    if (totalXp >= reward.xpRequired) step = reward.xpRequired;
  }
  return step;
}
