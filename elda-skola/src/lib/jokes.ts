/**
 * Dagens skämt. Kuraterad lista, ingen extern tjänst. Varje kalenderdag
 * väljer samma skämt för alla användare, och skämtet byts när en ny dag börjar.
 * Skämten riktar sig aldrig mot enskilda elever eller anställda.
 */

export interface Joke {
  id: string;
  text: string;
}

const RAW_JOKES: readonly string[] = [
  'Min studiemotivation är som skolans Wi-Fi – den försvinner precis när man behöver den.',
  'Läxan är som en katt: den finns alltid i närheten när man försöker glömma den.',
  'Jag har läst hela kapitlet. Tyvärr var det kapitlet om att vänta på bussen.',
  'Det går inte att bli sen till lektionen om man aldrig har kommit hem.',
  'Matteläraren sa att svaret är “lätt”. Det var nog det enda i uppgiften som var lätt.',
  'Vi har fredagsmys varje vecka. Fredagen är bara ganska ofta.',
  'Skolmaten är som ett bra mysterium: man vet aldrig riktigt vad det är, men man äter ändå.',
  'Mitt schema är så fullt att det har fått egen mapp på datorn.',
  'Om kunskap är makt, borde kopiatorn ha fler nycklar än rektorn.',
  'Den bästa ursäkten för sen inlämning är att datorn också ville ha paus.',
  'Att ha prov på måndag är som att få en kalender med en särskild dag markerad i rött.',
  'Det är inte fusk om man kallar det “jämförande studier”, eller hur?',
  'Jag tog en kaffepaus. Kaffet tog ingen paus, och det känns ganska orättvist.',
  'Lektionen började 08:15. Min hjärna började 10:30. Vi möttes i mitten, ungefär 09:20.',
  'Mitt favoritämne är rasten. Den har bäst betyg och ingen läxa.',
  'Vi lärde oss om tyngdlagen. Sedan föll mitt humör direkt efter provet.',
  'Man borde få extra poäng för att komma fram till skolan utan att ramla i trappan.',
  'Den som säger att lärarna inte har humor har aldrig sett en lärare försöka använda ett emoji.',
  'Det finns två sorters människor: de som gör läxan i tid och de som hittar den i väskan på torsdagen.',
  'Min dator har två lägen: “jobbar” och “uppdaterar”. Just nu kör den uppdatera.',
  'Jag googlade “snabbaste vägen genom läxan”. Det gav mig tre timmars videor om allt annat.',
  'Varför sitter eleverna alltid längst bak? För att framtiden är ännu inte bestämd.',
  'Gympaläraren sa “värm upp”. Jag värmde upp soffan i ungefär en timme.',
  'Det är svårt att vara ledig när kalendern påminner en om att man är upptagen.',
  'Historia handlar om det som hänt. Det är därför prov alltid har ett datum.',
  'Jag tog en snabb titt på uppgiften. Den tittade tillbaka på mig med samma blick.',
  'Ett bra studietips: börja i tid. Ett ännu bättre: börja i tid igen nästa vecka.',
  'Det är konstigt med kopiatorer. De fungerar alltid när man inte behöver dem.',
  'Min energinivå är ungefär som batteriet i en miniräknare: den räcker oväntat länge och tar sedan slut helt plötsligt.',
  'Vi har en skolgård. Den är stor, men fotbollen hittar alltid den lilla gruppen.',
  'Det sägs att kunskap är ljus. Då är skolans lampor ganska dåligt dimmade på torsdagar.',
  'Fyra och en halv timme sömn, men jag klarade den snyggaste utvecklingen i hela klassen.',
  'Jag brukar säga att jag har koll på läget. Läget har inte koll på mig.',
  'Att hitta rätt sal är en övning i geografi, logik och ren tur.',
  'Ordvits: Varför var boken så trött? Den hade läst för mycket.',
  'Ordvits: Vad sa pennan till suddgummit? “Du är ju alltid ute efter att radera mig.”',
  'Ordvits: Vilken fisk är bäst i matte? Den som kan räkna med sina fjäll.',
  'Ordvits: Varför är geometri alltid lugn? För att den har fasta vinklar.',
  'Ordvits: Vad heter en kemilärare som skrattar? En reaktion.',
  'Ordvits: Vad sa 0:an till 8:an? “Snygg bälte.”',
  'Ordvits: Varför gillar engelska ord att gå på bio? För att de har så många subtitlar.',
  'Ordvits: Vad är det svåraste med ett skolbibliotek? Att hålla reda på alla bokmärken.',
  'Tre saker jag lärt mig i skolan: hur man sover med öppna ögon, hur man ser upptagen ut och hur man låtsas förstå.',
  'Rasten är den enda lektion där alla verkligen är närvarande.',
  'Lärare säger “vi tar det på lektionen”. Eleverna hörde “vi tar det aldrig”.',
  'Jag hade planerat att göra läxan i bussen. Bussen hade planerat något annat.',
  'Måndagar borde vara frivilliga. Helst med en extra dag mellan lördag och söndag.',
  'Vi hade vikarie idag. Hon hade en egen plan och ett eget schema, och det var bäst.',
  'Hur många elever krävs för att byta en glödlampa? Ingen. Någon har säkert redan ordnat det med en quiz.',
  'Det värsta med prov är inte frågorna. Det är att facit alltid har en plats i tanken.',
  'Min mobil är så ofta på lektionen att den borde få sitta med på närvarolistan.',
  'Jag vill inte säga att skolan är svår, men även kaffeautomaten har gett upp på torsdagar.',
  'Det är ingen som går hem med ett 10-poängsbetyg i paus. Men någon har försökt.',
  'Om man vänder på dagen vänder man också på läxan. Så det funkar jättebra, tänker jag.',
  'Idrottsdagen är en fin tradition: alla springer lika fort, särskilt när det regnar.',
  'Förmiddagskaffe gör mer för klassrumsstämningen än någon pedagogisk modell.',
  'Den bästa idén kommer alltid precis efter att provet är slut.',
  'Vi övade på presentationen tills den blev perfekt. Sedan kom datorn och sa “ingen anslutning”.',
  'Det finns två typer av lektioner: de som går fort och de som bara verkar göra det.',
  'En bra lärare ger mycket. En riktigt bra lärare får också fram det där extra skrattet.',
  'Jag har fått en lärdom av kursen: alla rutiner är bra tills man glömmer lösenordet.',
  'Det är svårt att vara cool på lektionen när stolen gnisslar i varje rörelse.',
  'Skolresan blev bra. Bussen var sen, men humöret var tidigt uppe.',
  'Nyheten på skolan är att det inte längre finns någon nyhet. Vi får se om det håller i sig.',
  'Att få en påminnelse om deadline är faktiskt ganska praktiskt. Mer än att få den samma dag.',
  'Det bästa med en tisdag är att den inte är en måndag. Det sämsta är att den inte är en torsdag.',
];

/** Deterministisk blandning så att ordningen inte följer listans skrivordning. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const JOKES: readonly Joke[] = shuffle(RAW_JOKES, 20261020).map((text, index) => ({
  id: `joke-${index + 1}`,
  text,
}));

/** Antal dagar sedan 1970-01-01 för ett lokalt kalenderdatum. */
export function dayNumber(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(utc / 86_400_000);
}

/** Dagens skämt. Samma skämt hela kalenderdagen, och nästa skämt nästa dag. */
export function jokeForDay(date: Date, jokes: readonly Joke[] = JOKES): Joke {
  if (jokes.length === 0) throw new RangeError('Skämtlistan är tom');
  const index = ((dayNumber(date) % jokes.length) + jokes.length) % jokes.length;
  return jokes[index];
}
