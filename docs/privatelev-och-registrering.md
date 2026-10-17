# Privatelevpanelen, klasspärren och registreringsboten – vad som gjordes 2026-10-17

Detta är en körrapport för arbetet med privatelevpanelen, elev-/lärarpanelerna,
behörigheterna och registreringsbotens automatiska godkännande. Den beskriver
vad som ändrats, vad som är prövat i skarp miljö och vad som ännu inte är
verifierat. Siffror och utfall är från körningar i den här sessionen.

## 1. Vad som ändrades i koden

### Privatelevpanelen (ny)

- `src-new/src/lib/auth-types.ts`: panelen `privat` finns som egen panel, och
  `canAccessPanel` släpper en elev med `accountType: 'privat'` till enbart
  `privat` — aldrig till `elev`. `isPrivateStudent` avgör kontotypen.
- `src-new/src/lib/guards.ts`: `defaultRoute` ger en privat elev `#/privat/start`,
  och en direktadress till en klassrutt (`#/elev/klass`) omdirigeras till den
  egna panelen. Ett konto utan kontotyp behandlas som skolelev — samma tolkning
  som servern.
- `src-new/src/lib/nav.tsx`: privatelevens meny (Översikt, Mina studier,
  Studiehjälp, Framsteg) har inga klass-, klasskamrat-, klasschatt- eller
  meddelandesidor.
- `src-new/src/pages/PrivatelevPanel.tsx` och
  `src-new/src/pages/privat/PrivateStartPage.tsx`: panelen och dess startsida.
  Studieverktygen återanvänds från elevpanelen.
- `src-new/src/lib/panel-copy.ts` (ny): de texter som skiljer panelerna. En
  privat elev möts inte av "din lärare" eller "din klass" utan av sina egna
  studier. Skolelevens texter är oförändrade ordagrant.
- `src-new/src/pages/elev/*`: sidorna (planering, uppgifter, dokument, ämnen,
  flashcards, provträning, framsteg, AI-studiehjälp) tar emot panel-id, visar
  rätt text och rätt test-id (`page-privat-*` respektive `page-elev-*`).
- `src-new/src/lib/ai.ts`: AI-studi hjälpens inledning har en egen variant för
  privata elever.

### Klasspärr i backend

Två migreringar, båda körda mot det länkade projektet:

- `supabase/migrations/20261025000000_private_student_no_class.sql`:
  `public.request_class_join` nekar ett konto med `account_type = 'privat'`.
- `supabase/migrations/20261026000000_private_student_class_check_order.sql`:
  kontotypen prövas före granskningsflaggan `limited`, så ett privat konto får
  besked om kontotypen även medan granskningskön är aktiv.

Klasslistan och klasskamraterna bygger på `class_members`. Ett privat konto är
aldrig medlem och kan inte bli det, så `list_my_classes`, klasskamraterna och
klasschatten ger inget innehåll för en privat elev.

### Routing och adressfältet

- `src-new/src/App.tsx`: adressfältet speglas nu mot den *färdiga adressen*
  (en sträng) i stället för mot ett ruttobjekt som är nytt vid varje rendering.
  Tidigare kunde en adress som just skrivits in skrivas över innan webbläsaren
  hann lämna sin hashchange-händelse — den nya adressen tappades utan
  förklaring. Efter en nekad adress rättas adressfältet till den sida som
  faktiskt visas.
- Ett omdirigeringsbesked visas bara när adressen kom från adressfältet. En
  privat elev som just loggat in får inte längre "Du har inte behörighet till
  den panelen" för att appens egen startrutt rättades.
- Beskedet försvinner när användaren navigerar vidare i menyn.

### Rättade tester

- `class-join.test.tsx`: provet som förväntade att en privat elev skulle kunna
  begära klassmedlemskap är omskrivet till det nya kravet — en privat elev
  hamnar i sin egen panel och når aldrig klassvyn.
- `site-registration.test.mjs`: den låtsade servern skickar nu `required` som
  den riktiga servern gör (annars blev knapptexten en annan än provet sökte).
- `documents-and-submissions.test.tsx`, `elev-panel.test.tsx`,
  `admin-assignments.test.tsx`: prov som letade efter data medan den fortfarande
  hämtades väntar nu in den riktiga raden. De kunde annars falla slumpmässigt.
- `app-routing.test.tsx`, `larare-panel.test.tsx`: adressbyten levererar
  hashchange-händelsen direkt i stället för att lita på att jsdom hinner köa den.
- `panel-logic.test.ts` och `panel-copy.test.ts` (ny): privatelevens meny saknar
  klass, kamrater, klasschatt och meddelanden, och privatelevens texter nämner
  varken lärare eller klass.

## 2. Körda prov

| Prov | Utfall |
| --- | --- |
| `npm run typecheck` (src-new) | grönt |
| `npx vitest run` (src-new) | 342 prov i 26 filer, gröna (fem körningar i rad efter testfixarna) |
| `npm run build` (src-new, `tsc && vite build`) | grönt |
| `npm run build` (rotappen) | grönt |
| `cd site && npm test` | 28 prov, gröna |
| `npx supabase db push` (migrering 20261025 + 20261026) | båda applicerade |

## 3. Prövat i skarp miljö (inte bara bygge)

- **Privat konto mot den deployade servern**: ett testkonto registrerades via
  `register`, loggades in och anropade databasen direkt.
  - `request_class_join` nekades med "Ditt konto är ett privat konto och kan
    inte gå med i en klass."
  - `list_my_classes` gav `[]` och `list_my_students` gav `[]`.
  - Ett *skolkonto* fick inte samma nekande (det fick beskedet om
    granskningskön), vilket visar att kontotypen bedöms rätt och inte blandas
    ihop med skolelever.
- **Privatelevpanelen i webbläsare** mot den lokala utvecklingsservern
  (`src-new`, port 5174) med ett riktigt testkonto:
  - Inloggning landar i `#/privat/start` med menyn Översikt, Mina studier,
    Studiehjälp, Framsteg — ingen klass, ingen klasschatt, inga meddelanden.
  - Direktadressen `#/elev/klass` omdirigeras till `#/privat/start`, klassvyn
    och klasskodsformuläret finns inte i sidan, och adressfältet rättas.
  - Sidorna `uppgifter`, `planering`, `dokument`, `amnen`, `framsteg`,
    `flashcards`, `provtraning` och `ai-hjalp` visar rätt test-id, riktiga
    datahämtningar (alla REST-anrop svarade 200) och tomma lägen i stället för
    påhittade siffror. Ingen sida nämner lärare eller klass.
  - AI-studiehjälpen svarade med serverns felmeddelande
    ("AI-tjänsten har mycket att göra just nu. Försök igen om en stund.") i
    stället för ett påhittat svar — felet visas för användaren, ingen falsk
    framgång.
- **Testkontot togs bort** efter körningen (`account` med spårningskod och
  lösenord, `deleted: true`). Inga testkonton ligger kvar.

## 4. Registreringsboten: säker reserv fungerar, automatiken är blockerad

Boten, beslutsmotorn och den säkra reserven är prövade skarpt:

- Fem registreringar kördes mot den deployade funktionen. Alla svarade
  `status: "vantar"` med `ai: "misslyckades"` och orsaken
  `ai-bedomning-saknas`. Kontona skapades begränsade (`limited`), kunde logga in
  men nekades nedladdning — precis den säkra hanteringen som krävs.
- Orsaken är extern: den delade OpenRouter-nyckeln får **429 (kvoten för
  gratismodellerna är slut)**. Två oberoende funktioner drabbas lika —
  `register`s AI-bedömning och `ai-chat` — så det är nyckeln/kvoten, inte vår
  kod. Alla fem modellnamnen i listan finns kvar hos OpenRouter, så det är inte
  en borttagen modell.
- Kontrollen "`ai-chat` svarar" gjordes med ett tillfälligt testkonto och gav
  `502` med samma kvotbesked, både direkt och efter väntetid.

**Slutsats: automatisk godkänning är inte verifierad med en fungerande
AI-tjänst.** Den säkra reserven är däremot verifierad i skarpt läge: AI-fel
leder aldrig till ett automatiskt godkännande, ansökan sparas och hamnar hos
administratören. För att kunna verifiera automiken behöver OpenRouter-kontot
krediter (eller en ny nyckel/leverantör) — se `docs/registrering-och-roller.md`
för variablerna. En registreringsansökan som väntar på granskning kan
administratören hantera i adminpanelen under Registreringsansökningar.

## 5. Kvarstår / inte verifierat

1. **Automatisk godkänning med fungerande AI** — blockerad av OpenRouter-kvoten
   (punkt 4).
2. **Inloggade prov som lärare, speciallärare och administratör i webbläsaren**
   är inte körda: inga inloggningsuppgifter för de kontona används i det här
   arbetet (och konton ska inte skapas eller ändras i onödan). Panelernas
   routing, meny och behörigheter täcks av de automatiska proven.
3. **Klasskoden för ett skolkonto i skarpt läge** är inte prövad hela vägen:
   alla nya konton blev begränsade medan AI-kvoten är slut, och ett begränsat
   konto nekas klassmedlemskap av ett annat skäl. Kontotypbedömningen är dock
   prövad (skolkontot fick inte det privata nekandet).
4. **Tomma adminpanelsidor**: Klasser och elevgrupper, Elev- och lärardokument,
   Meddelanden och nyheter samt Kopplingar visar ett tydligt "planerat" läge.
   De visar ingen påhittad data, men de är inte byggda.
5. **Databastesterna i `supabase/tests/`** körs fortfarande inte (Docker saknas).
