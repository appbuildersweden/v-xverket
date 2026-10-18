/**
 * Trädgårdens media: bakgrundsvideo, stillbild, ljudlandskap och omslag.
 *
 * Scenen visar en video när en sådan finns, annars stillbilden
 * `src/assets/halloween-bakgrund.webp`. Videon spelas alltid tyst (`muted`),
 * loopar, och hoppas över helt av den som har reducerad rörelse påslagen — då
 * visas stillbilden i stället.
 *
 * Videon ligger i `src/assets/halloween-video.mp4` och hittas vid bygget. Den
 * är 12 sekunder, 1536×1024, utan ljudspår, och gjord av samma motiv som
 * stillbilden: en långsam in-och-ut-zoomning som möts exakt i klippunkten, så
 * att loopen går ihop utan hack.
 *
 * Den medskickade filen `haloween mp4/dl.mp4` är ingen film — det är en MP3
 * (Cozy Cottage, *Cozy Autumn Village Halloween Ambience*, 1 h 27 min) med ett
 * 500 px brett omslag. Därför finns ingen film att hämta ur den. I stället tas
 * filens båda riktiga delar tillvara:
 *
 * - `halloween-ambience.mp3` — 60 sekunder av filens ljudlandskap, klippt med
 *   en sex sekunders övergång så att loopen går ihop. Spelas bara när eleven
 *   själv trycker på ljudknappen (webbläsare får inte starta ljud själva).
 * - `halloween-cover.webp` — filens inbäddade omslagsbild, som visas vid
 *   ljudknappen så att det syns var ljudet kommer ifrån.
 *
 * Vill du byta video: ersätt `src/assets/halloween-video.mp4` (eller lägg en
 * `.webm` bredvid). Ingen kod behöver ändras.
 */
import ambienceUrl from '../assets/halloween-ambience.mp3';
import coverUrl from '../assets/halloween-cover.webp';

const AUTO_VIDEOS = import.meta.glob('../assets/halloween-video.*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Videon som hittades i `src/assets/`, annars null. */
export const HALLOWEEN_BACKDROP_VIDEO_AUTO: string | null =
  Object.values(AUTO_VIDEOS)[0] ?? null;

/** Egen sökväg, t.ex. '/halloween/bakgrund.mp4'. Går före den automatiska. */
export const HALLOWEEN_BACKDROP_VIDEO: string | null = null;

/** Videon trädgården ska spela, eller null när stillbilden ska visas. */
export function halloweenBackdropVideo(): string | null {
  return HALLOWEEN_BACKDROP_VIDEO ?? HALLOWEEN_BACKDROP_VIDEO_AUTO;
}

/** Ljudlandskapet från den medskickade filen (60 sekunder, loopar). */
export function halloweenAmbience(): string {
  return ambienceUrl;
}

/** Filens eget omslag, som visas vid ljudknappen. */
export function halloweenAmbienceCover(): string {
  return coverUrl;
}

/** Krediten som visas när ljudet är påslaget. */
export const HALLOWEEN_AMBIENCE_CREDIT =
  'Ljudlandskap: Cozy Cottage — Cozy Autumn Village Halloween Ambience (från filen du lade in).';
