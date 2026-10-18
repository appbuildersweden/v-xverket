/**
 * Exempeldata för demoläget.
 *
 * Allt här är påhittat och finns bara i utvecklingsbygget. Det skrivs aldrig
 * till Supabase, läses aldrig därifrån och försvinner när sidan laddas om.
 * Kontot heter `demoelev` just för att ingen ska kunna ta siffrorna för riktiga
 * framsteg: demoläget visar hur gränssnittet ser ut, inte vad eleven har gjort.
 *
 * Modulen importeras bara av `demoklient.ts`, som i sin tur bara laddas med en
 * dynamisk import när demoläget begärs — koden hamnar därför aldrig i en vanlig
 * produktionsanvändning.
 */

import { HALLOWEEN_REWARDS } from '../lib/halloween-rewards';

export type DemoRow = Record<string, unknown>;
export type DemoTables = Record<string, DemoRow[]>;

/** Användaren demoläget loggar in som. */
export const DEMO_UID = 'demo-privat-elev';

/**
 * Minimal, Supabase-lik användare. Roll och kontotyp ligger i `app_metadata`
 * precis som i den riktiga appen, så `mapUser` tolkar kontot som en privat elev
 * — ingen autentisering kringgås, det finns bara ingen server att fråga.
 */
export const DEMO_USER = {
  id: DEMO_UID,
  email: 'demoelev@demo.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-08-17T08:00:00.000Z',
  app_metadata: {
    role: 'elev',
    account_type: 'privat',
    active: true,
    username: 'demoelev',
  },
  user_metadata: {},
};

const DAY = 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Datum `offset` dagar från idag, som ÅÅÅÅ-MM-DD. */
function day(offset: number): string {
  const date = new Date(startOfToday().getTime() + offset * DAY);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

/** Tidsstämpel `offset` dagar (och timmar) från nu. */
function stamp(offsetDays: number, hours = 0): string {
  return new Date(Date.now() + offsetDays * DAY + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Bygger en färsk uppsättning tabeller. Anropas en gång per session, så att
 * ändringar i demoläget bara lever i minnet och aldrig kan blandas ihop med
 * riktig data.
 */
export function buildDemoTables(): DemoTables {
  return {
    profiles: [
      {
        id: DEMO_UID,
        username: 'demoelev',
        role: 'elev',
        account_type: 'privat',
        active: true,
        created_at: '2026-08-17T08:00:00.000Z',
      },
    ],

    // Planering: elevens egna studiepass. En försenad, en idag, några framåt
    // och en avklarad — så att grupperingar, räknare och kalendern syns.
    spec_tasks: [
      {
        id: 'demo-task-1',
        user_id: DEMO_UID,
        title: 'Repetera derivata – kedjeregeln',
        description: 'Kapitel 4, uppgift 12–18. Skriv ned varje steg.',
        notes: null,
        due_date: day(0),
        priority: 'hog',
        status: 'pagar',
        category: 'Matematik',
        completed_at: null,
        xp_awarded: false,
        created_at: stamp(-3),
        updated_at: stamp(0, -2),
      },
      {
        id: 'demo-task-2',
        user_id: DEMO_UID,
        title: 'Skriv utkast till debattartikeln',
        description: 'Minst 400 ord, tydlig tes i första stycket.',
        notes: 'Kolla källhänvisningarna innan inlämning.',
        due_date: day(-2),
        priority: 'hog',
        status: 'ej_paborjad',
        category: 'Svenska',
        completed_at: null,
        xp_awarded: false,
        created_at: stamp(-6),
        updated_at: stamp(-6),
      },
      {
        id: 'demo-task-3',
        user_id: DEMO_UID,
        title: 'Plugga 40 glosor inför provet',
        description: 'Använd kortleken i Flashcards och repetera de svåraste först.',
        notes: null,
        due_date: day(3),
        priority: 'medel',
        status: 'ej_paborjad',
        category: 'Engelska',
        completed_at: null,
        xp_awarded: false,
        created_at: stamp(-1),
        updated_at: stamp(-1),
      },
      {
        id: 'demo-task-4',
        user_id: DEMO_UID,
        title: 'Läs kapitel 4 om välfärdsmodeller',
        description: 'Anteckna tre skillnader mellan de nordiska och liberala modellerna.',
        notes: null,
        due_date: day(5),
        priority: 'medel',
        status: 'ej_paborjad',
        category: 'Samhällskunskap',
        completed_at: null,
        xp_awarded: false,
        created_at: stamp(-2),
        updated_at: stamp(-2),
      },
      {
        id: 'demo-task-5',
        user_id: DEMO_UID,
        title: 'Gör klart övningsprov 2',
        description: 'Tidsgräns 45 minuter, som på det riktiga provet.',
        notes: null,
        due_date: day(2),
        priority: 'medel',
        status: 'ej_paborjad',
        category: 'Matematik',
        completed_at: null,
        xp_awarded: false,
        created_at: stamp(-8),
        updated_at: stamp(-1, 3),
      },
      {
        id: 'demo-task-6',
        user_id: DEMO_UID,
        title: 'Sammanfatta laborationen om vattnets kretslopp',
        description: null,
        notes: 'Halva texten finns i anteckningsblocket.',
        due_date: null,
        priority: 'lag',
        status: 'ej_paborjad',
        category: 'Naturkunskap',
        completed_at: null,
        xp_awarded: false,
        created_at: stamp(-4),
        updated_at: stamp(-4),
      },
    ],

    // En privat elev har ingen lärare som delar ut uppgifter. Tabellen är
    // medvetet tom, så att "Mina uppgifter" visar sitt korrekta tomläge i
    // stället för påhittade lärauppgifter.
    student_tasks: [],

    documents: [
      {
        id: 'demo-doc-1',
        owner_id: DEMO_UID,
        title: 'Formelblad – derivata och integraler',
        description: 'Egen sammanställning inför provet.',
        subject: 'Matematik',
        storage_path: `${DEMO_UID}/demo-formelblad.pdf`,
        mime_type: 'application/pdf',
        size_bytes: 482_310,
        student_id: DEMO_UID,
        class_id: null,
        task_id: null,
        created_at: stamp(-5),
      },
      {
        id: 'demo-doc-2',
        owner_id: DEMO_UID,
        title: 'Utkast – debattartikel om skärmtid',
        description: null,
        subject: 'Svenska',
        storage_path: `${DEMO_UID}/demo-debattartikel.docx`,
        mime_type:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size_bytes: 38_912,
        student_id: DEMO_UID,
        class_id: null,
        task_id: null,
        created_at: stamp(-2),
      },
      {
        id: 'demo-doc-3',
        owner_id: DEMO_UID,
        title: 'Ordlista – oregelbundna verb',
        description: 'De 60 vanligaste verben, med exempelmeningar.',
        subject: 'Engelska',
        storage_path: `${DEMO_UID}/demo-ordlista.csv`,
        mime_type: 'text/csv',
        size_bytes: 12_480,
        student_id: DEMO_UID,
        class_id: null,
        task_id: null,
        created_at: stamp(-9),
      },
      {
        id: 'demo-doc-4',
        owner_id: DEMO_UID,
        title: 'Anteckningar – välfärdsmodeller',
        description: null,
        subject: 'Samhällskunskap',
        storage_path: `${DEMO_UID}/demo-valfard.txt`,
        mime_type: 'text/plain',
        size_bytes: 8_214,
        student_id: DEMO_UID,
        class_id: null,
        task_id: null,
        created_at: stamp(-3),
      },
    ],

    flashcard_decks: [
      {
        id: 'demo-deck-1',
        owner_id: DEMO_UID,
        title: 'Derivata – regler och begrepp',
        subject: 'Matematik',
        is_shared: false,
        created_at: stamp(-7),
        updated_at: stamp(-1),
      },
      {
        id: 'demo-deck-2',
        owner_id: DEMO_UID,
        title: 'Oregelbundna verb',
        subject: 'Engelska',
        is_shared: false,
        created_at: stamp(-12),
        updated_at: stamp(-4),
      },
      {
        id: 'demo-deck-3',
        owner_id: 'demo-shared-owner',
        title: 'Litterära begrepp',
        subject: 'Svenska',
        is_shared: true,
        created_at: stamp(-20),
        updated_at: stamp(-20),
      },
    ],

    flashcards: [
      {
        id: 'demo-card-1',
        deck_id: 'demo-deck-1',
        question: 'Vad säger kedjeregeln?',
        answer: 'Att derivatan av en sammansatt funktion är yttre derivatan gånger inre derivatan.',
        position: 0,
        created_at: stamp(-7),
      },
      {
        id: 'demo-card-2',
        deck_id: 'demo-deck-1',
        question: 'Derivatan av sin x?',
        answer: 'cos x',
        position: 1,
        created_at: stamp(-7),
      },
      {
        id: 'demo-card-3',
        deck_id: 'demo-deck-1',
        question: 'Vad betyder det att en funktion är deriverbar i en punkt?',
        answer: 'Att gränsvärdet för ändringskvoten finns i punkten — kurvan har en väldefinierad tangentlinje där.',
        position: 2,
        created_at: stamp(-6),
      },
      {
        id: 'demo-card-4',
        deck_id: 'demo-deck-1',
        question: 'Derivatan av e^(kx)?',
        answer: 'k · e^(kx)',
        position: 3,
        created_at: stamp(-6),
      },
      {
        id: 'demo-card-5',
        deck_id: 'demo-deck-1',
        question: 'Vad är en stationär punkt?',
        answer: 'En punkt där derivatan är noll. Den kan vara ett maximum, ett minimum eller en terrasspunkt.',
        position: 4,
        created_at: stamp(-5),
      },
      {
        id: 'demo-card-6',
        deck_id: 'demo-deck-2',
        question: 'go – went – ?',
        answer: 'gone',
        position: 0,
        created_at: stamp(-12),
      },
      {
        id: 'demo-card-7',
        deck_id: 'demo-deck-2',
        question: 'take – took – ?',
        answer: 'taken',
        position: 1,
        created_at: stamp(-12),
      },
      {
        id: 'demo-card-8',
        deck_id: 'demo-deck-2',
        question: 'write – wrote – ?',
        answer: 'written',
        position: 2,
        created_at: stamp(-12),
      },
      {
        id: 'demo-card-9',
        deck_id: 'demo-deck-3',
        question: 'Vad är en diktare?',
        answer: 'Berättarens röst i en dikt — inte samma sak som författaren.',
        position: 0,
        created_at: stamp(-20),
      },
      {
        id: 'demo-card-10',
        deck_id: 'demo-deck-3',
        question: 'Vad kallas en radbrytning som skapar en paus mitt i meningen?',
        answer: 'Cesur.',
        position: 1,
        created_at: stamp(-20),
      },
    ],

    // Inga kort är repeterade än — demoläget börjar från samma nolläge som en ny elev.
    flashcard_progress: [],

    quiz_sets: [
      {
        id: 'demo-quiz-1',
        owner_id: DEMO_UID,
        title: 'Matematik 2b – derivata',
        subject: 'Matematik',
        description: 'Fyra frågor om regler, tangenter och stationära punkter.',
        is_shared: false,
        created_at: stamp(-6),
        updated_at: stamp(-6),
      },
      {
        id: 'demo-quiz-2',
        owner_id: 'demo-shared-owner',
        title: 'Engelska – ordkunskap',
        subject: 'Engelska',
        description: 'Delad övning med vanliga ord och uttryck.',
        is_shared: true,
        created_at: stamp(-15),
        updated_at: stamp(-15),
      },
    ],

    quiz_questions: [
      {
        id: 'demo-question-1',
        set_id: 'demo-quiz-1',
        prompt: 'Vad är derivatan av f(x) = 3x²?',
        options: ['6x', '3x', 'x²', '6x²'],
        correct_index: 0,
        explanation: 'Potensregeln: derivatan av x² är 2x, alltså 3 · 2x = 6x.',
        position: 0,
        created_at: stamp(-6),
      },
      {
        id: 'demo-question-2',
        set_id: 'demo-quiz-1',
        prompt: 'Vad innebär det att f\'(a) = 0?',
        options: [
          'Funktionen är alltid noll i a',
          'Tangenten i a är horisontell',
          'Funktionen är inte definierad i a',
          'Kurvan skär x-axeln i a',
        ],
        correct_index: 1,
        explanation: 'En derivata som är noll ger en horisontell tangent — en stationär punkt.',
        position: 1,
        created_at: stamp(-6),
      },
      {
        id: 'demo-question-3',
        set_id: 'demo-quiz-1',
        prompt: 'Vilken är derivatan av f(x) = e^(2x)?',
        options: ['e^(2x)', '2e^(2x)', 'e^(x)', '2x · e^(2x)'],
        correct_index: 1,
        explanation: 'Kedjeregeln ger e^(2x) · 2.',
        position: 2,
        created_at: stamp(-6),
      },
      {
        id: 'demo-question-4',
        set_id: 'demo-quiz-1',
        prompt: 'Vad beskriver andraderivatan?',
        options: [
          'Kurvans lutning',
          'Kurvans krökning',
          'Kurvans skärning med y-axeln',
          'Funktionens nollställen',
        ],
        correct_index: 1,
        explanation: 'Andraderivatan anger hur lutningen förändras, alltså krökningen.',
        position: 3,
        created_at: stamp(-6),
      },
      {
        id: 'demo-question-5',
        set_id: 'demo-quiz-2',
        prompt: 'Vad betyder "to look something up"?',
        options: ['Att se ner', 'Att slå upp något', 'Att se upp till någon', 'Att titta bort'],
        correct_index: 1,
        explanation: 'Att slå upp ett ord eller en uppgift, till exempel i en ordbok.',
        position: 0,
        created_at: stamp(-15),
      },
    ],

    // En helt färsk elev har inte gjort några prov än, så framstegen börjar på noll.
    quiz_attempts: [],

    user_xp: [{ user_id: DEMO_UID, total_xp: 0 }],
    reward_settings: [{ key: 'xp_per_level', value: 100 }],

    // Halloween-stegen. Trösklarna och nycklarna kommer från
    // `lib/halloween-rewards.ts`, så demoläget visar exakt samma nivåer som
    // servern använder. Inga andra teman är aktiva i gränssnittet.
    reward_definitions: HALLOWEEN_REWARDS.map((reward) => ({
      id: `demo-${reward.artKey}`,
      name: reward.name,
      description: reward.description,
      theme: 'halloween',
      position: reward.position,
      xp_required: reward.xpRequired,
      bonus_xp: 0,
      illustration: reward.artKey,
      unlocks_items: [reward.itemKey],
      rarity: reward.rarity,
      is_final: false,
      active: true,
    })),

    // Nollställt läge: inga belöningar är uppnådda och ingen XP är intjänad.
    // På så sätt kan demoläget visa hela resan från 0 XP och första låsta mål.
    reward_unlocks: [],

    // Trädgården börjar tom. Första upplåsta föremålet blir det första man ser.
    garden_placements: [],

    xp_transactions: [],
  };
}

/** Ett tydligt AI-svar i demoläget — aldrig förväxlat med ett riktigt svar. */
export const DEMO_AI_ANSWER = `Det här är ett exempelsvar i demoläget, inte ett svar från AI-tjänsten.

Så här kan en förklaring se ut, steg för steg:

1. Börja med att skriva ned det du vet om uppgiften.
2. Dela upp problemet i mindre delar och ta en i taget.
3. Kontrollera svaret mot ett enklare exempel.

I det riktiga läget kommer svaret från Eldas AI-studiehjälp och anpassas efter din fråga.`;

/** Strukturerat exempelsvar när demoläget ska bygga ett Office-dokument. */
export function demoDocAnswer(kind: string): string {
  if (kind === 'excel') {
    return JSON.stringify({
      title: 'Studieplan – exempel',
      sheets: [
        {
          name: 'Vecka 1',
          columns: ['Dag', 'Ämne', 'Uppgift', 'Minuter'],
          rows: [
            ['Måndag', 'Matematik', 'Kedjeregeln', 40],
            ['Tisdag', 'Svenska', 'Debattartikel', 45],
            ['Onsdag', 'Engelska', 'Glosor', 20],
            ['Torsdag', 'Samhällskunskap', 'Kapitel 4', 30],
          ],
        },
      ],
    });
  }
  if (kind === 'powerpoint') {
    return JSON.stringify({
      title: 'Derivata – exempel',
      subtitle: 'En kort genomgång',
      slides: [
        {
          title: 'Vad är en derivata?',
          bullets: ['Förändringstakt', 'Tangentens lutning'],
          notes: null,
        },
        {
          title: 'Vanliga regler',
          bullets: ['Potensregeln', 'Kedjeregeln', 'Produktregeln'],
          notes: null,
        },
      ],
    });
  }
  return JSON.stringify({
    title: 'Sammanfattning – exempel',
    subtitle: 'Skapad i demoläget',
    sections: [
      {
        heading: 'Det här är demoinnehåll',
        paragraphs: [
          'Dokumentet byggs av exempeldata i demoläget. I det riktiga läget skriver AI:n innehållet utifrån ditt samtal.',
        ],
        bullets: [],
      },
      {
        heading: 'Så går det till',
        paragraphs: ['Ställ en fråga i chatten och välj sedan vilket dokument du vill skapa.'],
        bullets: ['Word', 'Excel', 'PowerPoint'],
      },
    ],
  });
}
