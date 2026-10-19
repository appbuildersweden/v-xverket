# Att publicera en ny Elda-version

Allt flöde körs automatiskt när du pushar en tagg. Inga manuella byggsteg behövs.

## Steg för steg

```bash
# 1. Ändra i appen och testa lokalt
npm run tauri dev

# 2. Öka versionsnumret i Tauri-konfigurationen
#    src-tauri/tauri.conf.json  ->  "version": "0.2.1"
#    (package.json och src-tauri/Cargo.toml hålls i samma version för tydlighet)

# 3. Committera och pusha
git add -A
git commit -m "Beskriv ändringen"
git push origin main

# 4. Skapa och pusha taggen – det startar hela publiceringen
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions kör sedan [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Bygger Windows-paketen (NSIS `.exe` och `.msi`) på `windows-latest`.
2. Signerar dem med updater-nyckeln (`TAURI_SIGNING_PRIVATE_KEY`).
3. Skapar GitHub Releasen **Elda v0.2.0** med de fyra filerna.
4. Hämtar filerna och bygger hemsidan med riktiga releaseuppgifter
   (versionsnummer, datum, storlekar, ändringsanteckningar).
5. Publicerar **endast hemsidan** till Cloudflare Pages.

Installationsfilerna publiceras aldrig längre med sidan: de läggs i den
privata Storage-bucketen `elda-installers` och delas ut som korta signerade
länkar av serverfunktionen `download`, efter att kontot har kontrollerats.
Se avsnittet *Skyddad nedladdning* nedan.

## Hemligheter och variabler

Satta på **Settings → Secrets and variables → Actions** i repo:t:

| Namn | Typ | Innehåll |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | secret | innehållet i `~/.tauri/elda.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | lösenordet till nyckelfilen |
| `CLOUDFLARE_ACCOUNT_ID` | secret | kontots ID |
| `CLOUDFLARE_API_TOKEN` | secret | token med behörighet *Cloudflare Pages: Edit* |
| `VITE_SUPABASE_URL` | variable | projektets adress, `https://<projekt>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | variable | projektets publika anon-nyckel (den ligger ändå i klienten) |
| `ELDA_SKOLA_URL` | variable (frivillig) | adressen till skolplattformen, t.ex. `https://elda-skola.pages.dev` |

`ELDA_DOWNLOAD_BASE` används inte längre — det fanns bara för att peka på en
publik `downloads/`-mapp. Webbplatsstegen hoppas över så länge
`CLOUDFLARE_API_TOKEN` saknas.

### Länken till Elda-skola

Hemsidans sektion **Elda-skola** och knappen *Öppna Elda-skola* styrs av
`ELDA_SKOLA_URL`. Variabeln är frivillig och läses av `site/build.mjs`, som
skriver adressen till `dist/config.json`; `site/app.js` visar knappen först när
adressen finns där.

- Bara **https**-adresser godkänns. En http-adress tappar sessionscookien, och
  en lokal testadress (`localhost`/`127.0.0.1`) avvisas i skarpa byggen.
- Är variabeln tom publiceras sidan utan knapp, och sektionen säger att
  plattformen inte går att öppna ännu. Ingen påhittad adress används.
- Sätts variabeln först när skolplattformen har en publicerad adress – då räcker
  det med en ny tagg för att knappen ska komma med.
- Lokal kontroll av flödet: bygg med
  `ELDA_SKOLA_URL=http://127.0.0.1:8789 ELDA_ALLOW_LOCAL_SKOLA=1 node build.mjs`
  (den andra variabeln tillåter loopback-adresser i ett lokalt bygge).

Reglerna testas i `site/tests/skola-url.test.mjs`.

`VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` behövs också för
webbplatsen: registreringsboten på `/registrera.html` är den enda publika vägen
till ett konto, och bygget skriver den publika adressen och anon-nyckeln till
`site/dist/config.json`. Saknas de publiceras sidan ändå (nedladdning och
uppdateringar ska aldrig blockeras), men registreringssidan visar då
"inte tillgänglig" i stället för att låtsas fungera. Anon-nyckeln är publik och
ligger redan i den byggda appen — service role-nyckeln får aldrig hamna där.


## Supabase-adressen bakas in i appen

Appen får sin Supabase-adress och anon-nyckel vid **bygget**. Därför:

- `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` måste finnas som
  Actions-variabler. Saknas de avbryts körningen direkt, och efter bygget
  kontrolleras dessutom att adressen verkligen hamnade i `dist/assets`.
  Tidigare kunde en app utan fungerande inloggning publiceras av misstag.
- Byter du Supabase-projekt, eller t.ex. domän för uppdateringar, måste en
  **ny version byggas och publiceras** – gamla installerade appar pekar kvar
  på den adress de byggdes med.
- Den **hemliga** service role-nyckeln används bara av serverfunktionerna i
  Supabase (och av [`scripts/skapa-admin.mjs`](scripts/skapa-admin.mjs) när
  administratörskontot skapas). Den ska aldrig ligga i `.env` eller i
  webbappen – endast i Supabase och i terminalen när skriptet körs.

## Signeringsnyckeln

- **Publik nyckel** ligger i [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)
  under `plugins.updater.pubkey`. Appen använder den för att avvisa allt
  som inte kommer från dig.
- **Privat nyckel** ligger `~/.tauri/elda.key` på din maskin (med lösenord
  i `~/.tauri/elda.key.password`) och som hemlighet i GitHub Actions.
  Den ska **aldrig** committas – `.gitignore` utesluter `*.key` och `*.pem`.

Tappar du nyckeln kan redan installerade appar inte verifiera uppdateringar
från den. Skapa då en ny nyckel, uppdatera `pubkey` och publicera en ny
version – men se till att alla användare installerar om den manuellt.

## Säkerhetsregler som gäller

- Repo:t är **privat**. Källkoden publiceras aldrig som del av hemsidan;
  bara `site/dist` (byggda artefakter) går upp till Cloudflare.
- Installationsfilerna ligger i en **privat** Storage-bucket. Ingen publik
  filadress finns: gamla `…/downloads/…`-länkar omdirigeras av
  [`site/_redirects`](site/_redirects) till nedladdningssektionen.
- Nedladdning kräver en giltig session och ett **godkänt** konto. Begränsade,
  inaktiva och borttagna konton får ingen länk.
- `permissions: contents: write` är enda behörigheten i arbetsflödet.
- Uppdateringar verifieras mot den inbäddade publika nyckeln innan
  något installeras. En hackad `update.json` räcker alltså inte.
- Det signerade uppdateringspaketet under `/updates/` är publik läsbart
  (kravet från Tauri) medan installationsknappen på sidan kräver inloggning.

## Skyddad nedladdning

Nedladdningsfunktionen `download` läser den privata bucketen `elda-installers`
och väljer den högsta versionen av `Elda_<version>_x64-setup.exe` (eller
`..._en-US.msi`). Publicera en ny installer så här:

```bash
npx supabase storage cp --experimental --linked \
  --content-type application/octet-stream \
  site/downloads/Elda_0.2.1_x64-setup.exe \
  ss:///elda-installers/Elda_0.2.1_x64-setup.exe
```

Sidan hämtar versionsnummer och storlek från funktionens publika `info`-läge,
så inget behöver ändras i `releases.json` för att knappen ska visa rätt version.

### Automatiska uppdateringar

Den installerade appen kontrollerar `https://elda-6a9.pages.dev/update.json`
vid start och därefter var sjätte timme. `site/build.mjs` skriver manifestet
från det signerade paketet i `site/downloads` och publicerar även själva
filen under `/updates/`. Båda måste vara publika: Tauri kan inte logga in för
att hämta en uppdatering. Skyddet ligger i signaturen — paketet verifieras mot
nyckeln i `tauri.conf.json` innan något installeras, och en utbytt fil avvisas.
Den vanliga nedladdningsknappen på sidan går fortfarande genom den inloggade
funktionen och den privata bucketen.

Saknas ett signerat paket i `site/downloads` publiceras inget manifest alls
(och ett gammalt manifest tas bort), så en app kan aldrig erbjudas en fil som
inte finns. Efter publicering kan flödet kontrolleras med:

```bash
node scripts/kontrollera-uppdatering.mjs
```

## Egen domän

Adressen är just nu `https://elda-6a9.pages.dev`. Vill du ha t.ex.
`elda.se`:

1. Lägg till domänen i Cloudflare (Pages-projektet **elda** →
   *Custom domains* → *Set up a custom domain*).
2. Peka CNAME till `elda-6a9.pages.dev` (eller låt Cloudflare sköta det
   om domänens DNS redan ligger i kontot).
3. Ändra `ELDA_DOWNLOAD_BASE` i GitHub Actions-variablerna.
4. Ändra uppdateringens endpoint i `src-tauri/tauri.conf.json`
   (`plugins.updater.endpoints`) och publicera en ny version, eftersom
   adressen är inbyggd i appen.

## Felsökning

- **Nedladdningsknappen är grå på hemsidan** – ingen fil finns i
  `elda-installers`, eller så kunde `info`-läget inte läsas.
- **"Kontot väntar på godkännande"** – kontot är `limited` (t.ex. ett
  lärarkonto som väntar på granskning). En administratör måste godkänna det
  innan nedladdningslänkar utfärdas.
- **Direktlänken ger ingen fil** – det är meningen. `/downloads/*` omdirigeras
  till nedladdningssektionen; filerna finns bara i den privata bucketen.
- **Bygget hoppas över webbplatsstegen** – `CLOUDFLARE_API_TOKEN` saknas.
- **Appen startar men inloggningen misslyckas** – bygget fick ingen
  Supabase-adress. Kontrollera att `VITE_SUPABASE_URL` och
  `VITE_SUPABASE_ANON_KEY` finns som variabler och publicera en ny version.
  En kontrollkörning av arbetsflödet (utan tagg) verifierar det i förväg:
  *Actions → Release → Run workflow*.
