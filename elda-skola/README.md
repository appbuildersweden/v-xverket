# Elda Skola

Elda Skola är en fristående webbapp i `elda-skola/`. Den använder **samma
Supabase-projekt, samma användarkonton och samma inloggningsfunktion** som Elda,
men har ett eget gränssnitt, egen navigation och egna skolregler. Den vanliga
Elda-appen är orörd.

## Starta

```bash
cd elda-skola
npm install
npm run dev      # http://localhost:5175
npm run build    # typkontroll + produktionsbygge
npm test
```

Appen läser `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` från repots
befintliga `.env` (via `envDir: ..` i `vite.config.ts`). Inga nycklar kopieras in
i Elda Skola och ingen service-rollnyckel finns i klienten.

## Inloggning och behörighet

- Inloggningen använder Edge Functionen `auth-login` precis som Elda. Användarnamn
  och lösenord verifieras av Supabase Auth; inget lösenord lagras i appen.
- Rollen och kontotypen läses från `app_metadata`/`profiles`, som bara servern kan
  skriva. Klienten kan inte göra sig själv till lärare.
- **Lärare** (`role = 'lärare'`) får lärarpanelen.
- **Skolelev** (`role = 'elev'`, `account_type = 'skola'`) får elevpanelen.
- **Privata elevkonton** (`account_type = 'privat'`), admin och speciallärare nekas
  inträde med en tydlig förklaring. De fortsätter använda vanliga Elda.
- Rollvakten kontrollerar både hash-adressen och vilken panel som renderas. Att
  skriva `#/larare/...` som elev leder tillbaka till elevens startsida.
- All data läses och skrivs via Supabase med RLS. Att dölja en knapp är aldrig
  enda skyddet.

## Databas

Kör de nya migrationerna i Supabase innan appen används:

```bash
supabase link --project-ref <projekt-ref>
supabase migration list --linked     # se vad som redan är kört
supabase db push --linked --dry-run  # granska utan att ändra
supabase db push --linked
```

De nya migrationerna är additiva:

- `20261103000000_profile_private.sql` – användarens egna kontaktuppgifter.
- `20261104000000_elda_skola.sql` – `classes.subject`, `student_tasks.published`
  och `archived_at`, meddelanden + lässtatus, kalenderhändelser, aktiviteter,
  anpassningar, RPC:er och RLS-policies.
- `20261105000000_school_submissions.sql` – **en inlämning per elev och uppgift**
  (`school_submissions`), serverfunktioner för utkast/inlämning och
  återkoppling, samt en säker migrering av befintliga individuella uppgifter.
- `20261106000000_submission_privacy.sql` – individuella uppgifter syns bara för
  eleven och behörig personal, inte för klasskamrater. Klassuppgifter delas
  fortfarande med klassen.

`school_submissions` har en unik nyckel på `(task_id, student_id)`. Det finns
medvetet inga insert/update/delete-policyer för klienten: eleven sparar via
`elda_skola_save_submission` och läraren via `elda_skola_review_submission`.
Båda validerar identitet, uppgiftstillhörighet och status på servern. Ett
inlämnat svar är låst till dess att läraren återlämnar det för komplettering.

Befintliga **individuella** uppgifter med `student_id` flyttas in i den nya
tabellen. En gammal klassuppgift hade ett gemensamt svar som inte säkert kan
tillskrivas en elev; den raden lämnas orörd i `student_tasks` och visas inte som
någons inlämning.

Fillagring använder den befintliga privata bucketen `elda-dokument`. En elevs
fil kopplas till elevens `student_id`, inte till klassen, så klasskamrater inte
kan läsa den. Läraren ser den genom behörigheten till eleven. Om bucketen saknas
visas ett tydligt fel i gränssnittet i stället för en tyst misslyckad
uppladdning.

Kör gärna RLS-testerna mot en lokal databas innan deploy:

```bash
supabase start
supabase test db
```

## Skapa elevkonton

Lärare kan skapa ett skolelevskonto direkt i en klass. Det går via den nya
skyddade serverfunktionen `school-account`, som kontrollerar att anroparen är
lärare för klassen och skapar **ett** konto med rollen `elev` och
`account_type = 'skola'`. Kontot får ett tillfälligt lösenord som visas en gång
och måste bytas vid första inloggningen.

Deploya funktionen:

```bash
supabase functions deploy school-account
```

Finns funktionen inte deployad kan läraren fortfarande lägga till ett befintligt
skolkonto med användarnamn, eller låta eleven ansöka med klasskoden och godkänna
ansökan i klasslistan.

## Vad som är kopplat till backend

- Inloggning, session, utloggning och lösenordsbyte (med verifiering av nuvarande
  lösenord via `auth-login`).
- Klasser: skapa, redigera, klasskod, förnya kod, klasslista, lägg till/ta bort
  elev, godkänn/neka klassansökningar.
- Uppgifter: skapa, redigera, utkast, publicera, arkivera, tilldela klass eller
  enskild elev, bilagor, samt **en egen inlämning per elev** med utkast,
  inlämning, komplettering, inlämningstid och individuell återkoppling.
- Inlämningar: läraren ser hela klassens status per uppgift, kan filtrera på
  klass/uppgift/status, läsa varje elevs svar och bilagor samt markera svaret
  som granskat eller återlämna det för komplettering.
- Material: uppladdning till privat bucket, signerade länkar, borttagning.
- Meddelanden: publicera information till klass, lässtatus per elev.
- Kalender: händelser och deadlines från riktiga uppgifter.
- Aktiviteter: skapa, publicera, återanvända, elevens avbockning.
- Anpassningar: skapa, redigera, avsluta och ta bort med RLS som bara släpper in
  behöriga lärare.
- Profil: namn, kontaktuppgifter (egen tabell, bara ägaren), startsida och
  lösenordsbyte.

## Kvarvarande begränsningar

- **iCalendar-flöde** är inte implementerat. Det kräver en hemlig, återkallelig
  token per användare och en publik serverfunktion som bara exponerar användarens
  egna händelser. Ingen sådan slutpunkt finns, så profilen visar ingen låtsaslänk.
- **Notiser** (e-post/push) är inte implementerade och visas därför som
  otillgängliga.
- **Antal inloggningar** och sessionshistorik finns inte i Supabase Auth. Endast
  `last_sign_in_at` visas, eftersom det är den uppgift som faktiskt levereras.
- **Profilbild** finns inte i profilschemat. Profilhuvudet visar därför initialer i stället för en påhittad bild. Uppladdning kräver en bildkolumn och en granskad lagringsväg.
- **Mörkt tema** är inte implementerat. Skolans ljusa tema är fast.
- **Engelska** är inte implementerat; gränssnittet är på svenska.
- En klassuppgifts gamla gemensamma svar kan inte tillskrivas en enskild elev.
  Nya inlämningar sparas per elev i `school_submissions`; gamla individuella svar
  migreras automatiskt, men gamla klassgemensamma svar visas inte som någons
  inlämning.
- `school-account` måste deployas för att lärare ska kunna skapa helt nya
  elevkonton från appen. Övriga elevflöden fungerar utan den.
