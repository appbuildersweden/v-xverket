-- Elda – Halloween-ikonerna.
--
-- Ikonarket delades upp i 48 enskilda bilder (se `scripts/dela-halloween-ikoner.py`
-- och `src/assets/halloween-ikoner/README.md`) och den här migreringen gör var
-- och en av dem till en egen belöning.
--
-- Migreringen är additiv:
--   1. Lägger till de 48 ikonbelöningarna med exakt de XP-gränser och den
--      raritet som ligger i `src/lib/halloween-icons.ts`. Ändra siffrorna där
--      och kör om den här filen — servern och gränssnittet följs åt.
--   2. Stänger av allt som inte hör till stegen, precis som
--      `20261029000000_halloween_stegen` gjorde. Nu står alla 58 belöningar i
--      listan (10 med ritad grafik + 48 ikoner).
--
-- Ingen befintlig XP och ingen tidigare upplåsning ändras: de tio första
-- belöningarna behåller sina trösklar, och raderna i `reward_unlocks` rörs inte.
-- Upplåsningen sker med samma `check_reward_unlocks` som förut, så varje ikon
-- låses upp av en slutförd uppgift precis som de andra föremålen.

-- ------------------------------------------------------- 1. Ikonbelöningarna

insert into public.reward_definitions
  (name, description, theme, position, xp_required, bonus_xp, illustration, unlocks_items, rarity, is_final, active)
values
  ('Majsgodis', 'Ett majsgodis i tre lager — det första godiset i hinken.', 'halloween', 111, 35, 0, 'ikon-majsgodis', '{ikon-majsgodis}', 'vanlig', false, true),
  ('Karamell', 'En karamell med papper som prasslar i godispåsen.', 'halloween', 112, 67, 0, 'ikon-karamell', '{ikon-karamell}', 'vanlig', false, true),
  ('Polkagris', 'En rödvit polkagris med skarpa ränder.', 'halloween', 113, 83, 0, 'ikon-polkagris', '{ikon-polkagris}', 'vanlig', false, true),
  ('Klubba', 'En klubba med virvlande mönster och långt skaft.', 'halloween', 114, 125, 0, 'ikon-klubba', '{ikon-klubba}', 'vanlig', false, true),
  ('Chokladkaka', 'En chokladkaka med rutor — lätt att dela, svår att lämna tillbaka.', 'halloween', 115, 150, 0, 'ikon-chokladkaka', '{ikon-chokladkaka}', 'vanlig', false, true),
  ('Kanderat äpple', 'Ett rött äpple med sockerlager och en kvist på toppen.', 'halloween', 116, 200, 0, 'ikon-kanderat-apple', '{ikon-kanderat-apple}', 'vanlig', false, true),
  ('Muffins', 'En muffins med orange glasyr och strössel.', 'halloween', 117, 225, 0, 'ikon-muffins', '{ikon-muffins}', 'vanlig', false, true),
  ('Godisspann', 'En liten pumpahink full av godis från kvällens runda.', 'halloween', 118, 250, 0, 'ikon-godisspann', '{ikon-godisspann}', 'vanlig', false, true),
  ('Ben', 'Ett ensamt ben med knöl i båda ändar.', 'halloween', 119, 300, 0, 'ikon-ben', '{ikon-ben}', 'vanlig', false, true),
  ('Korsade ben', 'Två ben lagda i kors.', 'halloween', 120, 325, 0, 'ikon-korsade-ben', '{ikon-korsade-ben}', 'vanlig', false, true),
  ('Spindelnät', 'Ett spindelnät vars mönster håller ihop hela hörnet.', 'halloween', 121, 350, 0, 'ikon-spindelnat', '{ikon-spindelnat}', 'vanlig', false, true),
  ('Öga', 'Ett öga med grön iris som följer den som går förbi.', 'halloween', 122, 375, 0, 'ikon-oga', '{ikon-oga}', 'vanlig', false, true),
  ('Levande ljus', 'Ett stearinljus med levande låga och smält kant.', 'halloween', 123, 425, 0, 'ikon-ljus', '{ikon-ljus}', 'ovanlig', false, true),
  ('Nyckel', 'En gammal nyckel. Ingen vet vilket lås den passar i.', 'halloween', 124, 450, 0, 'ikon-nyckel', '{ikon-nyckel}', 'ovanlig', false, true),
  ('Pergament', 'En rulle med rött sigill och text som är svår att tyda.', 'halloween', 125, 475, 0, 'ikon-pergament', '{ikon-pergament}', 'ovanlig', false, true),
  ('Gravsten', 'En sten med bokstäverna RIP och mossa i kanten.', 'halloween', 126, 500, 0, 'ikon-gravsten', '{ikon-gravsten}', 'ovanlig', false, true),
  ('Gravsten med kors', 'En gravsten med ett kors och en vit blomma.', 'halloween', 127, 525, 0, 'ikon-gravsten-kors', '{ikon-gravsten-kors}', 'ovanlig', false, true),
  ('Stenkors', 'Ett kors av huggen sten, gammalt och vittrat.', 'halloween', 128, 575, 0, 'ikon-stenkors', '{ikon-stenkors}', 'ovanlig', false, true),
  ('Träkors', 'Ett enkelt träkors, lutat av vinden.', 'halloween', 129, 600, 0, 'ikon-trakors', '{ikon-trakors}', 'ovanlig', false, true),
  ('Stenröse', 'En hög med stenar som någon har lagt till minne.', 'halloween', 130, 625, 0, 'ikon-stenrose', '{ikon-stenrose}', 'ovanlig', false, true),
  ('Järnstaket', 'Ett smitt staket med spetsar. Det håller ordning på tomten.', 'halloween', 131, 650, 0, 'ikon-staket', '{ikon-staket}', 'ovanlig', false, true),
  ('Kvast', 'En kvast med bundet ris, redo för nattens flygtur.', 'halloween', 132, 675, 0, 'ikon-kvast', '{ikon-kvast}', 'ovanlig', false, true),
  ('Häxhatt', 'En hög hatt med brett brätte och ett spänne.', 'halloween', 133, 700, 0, 'ikon-haxhatt', '{ikon-haxhatt}', 'ovanlig', false, true),
  ('Grön dryck', 'En smal flaska med grön dryck och kork.', 'halloween', 134, 750, 0, 'ikon-gron-dryck', '{ikon-gron-dryck}', 'ovanlig', false, true),
  ('Trolldryck', 'En rund flaska med lila dryck som glittrar.', 'halloween', 135, 775, 0, 'ikon-trolldryck', '{ikon-trolldryck}', 'sallsynt', false, true),
  ('Skallflaska', 'En flaska med skallen på etiketten. Receptet står ingenstans.', 'halloween', 136, 800, 0, 'ikon-skallflaska', '{ikon-skallflaska}', 'sallsynt', false, true),
  ('Trollbok', 'En bok med ett öga på omslaget som följer varje sida.', 'halloween', 137, 825, 0, 'ikon-trollbok', '{ikon-trollbok}', 'sallsynt', false, true),
  ('Trollstav', 'En stav med en stjärna i toppen som lämnar gnistor efter sig.', 'halloween', 138, 850, 0, 'ikon-trollstav', '{ikon-trollstav}', 'sallsynt', false, true),
  ('Kristallkula', 'En kula som visar dimmor i stället för framtiden.', 'halloween', 139, 875, 0, 'ikon-kristallkula', '{ikon-kristallkula}', 'sallsynt', false, true),
  ('Spindel', 'En spindel som vaktar sitt nät och aldrig släpper blicken.', 'halloween', 140, 950, 0, 'ikon-spindel', '{ikon-spindel}', 'sallsynt', false, true),
  ('Fladdermus', 'En fladdermus som flyger lågt över trädgården i skymningen.', 'halloween', 141, 975, 0, 'ikon-fladdermus', '{ikon-fladdermus}', 'sallsynt', false, true),
  ('Hängande fladdermus', 'En fladdermus som sover upp och ner under taket.', 'halloween', 142, 1000, 0, 'ikon-hangande-fladdermus', '{ikon-hangande-fladdermus}', 'sallsynt', false, true),
  ('Korp', 'En korp med gul näbb som håller ordning på trädgården.', 'halloween', 143, 1025, 0, 'ikon-korp', '{ikon-korp}', 'sallsynt', false, true),
  ('Katt med gula ögon', 'En svart katt som sitter still och ser allt som rör sig.', 'halloween', 144, 1050, 0, 'ikon-katt', '{ikon-katt}', 'sallsynt', false, true),
  ('Spöke', 'Ett litet spöke som svävar stilla och tittar nyfiket tillbaka.', 'halloween', 145, 1075, 0, 'ikon-spoke', '{ikon-spoke}', 'sallsynt', false, true),
  ('Lakan med ögon', 'Ett klassiskt lakan med två tomma ögon.', 'halloween', 146, 1100, 0, 'ikon-lakan', '{ikon-lakan}', 'sallsynt', false, true),
  ('Grön kittel', 'En kittel där det bubblar grönt, utan att någon har rört den.', 'halloween', 147, 1125, 0, 'ikon-kittel', '{ikon-kittel}', 'legendarisk', false, true),
  ('Lykta', 'En lykta med varmt ljus som brinner hela natten.', 'halloween', 148, 1150, 0, 'ikon-lykta', '{ikon-lykta}', 'legendarisk', false, true),
  ('Knotigt träd', 'Ett träd utan löv, med grenar som ser ut som fingrar.', 'halloween', 149, 1250, 0, 'ikon-trad', '{ikon-trad}', 'legendarisk', false, true),
  ('Skalle', 'En skalle med tomma ögonhålor och ett leende kvar.', 'halloween', 150, 1325, 0, 'ikon-skalle', '{ikon-skalle}', 'legendarisk', false, true),
  ('Kista', 'En träkista med kors och handtag — tom, som tur är.', 'halloween', 151, 1400, 0, 'ikon-kista', '{ikon-kista}', 'legendarisk', false, true),
  ('Pumpalykta', 'En urgröpt pumpa med lyktansikte. Ljuset inuti fladdrar när det blåser.', 'halloween', 152, 1475, 0, 'ikon-pumpalykta', '{ikon-pumpalykta}', 'legendarisk', false, true),
  ('Pumpahuvud', 'Ett pumpahuvud med glatt ansikte och ett litet ljus i botten.', 'halloween', 153, 1560, 0, 'ikon-pumpahuvud', '{ikon-pumpahuvud}', 'legendarisk', false, true),
  ('Stor pumpa', 'En rund, omålad pumpa — redo att gröpas ur.', 'halloween', 154, 1645, 0, 'ikon-stor-pumpa', '{ikon-stor-pumpa}', 'legendarisk', false, true),
  ('Vit pumpa', 'En blek pumpa som nästan lyser i mörkret.', 'halloween', 155, 1730, 0, 'ikon-vit-pumpa', '{ikon-vit-pumpa}', 'legendarisk', false, true),
  ('Två pumpor', 'En stor och en liten pumpa, sida vid sida.', 'halloween', 156, 1820, 0, 'ikon-pumpor', '{ikon-pumpor}', 'legendarisk', false, true),
  ('Spöke med armar', 'Ett spöke som sträcker armarna i vädret när det blir uppspelt.', 'halloween', 157, 1910, 0, 'ikon-spoke-armar', '{ikon-spoke-armar}', 'legendarisk', false, true),
  ('Måne', 'En månskära med en stjärna i släptåg — säsongens sista föremål.', 'halloween', 158, 2000, 0, 'ikon-mane', '{ikon-mane}', 'legendarisk', false, true)
on conflict (name) do update set
  description = excluded.description,
  theme = excluded.theme,
  position = excluded.position,
  xp_required = excluded.xp_required,
  bonus_xp = excluded.bonus_xp,
  illustration = excluded.illustration,
  unlocks_items = excluded.unlocks_items,
  rarity = excluded.rarity,
  is_final = excluded.is_final,
  active = excluded.active;

-- Allt som inte är en del av stegen stängs av. Rader och redan upplåsta föremål
-- ligger kvar — bara upplåsning och visning stängs av.
update public.reward_definitions
set active = false
where name <> all (array[
  'Lysande pumpalykta',
  'Gulligt spöke',
  'Svart katt',
  'Magisk kristall',
  'Halloween-lykta',
  'Fladdermusfigur',
  'Häxkittel',
  'Förtrollad svamp',
  'Magisk bok',
  'Sällsynt månlykta',
  'Majsgodis',
  'Karamell',
  'Polkagris',
  'Klubba',
  'Chokladkaka',
  'Kanderat äpple',
  'Muffins',
  'Godisspann',
  'Ben',
  'Korsade ben',
  'Spindelnät',
  'Öga',
  'Levande ljus',
  'Nyckel',
  'Pergament',
  'Gravsten',
  'Gravsten med kors',
  'Stenkors',
  'Träkors',
  'Stenröse',
  'Järnstaket',
  'Kvast',
  'Häxhatt',
  'Grön dryck',
  'Trolldryck',
  'Skallflaska',
  'Trollbok',
  'Trollstav',
  'Kristallkula',
  'Spindel',
  'Fladdermus',
  'Hängande fladdermus',
  'Korp',
  'Katt med gula ögon',
  'Spöke',
  'Lakan med ögon',
  'Grön kittel',
  'Lykta',
  'Knotigt träd',
  'Skalle',
  'Kista',
  'Pumpalykta',
  'Pumpahuvud',
  'Stor pumpa',
  'Vit pumpa',
  'Två pumpor',
  'Spöke med armar',
  'Måne'
]);
