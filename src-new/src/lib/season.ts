/**
 * Säsongens tema, rariteter och de visuella föremålen.
 *
 * Här ligger bara sådant som hör till *presentationen* av en säsong: vilket
 * tema som är aktivt, vilka föremål som hör till temat och hur de kopplas till
 * belöningarna i databasen. XP, nivåer och upplåsningar räknas fortfarande fram
 * på servern (se `planner.ts`), så ett byte av säsong kan aldrig ändra någons
 * framsteg — det byter bara vilken trädgård som ritas.
 *
 * Ett framtida tema (vinter, vår, sommar) läggs till genom att fylla på
 * `SEASONS` och lägga till föremål i `SEASON_ITEMS`. Belöningar som redan är
 * upplåsta ligger kvar i samlingen eftersom de kommer från databasen.
 */
import { RewardDefinition, RewardUnlock } from './planner';
import { HalloweenIconKey, isHalloweenIconKey } from './halloween-icons';

// ---------------------------------------------------------------- Säsonger

export type SeasonId = 'halloween';

export interface SeasonConfig {
  id: SeasonId;
  /** Värdet i `reward_definitions.theme` som föremålen hör till. */
  theme: string;
  label: string;
  tagline: string;
  /** Texten som förklarar hur säsongen kopplas till riktiga aktiviteter. */
  intro: string;
}

export const SEASONS: Readonly<Record<SeasonId, SeasonConfig>> = {
  halloween: {
    id: 'halloween',
    theme: 'halloween',
    label: 'Halloween',
    tagline: 'En levande trädgård som växer av dina studier',
    intro:
      'Trädgården är din alldeles egna. Varje gång du slutför en uppgift eller en post i planeringen får du XP av servern, och vid milstolparna låses nya föremål upp. Ingenting här är slumpat — det du ser är dina riktiga framsteg.',
  },
};

/** Säsongen som visas just nu. Byt här när ett nytt tema ska ta över. */
export const ACTIVE_SEASON: SeasonId = 'halloween';

export const activeSeason = SEASONS[ACTIVE_SEASON];

// ---------------------------------------------------------------- Rariteter

export type Rarity = 'vanlig' | 'ovanlig' | 'sallsynt' | 'legendarisk';

export const RARITY_ORDER: readonly Rarity[] = ['vanlig', 'ovanlig', 'sallsynt', 'legendarisk'];

export interface RarityMeta {
  label: string;
  /** Kort förklaring som visas i samlingen. */
  description: string;
}

export const RARITY_META: Readonly<Record<Rarity, RarityMeta>> = {
  vanlig: { label: 'Vanlig', description: 'Första stegen i trädgården.' },
  ovanlig: { label: 'Ovanlig', description: 'Du har kommit en bit på väg.' },
  sallsynt: { label: 'Sällsynt', description: 'För dig som håller ut över tid.' },
  legendarisk: { label: 'Legendarisk', description: 'De allra sista föremålen i säsongen.' },
};

/** Läser rariteten från en belöningsrad. Saknas den blir föremålet vanligt. */
export function normalizeRarity(value: unknown): Rarity {
  return RARITY_ORDER.includes(value as Rarity) ? (value as Rarity) : 'vanlig';
}

// ---------------------------------------------------------------- Föremålen

/**
 * Nycklarna som det finns ritad grafik för. `illustration` i databasen pekar
 * på en av de här, och belöningens `unlocks_items` innehåller samma nycklar.
 */
export const SEASON_ART_KEYS = [
  'pumpa-glod',
  'spoke',
  'fladdermus',
  'katt',
  'hatt',
  'kittel',
  'flaska',
  'lykta',
  'ljus',
  'svamp',
  'kristall',
  'kraka',
  'hxhus',
  'godispase',
  'kvast',
  'spokdator',
  // Belöningarna i Halloween-stegen (`halloween-rewards.ts`).
  'bok',
  'manlykta',
] as const;

/** Nycklarna med ritad SVG i `components/halloween/RewardArt.tsx`. */
export type DrawnArtKey = (typeof SEASON_ART_KEYS)[number];

/**
 * Allt en belöning kan visa: ritad grafik eller en uppdelad ikonbild.
 * Ikonbelöningarna har egna nycklar (`ikon-…`) med en bildfil i stället för
 * ritad grafik — se `halloween-icons.ts`.
 */
export type SeasonArtKey = DrawnArtKey | HalloweenIconKey;

/**
 * Äldre rader i belöningsbiblioteket använder kortare nycklar. De pekas om här
 * i stället för att databasen behöver skrivas om innan migreringen är körd.
 */
const ART_ALIASES: Readonly<Record<string, DrawnArtKey>> = {
  pumpa: 'pumpa-glod',
  'pumpa-liten': 'pumpa-glod',
  manskenslykta: 'lykta',
  spoke: 'spoke',
  fladdermus: 'fladdermus',
  katt: 'katt',
  hatt: 'hatt',
  kittel: 'kittel',
  flaska: 'flaska',
  lykta: 'lykta',
  ljus: 'ljus',
  svamp: 'svamp',
  kristall: 'kristall',
  kraka: 'kraka',
  hxhus: 'hxhus',
  godispase: 'godispase',
  kvast: 'kvast',
  spokdator: 'spokdator',
  bok: 'bok',
  magiskbok: 'bok',
  manlykta: 'manlykta',
  manljus: 'manlykta',
};

export function isDrawnArtKey(value: string): value is DrawnArtKey {
  return (SEASON_ART_KEYS as readonly string[]).includes(value);
}

/** Sant för både ritad grafik och en ikonbild. */
export function isSeasonArtKey(value: string): value is SeasonArtKey {
  return isDrawnArtKey(value) || isHalloweenIconKey(value);
}

/** Översätter en nyckel från databasen till en ritad tillgång, om det finns. */
export function seasonArtKey(value: string | null | undefined): SeasonArtKey | null {
  if (!value) return null;
  if (isSeasonArtKey(value)) return value;
  return ART_ALIASES[value] ?? null;
}

/**
 * Plockar fram grafiken för en belöning. Föremålsnycklarna i `unlocks_items`
 * går före `illustration`, eftersom de beskriver exakt vad belöningen ger.
 */
export function artKeyForDefinition(
  definition: Pick<RewardDefinition, 'theme' | 'illustration' | 'unlocks_items'>,
): SeasonArtKey | null {
  if (definition.theme !== activeSeason.theme) return null;
  for (const item of definition.unlocks_items ?? []) {
    const key = seasonArtKey(item);
    if (key) return key;
  }
  return seasonArtKey(definition.illustration);
}

/**
 * Placeringsnyckeln är den råa nyckeln i `unlocks_items`. Servern kontrollerar
 * den mot `unlocked_decorations`, så vi skickar aldrig en påhittad nyckel.
 */
export function placementKeyForDefinition(
  definition: Pick<RewardDefinition, 'unlocks_items'>,
): string | null {
  const first = (definition.unlocks_items ?? []).find((item) => item.trim().length > 0);
  return first ?? null;
}

// ---------------------------------------------------------------- Samlingen

export interface Collectible {
  /** Belöningens id i databasen. */
  id: string;
  name: string;
  description: string | null;
  theme: string;
  rarity: Rarity;
  xpRequired: number;
  attachedXp: number;
  unlocked: boolean;
  unlockedAt: string | null;
  /** Uppgiften som låste upp föremålet, när servern har sparat den. */
  unlockedBy: string | null;
  artKey: SeasonArtKey | null;
  /** Nyckeln som skickas till servern när föremålet ställs i trädgården. */
  placementKey: string | null;
  isFinal: boolean;
}

/** Bygger samlingen ur serverns definitioner och användarens upplåsningar. */
export function buildCollection(
  definitions: readonly RewardDefinition[],
  unlocks: ReadonlyMap<string, RewardUnlock>,
): Collectible[] {
  return definitions
    .map((definition) => {
      const unlock = unlocks.get(definition.id) ?? null;
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        theme: definition.theme,
        rarity: normalizeRarity(definition.rarity),
        xpRequired: definition.xp_required,
        attachedXp: definition.bonus_xp,
        unlocked: unlock !== null,
        unlockedAt: unlock?.unlocked_at ?? null,
        unlockedBy: unlock?.source_task_title ?? null,
        artKey: artKeyForDefinition(definition),
        placementKey: placementKeyForDefinition(definition),
        isFinal: definition.is_final,
      };
    })
    .sort(
      (a, b) =>
        a.xpRequired - b.xpRequired ||
        a.name.localeCompare(b.name, 'sv'),
    );
}

/** Hur många XP som återstår innan föremålet låses upp (0 när det är upplåst). */
export function xpUntilUnlock(item: Collectible, totalXp: number): number {
  if (item.unlocked) return 0;
  return Math.max(item.xpRequired - totalXp, 0);
}

// ---------------------------------------------------------------- Prestationer

export type GardenEffect =
  | 'eldflugor'
  | 'dimma'
  | 'spokparaden'
  | 'manskensgloria'
  | 'stjarnfall';

export interface ActivityStats {
  /** Antal uppgifter eleven faktiskt har slutfört (både egna och tilldelade). */
  completedTasks: number;
  /** Antal genomförda provträningar. */
  quizAttempts: number;
  /** Bästa resultat i procent, eller null när inget prov är gjort. */
  bestQuizPercent: number | null;
}

export interface Achievement {
  id: string;
  name: string;
  /** Vad eleven har gjort — alltid räknat från riktig data. */
  description: string;
  /** Vad prestationen ger trädgården. */
  reward: string;
  progress: number;
  target: number;
  unlocked: boolean;
  effect: GardenEffect;
}

interface AchievementRule {
  id: string;
  name: string;
  description: string;
  reward: string;
  target: number;
  effect: GardenEffect;
  /** Läser av det faktiska värdet ur elevens aktivitet. */
  measure: (stats: ActivityStats) => number;
}

/**
 * Prestationerna räknas fram ur data som redan finns i databasen (avklarade
 * uppgifter och provresultat). De kan därför inte låsas upp med ett klick, och
 * de försvinner inte om eleven byter enhet — samma siffror ger samma resultat.
 */
const ACHIEVEMENT_RULES: readonly AchievementRule[] = [
  {
    id: 'forsta-uppgiften',
    name: 'Första steget',
    description: 'Slutför din första uppgift.',
    reward: 'Eldflugor börjar lysa över gräset.',
    target: 1,
    effect: 'eldflugor',
    measure: (stats) => stats.completedTasks,
  },
  {
    id: 'fem-uppgifter',
    name: 'Fem klara',
    description: 'Slutför fem uppgifter.',
    reward: 'Dimman lägger sig tätare vid marken.',
    target: 5,
    effect: 'dimma',
    measure: (stats) => stats.completedTasks,
  },
  {
    id: 'tio-uppgifter',
    name: 'Tio klara',
    description: 'Slutför tio uppgifter.',
    reward: 'Ett extra spöke vandrar genom trädgården.',
    target: 10,
    effect: 'spokparaden',
    measure: (stats) => stats.completedTasks,
  },
  {
    id: 'forsta-provet',
    name: 'Provtränaren',
    description: 'Genomför en provträning.',
    reward: 'Månsken lägger sig över taken.',
    target: 1,
    effect: 'manskensgloria',
    measure: (stats) => stats.quizAttempts,
  },
  {
    id: 'skarpskytt',
    name: 'Skarpskytt',
    description: 'Få minst 80 % rätt på en provträning.',
    reward: 'Stjärnfall över trädgården.',
    target: 80,
    effect: 'stjarnfall',
    measure: (stats) => Math.round(stats.bestQuizPercent ?? 0),
  },
];

/** Räknar fram prestationerna med verklig progress. */
export function buildAchievements(stats: ActivityStats): Achievement[] {
  return ACHIEVEMENT_RULES.map((rule) => {
    const progress = Math.max(rule.measure(stats), 0);
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      reward: rule.reward,
      progress: Math.min(progress, rule.target),
      target: rule.target,
      unlocked: progress >= rule.target,
      effect: rule.effect,
    };
  });
}

/** Effekterna som trädgården ska visa, utifrån upplåsta prestationer. */
export function gardenEffects(achievements: readonly Achievement[]): GardenEffect[] {
  return achievements.filter((a) => a.unlocked).map((a) => a.effect);
}

// ---------------------------------------------------------------- Trädgården

/**
 * En namngiven plats i scenen. Platserna ligger på olika ställen i motivet —
 * vid grinden, under lyktan, vid pumporna — så att trädgården ser ut som en
 * trädgård och inte som en rad ikoner. `x` och `y` är procent av scenens bredd
 * respektive höjd, och `scale` gör föremål längre bak mindre.
 */
export interface GardenSpot {
  /** Platsnumret som sparas i databasen (0–5). */
  slot: number;
  /** Kort namn som visas när eleven väljer plats. */
  label: string;
  x: number;
  y: number;
  scale: number;
}

export const GARDEN_SPOTS: readonly GardenSpot[] = [
  { slot: 0, label: 'Vid grinden', x: 12, y: 71, scale: 0.94 },
  { slot: 1, label: 'Under lyktan', x: 30, y: 63, scale: 0.82 },
  { slot: 2, label: 'Vid pumporna', x: 46, y: 76, scale: 1 },
  { slot: 3, label: 'På trappan', x: 63, y: 66, scale: 0.86 },
  { slot: 4, label: 'Bredvid häxan', x: 79, y: 57, scale: 0.78 },
  { slot: 5, label: 'Vid staketet', x: 90, y: 73, scale: 0.92 },
];

/** Antal fasta platser i scenen. Följer `GARDEN_SPOTS`. */
export const GARDEN_SLOT_COUNT = GARDEN_SPOTS.length;

export function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < GARDEN_SLOT_COUNT;
}

/** Platsen med ett visst nummer, eller null när numret inte finns. */
export function gardenSpot(slot: number): GardenSpot | null {
  return GARDEN_SPOTS.find((spot) => spot.slot === slot) ?? null;
}

/** Namnet på en plats, t.ex. "Vid grinden". */
export function gardenSpotLabel(slot: number): string {
  return gardenSpot(slot)?.label ?? `Plats ${slot + 1}`;
}

/**
 * Föremål som går att ställa i trädgården: upplåsta, med en riktig
 * placeringsnyckel och ritad grafik.
 */
export function placeableItems(items: readonly Collectible[]): Collectible[] {
  return items.filter((item) => item.unlocked && item.placementKey && item.artKey);
}
