# Att publicera webbplatsen

Webbplatsen är skolplattformens publika sida: startsidan, registreringen,
förslagsformuläret och själva skolappen under `/skola/`. Den innehåller ingen
nedladdning, ingen versionshistorik och inget uppdateringsmanifest.

## Vad som publiceras

| Adress | Innehåll |
| --- | --- |
| `https://elda.cc.cd/` | startsidan, `registrera.html`, `feedback.html`, `app.js`, `site.css`, `config.json` |
| `https://elda.cc.cd/skola/` | den byggda Elda Skola-appen |
| `https://eldaskola.cc.cd/` | Worker `eldaskola-router`, som skickar roten vidare till `/skola/` |

Sidan ligger på Cloudflare Pages-projektet **`elda`** (`elda-6a9.pages.dev`).
Projektet har ingen Git-koppling: nytt innehåll syns först när
`wrangler pages deploy` körs, automatiskt av releaseflödet eller manuellt.

## Automatiskt flöde

En tagg startar [`.github/workflows/release.yml`](.github/workflows/release.yml):

```bash
git tag v0.2.14
git push origin v0.2.14
```

1. Windows-paketen byggs och signeras, och GitHub-releasen skapas.
2. `site/build.mjs` bygger webbplatsen till `site/dist`.
3. `elda-skola` byggs med `base /skola/` direkt in i `site/dist/skola`.
4. `wrangler pages deploy` publicerar `site/dist` till projektet `elda`.

Saknas `CLOUDFLARE_API_TOKEN` avslutas en taggkörning med fel, i stället för
att se grön ut medan sidan ligger kvar på föregående version.

## Hemligheter och variabler

| Namn | Typ | Innehåll |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | token med behörighet *Cloudflare Pages: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | secret | kontots ID |
| `TAURI_SIGNING_PRIVATE_KEY` | secret | används bara av appbygget |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | används bara av appbygget |
| `VITE_SUPABASE_URL` | variable | `https://<projekt>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | variable | projektets publika anon-nyckel |
| `ELDA_SKOLA_URL` | variable | adressen till plattformen, `https://eldaskola.cc.cd` |

`site/build.mjs` skriver den publika Supabase-adressen, anon-nyckeln och
`skolaUrl` till `site/dist/config.json`. Saknas Supabase-variablerna publiceras
sidan ändå, men registreringen och förslagsformuläret visar då att de inte är
tillgängliga i stället för att låtsas fungera.

### Adressen till plattformen

`ELDA_SKOLA_URL` läses av `site/build.mjs` via
[`site/skola-url.mjs`](site/skola-url.mjs). Bara **https** godkänns; en
http-adress tappar sessionscookien och `localhost` avvisas i skarpa byggen.
Är variabeln tom publiceras sidan utan knappen *Öppna Elda Skola*.
Reglerna testas i `site/tests/skola-url.test.mjs`.

## Publicera manuellt

Från en maskin med `npx wrangler login` (samma projekt `elda`):

```bash
# 1. Bygg Elda Skola under /skola (base /skola/)
cd elda-skola
ELDA_SKOLA_BUILD=1 npx tsc --noEmit
ELDA_SKOLA_BUILD=1 npx vite build --outDir ../site/dist/skola --emptyOutDir
cd ..

# 2. Bygg webbplatsen (index, registrera, feedback, config.json)
cd site
VITE_SUPABASE_URL="https://<projekt>.supabase.co" \
VITE_SUPABASE_ANON_KEY="<anon-nyckel>" \
ELDA_SKOLA_URL="https://eldaskola.cc.cd" \
npm run build

# 3. Publicera till det befintliga projektet
npx wrangler pages deploy dist --project-name elda --branch main
```

`npm run build` i `site/` rensar `dist/` först, så skolappen måste byggas
antingen före (steg 1) eller skickas med variabeln `ELDA_SKOLA_BUILD=1` som
releaseflödet gör. Byggs skolappen utan den variabeln hamnar dess filer under
`/assets` och `/skola/` fungerar inte.

## Domäner

- `elda.cc.cd` och `www.elda.cc.cd` är Custom Domains på Pages-projektet
  `elda`. Certifikaten sköts av Cloudflare.
- `eldaskola.cc.cd` är en egen zon med Workern `eldaskola-router`
  ([`cloudflare/eldaskola-router`](cloudflare/eldaskola-router)). Den rör inte
  Pages-projektet.

## Felsökning

- **Sidan visar gammalt innehåll** – deployen kördes aldrig. Jämför
  `npx wrangler pages deployment list --project-name elda` med senaste
  commit; produktion ska peka på samma commit.
- **`/skola/` är ostylad eller tom** – skolappen byggdes utan `base /skola/`,
  eller så saknas `dist/skola`. Bygg om enligt ovan.
- **Registreringen säger "inte tillgänglig"** – `config.json` saknar
  `supabaseUrl`/`supabaseAnonKey`. Sätt variablerna och publicera om.
- **Knappen *Öppna Elda Skola* saknas** – `ELDA_SKOLA_URL` var tom eller inte
  en https-adress vid bygget.
- **Okänd adress visar startsidan** – Pages serverar `index.html` för okända
  sökvägar. Det är avsiktligt; det finns inga gamla sidor kvar att omdirigera.
