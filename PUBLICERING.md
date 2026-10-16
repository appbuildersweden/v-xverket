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
4. Hämtar filerna, bygger hemsidan med riktiga releaseuppgifter
   (versionsnummer, datum, storlekar, ändringsanteckningar) och skriver
   `update.json` som appens updater läser.
5. Publicerar hemsidan och installationsfilerna till Cloudflare Pages.

Den installerade appen upptäcker sedan uppdateringen vid nästa start och
installerar den efter att signaturen har verifierats.

## Hemligheter och variabler

Satta på **Settings → Secrets and variables → Actions** i repo:t:

| Namn | Typ | Innehåll |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | secret | innehållet i `~/.tauri/elda.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | lösenordet till nyckelfilen |
| `CLOUDFLARE_ACCOUNT_ID` | secret | kontots ID |
| `CLOUDFLARE_API_TOKEN` | secret | token med behörighet *Cloudflare Pages: Edit* |
| `ELDA_DOWNLOAD_BASE` | variable | `https://elda-6a9.pages.dev/downloads` |
| `VITE_SUPABASE_URL` | variable | projektets adress, `https://<projekt>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | variable | projektets publika anon-nyckel (den ligger ändå i klienten) |

Webbplatsstegen hoppas över så länge `ELDA_DOWNLOAD_BASE` eller
`CLOUDFLARE_API_TOKEN` saknas – appen kan alltså publiceras innan
hostingen är klar.

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
- Installationsfilerna ligger publikt på `…/downloads/` eftersom en privat
  GitHub Release inte går att länka till anonymt.
- `permissions: contents: write` är enda behörigheten i arbetsflödet.
- Uppdateringar verifieras mot den inbäddade publika nyckeln innan
  något installeras. En hackad `update.json` räcker alltså inte.

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

- **Nedladdningsknappen är grå på hemsidan** – ingen stabil release
  publicerad ännu, eller så har `releases.json` inte kunnat hämtas.
- **Appen hittar ingen uppdatering** – kontrollera att
  `https://elda-6a9.pages.dev/update.json` svarar och att `version` är
  högre än den installerade.
- **"Update error" i appen** – signaturen stämmer inte. Filen på
  `…/downloads/` måste vara exakt den som signerats; kör om releasflödet.
- **Bygget hoppas över webbplatsstegen** – `ELDA_DOWNLOAD_BASE` eller
  `CLOUDFLARE_API_TOKEN` saknas.
- **Appen startar men inloggningen misslyckas** – bygget fick ingen
  Supabase-adress. Kontrollera att `VITE_SUPABASE_URL` och
  `VITE_SUPABASE_ANON_KEY` finns som variabler och publicera en ny version.
  En kontrollkörning av arbetsflödet (utan tagg) verifierar det i förväg:
  *Actions → Release → Run workflow*.
