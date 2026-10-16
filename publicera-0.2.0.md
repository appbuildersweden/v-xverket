# Elda 0.2.0 – utfall och kvarvarande steg

## Utfört

- **Appen byggd och publicerad.** GitHub Release `v0.2.0` finns med signerade filer:
  `Elda_0.2.0_x64-setup.exe(.sig)` och `Elda_0.2.0_x64_en-US.msi(.sig)`.
- **Webbplatsen publicerad** på https://elda-6a9.pages.dev med `releases.json` och
  `update.json` för 0.2.0 och fungerande nedladdningslänkar.
- **Signeringskedjan verifierad.** Signaturerna i `update.json` och i releasen
  verifierar mot den publika nyckeln i `src-tauri/tauri.conf.json`, alltså samma
  nyckel som `~/.tauri/elda.key` — ingen ny nyckel skapades.

## Varför webbplatsen inte publicerades av GitHub Actions

Körningen för `v0.2.0` lyckades, men tre steg hoppades över:

```
[skipped] Hämta signerade filer för webbplatsen
[skipped] Bygg webbplatsen
[skipped] Publicera till Cloudflare Pages
```

De hoppas över när `vars.ELDA_DOWNLOAD_BASE` eller `secrets.CLOUDFLARE_API_TOKEN`
saknas. Appen publicerades ändå, och webbplatsen publicerades därför manuellt med
`npx wrangler pages deploy`. **Sätt dessa två i GitHub så att nästa release sköter
allt automatiskt:**

```
gh variable set ELDA_DOWNLOAD_BASE --body "https://elda-6a9.pages.dev/downloads"
gh secret set CLOUDFLARE_API_TOKEN     # token med "Cloudflare Pages: Edit"
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/elda.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < ~/.tauri/elda.key.password
gh secret list
gh variable list
```

## VIKTIGT – gör detta innan appen används

Den publicerade appen förutsätter ändringar på serversidan. Utan dem fungerar inte
inloggningen.

1. **Kör migrationen** `supabase/migrations/20261017000000_usernames_and_password_change.sql`
   (lägger till `first_name`, `last_name`, `must_change_password` och
   `username_base`/`next_username`):

   ```
   supabase db push
   ```

2. **Publicera serverfunktionerna:**

   ```
   supabase functions deploy auth-login --no-verify-jwt
   supabase functions deploy admin-users
   supabase functions deploy ai-chat
   ```

3. **Skapa/verifiera administratören `ejentu01`** (kan bara göras med
   service role-nyckeln, som du har):

   ```powershell
   $env:SUPABASE_URL = "https://<ditt-projekt>.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role-nyckeln>"
   node scripts/skapa-admin.mjs
   Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
   ```

   Skriptet är idempotent och skapar inga dubblettkonton. Kontot får rollen `admin`
   serversidigt och måste byta lösenord vid första inloggningen.

## Användarnamnen – facit

Grundregeln är `e` + 3 bokstäver av förnamnet + 2 av efternamnet + tvåsiffrigt
löpnummer. Utöver den finns skolans fyra fastställda namn, som alltid ska ge
exakt dessa resultat:

| Namn | Användarnamn |
|---|---|
| Jens Turesson | `ejentu01` |
| Anna Andersson | `eannaad01` |
| Lisa Karlsson | `elisaka01` |
| Erik Nilsson | `eerikni01` |

Alla andra namn följer grundregeln (t.ex. Örjan Åberg → `eorjab01`). Är namnet
upptaget används nästa lediga nummer: `ejentu02`, `ejentu03` och så vidare.
Listan finns på två ställen — i `admin-users`-funktionen och i migrationen — så
att server och databas ger samma namn. **Ändra på båda ställena.**

Användarnamnet skapas i serverfunktionen, inte i appen. Därför räcker det att
publicera om `admin-users` — ingen ny appversion behövs för namnregeln.

## Hjälpskript

```
node scripts/skapa-admin.mjs                    # skapa/verifiera ejentu01
node scripts/testa-anvandarnamn.mjs             # testa namnregeln mot facit
node scripts/hamta-releasefiler.mjs v0.2.0      # hämta releasefilerna till site/downloads
node scripts/kontrollera-release.mjs            # status för körningar och releaser
node scripts/kontrollera-steg.mjs               # visa alla steg, även hoppade
```
