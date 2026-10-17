# Registrering, kontosystem och roller

Den här filen beskriver den nya registreringen, rollmodellen och vad som kräver
konfiguration. Koden ligger i:

| Del | Fil |
| --- | --- |
| Registreringsbot + kontoskapande | `supabase/functions/register/index.ts` |
| Inloggning | `supabase/functions/auth-login/index.ts` |
| Admins konto- och rollåtgärder | `supabase/functions/admin-users/index.ts` |
| Schema, RLS, RPC:er | `supabase/migrations/20261020000000_registration_roles.sql` |
| Klient mot boten + admins granskning | `src-new/src/lib/registration.ts` |
| Botens gränssnitt | `src-new/src/pages/Register.tsx` |
| Klasskod och klassmedlemskap | `src-new/src/lib/classes.ts` |

## Rollmodellen

Ett enda rollsystem, samma interna värden som tidigare (ingen parallell modell):

| Roll | Panel | Vad rollen är |
| --- | --- | --- |
| `admin` | adminpanelen | Systemadministration, granskning av ansökningar, roller |
| `lärare` | lärarpanelen | Egna klasser, egna elever, uppgifter, material, uppföljning |
| `speciallärare` | speciallärarpanelen | Oförändrad roll och oförändrad panel |
| `elev` | elevpanelen | Elevens egna studier. Kontotypen `skola` eller `privat` styr vilka klassfunktioner som erbjuds |

`profiles.account_type` (`skola` \| `privat`) är det enda som skiljer en
skolelev från en privat elev. Rollstrukturen är förberedd för fler roller: en ny
roll behöver bara ett värde i `profiles_role_check`, en post i
`ROLE_PERMISSIONS` (`src-new/src/lib/auth-types.ts`) och en meny i
`src-new/src/lib/nav.tsx`.

### Vad som skyddas var

- **Frontend** (`lib/guards.ts` + `ROLE_PERMISSIONS`) är ett gränssnittsskydd:
  den hindrar en roll från att se en panel som inte hör till rollen, även när
  adressen skrivs in manuellt.
- **Databasen** är auktoritativ: RLS-policies och `security definer`-funktioner
  avgör vad som får läsas och skrivas. Att dölja en meny ger ingen behörighet.
- **Roller** sätts endast serversidigt i `app_metadata` och `profiles`.
  Klienten kan varken välja eller ändra sin egen roll. Adminrollen kräver att
  anroparen redan är admin, och ingen får ändra sin egen roll
  (`admin-users`, action `set-role`).

## Registreringsboten

Flödet är stegvis och ägs av serverfunktionen `register`:

1. `start` – klienten skickar **bara kontotypen** (`skolelev`, `privat_elev`
   eller `larare`). Servern mappar den till rollen `elev` respektive `lärare`
   och skapar en ansökan med en spårningskod. Adminrollen kan aldrig skapas här.
2. `answer` / `answers` – ett eller flera fält i taget. Servern validerar varje
   svar (namn, e-post, klasskodens format, klassstorlek, val bland alternativ)
   och sparar varningssignaler på ansökan.
3. `submit` – lösenordet sätts och ansökan bedöms av en **regelbaserad motor**
   (`evaluateApplication`). Motorn avgör om ansökan är komplett och om den får
   godkännas automatiskt. AI:n är aldrig en del av beslutet.
4. `status` – spårningskoden ger ansökans status utan session.

### Vad som händer vid ett godkännande

- Kontot skapas med service role. Användarnamnet genereras av databasens regel
  (`next_username`, t.ex. `eelda01`) och kollisioner hanteras genom att nästa
  lediga nummer provas.
- Profilen får `role`, `account_type` och `limited`.
- En skolelev som angett en klasskod får en **förfrågan** i
  `class_join_requests` – aldrig medlemskap. Kontot skapas även när koden inte
  finns; eleven får då ett tydligt besked i stället.
- En lärare som vill ha en klass får klassen med en klasskod direkt vid
  automatisk godkännande.
- Villkorsversion och tidpunkt sparas i `terms_acceptances` och på ansökan.

### Vad som händer vid granskning

Om ansökan är ofullständig, bär varningssignaler eller kräver en människa får
kontot status `vantar` och `limited = true`: det går att logga in, men
`create_class_with_code` och `request_class_join` nekar till dess att en
administratör har godkänt. **En AI-bedömning är inte en verifiering av
yrkesidentitet** – därför är den manuella granskningen kvar och loggas.

### AI: fria modeller, och ett fungerande reservflöde

- AI används bara för att formulera frågor vänligare och föreslå
  varningssignaler. Svaren valideras innan de används, och de kan aldrig ändra
  en roll.
- Endast fria modeller provas, i tur och ordning: `openrouter/free` och därefter
  `:free`-modeller. Ingen betalmodell används som automatisk reserv.
- Saknas `ELDA_REGISTRATION_BOT_API_KEY` (och `OPENROUTER_API_KEY`) fortsätter
  registreringen ändå: servern skickar frågorna i klartext, och gränssnittet
  visar ett tydligt besked om att AI:n inte är tillgänglig samt erbjuder hela
  formuläret på en gång.

### Missbruksskydd

- Rate limit per åtgärd och IP (`start` 5, `submit` 10, `answer` 80 per 15 min).
- Idempotens: `registration_applications.idempotency_key` är unik och
  `tracking_code` är unik, så upprepade försök skapar inte fler konton eller
  klasser. Ett `submit` på en ansökan som redan skapat ett konto returnerar
  samma uppgifter i stället för att skapa igen.
- Alla meddelanden mellan bot och användare sparas i `registration_messages`
  (max 2000 tecken per rad). Lösenord, nycklar och onödiga personuppgifter
  loggas aldrig.

## Klasskod och klassmedlemskap

- Klasskoden är sex tecken ur alfabetet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (I,
  O, 0 och 1 uteslutna) och genereras i `generate_class_code()`.
- Koden är **inte** ett skydd: `request_class_join` skapar bara en förfrågan.
  Först `decide_class_join_request` (klassens lärare) skapar medlemskapet i
  `class_members`, och det är medlemskapet som ger åtkomst till klassens
  innehåll, klasschatten och klasskamraterna.
- En lärare ser bara sina egna klasser (`list_my_classes`), sina egna elever
  (`list_my_students`, bara elever i klasser där anroparen är lärare) och egna
  klassansökningar (`list_class_join_requests`).
- En klasskod kan bytas när som helst (`rotate_class_code`); den gamla slutar
  gälla direkt. Alla beslut loggas i `audit_log`.

## Admins granskning

| Menyval | Sida | Backend |
| --- | --- | --- |
| Registreringsansökningar | `admin/ansokningar` | `list_registration_applications`, `decide_registration_application` |
| Granskningslogg | `admin/granskningslogg` | `list_audit_log` |
| Konton | `admin/anvandare` | `admin-users`: list, create, update-profile, set-active, reset-password, set-role |
| Elever | `admin/anv-elever` | `admin-users` + `classes`/`class_members` för klasskopplingar |
| Personal | `admin/anv-personal` | `admin-users` (samma åtgärder; rollbyte sker inte här) |
| Roller och behörigheter | `admin/roller` | Rollmatris + `admin-users` (set-role) — enda vägen till adminrollen |
| Scheman | `admin/amnen` | `schedule_entries` + `create_schedule_entry`, `update_schedule_entry`, `delete_schedule_entry` |
| Uppgifter | `admin/uppgifter` | `student_tasks` + `mark_follow_up` |

Vilka åtgärder serverfunktionen `admin-users` utför: `list` (med profilfält),
`create` (roller `elev`, `lärare`, `speciallärare` — admin är undantagen),
`update-profile` (namn), `set-active`, `reset-password` (nytt tillfälligt
lösenord som visas en gång), `set-role` (aldrig på sitt eget konto och aldrig
sista administratören) samt `password-changed` (nollar `must_change_password`
efter ett genomfört byte).

Det tvingade lösenordsbytet hävdas av servern: `auth-login` lämnar ingen session
så länge kontot har ett tillfälligt lösenord, utan kräver att det nya lösenordet
följer med i samma anrop. Se avsnittet om spärren i
`docs/ELDA-CURRENT-STATE.md` (inklusive utrullningsordning).

Registreringen sker på Eldas hemsida (`site/registrera.html` och
`site/bot.js`) och är den enda publika vägen till ett konto. Appen har ingen
registrering — inloggningen hänvisar bara dit. Boten anropar samma
serverfunktion `register` som förut, och den funktionen äger hela flödet:
frågorna, valideringen, beslutet och kontoskapandet. Lärarkonton godkänns
aldrig automatiskt: de skapas begränsade och måste granskas av en administratör
innan klassverktygen öppnas, eftersom boten inte kan verifiera en
yrkesidentitet eller en skolas tillhörighet.

- **Godkänn** slår av begränsningen. **Begränsa** sätter `limited = true` (kan
  logga in men inte skapa klasser eller ansöka om klassmedlemskap).
  **Avslå** stänger av kontot.
- Varje beslut skriver en rad i `audit_log` med aktör, roll och vad som
  ändrades. Loggen innehåller aldrig lösenord, API-nycklar eller
  konversationsinnehåll.

## Konfiguration som återstår

1. **Kör migreringarna** i ordning i Supabase-projektet —
   `20261018`, `20261019`, `20261020_registration_roles` och
   `20261021_admin_schedules` (scheman; kräver att 20261020 är körd) — med
   `supabase db push` eller genom att klistra in filerna i SQL-editorn.
2. **Deploya funktionerna**:
   ```bash
   supabase functions deploy register --no-verify-jwt
   supabase functions deploy auth-login --no-verify-jwt
   supabase functions deploy admin-users
   supabase functions deploy ai-chat
   ```
   `--no-verify-jwt` behövs bara för de två publika funktionerna: en ny
   användare har ingen session ännu. De skyddas av validering, rate limit,
   idempotens och av att service role-nyckeln bara finns på servern.
3. **Valfritt: nyckeln för registreringsboten**:
   ```bash
   supabase secrets set ELDA_REGISTRATION_BOT_API_KEY=...
   ```
   Utan den fungerar registreringen utan AI (se ovan).
4. **Kör databastestet** (kräver Docker):
   ```bash
   supabase start
   supabase test db     # supabase/tests/0001_… och 0002_registration_and_classes.sql
   ```
   `0002` prövar de nya reglerna: att en elev inte kan skapa klasser eller
   granska ansökningar, att en klasskod bara ger en ansökan, att en annan lärare
   inte ser klassens ansökningar/elever och att ett begränsat konto nekas.
5. **E-postbekräftelse** i Supabase Auth: konton skapas med `email_confirm: true`
   och den interna adressen `<användarnamn>@vaxverket.local`. Godkända konton ska
   kunna logga in direkt utan extra verifieringssteg, så inställningen "Confirm
   email" ska vara **av** för projektet. Är den påslagen går det inte att logga
   in förrän adressen är bekräftad – aktivera den inte som genväg, utan stäng av
   den i Supabase-dashbordet (Authentication → Providers → Email).
6. **Behörigheter i Supabase**: `service_role`-nyckeln används endast av Edge
   Functions och finns aldrig i klienten, i `.env` eller i `VITE_`-variabler.

## Vad som inte ingår i det här steget

- Johannas arbetsyta och den nya AI-specialläraren för elever (byggs senare).
- Supportärenden som egen panel (finns inte i det befintliga flödet).
- Klasser, elevdokument, meddelanden och AI-inställningar i adminpanelen: de
  saknar fortfarande en administrativ datamodell och visar ett planerat läge.

Scheman (veckotabell), kontohanteringen, rollbytet och uppgifterna är däremot
byggda mot riktig data — se `docs/adminpanel-och-scheman.md`.
