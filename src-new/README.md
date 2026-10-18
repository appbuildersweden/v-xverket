# Elda – ny app (`src-new/`)

Isolerad ny frontend som utvecklas parallellt med den befintliga appen i `src/`.
Den gamla appen, webbplatsen, publiceringen och Tauri-konfigurationen är orörda —
ingenting i det här trädet påverkar produktionsingången.

## Kommandon

```bash
cd src-new
npm install
npm run dev        # dev-server på http://localhost:5174 (egen port)
npm run typecheck  # tsc --noEmit
npm test           # vitest (jsdom)
npm run build      # tsc && vite build → src-new/dist
```

`.env` läses från reporoten (`envDir` i `vite.config.ts`), så
`VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` behöver inte kopieras.
Endast anon-nyckeln används i klienten — service role-nyckeln finns aldrig här.

## Inloggning, registrering och roller

- Inloggning sker med **enbart användarnamn och lösenord** mot Edge Functionen
  `auth-login`, som kopplar användarnamnet till rätt konto serversidigt och låter
  Supabase Auth verifiera lösenordet. Ingen e-post, ingen social inloggning.
- **Ny användare?** Registreringen finns inte i appen. Konton skapas av
  registreringsboten på Eldas hemsida (`site/registrera.html`), som är den enda
  publika vägen till ett konto; den anropar den skyddade serverfunktionen
  `register`. Inloggningen hänvisar dit med en rad text och en länk. Se
  `docs/registrering-och-roller.md`.
- **Tvingat lösenordsbyte** hävdas av servern: ett konto med ett tillfälligt
  lösenord får ingen session av `auth-login` förrän ett eget lösenord följer med
  i samma anrop. Inloggningen visar då steget "Skapa nytt lösenord" i stället
  för panelerna; `App.tsx`-spärren är ett andra lager.
- Rollerna är `admin`, `lärare`, `speciallärare` och `elev`. Rollen kommer från
  `app_metadata` (serverstyrd). Saknas eller är rollen ogiltig blir den `okand`
  och åtkomst nekas — appen gissar aldrig.
- En elev har dessutom en kontotyp: `skola` (skolelev) eller `privat` (privat
  elev). Den styr vilka klassfunktioner som erbjuds — aldrig behörigheten.
  Klassens innehåll kräver ett **godkänt** klassmedlemskap.
- `lib/guards.ts` prövar varje rutt mot rollen. En direktöppnad adress
  (`#/panel/sida`) går genom exakt samma kontroll som all annan navigering.
- Ruttens skydd är ett gränssnittsskydd; den auktoritativa behörigheten ligger i
  Row Level Security och i funktionerna i databasen.

## Struktur

```
src/
  App.tsx                 skalet: ruttvakt, sidhuvud, drawer, profilmeny, menyfilter
  router.tsx              navigationstillstånd (panel + sida), startrutt från URL
  lib/
    auth-types.ts         typer + ROLE_PERMISSIONS (roll → paneler)
    auth.ts               backendfabrik med tydligt fel om konfiguration saknas
    auth-supabase.ts      riktig backend: login, session, konton, lösenord
    AuthContext.tsx       äger sessionen (återställning, förnyelse, utloggning)
    guards.ts             resolveRoute: allow / redirect / deny / login
    nav.tsx               grupperade menyer per panel + sid-id:n
    registration.ts       adminsidan: ansökningar, beslut och granskningslogg
    hash-route.ts         parsar/skriver #/panel/sida
    db.ts                 Result<T>, felöversättning och Supabase-anrop
    useAsync.ts           laddning / fel / tomt / omladdning åt alla vyer
    planner.ts            planering, XP, nivåer och belöningar
    assignments.ts        tilldelade uppgifter och uppföljning
    students.ts           kopplingen speciallärare ↔ elev
    classes.ts            klasser, medlemmar och klasskanaler
    chat.ts               global chatt, klasschatt och privata samtal
    flashcards.ts         kortlekar, kort och repetitionsstatus
    quiz.ts               provträning (frågor utan facit i klienten)
    documents.ts          dokument och privat fillagring
    accounts.ts           filtrering, räkning och validering av konton
    schedule.ts           schemaposter per veckodag (klass eller person)
    password.ts           validering av nya lösenord
    ai.ts                 AI-studiehjälp via Edge Functionen ai-chat
  components/             ui.tsx, forms.tsx, MessageThread, AssignmentForm,
                          AccountActions, PlannerTask, RewardCelebration,
                          QuickLinks, Sidebar …
  pages/
    admin/                startsida, elever, personal, konton, roller och
                          behörigheter, scheman, uppgifter, skapa konto, profil
                          och inställningar, registreringsansökningar,
                          granskningslogg
    elev/                 översikt, planering, ämnen, uppgifter, dokument,
                          AI-hjälp, flashcards, provträning, klass (med
                          klasskod), klasschatt, meddelanden, framsteg
    larare/               hem, klasser (klasskod + ansökningar), elever,
                          uppgifter, kontakt administratören
    speciallarar/         hem, elever, meddelande-elever, global chatt,
                          privata chattar, material, uppföljning, planering,
                          AI-assistent
    shared/BelonningarPage.tsx   belöningar och upplåsningar (alla panelerna)
    *Panel.tsx            routing per panel
  __tests__/              tester för inloggning, rutter, sessioner, konton,
                          klassansökan, elevpanelen, lärarpanelen,
                          speciallärarpanelen och adminpanelen
```

Registreringsboten ligger i `site/` (`registrera.html`, `registrera.js` och den
rena klienten `bot.js`) eftersom hemsidan är den enda publika vägen till ett
konto. Appen har ingen registrering.

## Registreringsboten (på hemsidan)

| Steg | Vad som händer |
| --- | --- |
| Välj kontotyp | Skolelev, privat elev eller lärare. Klienten skickar bara kontotypen — servern mappar den till rollen `elev` eller `lärare`. Adminrollen kan aldrig skapas här. |
| Frågor stegvis | Servern ställer en fråga i taget och validerar varje svar. Ofullständiga svar går inte vidare. |
| Klasskod | En skolelev som angett en klasskod får en **förfrågan** — aldrig medlemskap. Läraren godkänner den under Mina klasser. |
| Lösenord och villkor | Lösenordet skickas en gång till servern, villkorsversionen sparas i `terms_acceptances`. |
| Besked | Kontot skapas direkt när ansökan är komplett och utan varningssignaler. Annars granskas den av en administratör och kontot är begränsat till dess. |

- AI används bara för att formulera frågor och föreslå varningssignaler — aldrig
  för beslutet. Saknas den fria nyckeln fortsätter flödet utan AI, med samma
  frågor i klartext och ett formulärläge som fyller i allt på en gång.
- Fria modeller (`openrouter/free` med flera `:free`-modeller som reserv). Ingen
  betalmodell används någonsin automatiskt.
- Spårningskoden sparas lokalt så att en påbörjad ansökan kan fortsättas.

## Lärarpanelen

| Menyval | Sida | Vad som är kopplat till backend |
| --- | --- | --- |
| Hem | `larare/hem` | Nyckeltal och väntande klassansökningar från `list_my_classes`, `list_my_students`, `list_class_join_requests`, `listAssignedTasks`. Godkänn/neka sker direkt i listan. |
| Mina klasser | `larare/klasser` | `create_class_with_code`, `rotate_class_code`, `list_class_join_requests`, `decide_class_join_request`, `remove_class_student`. Klasskoden visas bara för klassens lärare. |
| Mina elever | `larare/elever` | `list_my_students` (endast egna klasser) och `open_direct_channel` för samtal med eleven. |
| Uppgifter | `larare/uppgifter` | `student_tasks`: skapa, tilldela klass eller enskild elev och ta bort. Läget ny → pågående → klar/inlämnad → bedömd visas per uppgift. |
| Undervisningsmaterial | `larare/material` | Samma sida som personalpanelen använder. |
| Uppföljning och återkoppling | `larare/uppfoljning` | `mark_follow_up` med återkoppling som eleven ser. |
| Min planering och att göra | `larare/planering` | Planeringsposter och `complete_task`. |
| Kontakta administratören | `larare/kontakt-admin` | `list_admin_accounts` + `open_direct_channel`. |
| AI-assistent | `larare/ai-assistent` | Edge Functionen `ai-chat`. |

Läraren når aldrig en annan lärares klass, en privat elev som inte anslutit till
en klass, eller administratörens funktioner — det avgörs av servern, inte av
menyn.

## Speciallärarpanelen

| Menyval | Sida | Vad som är kopplat till backend |
| --- | --- | --- |
| Hem | `speciallarar/hem` | Elever, dagens planering, uppföljning och samtal från `listTasks`, `listMyStudents`, `listAssignedTasks`, `listDirectConversations`. All statistik räknas fram ur hämtade data. |
| Mina elever | `speciallarar/elever` | `listMyStudents`, `listLinkableStudents`, `link_student`, `unlink_student`. Elevprofilen visar uppgifter och uppföljning för eleven. |
| Meddelande-elever | `speciallarar/meddelande-elever` | `open_direct_channel` + `list_messages`/`send_message`. |
| Global chatt | `speciallarar/global-chatt` | Den globala kanalen från `chat_channels`; medlemskapet prövas i `list_messages`. |
| Privata chattar | `speciallarar/private-chattar` | Egna direktkanaler (`list_my_direct_channels`) och nya samtal med personal. |
| Undervisningsmaterial | `speciallarar/material` | `documents`, privat bucket `elda-dokument`, tidsbegränsade länkar. Uppladdning är avstängd och förklarad när bucketen saknas. |
| Uppgifter och uppföljning | `speciallarar/uppfoljning` | Skapa, redigera och ta bort i `student_tasks`, `mark_follow_up` med återkoppling som eleven ser. |
| Min planering och att göra | `speciallarar/planering` | `spec_tasks` + `complete_task` (XP en gång per post) och `reopen_task`. |
| Belöningar och upplåsningar | `speciallarar/belonningar` | `user_xp`, `reward_definitions`, `reward_unlocks`, `xp_transactions` — plus trädgården. |
| AI-assistent | `speciallarar/ai-assistent` | Edge Functionen `ai-chat` med användarens token. |

## Elevpanelen

| Menyval | Sida | Vad som är kopplat till backend |
| --- | --- | --- |
| Översikt | `elev/start` | Egna uppgifter, egen planering, senaste samtal och XP — bara det som finns visas. |
| Min planering | `elev/planering` | Elevens egna poster i `spec_tasks`, tilldelad planering från läraren läses separat. Kalendern visar båda och kan filtrera på en dag. |
| Mina ämnen | `elev/amnen` | Uppgifterna grupperade per ämne; eleven ser bara sina egna och klassens. |
| Uppgifter | `elev/uppgifter` | `student_set_task_status` för status och inlämning; XP betalas ut av servern. Visar läget ny → pågående → klar/inlämnad → bedömd, och lärarens återkoppling när den finns. |
| Mina dokument | `elev/dokument` | Delade dokument och tidsbegränsade länkar. Egen uppladdning mot sin egen mapp i bucketen. |
| AI-studiehjälp | `elev/ai-hjalp` | Edge Functionen `ai-chat`. |
| Flashcards och repetition | `elev/flashcards` | `flashcard_decks`, `flashcards`, `flashcard_progress`. |
| Provträning | `elev/provtraning` | `quiz_sets`, `get_quiz_questions` (utan facit), `submit_quiz_attempt`. |
| Min klass / Klasschatt | `elev/klass`, `elev/klasschatt` | `classes`, `class_members`, `class_channel`. Klasskoden skickas till `request_class_join` och blir en ansökan hos läraren — koden ger ingen åtkomst i sig. En privat elev får samma möjlighet utan att skapa ett nytt konto. |
| Meddelanden | `elev/meddelanden` | Egna direktkanaler; eleven svarar i samtal som läraren har startat. |
| Mina framsteg / Belöningar | `elev/framsteg`, `elev/belonningar` | Uppgiftsstatus, XP, nivå och upplåsta belöningar. |

## Belöningar och trädgården

- 10 XP per slutförd uppgift eller planeringspost. Trösklarna 25, 50, 75 och 100 XP
  låser upp blomma, sol, stjärna och hjärta.
- Trädgården ("Din trädgård" på belöningssidan) visar ett träd som växer i sju steg
  med användarens riktiga XP, och de fyra föremålen på sina platser i scenen.
  Upplåsta föremål visas med sin bild, låsta med sitt XP-krav — ingenting räknas
  fram i klienten.
- XP, nivå och upplåsningar beräknas **bara serversidigt** i `security definer`-funktioner
  (`complete_task`, `student_set_task_status`, `submit_quiz_attempt`).
  Den unika nyckeln `xp_tx_one_per_student_task` gör att samma uppgift aldrig kan ge
  XP två gånger, även vid samtidiga anrop. Klienten kan inte skriva XP alls.
- `RewardCelebration` visar vad som låstes upp direkt efter åtgärden.

## Adminpanelen

| Menyval | Sida | Vad som är kopplat till backend |
| --- | --- | --- |
| Startsida | `admin/start` | `admin-users` (list), `schedule_entries` och `list_audit_log`: riktiga nyckeltal, kommande schemaposter och senaste händelser — varje kort med eget laddnings- och felläge. |
| Elever | `admin/anv-elever` | `admin-users` (list, update-profile, set-active, reset-password) + `classes`/`class_members` för klasskopplingar. Sökning, elevtypsfilter och kontouppgifter. |
| Personal / Speciallärare | `admin/anv-personal`, `admin/anv-speciallarare` | Samma kontovy, filtrerad på personalroller. Rollbyte sker inte här. |
| Konton | `admin/anvandare` | `admin-users`: list, create, update-profile, set-active, reset-password, set-role (aldrig sitt eget konto). |
| Roller och behörigheter | `admin/roller` | Rollmatrisen ur `ROLE_PERMISSIONS` och den enda vägen till adminrollen (`set-role`), med bekräftelse och loggning. |
| Registreringsansökningar | `admin/ansokningar` | `list_registration_applications` och `decide_registration_application` (godkänn, begränsa eller avslå) med anteckning till loggen. |
| Skapa konto | `admin/create-user` | `admin-users` (create) med rollerna elev, lärare och speciallärare. Lösenordet kan anges eller skapas av servern och visas då en gång. |
| Scheman | `admin/amnen` | `schedule_entries` + `create_schedule_entry`, `update_schedule_entry`, `delete_schedule_entry`. En post gäller en klass eller en person. |
| Uppgifter | `admin/uppgifter` | Samma `student_tasks` och `AssignmentForm` som lärar- och elevpanelerna, plus `mark_follow_up` för inlämningar. |
| Profil och inställningar | `admin/installningar` | Appens gemensamma profilvy: konto, tema, lösenordsbyte och utloggning. Rollen kan inte ändras här. |
| Granskningslogg | `admin/granskningslogg` | `list_audit_log` — registreringar, konton, roller, scheman och klassbeslut. |

Sidorna `klasser`, `dokument`, `meddelanden`, `ai-installningar`, `loggar`,
`uppdateringar`, `kopplingar` och `nyheter` saknar fortfarande en administrativ
datamodell och visar ett tydligt planerat läge (inga knappar som låtsas utföra
något).

Detaljer om kontoskapande, första administratören, schemamigreringen och
kvarvarande Supabase-steg finns i `docs/adminpanel-och-scheman.md`.

## Databas och migreringar

Registreringen, rollerna, klasskoden, klassansökningarna och granskningsloggen
ligger i `supabase/migrations/20261020000000_registration_roles.sql`
(**icke-destruktiv**: nya tabeller och kolumner, vidgade CHECK-villkor, nya
policies och funktioner — inga befintliga rader rörs).

Schemaposterna ligger i `supabase/migrations/20261021000000_admin_schedules.sql`
(**icke-destruktiv**: tabellen `schedule_entries`, tre index, en select-policy
och funktionerna `create_schedule_entry`, `update_schedule_entry` och
`delete_schedule_entry`, som kontrollerar adminrollen och loggar ändringen).
Den kräver att `20261020` är körd. Se `docs/adminpanel-och-scheman.md`.

Nya tabeller, policies och funktioner ligger i
`supabase/migrations/20261018000000_panels_students_messages.sql`
(1473 rader, **icke-destruktiv**: bara `create table if not exists`,
`add column if not exists` och `create policy`).
Trädgårdens fyra belöningar ligger i
`supabase/migrations/20261019000000_garden_rewards.sql` — den vidgar temat
`tradgard` på `reward_definitions` och lägger till fyra nya rader (blomma 25 XP,
sol 50 XP, stjärna 75 XP, hjärta 100 XP) utan att röra befintliga rader.

Migreringarna behöver köras i Supabase-projektet innan panelerna fungerar mot
riktiga data:

```bash
supabase db push          # eller klistra in filerna i SQL-editorn
```

Den första skapar bland annat:

- `classes`, `class_members`, `student_links`, `student_tasks`
- `chat_channels`, `messages` (global, klass och direkt)
- `flashcard_decks`, `flashcards`, `flashcard_progress`
- `quiz_sets`, `quiz_questions`, `quiz_attempts`
- `documents` och den privata bucketen `elda-dokument` med storage-policies
- RPC:erna `link_student`, `unlink_student`, `create_class`, `add_class_member`,
  `remove_class_member`, `class_channel`, `open_direct_channel`,
  `list_my_direct_channels`, `list_messages`, `send_message`,
  `student_set_task_status`, `mark_follow_up`, `get_quiz_questions`,
  `submit_quiz_attempt`, `list_elev_accounts`, `list_staff_accounts`

Migreringen `20261020000000_registration_roles.sql` skapar dessutom
`registration_applications`, `registration_messages`, `class_join_requests`,
`terms_acceptances` och `audit_log`, klasskoden på `classes` samt RPC:erna
`create_class_with_code`, `rotate_class_code`, `list_my_classes`,
`list_my_students`, `request_class_join`, `list_class_join_requests`,
`decide_class_join_request`, `remove_class_student`, `list_admin_accounts`,
`list_registration_applications`, `decide_registration_application`,
`set_account_restriction` och `list_audit_log`.

Saknas migreringen visas tydliga fel i gränssnittet (`ERR_NOT_READY` från
`lib/db.ts`) i stället för tomma vyer eller påhittad data.

## Shopen, temana och samlingen

Shopen ligger i `supabase/migrations/20261101000000_shop.sql`
(**icke-destruktiv**: nya tabeller, `add column if not exists` och två vidgade
CHECK-villkor på `xp_transactions` — inga befintliga XP-, nivå- eller kontorader
skrivs om).

| Tabell | Innehåll |
| --- | --- |
| `seasons` | Säsonger (id, namn, fönster, aktiv). Halloween är den första raden. |
| `shop_products` | Produkter med kategori, sällsynthet, XP-pris, nivåkrav, säsong, bild- och temanyckel samt `published`. |
| `shop_purchases` | Genomförda köp med en **kopia** av namn, pris och utseende vid köptillfället. Ägandet ligger här. |
| `user_equipped` | Aktivt tema och utrustade föremål per konto, ett per plats. |

All skrivning går genom databasfunktionerna:

- `shop_purchase(product_id, idempotency_key)` — prövar publicering, säsong,
  nivåkrav, ägande och XP-saldo, låser användarens XP-rad och skriver köpet och
  den negativa XP-raden i samma anrop. Samma nyckel ger samma kvitto, och en
  samtidig dubblett fångas som `unique_violation` och besvaras med det köp som
  redan finns — aldrig med ett andra avdrag.
- `shop_equip(product_id)` / `shop_unequip(kind)` — utrustning och temabyte.
  Kontrollerar ägandet och kostar aldrig XP.
- `admin_shop_save_product`, `admin_shop_set_published` och
  `admin_shop_save_season` — kräver `is_admin()` i funktionen, inte bara i
  gränssnittet.

XP:t är oförändrat: köp är `xp_transactions` med `source = 'shop_purchase'` och
negativt belopp. Uppgifter ger fortfarande XP på samma sätt och exakt en gång.
Säsongens tillgänglighet avgörs av `season_is_active(id)` på servern, aldrig av
klientens klocka.

Temana är ett gemensamt system, inte fem kopior av appen: `src/styles/teman.css`
sätter paletten (ytor, text, ramar, knappar, meny, skuggor, fokus) via
`data-ui-tema` på `<html>`, och varje tema lägger till sina egna dekorationer om
det vill. Nya teman kräver en rad i `shop_products`, en bild i
`src/assets/teman/` och ett `[data-ui-tema='…']`-block. Saknas temanyckeln faller
appen tillbaka på standardtemat (`safeThemeKey`) utan att något ägande förloras.

Efter en avpublicerad produkt eller en avslutad säsong ligger köpet kvar i
`shop_purchases` och syns i **Min samling**; `on delete set null` på
`product_id` gör att inte ens en borttagen produkt tar med sig ägandet.

## Testning

`npm test` kör 443 tester i 38 filer. Registreringsbotens klienttester ligger i
`site/tests/bot.test.mjs` och körs med `npm test` i `site/`:

- **Enhetstester** för ruttvakt, hash-rutter, lösenord, kontofiltrering,
  backendfel, datum, kalender, planering/XP, trädgården, uppgiftens läge,
  flashcards, provträning, dokument, meddelanden och klasskoden
  (`src/lib/*.test.ts`, `src/lib/panel-logic.test.ts`).
- **Gränssnittstester med mockad backend** (`src/__tests__/`): inloggning per roll,
  tvingat lösenordsbyte både vid inloggning (ny server) och via sessionsflaggan
  (äldre server), skyddade rutter, sessioner, utloggning, menyfilter,
  kontolistan med alla
  kontohandlingar (24 tester), skapa konto, eleversidan, roller och
  behörigheter, schemasidan (9 tester), uppgiftssidan (9 tester),
  klassansökan med klasskod, elevpanelen (35 tester),
  lärarpanelen (12 tester), speciallärarpanelen (22 tester) och admins
  ansökningar/granskningslogg (7 tester).
- Hemsidans registreringssida körs i jsdom mot en låtsad server
  (`src/__tests__/site-registration.test.mjs`): hela flödet från kontotyp till
  resultat, felfallen och att anropet aldrig innehåller en roll.
- Schemat har dessutom enhetstester för veckodagar, validering, sortering,
  gruppering och filtrering (`src/lib/schedule.test.ts`, 15 tester).
- Shopen prövas i `src/__tests__/shop.test.tsx` (21 tester): produktens
  tillstånd (XP, nivå, säsong, ägande, avpublicering), att katalogen och
  migreringens frö har samma priser, att samlingen behåller ägandet när en
  produkt avpubliceras, och demolägets köpregler — nekade köp, exakt ett avdrag,
  idempotent omförsök, dubbelköp, nivåkrav samt byte mellan två ägda teman utan
  XP-kostnad.
  Adminpanelens shop prövas i `src/__tests__/admin-shop.test.tsx` (4 tester):
  listning, prisbekräftelse, avpublicering och säsongssparande.

Testerna når aldrig nätet: `.env.test` i reporoten lämnar
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` tomma, så `lib/db.ts` avvisar
anropet direkt i stället för att fråga ett riktigt projekt.

Databastestet för scheman och uppgifter ligger i
`supabase/tests/0003_admin_schedule_and_tasks.sql` och körs med
`supabase test db` (kräver Docker). Det är inte kört i utvecklingsmiljön — se
`docs/adminpanel-och-scheman.md` avsnitt 9.

Tester som kräver riktiga Supabase-konton eller en lokal databas körs separat:
RLS- och rolltesterna i `supabase/tests/` (`supabase start` + `supabase test db`,
kräver Docker), riktig inloggning per roll samt fillagring mot den privata
bucketen. Se `docs/registrering-och-roller.md`.

## Konfiguration

`.env.example` i reporoten visar vilka variabler som behövs. Vad som återstår
att göra i Supabase (migreringar, deploy av funktioner, den valfria botnyckeln,
första administratörskontot och e-postbekräftelsen) står i
`docs/registrering-och-roller.md` och `docs/adminpanel-och-scheman.md`.
