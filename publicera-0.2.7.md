# Elda 0.2.7 – trädgården på riktiga platser, nytt firande och tydligare framsteg

## Vad som ändrades

- **Platserna i trädgården.** Scenen har nu sex namngivna platser — *Vid
  grinden*, *Under lyktan*, *Vid pumporna*, *På trappan*, *Bredvid häxan* och
  *Vid staketet* — i stället för en rad i nederkanten. Ockuperade platser syns
  i scenens djup (längre bak = mindre). Allt ligger kvar i samma tabell och
  samma serverfunktioner som förut: `GARDEN_SPOTS` i `lib/season.ts` styr bara
  var platsen ritas.
- **Välj plats, dra eller flytta.** Ett klick på en ledig plats öppnar en
  väljare med de upplåsta föremål som inte står ute. Ett föremål kan dras till
  en annan plats, och står det något där **byter de två plats** — inget föremål
  försvinner av misstag. Detaljrutan har också en egen platsväljare för den som
  hellre klickar än drar. Servern är fortfarande den som avgör vad som får
  ställas ut (`garden_place_item`).
- **Ljudlandskapet från den medskickade filen.** Filen `haloween mp4/dl.mp4` är
  ingen video utan en MP3 (Cozy Cottage, *Cozy Autumn Village Halloween
  Ambience*, 1 h 27 min) med ett 500 px omslag. Två nya filer tar nu tillvara
  det som faktiskt finns i den: `halloween-ambience.mp3` (60 sekunder, klippt
  med sex sekunders övergång så att loopen går ihop, 470 kB) och
  `halloween-cover.webp` (filens eget omslag, 29 kB). Ljudet startar bara när
  eleven själv trycker på knappen i trädgårdens huvud — aldrig av sig självt —
  och knappen visar filens omslag.
- **Upplåsningsfirandet är ombyggt.** Egen ruta i stället för den gamla
  modal-varianten: ljussken och roterande ringar kring föremålet, konfetti i
  säsongens färger, raritet (när servern skickar den), XP, alla föremål i
  upplåsningen och övriga belöningar i samma åtgärd. Innehållet kommer
  fortfarande från servern — rutan räknar inte ut något själv. Reducerad rörelse
  ger samma innehåll utan rörelse.
- **Mina framsteg är ombyggd.** Överst en nivåring med XP inom nivån, XP till
  nästa nivå, nästa belöning med ritad grafik och exakt antal XP kvar, plus en
  direkt väg till trädgården. Därefter statistik, samlingen som vägg (upplåsta
  tydligt, låsta med kvarvarande XP), milstolpar med riktig progress, ämnen,
  provresultat och material.
- **Uppdateringskortet** (från föregående arbete, tidigare ocommittat) följer
  med: kontroll, nedladdning med förlopp och installation från profilsidan, och
  adminens menyval *Uppdateringar* visar riktigt innehåll.

## Publicerat

| Del | Version/adress |
| --- | --- |
| GitHub Release | `v0.2.7` – exe, msi och signaturer (Release-körningen grön) |
| Hemsida | https://elda-6a9.pages.dev (version 0.2.7 i sidhuvudet) |
| Uppdatering | `https://elda-6a9.pages.dev/update.json` – 0.2.7 |
| Nedladdning | `elda-installers/Elda_0.2.7_x64-setup.exe` och `.msi` (privat bucket) |

CI kör releasen; hemsidan och uppdateringsmanifestet publicerades lokalt med
`wrangler pages deploy dist --project-name elda --branch main`, eftersom
`CLOUDFLARE_API_TOKEN` fortfarande saknas i GitHub.

## Verifierat

| Kontroll | Resultat |
| --- | --- |
| `npm run typecheck` i `src-new` | grönt |
| `npm test` i `src-new` | 34 filer, 409 prov, alla gröna |
| `npm run build` i rotappen | grönt, alla mediatillgångar med i `dist/assets` |
| Byggt gränssnitt i webbläsare | login-sidan renderas, inga konsol- eller nätverksfel |
| `update.json` live | 0.2.7, rätt adress och signatur |
| `node scripts/kontrollera-uppdatering.mjs` | version 0.2.7, signatur mot `.sig` stämmer, filen nedladdningsbar (8 873 375 B) |
| `download`-funktionens `info` | 0.2.7, exe + msi |
| Anonym nedladdning | 401, som förut |
| Trädgården i webbläsaren (demoläge) | platser, etiketter, platsval, flyttlista och ljudknapp fungerar |
| Upplåsningsfirandet i webbläsaren | ruta med grafik, raritet, XP och fortsätt-knapp |

## Kvar och begränsningar

- **Ingen video kunde hämtas ur den medskickade filen** — den innehåller ingen
  videoström. Bakgrundsvideon i trädgården är därför fortfarande den renderade
  tolvsekundersfilmen; filens ljud och omslag används nu i stället.
- **Ljudet kan inte startas automatiskt.** Webbläsare (och Windows-appen) nekar
  uppspelning utan en användarhandling, så knappen är avstängd tills eleven
  trycker på den.
- **Ingen installerad app har uppdaterats end-to-end härifrån.** Manifest,
  signatur, filstorlek och nedladdning är verifierade med samma kontroller som
  appen gör.
- **Platserna är sex stycken och ligger fast i scenen.** Att lägga till fler
  kräver en migrering av `garden_placements.slot` (0–5) och motsvarande
  kontroll i `garden_place_item` — det är därför inte gjort i den här versionen.
