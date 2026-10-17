# Elda 0.2.2 – automatisk uppdatering

## Varför uppdateringen inte nådde den installerade appen

Fyra fel låg bakom, och de förstärkte varandra:

1. **Uppdateringsbehörigheten saknades.** I
   [`src-tauri/capabilities/default.json`](src-tauri/capabilities/default.json)
   fanns bara `core:default`. Utan `updater:default` avvisar Tauri varje
   `check()`/`download()`/`install()` från gränssnittet. Den installerade
   0.2.1-appen kan därför inte ens kontrollera efter en ny version.
2. **Ingen automatisk kontroll fanns.** `checkForUpdate()` anropades bara om
   användaren öppnade *Profil & inställningar*. Ingen kontroll vid start och
   ingen återkommande kontroll.
3. **Manifestets nedladdningsadress var död.** `update.json` pekade på
   `/downloads/Elda_0.2.1_x64-setup.exe`, men [`site/_redirects`](site/_redirects)
   skickar alla `/downloads/*` till startsidan (302). Uppdateraren fick alltså
   HTML i stället för ett installationspaket.
4. **Manifestet försvann vid nästa publicering.** `site/build.mjs` raderade
   `update.json` och satte `releases.json` till `updater: false`, eftersom
   nedladdningsskyddet ansågs krocka med en publik uppdateringsfil.

Dessutom visade gränssnittet `0.0.0` som installerad version, eftersom
`currentBuiltVersion()` läste en global som aldrig sattes.

## Ändringar

- **Behörigheter:** `updater:default` och `process:allow-restart` i
  `capabilities/default.json`.
- **Automatik:** [`src/components/UpdateBanner.tsx`](src/components/UpdateBanner.tsx)
  kontrollerar sex sekunder efter start och därefter var sjätte timme, laddar
  ner signerade uppdateringar i bakgrunden och visar förlopp, fel och
  återförsök. Användaren startar om med ett tydligt val; rutan kan skjutas upp
  ett dygn.
- **Robusthet:** [`src/lib/update.ts`](src/lib/update.ts) gör tre försök med
  backoff vid nätverksfel, återanvänder samma `Update`-objekt och läser
  versionen via `getVersion()` i stället för en odefinierad global.
- **Manifest:** [`site/update-manifest.mjs`](site/update-manifest.mjs) bygger
  `update.json` från det signerade NSIS-paketet, och `site/build.mjs`
  publicerar filen under `/updates/`. Saknas paket eller signatur publiceras
  inget manifest – ett gammalt manifest tas alltid bort först.
- **Releaseflödet:** webbplatssteget kräver inte längre `ELDA_DOWNLOAD_BASE`,
  och efter deploy körs [`scripts/kontrollera-uppdatering.mjs`](scripts/kontrollera-uppdatering.mjs)
  som jämför live-manifestet med den lokala signaturen och filstorleken.
- **Adminpanelen:** [`src/pages/admin/AdminUpdatesPage.tsx`](src/pages/admin/AdminUpdatesPage.tsx)
  ersätter exempeldatan under *Nyheter och uppdateringar → Uppdateringar* med
  verklig status: installerad version, publicerad version, signerat paket,
  kontrolltid och ändringsanteckningar. I webbläsaren läses `update.json`
  direkt; i appen används Tauri-uppdateraren, och en tillgänglig uppdatering
  kan startas därifrån.
- **Tester:** [`site/tests/updater.test.mjs`](site/tests/updater.test.mjs)
  prövar versionsval, saknad signatur, osäker basadress och filnamn med
  sökväg.

## Publicerat

| Sak | Adress |
| --- | --- |
| Manifest | `https://elda-6a9.pages.dev/update.json` (version 0.2.2) |
| Uppdateringspaket | `https://elda-6a9.pages.dev/updates/Elda_0.2.2_x64-setup.exe` |
| Skyddad nedladdning | `elda-installers/Elda_0.2.2_x64-setup.exe` och `.msi` |

Paketet är byggt och signerat lokalt med nyckeln i `~/.tauri` (nyckel-id
`74e93c03c8b0eb67`, samma publika nyckel som förut). Ingen ny nyckel skapades
och den privata nyckeln har inte skrivits ut eller lagts i repot.

## Verifierat

| Kontroll | Resultat |
| --- | --- |
| `npm run build` (tsc + vite) | grönt |
| `site`: `npm test` | 28 av 28 |
| Installerad version i bygget | 0.2.2 (app.exe och setup.exe) |
| `update.json` live | version 0.2.2, rätt URL och signatur |
| Nedladdning live | HTTP 200, `application/octet-stream`, 6 412 784 B |
| SHA-256 live mot lokalt paket | identiska |
| Signatur mot appens publika nyckel | verifierad (`minisign-verify`) |
| Nedladdningsfunktionens `info` | version 0.2.2, exe och msi |
| Gränssnittet i webbläsare | laddar utan konsolfel, adminpanelen fungerar |
| Adminpanelen → Uppdateringar | visar installerad/publicerad version, status och ändringsanteckningar från live-manifestet |

## Kvar och begränsningar

- **Installerad 0.2.1 kan inte uppdatera sig själv.** Den byggdes utan
  uppdateringsbehörighet och utan automatisk kontroll, så den måste installeras
  om en gång med 0.2.2. Därefter fungerar automatiken.
- Ingen gammal installerad version har uppdaterats end-to-end i det här steget:
  det kräver att 0.2.2 installeras och att en nyare version publiceras.
- Ingen GitHub Release `v0.2.2` är skapad, eftersom ändringarna inte är
  committade/pushade. En taggpush kör releaseflödet och publicerar då även
  GitHub-releasen.
- Det publika uppdateringspaketet under `/updates/` går att ladda ner utan
  inloggning – det är ett krav från Tauri. Integriteten skyddas av signaturen;
  den vanliga nedladdningsknappen på sidan är fortfarande inloggningsskyddad.
