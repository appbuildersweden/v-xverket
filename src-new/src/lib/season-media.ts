/**
 * Trädgårdens bakgrundsvideo.
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
 * Källfilen `haloween mp4/dl.mp4` i projektets rot är ingen video — det är en
 * MP3 (Cozy Cottage, *Cozy Autumn Village Halloween Ambience*, 1 h 27 min) med
 * ett 500 px brett omslag. Därför finns ingen film att hämta ur den; videon är
 * renderad ur det högupplösta motivet i stället.
 *
 * Vill du byta video: ersätt `src/assets/halloween-video.mp4` (eller lägg en
 * `.webm` bredvid). Ingen kod behöver ändras.
 */
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
