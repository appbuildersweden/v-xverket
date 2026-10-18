# Elda – aktuellt läge

Kort ögonblicksbild för den nya appen (`src-new/`). Uppdaterad 2026-10-18.

## Den nya appen är nu den som installeras (0.2.4)

- `src-tauri/tauri.conf.json` pekar på `../dist`, och rotens `npm run build`
  bygger `src-new` och kopierar hit resultatet (`scripts/kopiera-webbappen.mjs`).
  Den installerade appen innehåller alltså privatelevpanelen.
- Uppdateringsrutan finns även i den nya appen (`src-new/src/lib/update.ts`,
  `src-new/src/components/UpdateBanner.tsx`).
- Admin kan sätta kontotyp (`skola`/`privat`) på ett elevkonto via
  `admin-users` (`set-account-type`) och rutan *Kontotyp för elev* under
  *Roller*. Ett konto som är klassmedlem nekas (409) tills det lämnat klassen.
- Privat elev är fortfarande `role = 'elev'` + `account_type = 'privat'`:
  rollen styr panel och RLS, kontotypen styr klasspärren. Båda sätts på
  servern.

## Privatelevpanelen (2026-10-17)

En elev med ett privat konto har nu en egen panel (`#/privat/...`) utan klass,
klasskamrater, klasschatt eller meddelanden — i gränssnittet, i ruttvakten och i
backend. Detaljer, körda prov och vad som ännu inte är verifierat finns i
`docs/privatelev-och-registrering.md`.

Kort: panel-id:t `privat` i `lib/auth-types.ts` och `lib/nav.tsx`, texterna i
`lib/panel-copy.ts`, klasspärren i migreringarna `20261025` och `20261026`
(`request_class_join` nekar ett privat konto), samt ett rättat adressfält i
`App.tsx` (hash-synken jämför nu färdiga adresser i stället för nya objekt vid
varje rendering).

Detta är medvetet en kort status, inte en fullständig beskrivning. Detaljerna
finns i `docs/registrering-och-roller.md`, `docs/adminpanel-och-scheman.md` och
`src-new/README.md`.

## Shopen och temana (0.2.10)

Shopen kom i 0.2.9 (commit `32e3af4`) och byggdes ut i 0.2.10 (commit `269df2c`,
tagg `v0.2.10`, releasekörning 39161141725) med 19 nya föremål och två
gradient-teman. Elev- och privatelevpanelen har gruppen *Shop*
med sidorna *Shop* och *Min samling*; adminpanelen har *Shop och säsonger*.
Detaljerna — katalog, teman, tabeller, funktioner och vad som är verifierat —
står i `publicera-0.2.10.md`, `publicera-0.2.9.md` och `src-new/README.md`.

Kort: 54 produkter i sju kategorier, sju UI-teman (300–600 XP), ägandet i
`shop_purchases` med en kopia av köpet, och all skrivning genom
`shop_purchase`, `shop_equip`/`shop_unequip` samt `admin_shop_*`. Ingen
riktig valuta, ingen loot och ingen ny XP-väg. De 19 sista produkterna (två
teman, fyra avatarer, fyra ramar, fyra märken och fem dekorationer) ligger i
`20261102000000_shop_utokning.sql`, som bygger vidare på den första
migreringen. Ingen av dem är **körd** — tills de är det visar shopen
`ERR_NOT_READY` i stället för tomma vyer.

## Verifierat i utvecklingsmiljön

- `npx tsc --noEmit` grön i båda apparna (gamla `src/` och `src-new/`).
- `npx vitest run` i `src-new/`: 445 tester i 38 filer, gröna
  (2026-10-18, efter 0.2.10).
- `npm run build` i rotappen grön: den bygger `src-new` (`tsc && vite build`) och
  kopierar resultatet till `dist/`, som Tauri paketerar.
- Databasen statiskt granskad: varje tabell som migreringarna skapar har
  `enable row level security`, och klienter har ingen skrivpolicy på `profiles`
  (all skrivning sker serversidigt).
- Serverns kontroller: `active` nekas i `auth-login`, `limited` tillämpas inne i
  SQL-funktionerna — inte bara i gränssnittet. Rollen läses från JWT:ns
  `app_metadata`, som bara servern kan skriva.

## Tvingat lösenordsbyte är nu serversidigt

Nya konton och återställda lösenord sätter `must_change_password`. Spärren
hävdas numera av `auth-login` och inte av gränssnittet:

- Utan ett nytt lösenord i samma anrop lämnas **ingen session** ut
  (409 + `mustChangePassword`). Det tillfälliga lösenordet ger alltså inget
  tillträde till API:et.
- Med ett nytt lösenord: lösenordet verifieras först (det är kontots ägare),
  det nya valideras serversidigt, sparas av Supabase Auth, flaggan nollas i
  `profiles` och `app_metadata`, sessionen från det tillfälliga lösenordet
  stängs och en ny session utfärdas.
- Klienten (`src-new/src/pages/Login.tsx`) visar steget "Skapa nytt lösenord"
  och gör om inloggningen med det nya lösenordet. Spärren i `App.tsx` finns
  kvar som ett andra lager.
- Klienten fungerar även mot en äldre server som fortfarande lämnar ut en
  session med flaggan satt — då tar den gamla vägen över.
- **Utrullningsordning:** släpp appversionen först, deploya `auth-login`
  efteråt (`supabase functions deploy auth-login --no-verify-jwt`). En äldre
  klient mot den nya servern får ett begripligt felmeddelande men kan inte
  komma vidare.
- **Inte kört:** funktionen är inte körd lokalt (ingen Deno installerad) och
  inget riktigt konto har använts. Det som är automatiserat är klientens två
  vägar (ny och äldre server), inte serverfunktionen.

## Kvarstående osäkerhet

1. Databastesterna i `supabase/tests/` (`0001`–`0003`) är aldrig körda: Docker
   kör inte och `supabase/config.toml` saknas. RLS och rollreglerna är granskade
   i SQL — inte bevisade i en databas.
2. Live-inloggning och kontoskapande mot det riktiga Supabase-projektet är inte
   körda härifrån. Det kräver deployade funktioner och ett testkonto.
3. Det är inte kontrollerat om migreringarna `20261018`–`20261021` är körda i
   projektet.
4. Ett konto som redan är inloggat när admin återställer lösenordet behåller sin
   session tills den tar slut: Supabase admin-API kan bara stänga sessioner med
   användarens egen JWT, inte per användar-id. Om själva lösenordsbytet
   ogiltigförklarar sessionerna är inte verifierat.
5. **OpenRouter-kvoten för gratismodellerna är slut (429), vilket gör att både
   `register`s AI-bedömning och `ai-chat` svarar med fel.** Registreringen
   faller då tillbaka på manuell granskning — en säker hantering som är prövad —
   men den automatiska godkänningen kan inte verifieras förrän nyckeln har
   krediter igen. Se `docs/privatelev-och-registrering.md`.

   Läget visas nu för användaren i stället för som ett allmänt fel:
   - `ai-chat` svarar med HTTP 503 och `{ error, code }` där `code` är
     `ai-kvot-slut` (429), `ai-krediter-saknas` (402), `ai-modell-saknas` (404)
     eller `ai-otillganglig` (övriga serverfel). Klienten (`lib/ai.ts`)
     översätter koden till en förklaring, och chatten märker rutan som
     "AI-hjälpen är tillfälligt otillgänglig" i stället för ett rött fel.
   - `register` skickar `aiIssue` (`kvot-slut`, `krediter-slut` eller
     `svar-uteblev`) med sitt svar, och registreringssidan förklarar att
     ansökan går till manuell granskning och att den inte är avslagen.
   - **Kräver omdeploy** av `ai-chat` och `register` samt en ny publicering av
     hemsidan för att bli synligt skarpt; ändringen är provad i automatiska
     prov men inte mot den publicerade funktionen.

## Registreringsingången: boten ligger nu på hemsidan

Registreringsboten på hemsidan är den enda publika vägen till ett konto, och
appen loggar bara in.

- Hemsidan: `site/registrera.html` + `site/registrera.js` samt den rena
  klienten `site/bot.js`. Sidan anropar samma skyddade serverfunktion `register`
  som förut — inget parallellt registreringssystem finns.
- Appen: "Skapa konto"-knappen, registreringsvyn (`Register.tsx`) och botens
  klientfunktioner i `lib/registration.ts` är borttagna. Kvar i inloggningen
  finns en diskret hänvisning till hemsidan.
- Publiceringen: `site/build.mjs` skriver `dist/config.json` med den publika
  Supabase-adressen och anon-nyckeln. Saknas de publiceras sidan ändå (så att
  nedladdning och uppdateringar aldrig blockeras), men registreringssidan visar
då "inte tillgänglig". `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` måste
därför vara satta även för webbplatssteget i release-workflowen.

Serversidan: lärarkonton godkänns aldrig automatiskt längre. Beslutsmotorn i
`register` sätter `autoApprove = kind !== 'larare' && inga varningssignaler`, så
ett lärarkonto skapas begränsat och hamnar alltid hos en administratör innan
klassverktygen öppnas. Boten kan inte verifiera en yrkesidentitet — och påstår
det därför inte heller.

Adminpanelens behörighetskontrollerade kontoskapande (`admin-users`, som kräver
en administratörssession) är oförändrat och är inte en publik väg.

## Rensning av död kod (2026-10-16)

Borttaget i nya appen: det dubbla filter-API:et i `lib/accounts.ts` (ersatt av
`searchAccounts` + `filterByAccountType` + `filterByStatus`), `DECISION_LABELS`,
`listElevProfiles`, `formatClassCode`, XP-aliaset i `lib/planner.ts` samt
oanvända hjälpare i `lib/db.ts`. Rollistorna återanvänds nu via `ELEV_ROLES` och
`PERSONAL_ROLES` i stället för att skrivas om i sidorna. I gamla appen togs
`src/components/Header.tsx` bort efter att den bekräftats död (två oberoende
kontroller) — den gamlas `tsc` och bygge är grönt efteråt.

Medvetet behållet: `App.tsx`-spärren för tvingat lösenordsbyte (andra lagret),
`completePasswordChange` (används av äldre server), samt de publika hjälparna i
`lib/schedule.ts` och `lib/students.ts` som sidorna använder.

## Verifierat / inte verifierat för registreringen

- Klienten på hemsidan är testad utan webbläsare: `cd site && npm test`
  (13 tester) prövar hela flödet start → svar → inskickning mot en låtsad
  server, felfallen (fältfel, ofullständig ansökan, rate limit, nätverksfel) och
  att insättandet bara innehåller spårningskod och lösenord.
- Själva sidan är dessutom körd i jsdom med den riktiga sidkoden
  (`src-new/src/__tests__/site-registration.test.mjs`, 6 tester): kontotyp,
  fråga för fråga, lösenord, villkor och resultat — samt att svaga lösenord och
  uteblivet godkännande av villkoren stoppas innan något skickas.
- Appens inloggning är testad: ingen registreringsknapp, ingen rollväljare,
  ingen registrering ens via en gammal registreringsadress.
- Sidan och inloggningen är dessutom visuellt kontrollerade i webbläsare mot
  lokala servrar.
- **Inte kört:** hela registreringen mot den riktiga serverfunktionen. Det kräver
  en deployad `register`, en riktig databas och ett testkonto, och skulle skriva
  en riktig ansökan i projektets databas. Serverfunktionens egna avvisningar
  (ofullständig ansökan, okänd spårningskod, rate limit) är granskade i koden men
  inte körda.

## Nästa steg

0. Kör migreringen `20261101000000_shop.sql` (`npx supabase db push`) så att
   shopen fungerar mot den riktiga databasen – se `publicera-0.2.9.md`.
1. Fyll på OpenRouter-kontot (eller sätt en ny nyckel) och kör
   `node scripts/e2e-registrering.mjs` igen: då ska ett privat elevkonto få
   `status: "skapad"` utan administratörens inblandning.
2. Starta Docker → `npx supabase init` → `npx supabase test db` (punkterna 1
   och 3 ovan).
3. Deploya `register` (och `auth-login` om den inte redan är deployad) och kör
   igenom registreringen en gång mot det riktiga projektet med ett testkonto.
4. Verifiera inloggning, lösenordsbyte och kontoskapande i adminpanelen mot det
   riktiga projektet.
5. Därefter: biblioteket med utvecklingsskills och dess dokumentation.
