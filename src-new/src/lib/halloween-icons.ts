/**
 * De 48 ikonerna från Halloween-arket — en belöning per ikon.
 *
 * Arket delades upp i enskilda bilder med `scripts/dela-halloween-ikoner.py`
 * och filerna ligger i `src/assets/halloween-ikoner/`. Filnamnet är samma sak
 * som `key`: `ikon-majsgodis.png` hör till nyckeln `ikon-majsgodis`, och samma
 * nyckel används i databasen (`illustration` och `unlocks_items`) och i
 * gränssnittet. Nycklarna har prefixet `ikon-` för att aldrig kunna krocka med
 * de ritade föremålen i `season.ts`.
 *
 * Här ligger bara säsongens *innehåll*: namn, beskrivning, raritet och XP-gräns.
 * Allt som räknas — XP, nivåer och upplåsningar — räknas fortfarande fram på
 * servern (se `planner.ts`), och stegen samlas i `halloween-rewards.ts`.
 */
import type { Rarity } from './season';

const ICON_FILES = import.meta.glob('../assets/halloween-ikoner/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Sökvägen till en ikons bildfil, eller null när filen inte finns. */
export function halloweenIconFile(key: string): string | null {
  return ICON_FILES[`../assets/halloween-ikoner/${key}.png`] ?? null;
}

export interface HalloweenIcon {
  /** Nyckeln som binder ihop bildfil, databasrad och gränssnitt. */
  key: string;
  /** Namnet som visas i samlingen. */
  name: string;
  /** Vad ikonen föreställer, med appens röst. */
  description: string;
  /** Total XP som krävs för att låsa upp ikonen. */
  xpRequired: number;
  rarity: Rarity;
}

/**
 * Ikonerna i den ordning de låses upp. Trösklarna är flätade in i stegen med
 * ritad grafik (`halloween-rewards.ts`), så varje ny XP-gräns ger ett nytt
 * föremål — ändra en siffra här och kör migreringen `halloween_ikoner`.
 */
export const HALLOWEEN_ICONS = [
  {
    key: 'ikon-majsgodis',
    name: 'Majsgodis',
    description: 'Ett majsgodis i tre lager — det första godiset i hinken.',
    xpRequired: 35,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-karamell',
    name: 'Karamell',
    description: 'En karamell med papper som prasslar i godispåsen.',
    xpRequired: 67,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-polkagris',
    name: 'Polkagris',
    description: 'En rödvit polkagris med skarpa ränder.',
    xpRequired: 83,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-klubba',
    name: 'Klubba',
    description: 'En klubba med virvlande mönster och långt skaft.',
    xpRequired: 125,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-chokladkaka',
    name: 'Chokladkaka',
    description: 'En chokladkaka med rutor — lätt att dela, svår att lämna tillbaka.',
    xpRequired: 150,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-kanderat-apple',
    name: 'Kanderat äpple',
    description: 'Ett rött äpple med sockerlager och en kvist på toppen.',
    xpRequired: 200,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-muffins',
    name: 'Muffins',
    description: 'En muffins med orange glasyr och strössel.',
    xpRequired: 225,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-godisspann',
    name: 'Godisspann',
    description: 'En liten pumpahink full av godis från kvällens runda.',
    xpRequired: 250,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-ben',
    name: 'Ben',
    description: 'Ett ensamt ben med knöl i båda ändar.',
    xpRequired: 300,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-korsade-ben',
    name: 'Korsade ben',
    description: 'Två ben lagda i kors.',
    xpRequired: 325,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-spindelnat',
    name: 'Spindelnät',
    description: 'Ett spindelnät vars mönster håller ihop hela hörnet.',
    xpRequired: 350,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-oga',
    name: 'Öga',
    description: 'Ett öga med grön iris som följer den som går förbi.',
    xpRequired: 375,
    rarity: 'vanlig',
  },
  {
    key: 'ikon-ljus',
    name: 'Levande ljus',
    description: 'Ett stearinljus med levande låga och smält kant.',
    xpRequired: 425,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-nyckel',
    name: 'Nyckel',
    description: 'En gammal nyckel. Ingen vet vilket lås den passar i.',
    xpRequired: 450,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-pergament',
    name: 'Pergament',
    description: 'En rulle med rött sigill och text som är svår att tyda.',
    xpRequired: 475,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-gravsten',
    name: 'Gravsten',
    description: 'En sten med bokstäverna RIP och mossa i kanten.',
    xpRequired: 500,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-gravsten-kors',
    name: 'Gravsten med kors',
    description: 'En gravsten med ett kors och en vit blomma.',
    xpRequired: 525,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-stenkors',
    name: 'Stenkors',
    description: 'Ett kors av huggen sten, gammalt och vittrat.',
    xpRequired: 575,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-trakors',
    name: 'Träkors',
    description: 'Ett enkelt träkors, lutat av vinden.',
    xpRequired: 600,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-stenrose',
    name: 'Stenröse',
    description: 'En hög med stenar som någon har lagt till minne.',
    xpRequired: 625,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-staket',
    name: 'Järnstaket',
    description: 'Ett smitt staket med spetsar. Det håller ordning på tomten.',
    xpRequired: 650,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-kvast',
    name: 'Kvast',
    description: 'En kvast med bundet ris, redo för nattens flygtur.',
    xpRequired: 675,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-haxhatt',
    name: 'Häxhatt',
    description: 'En hög hatt med brett brätte och ett spänne.',
    xpRequired: 700,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-gron-dryck',
    name: 'Grön dryck',
    description: 'En smal flaska med grön dryck och kork.',
    xpRequired: 750,
    rarity: 'ovanlig',
  },
  {
    key: 'ikon-trolldryck',
    name: 'Trolldryck',
    description: 'En rund flaska med lila dryck som glittrar.',
    xpRequired: 775,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-skallflaska',
    name: 'Skallflaska',
    description: 'En flaska med skallen på etiketten. Receptet står ingenstans.',
    xpRequired: 800,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-trollbok',
    name: 'Trollbok',
    description: 'En bok med ett öga på omslaget som följer varje sida.',
    xpRequired: 825,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-trollstav',
    name: 'Trollstav',
    description: 'En stav med en stjärna i toppen som lämnar gnistor efter sig.',
    xpRequired: 850,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-kristallkula',
    name: 'Kristallkula',
    description: 'En kula som visar dimmor i stället för framtiden.',
    xpRequired: 875,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-spindel',
    name: 'Spindel',
    description: 'En spindel som vaktar sitt nät och aldrig släpper blicken.',
    xpRequired: 950,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-fladdermus',
    name: 'Fladdermus',
    description: 'En fladdermus som flyger lågt över trädgården i skymningen.',
    xpRequired: 975,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-hangande-fladdermus',
    name: 'Hängande fladdermus',
    description: 'En fladdermus som sover upp och ner under taket.',
    xpRequired: 1000,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-korp',
    name: 'Korp',
    description: 'En korp med gul näbb som håller ordning på trädgården.',
    xpRequired: 1025,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-katt',
    name: 'Katt med gula ögon',
    description: 'En svart katt som sitter still och ser allt som rör sig.',
    xpRequired: 1050,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-spoke',
    name: 'Spöke',
    description: 'Ett litet spöke som svävar stilla och tittar nyfiket tillbaka.',
    xpRequired: 1075,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-lakan',
    name: 'Lakan med ögon',
    description: 'Ett klassiskt lakan med två tomma ögon.',
    xpRequired: 1100,
    rarity: 'sallsynt',
  },
  {
    key: 'ikon-kittel',
    name: 'Grön kittel',
    description: 'En kittel där det bubblar grönt, utan att någon har rört den.',
    xpRequired: 1125,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-lykta',
    name: 'Lykta',
    description: 'En lykta med varmt ljus som brinner hela natten.',
    xpRequired: 1150,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-trad',
    name: 'Knotigt träd',
    description: 'Ett träd utan löv, med grenar som ser ut som fingrar.',
    xpRequired: 1250,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-skalle',
    name: 'Skalle',
    description: 'En skalle med tomma ögonhålor och ett leende kvar.',
    xpRequired: 1325,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-kista',
    name: 'Kista',
    description: 'En träkista med kors och handtag — tom, som tur är.',
    xpRequired: 1400,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-pumpalykta',
    name: 'Pumpalykta',
    description: 'En urgröpt pumpa med lyktansikte. Ljuset inuti fladdrar när det blåser.',
    xpRequired: 1475,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-pumpahuvud',
    name: 'Pumpahuvud',
    description: 'Ett pumpahuvud med glatt ansikte och ett litet ljus i botten.',
    xpRequired: 1560,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-stor-pumpa',
    name: 'Stor pumpa',
    description: 'En rund, omålad pumpa — redo att gröpas ur.',
    xpRequired: 1645,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-vit-pumpa',
    name: 'Vit pumpa',
    description: 'En blek pumpa som nästan lyser i mörkret.',
    xpRequired: 1730,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-pumpor',
    name: 'Två pumpor',
    description: 'En stor och en liten pumpa, sida vid sida.',
    xpRequired: 1820,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-spoke-armar',
    name: 'Spöke med armar',
    description: 'Ett spöke som sträcker armarna i vädret när det blir uppspelt.',
    xpRequired: 1910,
    rarity: 'legendarisk',
  },
  {
    key: 'ikon-mane',
    name: 'Måne',
    description: 'En månskära med en stjärna i släptåg — säsongens sista föremål.',
    xpRequired: 2000,
    rarity: 'legendarisk',
  },
] as const satisfies readonly HalloweenIcon[];

export type HalloweenIconKey = (typeof HALLOWEEN_ICONS)[number]['key'];

/** Alla ikonnycklar, i upplåsningsordning. */
export const HALLOWEEN_ICON_KEYS: readonly HalloweenIconKey[] = HALLOWEEN_ICONS.map(
  (icon) => icon.key,
);

/** Sant när värdet är en av ikonnycklarna. */
export function isHalloweenIconKey(value: string): value is HalloweenIconKey {
  return (HALLOWEEN_ICON_KEYS as readonly string[]).includes(value);
}
