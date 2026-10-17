# Elda 0.2.4 – privatelevpanelen i den installerade appen

## Vad som ändrades

- **Desktopappen paketerar nu den nya appen** (`src-new`). Tidigare byggdes den
  äldre appen i `src/`, där privatelevpanelen inte fanns. `src-tauri/tauri.conf.json`
  pekar på `../dist`, och rotens `npm run build` bygger `src-new` och kopierar
  hit resultatet (`scripts/kopiera-webbappen.mjs`). Samma sökvägar som förut
  gäller därför i releaseflödet.
- **Uppdateringsrutan flyttades med** (`src-new/src/lib/update.ts`,
  `src-new/src/components/UpdateBanner.tsx`): kontroll vid start och var sjätte
  timme, nedladdning i bakgrunden, omstart med användarens val.
- **Admin kan sätta kontotyp** på ett elevkonto: `admin-users`
  (`action: set-account-type`) sätter `profiles.account_type` till `skola` eller
  `privat`, uppdaterar `app_metadata`, loggar i granskningsloggen och **nekar**
  bytet om eleven är klassmedlem (409) — annars skulle klassåtkomsten ligga kvar.
  Sidan *Roller* har en ny ruta *Kontotyp för elev*.
- **Rollen privat elev** är i databasen `role = 'elev'` + `account_type = 'privat'`,
  inte ett eget rollnamn. Rollen styr panelerna och RLS; kontotypen styr
  klasspärren, och båda sätts serversidigt. Att införa ett eget rollvärde skulle
  kräva ändringar i JWT, RLS och alla rollkontroller utan att ge något extra.
- **Linneas konto** (`elintu01`, Linnea Turesson) är orört och redan
  `role=elev, account_type=privat, active=true`. Ingen roll ändrades
  automatiskt och inget extra konto skapades.

## Publicerat

| Del | Version/adress |
| --- | --- |
| Serverfunktioner | `admin-users` (kontotyp), `ai-chat`, `register` |
| Hemsida | https://elda-6a9.pages.dev (manifest 0.2.4) |
| GitHub Release | `v0.2.4` – exe, msi, signaturer |
| Nedladdning | `elda-installers/Elda_0.2.4_x64-setup.exe` och `.msi` |
| Uppdatering | `https://elda-6a9.pages.dev/update.json` |

CI-körningen för `v0.2.4` lyckades. Den första taggen föll på att
`frontendDist` pekade in i `src-new/dist`; lösningen blev att bygga till rotens
`dist` i stället, och taggen skapades om.

## Verifierat

| Kontroll | Resultat |
| --- | --- |
| `npm run typecheck` i `src-new` | grönt |
| `npm test` i `src-new` | 27 filer, alla gröna (361 prov) |
| `npm run build` i rotappen | grönt, Supabase-adressen finns i `dist/assets` |
| Lokal Tauri-build | `Elda_0.2.4_x64-setup.exe`, signerad |
| `update.json` live | 0.2.4, rätt URL och signatur |
| Signatur mot appens publika nyckel | verifierad (`file:... version:0.2.4`) |
| `/updates/`-filens SHA-256 | identisk med releasefilen |
| `download`-funktionens `info` | 0.2.4, exe + msi |
| Kontotyp-åtgärden | elev får 403, utan session 401 |
| Linneas konto | `role=elev, account_type=privat`, aktivt, oförändrat |
| Hemsidan i webbläsare | v0.2.4 med nya anteckningar, inga fel |

## Kvar och begränsningar

- **Administratörens väg i kontotyp-åtgärden är inte körd live** (inget
  adminlösenord användes). Elev- och anonym-nekanden är verifierade; UI-flödet
  är prövat i automatiska prov mot mockad backend.
- **Ingen installerad app har uppdaterats end-to-end härifrån.** Manifest,
  storlek och signatur är verifierade med samma kontroll som appen gör.
- `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` saknas fortfarande i GitHub,
  så CI skapar releasen men publicerar inte sajten; sajten publicerades lokalt.
- OpenRouter-kvoten är fortfarande slut: AI-hjälpen visar då sitt ärliga
  kvotbesked i stället för att svara.
