# Elda 0.2.8 – 48 ikonbelöningar från Halloween-arket

## Vad som ändrades

- **Ikonarket är uppdelat i 48 enskilda ikoner.** Arket (`48 SPRITES`,
  6 kategorier, 32×32 bas, x1 och x4) delades med
  [`scripts/dela-halloween-ikoner.py`](scripts/dela-halloween-ikoner.py): raderna
  hittas, varje rad delas i enskilda ikoner och varje ikon skrivs som en egen
  PNG med transparent bakgrund. Bakgrunden tas bort genom att fylla från
  bildens kant, så bara bakgrund som hänger ihop med kanten blir genomskinlig —
  hål inuti ett motiv (till exempel mellan staketets spjälor) behåller motivet
  intakt. Ingen ikon är ritad eller ersatt på nytt.
- **En belöning per ikon.** Varje ikon har egen fil, eget ID, eget namn på
  svenska, egen beskrivning, egen raritet och egen XP-gräns. Nycklarna har
  prefixet `ikon-` (`ikon-majsgodis`, `ikon-katt`, …) så att de aldrig kan
  krocka med de ritade föremålen i `season.ts`. Filen, nyckeln och
  databasraden heter samma sak.
- **XP-gränserna är flätade in i den befintliga stegen.** De tio ritade
  belöningarna behåller sina trösklar (20–1 200 XP); ikonerna ligger mellan
  35 och 2 000 XP. Trösklarna är unika, så varje ny XP-gräns ger exakt ett nytt
  föremål. Stegen ligger i `src/lib/halloween-rewards.ts` och är enda källan —
  servern, demoläget och gränssnittet läser samma siffror.
- **Serversidan.** Migreringen `20261031000000_halloween_ikoner.sql` lägger in
  de 48 belöningarna i `reward_definitions` med samma namn, XP-gränser och
  rariteter som klienten. Upplåsningen sker med samma `check_reward_unlocks`
  som förut, så varje ikon låses upp av en slutförd uppgift precis som de andra
  föremålen. Ingen XP och ingen tidigare upplåsning rörs.
- **Visningen.** Samlingen visar varje ikon med sin egen bild, sitt namn, sin
  raritet och exakt hur många XP som återstår. Låsta ikoner visas tonade som
  kommande belöningar och går inte att använda. Ikonerna är pixelbilder och
  ritas i sin egen storlek (`image-rendering: pixelated`), aldrig uppskalade.
  Bilderna är små nog att Vite bäddar in dem i paketet, så de följer med både i
  webbversionen och i den installerade appen.
- **Trädgården är oförändrad.** Den ocommittade omskrivningen i arbetsträdet
  (där platserna och utställningen tagits bort och bara bakgrundsvideon var
  kvar) publicerades **inte**; filerna återställdes till 0.2.7 innan releasen.

## Bilderna

| Bild | Innehåll | Nya ikoner |
| --- | --- | --- |
| 1 – ikonarket | 48 ikoner i 6 kategorier (5 pumpor, 8 varelser, 8 godis, 8 häx- och magisaker, 9 kyrkogårdsting, 10 mörka dekorationer) | 48 |
| 2 – arket med tolv ikoner | pumpa, spöke, skallflaska, godisspann, trollbok, katt, skalle, kittel, klubba, kristallkula, fladdermus, ljus | 0 (alla finns redan) |
| 3 – kvällsscenen | samma ikoner i en scen: spöken, spindel, fladdermöss, måne, träd, korp, katt, staket, gravstenar, kors, pumpor, ljus, godisspann, kittel, hatt, majsgodis | 0 (alla finns redan) |

Dubbletterna hittas med
[`scripts/jamfor-halloween-ikoner.py`](scripts/jamfor-halloween-ikoner.py), som
letar upp varje ikon i en målbild i flera skalor (0,82–1,00 i normaliserad
korskorrelation) och skriver en `-matchad.png` med träffarna inramade.

**Unika belöningar:** 48 nya ikoner + de 10 tidigare = **58 föremål** i
samlingen. Varje ikon har en egen fil i
[`src-new/src/assets/halloween-ikoner/`](src-new/src/assets/halloween-ikoner)
och en egen post i `HALLOWEEN_ICONS`, i stegen och i databasen.

## Publicerat

| Del | Version/adress |
| --- | --- |
| GitHub Release | `v0.2.8` – exe, msi och signaturer (Release-körningen grön, körning 39139359977) |
| Hemsida | https://elda-6a9.pages.dev – VERSION 0.2.8, publicerad 18 oktober 2026 |
| Uppdatering | `https://elda-6a9.pages.dev/update.json` – 0.2.8 |
| Nedladdning | `elda-installers/Elda_0.2.8_x64-setup.exe` och `.msi` (privat bucket) |
| Databas | migreringen `20261031000000_halloween_ikoner` körd mot det länkade projektet |

CI kör releasen; hemsidan och uppdateringsmanifestet publicerades lokalt med
`npx wrangler pages deploy dist --project-name elda --branch main`, eftersom
`CLOUDFLARE_API_TOKEN` fortfarande saknas i GitHub.

## Verifierat

| Kontroll | Resultat |
| --- | --- |
| `npx tsc --noEmit` i `src-new` | grönt |
| `npx vitest run` i `src-new` | 36 filer, 418 prov, alla gröna |
| `npm run build` i rotappen | grönt |
| Ikonerna i det byggda paketet | 48 inbäddade PNG-dataurier i `dist/assets` – inga separata filer kan saknas |
| Samlingen i webbläsaren (demoläge) | 58 kort, 48 ikoner varav 0 trasiga, varje ikon i sin egen naturliga storlek |
| Upplåsning i webbläsaren | vid 40 XP visades *Ny belöning: Majsgodis* med ikonens bild och beskrivning |
| Trädgården i webbläsaren | platserna och utställningen fungerar som i 0.2.7; *Majsgodis* står utställd och ritas som pixelbild |
| Mina framsteg i webbläsaren | visar nästa belöning (*Karamell*) med ikonens bild och exakt antal XP kvar |
| Migreringen | `reward_definitions`: 89 rader (41 tidigare + 48 nya), `reward_unlocks`: 2 rader – oförändrade |
| `node scripts/kontrollera-uppdatering.mjs` | version 0.2.8, signatur mot `.sig` stämmer, filen nedladdningsbar (8 906 605 B) |
| `download`-funktionens `info` | 0.2.8, exe + msi |
| Anonym nedladdning | 401, som förut |
| Privata bucketen | `Elda_0.2.8_x64-setup.exe` och `Elda_0.2.8_x64_en-US.msi` finns |

## Kvar och begränsningar

- **Ingen installerad app har uppdaterats end-to-end härifrån.** Manifest,
  signatur, filstorlek och nedladdning är verifierade med samma kontroller som
  appen gör innan den installerar.
- **Taggen `v0.2.8` innehåller det gamla migreringsfilnamnet.** Filen döptes
  först till `20261030000000_halloween_ikoner.sql`, vilket krockade med den
  redan körda `20261030000000_todo_xp.sql`; den ligger därför som
  `20261031000000_halloween_ikoner.sql` från och med commit `94ae03c`. Själva
  migreringen kördes efter namnbytet, och migreringsfiler följer ändå inte med
  i appens paket.
- **Ikonerna i trädgården skalas ned** till platsens storlek (i exemplet
  36×46 px). De ritas med `pixelated`, men nerskalning av pixelgrafik är inte
  alltid jämn; i samlingen och i nästa-belöning-rutan visas de i sin egen
  storlek.
- **Hemsidan kan fortfarande inte publiceras av CI** så länge
  `CLOUDFLARE_API_TOKEN` saknas i GitHub.
- OpenRouter-kvoten för AI-hjälpen är oförändrad – den rör inte den här
  versionen.
