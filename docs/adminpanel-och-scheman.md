# Adminpanelen, konton och scheman

Den här filen beskriver adminpanelen i den nya appen (`src-new/`), hur konton
och roller hanteras, hur det första administratörskontot skapas och vilka
databassteg som återstår. Koden ligger i:

| Del | Fil |
| --- | --- |
| Admins konto- och rollåtgärder (server) | `supabase/functions/admin-users/index.ts` |
| Scheman: tabell, RLS, RPC:er | `supabase/migrations/20261021000000_admin_schedules.sql` |
| Klient mot kontofunktionen | `src-new/src/lib/auth-supabase.ts`, `src-new/src/lib/accounts.ts` |
| Klient mot schemat | `src-new/src/lib/schedule.ts` |
| Adminpanelens sidor | `src-new/src/pages/admin/` |
| RLS-test för scheman och uppgifter | `supabase/tests/0003_admin_schedule_and_tasks.sql` |
| Första administratören | `scripts/skapa-admin.mjs` |

## 1. Sidorna och vad de är kopplade till

| Menyval i adminpanelen | Sida | Backend |
| --- | --- | --- |
| Startsida | `start` | `admin-users` (list), `schedule_entries` och `list_audit_log` — nyckeltal, kommande schemaposter och senaste händelser |
| Elever | `anv-elever` | `admin-users` (list, update-profile, set-active, reset-password) + `classes`/`class_members` för klasskopplingar |
| Personal | `anv-personal` | `admin-users` (samma åtgärder som ovan). Rollbyte sker inte här |
| Speciallärare | `anv-speciallarare` | Samma sida som Personal, filtrerad till rollen `speciallärare` |
| Konton | `anvandare` | `admin-users`: list, create, update-profile, set-active, reset-password, set-role |
| Roller och behörigheter | `roller` | Rollmatris ur `ROLE_PERMISSIONS` + `admin-users` (set-role). Den enda vägen till adminrollen |
| Registreringsansökningar | `ansokningar` | `list_registration_applications`, `decide_registration_application` |
| Skapa konto | `create-user` | `admin-users` (create) |
| Scheman | `amnen` | `schedule_entries` (select) + `create_schedule_entry`, `update_schedule_entry`, `delete_schedule_entry` |
| Uppgifter | `uppgifter` | `student_tasks` (select/insert/update/delete) + `mark_follow_up` |
| Profil och inställningar | `installningar` | Appens gemensamma profilvy: konto, tema, lösenordsbyte, utloggning |
| Granskningslogg | `granskningslogg` | `list_audit_log` |

Sidorna `Klasser och elevgrupper`, `Elevdokument och lärardokument`, `Meddelanden
och nyheter`, `AI-inställningar`, `Loggar`, `Uppdateringar`, `Kopplingar` och
`Nyheter` har ingen datamodell i det här steget och visar ett tydligt planerat
läge (`SectionPage`) — de har inga knappar som låtsas utföra något.

Alla listor har samma fyra lägen: laddning, innehåll, tomt (med förklaring) och
fel (med möjlighet att försöka igen). Efter en lyckad ändring hämtas listan om
från backend innan gränssnittet visar det nya värdet.

## 2. Skapa konto

- Administratören anger **användarnamn** och **roll**. Rollerna som får väljas är
  `elev`, `lärare` och `speciallärare`. Administratörsrollen är medvetet utanför
  formuläret — servern avvisar den också (CREATABLE_ROLES i `admin-users`).
- Lösenordet kan antingen anges av administratören (minst 8 tecken, inte samma
  som användarnamnet, inte ett av de vanligaste) eller **genereras av servern**.
  Ett genererat lösenord returneras en enda gång i svaret och visas en gång i
  bekräftelsen; det lagras aldrig i klartext och går inte att läsa efteråt.
- Användarnamnet normaliseras till gemener och valideras likadant i klienten och
  på servern (`/^[a-z0-9._-]{3,32}$/`). Unikheten är en unik begränsning i
  `profiles.username` plus en unik intern e-postadress i Supabase Auth, så att
  två samtidiga anrop inte kan skapa samma namn.
- Kontot skapas i två steg på servern: först auth-kontot, sedan profilen. Fallerar
  profilen tas auth-kontot bort igen, så att inget halvskapat konto blir kvar. Är
  namnet upptaget provas nästa lediga löpnummer (eller så får administratören ett
  tydligt besked om namnet angetts manuellt).
- Nya konton får `must_change_password = true`: vid första inloggningen måste
  användaren välja ett eget lösenord innan panelen öppnas.

Användarnamnsregeln är densamma som skolan använder: `e` + tre bokstäver av
förnamnet + två av efternamnet + löpnummer (`ejentu01`), med skolans fastställda
undantag i `NAME_OVERRIDES`.

## 3. Konton: status, lösenord och namn

| Åtgärd | Vad som händer | Skydd |
| --- | --- | --- |
| Ändra namn | `profiles.first_name/last_name` uppdateras och speglas i `user_metadata` | Kräver admin. Loggas som `account.profile_updated` |
| Inaktivera/aktivera | `profiles.active` + `app_metadata.active` sätts. Ingenting raderas | Ingen kan inaktivera sitt eget konto. Den sista aktiva administratören kan inte inaktiveras |
| Nytt tillfälligt lösenord | Servern skapar ett slumpat lösenord, sätter `must_change_password = true` och returnerar lösenordet en gång | Kräver admin. Lösenordet visas aldrig i listan och sparas aldrig i klartext. Loggas som `account.password_reset` |
| Byt roll | `profiles.role` + `app_metadata.role` uppdateras | Kräver admin, aldrig på sitt eget konto. Sista administratören kan inte nedgraderas. Loggas som `account.role_changed` |

Sessionshanteringen ligger hos Supabase Auth: rollen läses ur
`app_metadata` vid inloggning och vid förnyelse av token. En ändrad roll slår
därför igenom när sessionen förnyas, och inaktiverade konton nekas redan vid
inloggning och vid sessionens återställning.

## 4. Roller och behörigheter

Rollerna är desamma som tidigare: `admin`, `lärare`, `speciallärare` och `elev`.
Inget parallellt rollsystem har lagts till.

Behörigheten kontrolleras i fyra lager, alla på serversidan:

1. **JWT:ns `app_metadata.role`** — bara servern kan skriva den.
2. **Ruttvakten** (`lib/guards.ts` + `ROLE_PERMISSIONS`) — avgör vilka paneler och
   sidor som får visas, även för en inklistrad adress (`#/panel/sida`).
3. **Row Level Security** — avgör vilka rader som får läsas och skrivas.
4. **Edge Functions och databasfunktioner** — kontrollerar anroparens roll vid
   varje känslig åtgärd (kontoskapande, rollbyte, scheman och ansökningar).

Rollen kan aldrig ändras från klienten: `set-role` kräver en administratörs JWT,
nekar ändring av det egna kontot och loggar ändringen. Att ändra en variabel i
webbläsaren, en URL eller localStorage ger ingen behörighet.

## 5. Det första administratörskontot

Det finns ingen publik väg till adminrollen. Registreringen kan bara skapa
`elev` eller `lärare`, och kontoformuläret kan inte välja admin. Första
administratören skapas i stället av ägaren, en gång, lokalt:

```bash
# PowerShell (nyckeln sätts i terminalen och hamnar aldrig i en fil i repot)
$env:SUPABASE_URL = "https://<projekt>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role-nyckeln>"
$env:ELDA_TEMP_PASSWORD = "<ett tillfälligt lösenord>"
node scripts/skapa-admin.mjs
```

- Skriptet är idempotent: finns kontot redan säkras rollen `admin` och inget
  dubblettkonto skapas.
- Kontot får `must_change_password = true` och måste byta lösenord vid första
  inloggningen.
- Service role-nyckeln finns bara i den lokala miljön — aldrig i klienten, i
  `.env` eller i någon `VITE_`-variabel.
- Fler administratörer skapas efteråt inifrån appen: en befintlig administratör
  tilldelar rollen under **Roller och behörigheter**. Ingen kan höja sig själv.

## 6. Scheman

Schemat är en egen, återkommande post per veckodag som gäller **antingen** en
klass **eller** en person — aldrig båda och aldrig ingen:

- En klasspost ser klassens medlemmar (`is_class_member`).
- En personpost ser personen själv och den personal som redan har rätt att se
  personen (`can_see_user`).
- All läsning går genom `schedule_entries` och begränsas av RLS. Ingen klient har
  insert/update/delete-policy.

Migreringen `supabase/migrations/20261021000000_admin_schedules.sql` är
**icke-destruktiv**: en ny tabell, tre index, en select-policy och tre funktioner.
Inga befintliga tabeller, kolumner eller rader rörs.

| Del | Innehåll |
| --- | --- |
| Tabell | `schedule_entries` (titel, ämne, sal, veckodag 1–7, start/sluttid, klass eller person, anteckning, `created_by`) |
| Begränsningar | `weekday between 1 and 7`, `end_time > start_time`, exakt ett av `class_id`/`user_id` |
| Index | `(weekday, start_time)`, `(class_id, weekday)`, `(user_id, weekday)` |
| Funktioner | `create_schedule_entry`, `update_schedule_entry`, `delete_schedule_entry` — `security definer`, admin-kontroll och `log_audit` |
| Behörigheter | Endast `authenticated` får köra funktionerna; funktionerna kräver adminrollen |

Saknas migreringen visas `ERR_NOT_READY` i gränssnittet ("Funktionen är inte
aktiverad i databasen ännu …") i stället för en tom vy eller påhittade scheman.

## 7. Uppgifter

Adminpanelen använder samma uppgiftssystem som lärar- och elevpanelerna:
`student_tasks`, `AssignmentForm` och `TaskRow`. Det finns ingen separat
adminversion av en uppgift.

- Administratören ser alla uppgifter (`can_see_student_task` ger admin åtkomst),
  kan skapa uppgifter till en elev eller en klass, redigera dem, ta bort dem och
  följa upp inlämningar med återkoppling.
- En lärare kan bara skapa uppgifter till sina egna elever och klasser; en elev
  kan bara läsa sina egna och klassens, och bara ändra sin egen status genom
  `student_set_task_status` (XP delas ut av servern, exakt en gång).
- En elev kan inte skriva i tabellen direkt, och ett borttaget uppgiftsinnehåll
  tar med elevens svar på just den uppgiften — därför kräver borttagningen en
  bekräftelse i gränssnittet.

## 8. Manuella steg i Supabase

1. **Kör migreringarna** i ordning (den sista är scheman):

   ```bash
   supabase db push          # eller klistra in filerna i SQL-editorn
   ```

   `20261021000000_admin_schedules.sql` kräver att
   `20261020000000_registration_roles.sql` är körd (den använder `is_admin`,
   `is_class_member`, `can_see_user` och `log_audit`).

2. **Deploya funktionerna** (adminpanelen behöver `admin-users`):

   ```bash
   supabase functions deploy admin-users
   supabase functions deploy auth-login --no-verify-jwt
   supabase functions deploy register --no-verify-jwt
   ```

3. **Skapa första administratören** med `scripts/skapa-admin.mjs` (avsnitt 5).
   Utan ett administratörskonto kan ingen logga in i adminpanelen.

4. **Stäng av e-postbekräftelse** i Supabase Auth
   (Authentication → Providers → Email). Konton skapas med `email_confirm: true`
   och den interna adressen `<användarnamn>@vaxverket.local`, så godkända konton
   ska kunna logga in direkt.

5. **Kör databastesterna** mot en lokal testdatabas (kräver Docker):

   ```bash
   supabase start
   supabase test db
   ```

   `supabase/tests/0003_admin_schedule_and_tasks.sql` prövar att bara admin får
   skriva schemaposter, att en klasspost går till klassens medlemmar, att en
   personpost bara går till personen, att ingen klient kan skriva direkt i
   `schedule_entries`, och att uppgifter hamnar rätt mellan admin, lärare och
   elev.

## 9. Vad som är verifierat — och vad som inte är det

Kört i utvecklingsmiljön (se slutrapporten för resultat):

- `npm run typecheck` och `npm test` i `src-new/` samt `npm run build` i både
  `src-new/` och den gamla appen.
- `libpg-query` har parsats mot `20261021000000_admin_schedules.sql` och
  `supabase/tests/0003_admin_schedule_and_tasks.sql` (syntaxkontroll, inte
  körning).

Inte kört här, och därför inte verifierat:

- `supabase test db` (RLS-testen) — kräver Docker och en lokal Supabase-instans,
  som inte finns i den här miljön.
- Riktig inloggning, kontoskapande och schemaändringar mot ett skarpt
  Supabase-projekt — kräver att migreringen är körd, funktionerna deployade och
  ett administratörskonto enligt avsnitt 5.
- `admin-users` bygger på service role-nyckeln, som bara finns i
  Supabase-projektet; den har inte kunnat köras mot en riktig backend här.
