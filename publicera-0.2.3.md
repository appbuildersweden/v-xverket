# Elda 0.2.3 – publicerad

## Vad som publicerades

| Del | Vad | Var |
| --- | --- | --- |
| Serverfunktioner | `ai-chat` (felkod + tydligt kvotbesked, HTTP 503), `register` (`aiIssue` + förklarande besked) | Supabase, projekt `nwgufdnnordapjbgplzs` |
| Hemsidan | kvotbesked på registreringssidan, uppdaterat `update.json` (0.2.3) | https://elda-6a9.pages.dev |
| Appen | version 0.2.3 (NSIS + MSI, signerade) | GitHub Release `v0.2.3`, `elda-installers`, `/updates/` |
| Git | commit `0674b5a` + tagg `v0.2.3` pushade till `main` | GitHub |

Appens gränssnitt är oförändrat sedan 0.2.2. Det som är nytt för användaren
kommer från servern och når därför även en installerad 0.2.2: AI-hjälpen säger
att gratiskvoten är slut i stället för "försök igen", och registreringen
förklarar att ansökan går till manuell granskning och inte är avslagen.

## Verifierat

| Kontroll | Resultat |
| --- | --- |
| `npm run build` i rotappen (0.2.3) | grönt |
| `npm test` i `src-new` | 359 prov i 27 filer, gröna |
| `npm test` i `site` | 28 prov, gröna |
| `ai-chat` live med kvävd kvot | HTTP 503, `code: ai-kvot-slut`, förklarande text |
| `register` live | `aiIssue: krediter-slut` och besked om manuell granskning |
| `update.json` live | version 0.2.3, rätt URL och signatur |
| `/updates/Elda_0.2.3_x64-setup.exe` | `application/octet-stream`, 6 417 471 B, samma SHA-256 som releasefilen |
| Signaturen mot appens publika nyckel | verifierad (Ed25519, `blake2b512`, nyckel-id `67EBB0C8033CE974`) |
| Trusted comment i signaturen | `file:Elda_0.2.3_x64-setup.exe version:0.2.3` |
| `download`-funktionens `info` | version 0.2.3, exe och msi |
| `scripts/kontrollera-uppdatering.mjs` | grönt (version, signatur, nedladdningsbar) |
| Hemsidan i webbläsare | versionshistorik v0.2.3/v0.2.1/v0.2.0/v0.1.0, inga konsol- eller nätverksfel |

Alla installationsfiler som sajten och bucketen serverar är **GitHub-releasens
egna filer**, hämtade från `releases/download/v0.2.3/`. Därför finns bara en
0.2.3-binär i omlopp, inte en lokal och en från CI.

## Två saker att känna till

1. **CI publicerade releasen men inte sajten.** Taggpuchen skapade GitHub
   Releasen `v0.2.3` med exe, msi och signaturer, men webbplatsstegen hoppades
   över eftersom `CLOUDFLARE_API_TOKEN` (och `CLOUDFLARE_ACCOUNT_ID`) saknas som
   Actions-hemligheter. Sajten publicerades därför lokalt med `wrangler`.
   Lägg till hemligheterna så publicerar en taggpush både release och sajt
   fortsättningsvis.
2. **Versionshistoriken kunde tömmas av ett lokalt bygge.** `site/build.mjs`
   skrev en tom lista när GitHub inte kunde läsas. Nu behålls den publicerade
   historiken, med `site/releases-snapshot.json` som sista utväg. Fixen ligger i
   commit `6936c95` och är publicerad.

## Kvar och begränsningar

- Ingen installerad 0.2.2 har uppdaterats end-to-end härifrån: det kräver att
  appen startas och att uppdateringsrutan används. Manifest, filstorlek och
  signatur är verifierade med samma kontroll som appen gör.
- `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` saknas fortfarande i GitHub;
  tills de finns publiceras sajten bara vid en lokal `wrangler`-körning.
- Kvoten hos OpenRouter är fortfarande slut, så AI-hjälpen kan inte svara förrän
  den fylls på. Det är just det läget som nu syns tydligt för användaren.
