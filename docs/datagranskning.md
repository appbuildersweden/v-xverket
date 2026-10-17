# Granskning: finns det påhittad eller simulerad användardata i Elda?

Granskning gjord 2026-10-17 mot koden och mot projektets produktionsdatabas.
Frågan som besvaras: visas något i panelerna som inte motsvarar en verklig
händelse i databasen, och finns det kvar test-/demodata i produktionen?

## 1. Sammanfattning

- **Ingen kod skapar påhittad användardata.** Inga seed-filer finns, inga
  migreringar lägger in klasser, elever, uppgifter, inlämningar, meddelanden,
  betyg eller belöningar. Alla paneler hämtar från databasen eller räknar fram
  sina siffror ur de rader som finns.
- **Produktionen innehåller ingen falsk aktivitetsdata.** Klasser, medlemmar,
  uppgifter, inlämningar, dokument, meddelanden, provresultat, XP-händelser och
  upplåsta belöningar står på noll. Det som finns är tre riktiga konton, en
  riktig uppgift som ägaren själv har skrivit, en global kanal och konfiguration.
- **Det som finns kvar är spår efter automatiska testkörningar** i
  registreringstabellerna (avslutade ansökningar och deras botlogg) samt i
  granskningsloggen. De visas inte som väntande arbete i adminpanelen, men de
  ligger kvar i historiken. Jag har **inte** raderat dem: se punkt 5.
- **Ett verkligt fel åtgärdades**: flera sidor kunde visa en nolla när en
  delhämtning misslyckades. Det såg ut som "ingen aktivitet" i stället för
  "kunde inte hämtas". Det visas nu som ett tydligt besked.

## 2. Kodgranskning

| Kontroll | Resultat |
| --- | --- |
| Seed-filer (`supabase/seed*`, `seed.sql`) | finns inte |
| Migreringar som infogar användardata | endast backfill av `profiles` för **befintliga** riktiga konton, samt data inuti funktioner som körs av en användares egen åtgärd |
| Hårdkodade listor i panelerna (elever, klasser, uppgifter, betyg) | inga |
| Sökning på `demo`, `fake`, `dummy`, `sample`, `exempeldata`, `påhittad` i produktionskod | träffar endast kommentarer som lovar motsatsen |
| Reservvärden när hämtning misslyckas | **hittat och åtgärdat** (se punkt 4) |
| AI-genererat innehåll som ser ut som lärartilldelat | inga AI-övningar skrivs till uppgiftstabellen; provträning ligger i egna tabeller och delas upp i "Mina övningar (skapade av dig)" och "Delade övningar" |
| XP och belöningar | betalas ut av servern en gång per post; `xp_transactions` och `reward_unlocks` är tomma i produktionen |
| Statistik och framsteg | beräknas ur uppgifter, provförsök, kortlekar, dokument och XP-händelser — inga hårdkodade tal |
| Tomma lägen | finns på alla listsidor (t.ex. "Inga uppgifter ännu", "Du har ingen klass ännu", "Ingen data ännu") |
| Fel läge | `ErrorState` med "Försök igen" när huvudhämtningen misslyckas; AI-fel visas som serverns meddelande, aldrig som ett påhittat svar |

## 3. Produktionsdatabasen – vad som faktiskt finns

Läst med `npx supabase db query --linked` (endast `select`).

**Riktig användardata (behålls):**

| Tabell | Antal | Innehåll |
| --- | --- | --- |
| `profiles` | 3 | `ejentu01` (admin), `elintu01` (elev, privat konto), `elowtu01` (lärare) — skapade 2026-10-16/17 |
| `spec_tasks` | 1 | "jag ska göra en uppsatts" — en post som en användare själv har skrivit |
| `chat_channels` | 1 | den globala kanalen, med 0 meddelanden |
| `terms_acceptances` | 1 | villkoren godkändes vid en riktig registrering 2026-10-17 |
| `download_grants` | 3 | två för de riktiga kontona, en för ett konto som senare tagits bort |
| `reward_definitions` / `reward_settings` | 27 / 2 | konfiguration som migreringarna skapar — inte användaraktivitet |

**Tomt (inga påhittade eller simulerade händelser):** `classes` (0),
`class_members` (0), `class_join_requests` (0), `student_tasks` (0),
`documents` (0), `messages` (0), `quiz_questions` (0), `xp_transactions` (0),
`reward_unlocks` (0), `unlocked_decorations` (0), `schedule_entries` (0),
`student_links` (0).

**Kvarlevor från automatiska tester (funna i granskningen, sedan städade på ägarens begäran):**

| Tabell | Antal | Vad det är |
| --- | --- | --- |
| `registration_applications` | 15 rader med status `borttagen` | konton som skapades av testkörningarna (`scripts/e2e-registrering.mjs` och felsökningskörningarna) och som därefter togs bort av samma skript. Raderna är märkta med tid och beslut (`granskas:ai-kredit-saknas`, `granskas:roll-kraver-granskning`) |
| `registration_applications` | 2 rader med status `utkast` | påbörjade ansökningar som aldrig skickades in. **Oklart ursprung** — de kan komma från ett automatiskt test *eller* från att någon öppnat registreringssidan och stängt den. Rörs inte |
| `registration_messages` | 192 | botens frågor och svar tillhöriga de ansökningarna |
| `account_deletions` | 15 | spår av att testkontona togs bort via spårningskod |
| `audit_log` | 186 | blandade verkliga och testdrivna händelser. Går inte att skilja säkert åt → rörs inte |

De två `utkast`-raderna är båda av typen `skolelev` och skapades 2026-10-17
16:05. Ingen av dem har någon kopplad användare eller klass.

Kontroll av vad adminpanelen visar: **Registreringsansökningar öppnar filtret
"Väntar på granskning"**, och ingen ansökan har status `vantar` — kön är alltså
tom och testkvarlevorna visas inte som arbete. Väljer man "Alla" visas de, nu med
korrekt etikett (se punkt 4).

`AdminStartPage` räknar inte registreringsansökningar alls, så ingen siffra på
startsidan påverkas av kvarlevorna.

## 4. Vad som ändrades i koden

1. **Dolda fellägen blev synliga.** Sju sidor byggde på flera hämtningar och
   gjorde en misslyckad delhämtning till en tyst nolla — till exempel kunde
   "Mina framsteg" visa `XP 0` och "0 av 0 provträningar" när servern inte
   svarade. De visar nu `PartialDataNotice` (`src/components/ui.tsx`): *"Kunde
   inte hämta dina poäng just nu. Det som saknas visas inte, så siffrorna ovan
   kan vara ofullständiga"* med en "Försök igen"-knapp. Ändrade sidor:

   | Sida | Delar som kan saknas och därför namnges |
   | --- | --- |
   | Elevens översikt | egna poster, meddelanden, poäng |
   | Privatelevens översikt | uppgifter, poäng |
   | Mina framsteg | poäng, provresultat, kortlekar, dokument |
   | Mina dokument | fillagringen, kopplingen till uppgifter |
   | Belöningar och nivåer | poänghistoriken |
   | Lärarens klasser | klassansökningarna, eleverna (varningen byggdes men visades aldrig) |
   | Speciallärarens planering | poäng |

   Lärarens hemsida, lärarens uppgifter och speciallärarens hemsida gjorde redan
   detta och är oförändrade. Sidor med en enda hämtning (till exempel elevens
   uppgiftslista) visar fortsatt `ErrorState` när den hämtningen misslyckas.
2. **Statusetiketten för borttagna konton.** Databasen har statusen
   `borttagen` (konto skapat och sedan borttaget av användaren) men typen och
   etiketterna saknade den, så en sådan rad visades utan status. Nu finns
   `borttagen: "Borttagen av användaren"` och ett filter "Borttagna konton".
3. **Privatelevens texter** (från det tidigare arbetet) håller isär egna
   studieaktiviteter och lärarens uppgifter, och framstegssidan säger för en
   privat elev att det ännu inte finns någon aktivitet att sammanställa.

## 5. Städningen som gjordes (efter ägarens beslut)

Kvarlevorna var spår av verkliga händelser (testkörningar), inte påhittad data,
och de visades inte som aktivitet i panelerna. Eftersom de ändå är testdata
städades de efter att ägaren godkänt det:

```sql
delete from public.registration_applications where status = 'borttagen';
```

`registration_messages` och `account_deletions` har `on delete cascade` mot
`registration_applications`, så botloggen och kontoborttagningarna försvann med
samma radering. Inga andra tabeller refererar till ansökningarna.

**Före:** 18 ansökningar (15 `borttagen`, 2 `utkast`, 1 `godkand`), 192
botmeddelanden, 15 kontoborttagningar.
**Efter:** 3 ansökningar (2 `utkast`, 1 `godkand`), 11 botmeddelanden, 0
kontoborttagningar. `profiles` (3 riktiga konton) och `audit_log` är orörda.

En säkerhetskopia av de borttagna raderna ligger utanför repot:
`C:/tmp/elda-testkvarlevor.csv` (15 ansökningar och 15 kontoborttagningar med
tid och beslut).

De 11 botmeddelanden som är kvar fördelar sig så: 9 tillhör den riktiga
registreringen (status `godkand`) och 1 hör till vardera utkast.

Kvar för granskning: de **två `utkast`-ansökningarna** (`skolelev`, 2026-10-17
16:05). De rördes inte, eftersom det inte går att avgöra om de kommer från ett
test eller från någon som öppnade registreringssidan och stängde den.

`audit_log` lämnades orörd: den innehåller både riktiga och testdrivna händelser
och går inte att skilja säkert åt. Den innehåller ingen visad användaraktivitet i
panelerna.

## 6. Verifiering

- `npm run typecheck` i `src-new`: grönt.
- `npx vitest run` i `src-new`: 354 prov i 27 filer, gröna.
- Nya prov: "visar att en del inte kunde hämtas i stället för en falsk nolla"
  (`src/__tests__/elev-panel.test.tsx`) — en uppgift som hämtas visas tillsammans
  med beskedet att poängen inte kunde hämtas — och `src/lib/db.test.ts` (11 prov),
  som visar att databasfel blir fel och inte tysta tomma listor.
- `npm run build` i `src-new` och i rotappen: grönt. `cd site && npm test`: 28 prov gröna.
- Gränssnittsprov i webbläsaren (dev-servern på `localhost:5174`) med en
tillfällig privat elev: inloggning landade på `#/privat/start`, menyn visade
rollen `Elev · Privatelev` och bara de privata valen (ingen klass, klasschatt
eller kamratlista), tomma lägen var sanna ("Inga uppgifter just nu"), `#/elev/klass`
och `#/admin/start` skickade tillbaka till den privata översikten, omladdning
behöll sessionen, och efter "Logga ut" gick det inte att komma in igen — inte
ens efter omladdning eller via en djup länk till adminpanelen.
- Skarpt prov mot den publicerade sajten (`C:/tmp/steg2-probe.mjs`): en
tillfällig privat elev skapades via den riktiga registreringen, loggade in och
prövades mot backend. 18 av 18 kontroller gick igenom (rätt roll och kontotyp i
sessionen, ingen åtkomst till andras profiler, uppgifter, dokument eller
meddelanden, ingen klasslista och ingen klassansökan, ingen åtkomst till
adminfunktionerna, rollen gick inte att höja från klienten). Kontot och dess
ansökan städades bort efteråt genom den riktiga kontoborttagningen.
- Databassiffrorna ovan är lästa direkt ur projektets databas samma dag, både
  före och efter städningen, och igen efter det skarpa provet.
- Efter städningen: 3 ansökningar (1 verklig registrering, 2 oavslutade
  utkast), 11 botmeddelanden, 0 kontoborttagningar, 3 profiler — och fortfarande
  0 klasser, uppgifter, inlämningar, dokument, meddelanden, provresultat,
  XP-händelser och upplåsta belöningar. Adminpanelens kö "Väntar på granskning"
  är tom, precis som före städningen.
- `audit_log` har vuxit med de händelser som de skarpa proven faktiskt gav
  upphov till (inloggning, ansökan, borttagning). Det är riktiga händelser och
  de visas inte som aktivitet i panelerna.
