# Elda 0.2.10 – shopen växer: två teman och 19 nya föremål

**Status: publicerad 18 oktober 2026.** Commit `269df2c`, tagg `v0.2.10` och
releasekörning 39161141725 är gröna. Hemsida, uppdateringsmanifest och
installationsfiler är publicerade; databasmigreringen återstår (se *Kvar att
göra*).

## Vad som ändrades

- **19 nya föremål i shopen.** Katalogen går från 35 till 54 produkter i sju
  kategorier. Alla priser är fortfarande hela XP som eleven redan tjänat in på
  uppgifter — inga riktiga pengar, ingen loot och ingen ny XP-väg.
- **Två nya UI-teman.** *Ghostly Moonlight* (550 XP, nivå 3) och *Candy Crypt*
  (350 XP, nivå 2). Båda är kompletta teman: palett, ytor, knappar, meny,
  rubriker, fokusmarkering och bakgrund. De ritar bakgrunden med gradienter i
  stället för en bildfil, så de har ingen extern resurs som kan försvinna och
  inga licensfrågor att reda ut.
- **Fyra nya profilramar.** *Spökgloet* (200 XP), *Fladdermusvingar* (240 XP),
  *Trolldomsramen* (320 XP) och *Godisstången* (120 XP), alla med egen kant,
  glöd och ornament runt avataren.
- **Fyra nya avatarer.** Spökavatar, Pumpalyktsavatar, Häxavatar och
  Godisspannsavatar (120–200 XP).
- **Fyra nya märken.** *Pumpaskördaren*, *Spökjägaren*, *Midnattsvandraren* och
  *Godissamlaren* (80–320 XP), som visas bredvid namnet i toppraden och på
  profilen.
- **Fem nya dekorationer.** Ljuslyktan, Kristallerna, Spökbesöket,
  Nattfladdermusen och Månskivan (60–320 XP) på profilsidan.
- **Förhandsvisningen klarar teman utan bild.** Ett tema som bara är en gradient
  visar sin egen bakgrund i butikens prov i stället för en tom yta.
- **Ingen ny skrivväg.** De nya produkterna går genom samma `shop_purchase`,
  `shop_equip`/`shop_unequip` och adminfunktioner som de gamla. Servern prövar
  pris, nivå, säsong, saldo och ägande; klienten räknar aldrig ut något av det.

## Katalogen efter 0.2.10

| Kategori | Antal |
| --- | --- |
| UI-teman | 7 |
| Figurer | 12 |
| Avatarer | 8 |
| Profilramar | 8 |
| Ikoner och märken | 8 |
| Dekorationer | 8 |
| Visuella effekter | 3 |
| **Totalt** | **54** |

## Databasen

De 19 nya raderna ligger i `supabase/migrations/20261102000000_shop_utokning.sql`,
som bygger vidare på `20261101000000_shop.sql`. Migreringen är additiv: den
lägger bara till produkter i `shop_products` (`on conflict (slug) do update`) och
rör inga konton, XP-rader, köp eller utrustning.

## Verifierat före taggen

- `npx tsc --noEmit` i `src-new/`: exit 0.
- `npx vitest run` i `src-new/`: 445 tester i 38 filer, gröna. Bland dem att
  varje katalogpost finns i någon av de två migreringarna, att ingen slug fröas
  två gånger, att varje temanyckel har ett CSS-block och att varje sålt föremål
  har en bild i projektet.
- `npm run build`: exit 0.
- Demoläget i webbläsaren: 54 av 54 produktkort, kategoriantalen
  7/12/8/8/8/8/3, Candy Crypt-provet visar gradient, båda nya temana ger nya
  beräknade färger, inga konsol- eller nätverksfel.

## Publicerat och kontrollerat

| Del | Resultat |
| --- | --- |
| Releasekörning | 39161141725 – grön, jobbet `release` utan felande steg |
| GitHub Release | `v0.2.10`: exe 9 554 086 B, msi 10 829 824 B, båda signaturerna, `latest.json` |
| Hemsida | https://elda-6a9.pages.dev visar **VERSION 0.2.10**; historiken toppar `v0.2.10` med texten *Shopen växer* |
| Uppdatering | `update.json` = 0.2.10; `scripts/kontrollera-uppdatering.mjs` exit 0 (version, signatur och nedladdningsbar fil) |
| Privat bucket | `elda-installers` har 0.2.10 exe och msi; `download`-funktionens `info` svarar 0.2.10; anonymt anrop ger 401 |
| Riktig installation | 0.2.9 upptäckte 0.2.10, laddade ner 9 554 086 byte med godkänd signatur och installerade; registret och `app.exe` visar 0.2.10 |

### Webbplatsen publicerades manuellt

Releaseflödet hoppade över stegen för webbplatsen: `secrets.CLOUDFLARE_API_TOKEN`
är inte satt i repo:t, så `PUBLISH_SITE` blev false och både
webbplatsbygget, publiceringen och manifestkontrollen hoppades över. Därför
byggdes `site/dist` från en ren worktree på taggen och publicerades med
`npx wrangler pages deploy` – samma bygge som flödet gör – och
installationsfilerna lades i den privata bucketen med `supabase storage cp`.
Sätt tillbaka `CLOUDFLARE_API_TOKEN` och `CLOUDFLARE_ACCOUNT_ID` som secrets så
sköter flödet publiceringen själv nästa gång.

## Kvar att göra

- **Ingen av shopmigreringarna är körd.** Utan `SUPABASE_DB_PASSWORD` kan
  `supabase db push` inte köras härifrån, och tills den är körd visar shopen
  `ERR_NOT_READY` i den publicerade appen. Övriga delar av appen påverkas inte.
- **Intjänade profil-märken finns inte.** Butikens märken är köpbara; de föremål
  som tjänas genom riktig aktivitet är trädgårdens belöningsstege. Ingen
  låtsas-intjänad märkesrad har lagts till.
