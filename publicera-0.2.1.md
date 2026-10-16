# Elda 0.2.1 – utfall och kvarvarande steg

## Varför en ny version behövdes

Den publicerade 0.2.0-appen byggdes med platshållare i `.env`
(`https://your-project.supabase.co`) och GitHub Actions skickade inga
Supabase-uppgifter till bygget. Appen startade men kunde inte logga in.
Därför byggdes 0.2.1 om med rätt adress och anon-nyckel, och flödet
stoppar nu en release som skulle sakna dem.

## Utfört

- **Supabase.** Migreringarna `20261015000000`, `20261016000000` och
  `20261017000000` ligger både lokalt och i projektet `nwgufdnnordapjbgplzs`.
  `admin-users`, `auth-login` och `ai-chat` är publicerade (auth-login med
  `--no-verify-jwt`, de andra med JWT-kontroll). Användarnamnsregeln och
  facitlistan är identiska i serverfunktionen och i migrationen.
- **Administratörskontot `ejentu01`** är skapat via
  [`scripts/skapa-admin.mjs`](scripts/skapa-admin.mjs) med rollen `admin` och
  `must_change_password`. Inloggning med användarnamn + det tillfälliga
  lösenordet verifierades mot den publicerade `auth-login` (HTTP 200), och
  `ai-chat` nekade anropet med 403 så länge lösenordet inte var bytt.
- **`.env`** pekar nu på rätt projekt. Filen är fortfarande gitignorerad och
  innehåller ingen service role-nyckel.
- **Automatisk publicering.** `ELDA_DOWNLOAD_BASE`, `VITE_SUPABASE_URL` och
  `VITE_SUPABASE_ANON_KEY` finns som Actions-variabler; signeringsnyckeln och
  `CLOUDFLARE_ACCOUNT_ID` som hemligheter. Arbetsflödet kontrollerar före och
  efter bygget att Supabase-adressen finns och avbryter annars.
- **Release `v0.2.1`** byggdes av arbetsflödet på `windows-latest` med
  NSIS- och MSI-paket plus signaturer, och webbplatsen är uppdaterad manuellt
  med dessa filer, `update.json` för 0.2.1 och versionshistorik.

## Verifierat

| Kontroll | Resultat |
| --- | --- |
| Migreringar lokalt och i projektet | tre av tre, ingen skillnad |
| Publicerade funktioner | `ai-chat` 13, `auth-login` 7 (verify_jwt=false), `admin-users` 7 |
| Inloggning `ejentu01` via `auth-login` | HTTP 200, roll `admin` |
| Profilens `must_change_password` | `true`, kontot aktivt |
| `ai-chat` före lösenordsbytet | HTTP 403 med förklarande fel |
| Bygge utan lokal `.env`, bara miljövariabler | Supabase-adressen hamnade i `dist/assets` |
| Kontrollkörning i GitHub Actions | grön – bygget fick adressen |
| Releasekörningen för `v0.2.1` | grön, fyra filer + `latest.json` |
| Signaturer för `.exe` och `.msi` | verifierar mot nyckeln i `tauri.conf.json` |
| Live: `update.json` | version 0.2.1, samma signatur som `.sig`-filen |
| Live: nedladdning | HTTP 200, 6 402 147 byte, signaturen verifierar |

Signaturkontrollen skedde mot den publika nyckeln i
[`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) (nyckel-id
`74e93c03c8b0eb67`) — ingen ny nyckel skapades.

## Kvar: en åtkomstblockerare

`CLOUDFLARE_API_TOKEN` saknas. Sessionen på den här maskinen är inloggad i
Cloudflare via wrangler, men den inloggningen får inte skapa API-token
(Cloudflare svarar `9109 Unauthorized to request resource`), och GitHub:s
credential helper ger bara åtkomst till GitHub. Därför hoppas de tre
webbplatsstegen över och sidan publiceras manuellt med
`npx wrangler pages deploy site/dist --project-name elda --branch main`.

Åtgärd:

1. Skapa en token i Cloudflare: **My Profile → API Tokens → Create Token →
   Edit Cloudflare Workers** (eller egen mall med *Cloudflare Pages: Edit*).
2. Lägg in den som hemligheten `CLOUDFLARE_API_TOKEN` i repot
   (*Settings → Secrets and variables → Actions*).

Därefter sköter en taggpush hela kedjan: bygge, signering, release, webbplats.

## Tester

`npm run build` (tsc + vite) grönt · bygge med enbart miljövariabler grönt ·
kontrollkörning av arbetsflödet grön · releasekörningen för `v0.2.1` grön ·
signaturverifiering för båda filerna grön · live-HTTP 200 för `update.json`,
`releases.json` och nedladdningen.

**Inte kört:** inloggning, kontoskapande och lösenordsbytet inne i den
installerade Windows-appen. Det kräver att appen installeras och körs, och
du sa att du testar den manuellt.
