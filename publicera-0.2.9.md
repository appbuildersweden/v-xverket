# Elda 0.2.9 – shopen, fem teman och samlingen

**Status: förberedd i arbetsträdet.** Versionen är höjd och kontrollerna är
körda, men inget är committat, taggat eller publicerat än. Stegen som återstår
står under *Kvar att göra*.

## Vad som ändrades

- **Shopen finns i elev- och privatelevpanelen.** Ny grupp *Shop* med två sidor:
  *Shop* (35 publicerade produkter i sju kategorier) och *Min samling* (allt
  eleven äger). Sidan visar saldo, nivå och vad varje produkt kostar, och
  förklarar alltid varför ett köp inte går igenom — för lite XP, för låg nivå,
  utanför säsong eller redan ägd — i stället för att bara stänga av knappen.
  Filter och sortering: kategori, sällsynthet,  säsong, högsta pris, fritext,
  "bara sådant jag kan köpa" samt fem sorteringar.
- **Fem UI-teman.** *Pumpatema* (300 XP, nivå 2), *Spökhus* (400 XP, nivå 2),
  *Häxkonst* (450 XP, nivå 3), *Haunted Forest* (500 XP, nivå 3) och
  *Midnight Halloween* (600 XP, nivå 4). Ett köpt tema läggs på `<html>` som
  `data-ui-tema` och byter paletten i hela appen — ytor, text, ramar, knappar,
  meny, skuggor och fokus — samt visar temats bakgrundsbild. Temana är ett
  gemensamt system (`styles/teman.css`), inte fem kopior av appen. Saknas
  temanyckeln faller appen tillbaka på standardtemat utan att något ägande
  förloras.
- **Bilderna följer med i paketet.** De fem motiven ligger som WebP i
  `src/assets/teman/` (620 kB totalt, högst 1600 px breda) och hittas vid
  bygget, precis som Halloween-ikonerna. Inget tema hämtas från en extern
  adress. `scripts/forbered-teman.py` gör om nya källbilder till samma format.
- **Resten av katalogen.** 12 figurer (60–500 XP), 4 avatarer, 4 profilramar,
  4 ikoner/märken, 3 dekorationer och 3 visuella effekter. Avatar, ram och märke
  syns i toppraden och profilen; figuren och dekorationen på profilsidan.
  Utrustning och temabyte kostar aldrig XP och görs per plats, så en avatar och
  en ram kan vara utrustade samtidigt.
- **Ägandet ligger i en egen tabell.** Ett köp sparar en kopia av namn, pris och
  utseende vid köptillfället. En avpublicerad produkt eller en avslutad säsong
  tar därför aldrig bort något ur samlingen, och en prisändring påverkar aldrig
  redan gjorda köp.
- **Servern äger köpet.** Migreringen `20261101000000_shop.sql` är
  icke-destruktiv: nya tabeller (`seasons`, `shop_products`, `shop_purchases`,
  `user_equipped`), `add column if not exists` och två vidgade CHECK-villkor på
  `xp_transactions`. Inga befintliga XP-, nivå- eller kontorader skrivs om.
  - `shop_purchase(product_id, idempotency_key)` prövar publicering, säsong,
    nivåkrav, ägande och saldo, låser användarens XP-rad och skriver köpet och
    den negativa XP-raden i samma anrop. Samma nyckel ger samma kvitto, och en
    samtidig dubblett besvaras med det köp som redan finns — aldrig med ett
    andra avdrag.
  - `shop_equip` / `shop_unequip` kontrollerar ägandet och kostar aldrig XP.
  - `admin_shop_save_product`, `admin_shop_set_published` och
    `admin_shop_save_season` kräver `is_admin()` i funktionen, inte bara i
    gränssnittet.
  - Säsongens tillgänglighet avgörs av `season_is_active(id)` på servern,
    aldrig av klientens klocka.
- **Shophanteringen i adminpanelen.** Menyn *Shop → Shop och säsonger* listar
  alla produkter och säsonger. En administratör kan ändra pris, nivåkrav,
  sällsynthet, kategori, säsong, bild och publicering, lägga till en produkt och
  spara säsonger — utan ny kodversion. Prisändring och avpublicering kräver en
  bekräftelse, eftersom de påverkar det eleverna ser.
- **Demoläget kan visa shopen.** Den lokala klienten har samma köpregler
  (nekade köp, exakt ett avdrag, idempotent omförsök, dubbelköp, nivåkrav och
  temabyte utan XP-kostnad), så shopen kan granskas utan databas. Demokoden
  ligger fortfarande bara i utvecklingsbygget.
- **Dokumentation.** `src-new/README.md` har ett avsnitt om shopen, temana och
  samlingen, inklusive tabellerna och funktionerna.
  `src/assets/README.md` beskriver bilderna och att licensen för motiven måste
  bekräftas innan publicering.

## Kvar att göra

| Steg | Varför |
| --- | --- |
| `git add` / `commit` | Shopen, temana, migreringen och dokumentationen är ocommittade. `.env.test` (som håller testerna borta från nätet) är ny och ska med. |
| `git tag v0.2.9` + `git push origin main v0.2.9` | Startar releasekörningen som bygger exe och msi. |
| `npx supabase db push` | Kör `20261101000000_shop.sql`. Kräver databaslösenord och ändrar det riktiga projektet — därför inte gjort härifrån. |
| `npx supabase storage cp …` | Lägger `Elda_0.2.9_x64-setup.exe` och `.msi` i den privata bucketen `elda-installers`. |
| `npx wrangler pages deploy dist --project-name elda --branch main` | Publicerar hemsidan och `update.json`; `CLOUDFLARE_API_TOKEN` saknas fortfarande i GitHub. |
| Licensgenomgång av de fem temabilderna | Se `src-new/src/assets/README.md`. |

## Verifierat

| Kontroll | Resultat |
| --- | --- |
| `npm run typecheck` i `src-new` | exit 0 |
| `npx vitest run` i `src-new` | 38 filer, 443 prov, alla gröna |
| `npm run build` i rotappen | exit 0, `dist` 8,3 MB |
| Temabilderna i bygget | `pumpa`, `spokhus`, `haxkonst`, `haunted-forest` och `midnight` som egna `.webp` i `dist/assets`, refererade från `index-*.js` |
| Temats CSS i bygget | `data-ui-tema` finns i den byggda CSS-filen |
| Demokoden i bygget | `elda-demolage` och `createDemoClient` finns inte i `dist/assets` |
| Shopen i webbläsaren (demoläge) | 35 av 35 produkter, kategoriantal 5/12/4/4/4/3/3, inga konsol- eller nätverksfel |
| Min samling i webbläsaren | tomt läge med förklaring och väg tillbaka till shopen |
| Temat i webbläsaren | `data-ui-tema="pumpa"` byter accent till `#ff9a3c` och sätter bakgrundsbilden; standardtemat återställs när attributet tas bort |

En första full testkörning gav två tidsgränser (5 s) i de tunga
Excel/PowerPoint-proven. Båda filerna gick grönt ensamma och hela sviten gick
grönt vid omkörningen, så det var kötid under parallel körning — inte ett fel i
koden. Siffrorna ovan är från den gröna hela körningen.

## Kvar och begränsningar

- **Migreringen är inte körd.** `supabase db push` kräver databaslösenord och
  ändrar det riktiga projektet, och Docker kör inte här så `supabase test db`
  gick inte. Fram till dess visar shopen ett tydligt `ERR_NOT_READY` i stället
  för tomma vyer.
- **RLS och adminavvisning är inte prövade mot en riktig databas.** Reglerna
  ligger i SQL-funktionerna (`is_admin()`, `season_is_active`,
  `shop_purchase`), men här är bara enhets- och gränssnittsnivån körd.
- **Licensen för de fem temabilderna måste bekräftas** innan publicering. Hur
  man byter motiv eller kör temat utan bild står i
  `src-new/src/assets/README.md`.
- **Ingen installerad app har uppdaterats end-to-end härifrån**, och ingen
  tagg är skapad. Det är medvetet: publiceringen startar först när du säger till.
- **Inga riktiga pengar, ingen loot och ingen ny XP-väg.** XP kommer fortfarande
  bara från slutförda uppgifter; köp är negativa `xp_transactions` med
  `source = 'shop_purchase'`.
- **Bygget varnar för chunkar över 500 kB.** Det gäller `exceljs`, `pptxgen` och
  huvudpaketet och fanns före den här versionen; ingen funktion påverkas.
