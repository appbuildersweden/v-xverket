Elda – Publiceringsberedskapsrapport

Genomförda kontroller:
- Hemsidan, build.mjs, site/wrangler.toml, GitHub Actions-workflowen och sidans logik har lästs och granskats.
- Källkoden till hemsidan och sidans versionshantering pekar mot repo appbuildersweden/v-xverket och Cloudflare Pages-projektet "elda".
- Sidans nedladdningsknapp, versionshistorik och uppdateringsstatus drivs av releases.json som byggs av site/build.mjs. Inga hemligheter finns i frontendfilerna.
- Supabase Edge Functions använder serverhemligheter (SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL). Inga AI-nycklar finns i sidan.

Georerbar bekräftelse:
- Terminalen fungerar inte i den här miljön (git och node kan inte köras via bash-kommandot).
- Git-status, aktuell branch, dist-mapp och tags kan därför inte verifieras från här.

Vad som saknas för att publicera webbplatsen:
1. En git-tagg som startar release-workflowen, till exempel v0.1.0 om den inte finns.
2. GitHub Actions-secrets som måste finnas i repoet:
   - TAURI_SIGNING_PRIVATE_KEY
   - TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   - CLOUDFLARE_API_TOKEN
   - CLOUDFLARE_ACCOUNT_ID
3. GitHub Actions-variable som måste finnas i repoet:
   - ELDA_DOWNLOAD_BASE (till exempel https://elda-6a9.pages.dev/downloads)
4. En signerad Windows-installation i en GitHub Release innan sidans nedladdningsknapp får en riktig url. Utan det byggs sidan, men nedladdning visas som "inte tillgänglig".

Vad som är klart lokalt i koden:
- Wrangler-konfigurationen pekar på dist/ som publiceringskatalog och projektet "elda".
- Build-skriptet bygger dist/index.html, dist/styles.css, dist/app.js, dist/assets/, dist/releases.json och eventuellt dist/update.json.
- Workflowen körs på windows-latest, bygger Windows-paketen med tauri-action, hämtar filer till site/downloads, bygger om hemsidan och publicerar till Cloudflare Pages.

Rekommenderat nästa steg för Windows PowerShell:
- Öppna PowerShell i projektroten.
- Kontrollera git-status och branch manuellt: git status; git branch --show-current
- Kontrollera remote och existerande taggar: git remote -v; git tag -l
- Om taggen saknas och du vill köra release: git tag v0.1.0 && git push origin v0.1.0
- Om du vill testa bygget lokalt innan du trycker taggen:
   cd site
   npm install
   $env:GITHUB_TOKEN = "<ditt-github-token>"
   $env:ELDA_DOWNLOAD_BASE = "https://elda-6a9.pages.dev/downloads"
   node build.mjs
- Kontrollera att dist/ skapades och att releases.json blev ifylld.

Kodstatus:
- Inga ändringar gjordes i detta steg.
