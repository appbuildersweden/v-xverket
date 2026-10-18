# Ikonerna i Halloween-samlingen

De 48 ikonerna kommer från ett ikonark som användaren skickade in. Arket delades
upp i en bild per ikon, och varje ikon är nu en egen belöning i Halloween-stegen.

## Så togs bilderna fram

```bash
python scripts/dela-halloween-ikoner.py <arket.png> <målkatalog>
```

Skriptet letar upp ikonraderna (rubriker och sidfotstext hoppas över eftersom de
består av smala bokstäver), delar varje rad i enskilda ikoner och skriver varje
ikon som en egen PNG. Bakgrundsfärgen tas bort genom att fylla från bildens kant,
så bara bakgrund som hänger ihop med kanten blir genomskinlig — hål inuti ett
motiv (till exempel mellan staketets spjälor) behåller motivet intakt.

Arket gav **48 ikoner**: 5 pumpor, 8 varelser, 8 godis, 8 häx- och magisaker,
9 kyrkogårdsting och 10 mörka dekorationer. Varje beskärning innehåller hela
motivet, inga grannikoner och har transparent bakgrund.

Filnamnet är samma sak som nyckeln i `src/lib/halloween-icons.ts`:
`ikon-majsgodis.png` hör till nyckeln `ikon-majsgodis`. Prefixet `ikon-` gör att
en ikonnyckel aldrig kan krocka med nycklarna för den ritade grafiken i
`src/lib/season.ts` (som `spoke`, `katt` och `lykta`), vilket testas i
`src/lib/halloween-icons.test.ts`.

## Ikonerna

| # | Rad i arket | Namn i appen | Nyckel | XP | Raritet | Storlek |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | PUMPKINS | Pumpalykta | `ikon-pumpalykta` | 1475 | legendarisk | 93×75 |
| 02 | PUMPKINS | Pumpahuvud | `ikon-pumpahuvud` | 1560 | legendarisk | 93×69 |
| 03 | PUMPKINS | Stor pumpa | `ikon-stor-pumpa` | 1645 | legendarisk | 90×87 |
| 04 | PUMPKINS | Vit pumpa | `ikon-vit-pumpa` | 1730 | legendarisk | 78×66 |
| 05 | PUMPKINS | Två pumpor | `ikon-pumpor` | 1820 | legendarisk | 96×84 |
| 06 | CREATURES | Spöke | `ikon-spoke` | 1075 | sallsynt | 66×87 |
| 07 | CREATURES | Spöke med armar | `ikon-spoke-armar` | 1910 | legendarisk | 87×81 |
| 08 | CREATURES | Lakan med ögon | `ikon-lakan` | 1100 | sallsynt | 87×87 |
| 09 | CREATURES | Fladdermus | `ikon-fladdermus` | 975 | sallsynt | 93×57 |
| 10 | CREATURES | Hängande fladdermus | `ikon-hangande-fladdermus` | 1000 | sallsynt | 84×96 |
| 11 | CREATURES | Spindel | `ikon-spindel` | 950 | sallsynt | 84×96 |
| 12 | CREATURES | Katt med gula ögon | `ikon-katt` | 1050 | sallsynt | 81×93 |
| 13 | CREATURES | Korp | `ikon-korp` | 1025 | sallsynt | 96×75 |
| 14 | CANDY & TREATS | Majsgodis | `ikon-majsgodis` | 35 | vanlig | 63×81 |
| 15 | CANDY & TREATS | Karamell | `ikon-karamell` | 67 | vanlig | 93×51 |
| 16 | CANDY & TREATS | Polkagris | `ikon-polkagris` | 83 | vanlig | 75×75 |
| 17 | CANDY & TREATS | Klubba | `ikon-klubba` | 125 | vanlig | 63×93 |
| 18 | CANDY & TREATS | Kanderat äpple | `ikon-kanderat-apple` | 200 | vanlig | 69×87 |
| 19 | CANDY & TREATS | Chokladkaka | `ikon-chokladkaka` | 150 | vanlig | 63×75 |
| 20 | CANDY & TREATS | Godisspann | `ikon-godisspann` | 250 | vanlig | 75×84 |
| 21 | CANDY & TREATS | Muffins | `ikon-muffins` | 225 | vanlig | 63×90 |
| 22 | WITCH & MAGIC | Häxhatt | `ikon-haxhatt` | 700 | ovanlig | 87×87 |
| 23 | WITCH & MAGIC | Kvast | `ikon-kvast` | 675 | ovanlig | 90×90 |
| 24 | WITCH & MAGIC | Trolldryck | `ikon-trolldryck` | 775 | sallsynt | 63×87 |
| 25 | WITCH & MAGIC | Grön dryck | `ikon-gron-dryck` | 750 | ovanlig | 39×93 |
| 26 | WITCH & MAGIC | Skallflaska | `ikon-skallflaska` | 800 | sallsynt | 63×87 |
| 27 | WITCH & MAGIC | Trollbok | `ikon-trollbok` | 825 | sallsynt | 72×81 |
| 28 | WITCH & MAGIC | Kristallkula | `ikon-kristallkula` | 875 | sallsynt | 69×81 |
| 29 | WITCH & MAGIC | Trollstav | `ikon-trollstav` | 850 | sallsynt | 87×90 |
| 30 | GRAVEYARD | Gravsten | `ikon-gravsten` | 500 | ovanlig | 66×90 |
| 31 | GRAVEYARD | Stenkors | `ikon-stenkors` | 575 | ovanlig | 69×87 |
| 32 | GRAVEYARD | Gravsten med kors | `ikon-gravsten-kors` | 525 | ovanlig | 54×87 |
| 33 | GRAVEYARD | Stenröse | `ikon-stenrose` | 625 | ovanlig | 78×69 |
| 34 | GRAVEYARD | Träkors | `ikon-trakors` | 600 | ovanlig | 69×90 |
| 35 | GRAVEYARD | Kista | `ikon-kista` | 1400 | legendarisk | 87×135 |
| 36 | GRAVEYARD | Järnstaket | `ikon-staket` | 650 | ovanlig | 141×93 |
| 37 | GRAVEYARD | Knotigt träd | `ikon-trad` | 1250 | legendarisk | 162×183 |
| 38 | GRAVEYARD | Måne | `ikon-mane` | 2000 | legendarisk | 78×75 |
| 39 | DARK DECOR | Grön kittel | `ikon-kittel` | 1125 | legendarisk | 87×90 |
| 40 | DARK DECOR | Levande ljus | `ikon-ljus` | 425 | ovanlig | 69×93 |
| 41 | DARK DECOR | Lykta | `ikon-lykta` | 1150 | legendarisk | 57×90 |
| 42 | DARK DECOR | Skalle | `ikon-skalle` | 1325 | legendarisk | 69×75 |
| 43 | DARK DECOR | Korsade ben | `ikon-korsade-ben` | 325 | vanlig | 90×90 |
| 44 | DARK DECOR | Ben | `ikon-ben` | 300 | vanlig | 90×78 |
| 45 | DARK DECOR | Öga | `ikon-oga` | 375 | vanlig | 69×84 |
| 46 | DARK DECOR | Spindelnät | `ikon-spindelnat` | 350 | vanlig | 93×93 |
| 47 | DARK DECOR | Nyckel | `ikon-nyckel` | 450 | ovanlig | 87×87 |
| 48 | DARK DECOR | Pergament | `ikon-pergament` | 475 | ovanlig | 63×81 |

## Dubbletter

De två andra bilderna innehöll inga nya ikoner:

* **Bild 2** (arket med tolv ikoner i två rader) visar tolv ikoner — pumpa, spöke,
  skallflaska, godisspann, trollbok, svart katt, skalle, kittel, klubba,
  kristallkula, fladdermus och ljus. Alla finns redan bland de 48 och matchar dem
  med 0,93–1,00 i normaliserad korskorrelation.
* **Bild 3** (kvällsscenen) är byggd av samma ikoner: spöken, spindel,
  fladdermöss, måne, träd, korp, katt, staket, gravstenar, kors, pumpor, ljus,
  godisspann, kittel, hatt och majsgodis. Alla träffar bland de 48 (scenens
  största figurer med 0,82–0,96).

Kontrollen görs med:

```bash
python scripts/jamfor-halloween-ikoner.py src/assets/halloween-ikoner <bild.png>
```

Skriptet letar upp varje ikon i målbilden i flera skalor och skriver en
`-matchad.png` där träffarna är inramade, så att resultatet går att kontrollera
med ögat.

## Så visas ikonerna

Ikonerna är pixelbilder och ritas i sin egen storlek, aldrig uppskalade
(`image-rendering: pixelated` i `styles/halloween.css`). Bilderna är små nog att
Vite bäddar in dem i appens paket, så de följer med både i webbversionen och i den
installerade appen utan separata filhämtningar.

Vill du byta ut en ikon: ersätt PNG-filen med samma namn. Vill du lägga till en
ikon: lägg filen i den här mappen och lägg till en post i
`src/lib/halloween-icons.ts` samt kör migreringen `halloween_ikoner`.
