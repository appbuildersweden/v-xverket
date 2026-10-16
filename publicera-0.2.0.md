# Elda 0.2.0 – det här gör du innan releasen

Allt i koden är klart och byggt. Det som återstår kräver dina uppgifter eller ditt
godkännande.

## 1. Kör databasmigrationen först (viktigt)

`supabase/migrations/20261017000000_usernames_and_password_change.sql` lägger till
`first_name`, `last_name` och `must_change_password` samt funktionerna
`username_base` / `next_username`.

Koden förutsätter de kolumnerna. Kör migrationen **innan** du testar appen:

```
supabase link --project-ref <ditt-projekt>
supabase db push
```

## 2. Skapa/verifiera administratörskontot ejentu01

Kontot kan inte kontrolleras härifrån (kräver service role-nyckeln, som bara du har).
Engångsskriptet är idempotent och skapar inga dubbletter:

```powershell
$env:SUPABASE_URL = "https://<ditt-projekt>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role-nyckeln>"
node scripts/skapa-admin.mjs
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

Kontot får rollen `admin` serversidigt och det tillfälliga lösenordet, med tvingat
lösenordsbyte vid första inloggningen.

## 3. Funktionerna i releasen

```
supabase functions deploy auth-login --no-verify-jwt
supabase functions deploy admin-users
supabase functions deploy ai-chat
```

## 4. GitHub – kontrollera hemligheterna

Kör i repo-roten (kräver GitHub CLI inloggad):

```
gh secret list
gh variable list
```

Ska finnas:

| Namn | Typ |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | secret |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret |
| `CLOUDFLARE_API_TOKEN` | secret |
| `CLOUDFLARE_ACCOUNT_ID` | secret |
| `ELDA_DOWNLOAD_BASE` | variable |

Om något saknas:

```
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/elda.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < ~/.tauri/elda.key.password
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set ELDA_DOWNLOAD_BASE --body "https://elda-6a9.pages.dev/downloads"
```

`ELDA_DOWNLOAD_BASE` styr var nedladdningsknappen hämtar filerna. Utan den hoppas
webbplatsstegen i workflowen över (appen publiceras ändå).

## 5. Publicera

```
git add -A
git commit -m "Inloggning med användarnamn, automatiska användarnamn och tvingat lösenordsbyte"
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

Taggen startar `.github/workflows/release.yml` som bygger, signerar, skapar
GitHub-releasen, bygger webbplatsen och publicerar till Cloudflare Pages.

Följ körningen:

```
gh run watch
```

## 6. Fakta om versionen

- Appversion: **0.2.0** (package.json, tauri.conf.json, Cargo.toml, Cargo.lock)
- Signerade filer: `Elda_0.2.0_x64-setup.exe(.sig)` och `Elda_0.2.0_x64_en-US.msi(.sig)`
- Signeringen använder den befintliga nyckeln i `~/.tauri/elda.key` — ingen ny nyckel
  skapades, och nyckelmaterial finns inte i repot.
- `bundle.createUpdaterArtifacts: true` lades till i tauri.conf.json. Utan den skapades
  inga `.sig`-filer, och då kan Tauri Updater inte verifiera en uppdatering.
