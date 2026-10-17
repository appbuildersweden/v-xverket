import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  dueLabel,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatShortStamp,
  isOverdue,
  monthLabel,
  parseISODate,
  todayISO,
} from './dates';
import { countByDay, dayAriaLabel, monthGrid, shiftMonth } from './calendar';
import {
  GARDEN_THEME,
  PlannerTask,
  RewardDefinition,
  countPlannerTasks,
  filterPlannerTasks,
  gardenPlots,
  gardenSummary,
  groupPlannerTasks,
  levelFromXp,
  rewardProgress,
  sortPlannerTasks,
  treeStageIndex,
  validateTask,
  xpStateFrom,
} from './planner';
import {
  AssignedTask,
  assignmentStage,
  countAssignedTasks,
  filterAssignedTasks,
  groupTasksBySubject,
  hasTeacherFeedback,
  validateAssignment,
} from './assignments';
import {
  deckStats,
  knownRatio,
  nextCardIndex,
  validateCard,
  validateDeck,
  Flashcard,
} from './flashcards';
import { scoreLabel, scorePercent, validateQuestion, validateQuizSet } from './quiz';
import { formatBytes, safeFileName, validateUpload } from './documents';
import { conversationPreview, mergeMessages, validateMessage } from './chat';
import { ERR_NETWORK, ERR_NOT_READY, ERR_PERMISSION, ERR_SESSION, ERR_UNKNOWN, toErrorMessage } from './db';
import { NAV_CATEGORIES, isPageInPanel, labelForPage, panelPages } from './nav';
import { formatHashRoute, parseHashRoute } from './hash-route';

// ---------------------------------------------------------------- testdata

function plannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    id: 't1',
    user_id: 'u1',
    title: 'Uppgift',
    description: null,
    notes: null,
    due_date: null,
    priority: 'medel',
    status: 'ej_paborjad',
    category: 'arbetsomrade',
    completed_at: null,
    xp_awarded: false,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

function assignedTask(overrides: Partial<AssignedTask> = {}): AssignedTask {
  return {
    id: 'a1',
    created_by: 'spec-1',
    student_id: 'elev-1',
    class_id: null,
    title: 'Uppgift',
    description: null,
    instructions: null,
    subject: null,
    due_date: null,
    status: 'ej_paborjad',
    submission: null,
    submitted_at: null,
    completed_at: null,
    xp_awarded: false,
    follow_up: false,
    follow_up_note: null,
    followed_up_at: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

function card(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: 'c1',
    deck_id: 'd1',
    question: 'Fråga',
    answer: 'Svar',
    position: 0,
    known_count: 0,
    repeat_count: 0,
    last_result: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------- datum

describe('datumhjälpare', () => {
  const now = new Date(2026, 9, 16, 12, 0, 0); // 16 oktober 2026

  it('formaterar dagens datum som lokalt ISO-datum', () => {
    expect(todayISO(now)).toBe('2026-10-16');
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('tolkar ISO-datum och avvisar ogiltiga värden', () => {
    expect(parseISODate('2026-10-16')?.getDate()).toBe(16);
    expect(parseISODate('nonsens')).toBeNull();
    expect(parseISODate(null)).toBeNull();
  });

  it('räknar dagar och avgör om något är försenat', () => {
    expect(daysUntil('2026-10-16', now)).toBe(0);
    expect(daysUntil('2026-10-19', now)).toBe(3);
    expect(daysUntil('2026-10-14', now)).toBe(-2);
    expect(isOverdue('2026-10-15', now)).toBe(true);
    expect(isOverdue('2026-10-16', now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });

  it('ger begripliga etiketter för förfallodatum', () => {
    expect(dueLabel('2026-10-16', now)).toBe('Idag');
    expect(dueLabel('2026-10-17', now)).toBe('Imorgon');
    expect(dueLabel('2026-10-15', now)).toBe('Igår');
    expect(dueLabel('2026-10-20', now)).toBe('Om 4 dagar');
    expect(dueLabel('2026-10-12', now)).toBe('För 4 dagar sedan');
    expect(dueLabel('2026-12-01', now)).toBe('1 dec 2026');
    expect(dueLabel(null, now)).toBe('Inget datum');
  });

  it('formaterar datum och tider för svenska läsare', () => {
    expect(formatLongDate(now)).toBe('fredag 16 okt 2026');
    expect(formatDate('2026-10-16')).toBe('16 okt 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime('2026-10-16T14:05:00')).toContain('16 okt 2026 kl. 14:05');
    expect(formatShortStamp('2026-10-16T09:05:00', now)).toBe('09:05');
    expect(formatShortStamp('2026-10-15T09:05:00', now)).toBe('Igår');
    expect(formatShortStamp('2026-10-01T09:05:00', now)).toBe('1/10');
  });
});

// ---------------------------------------------------------------- planering

describe('planering och XP', () => {
  it('validerar formuläret för en planeringspost', () => {
    expect(validateTask({ title: 'a', description: '', due_date: '', priority: 'medel' })).toMatch(
      /rubrik/i,
    );
    expect(
      validateTask({ title: 'Läsa kapitel 3', description: '', due_date: '', priority: 'medel' }),
    ).toBeNull();
    expect(
      validateTask({ title: 'Läsa', description: '', due_date: '16/10', priority: 'medel' }),
    ).toMatch(/ÅÅÅÅ-MM-DD/);
    expect(
      validateTask({ title: 'Läsa', description: 'x'.repeat(4001), due_date: '', priority: 'medel' }),
    ).toMatch(/för lång/i);
  });

  it('sorterar oavslutade först, med närmaste datum först', () => {
    const sorted = sortPlannerTasks([
      plannerTask({ id: 'klar', status: 'klar', due_date: '2026-10-01' }),
      plannerTask({ id: 'sen', due_date: '2026-11-01' }),
      plannerTask({ id: 'snar', due_date: '2026-10-17' }),
      plannerTask({ id: 'utan', due_date: null }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['snar', 'sen', 'utan', 'klar']);
  });

  it('delar upp planeringen i grupper och räknar dem', () => {
    const today = '2026-10-16';
    const tasks = [
      plannerTask({ id: 'sen', due_date: '2026-10-10' }),
      plannerTask({ id: 'idag', due_date: today }),
      plannerTask({ id: 'fram', due_date: '2026-10-20' }),
      plannerTask({ id: 'utan', due_date: null }),
      plannerTask({ id: 'klar', status: 'klar' }),
    ];
    const groups = groupPlannerTasks(tasks, today);
    expect(groups.overdue.map((t) => t.id)).toEqual(['sen']);
    expect(groups.today.map((t) => t.id)).toEqual(['idag']);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['fram']);
    expect(groups.noDate.map((t) => t.id)).toEqual(['utan']);
    expect(groups.done.map((t) => t.id)).toEqual(['klar']);

    expect(countPlannerTasks(tasks, today)).toEqual({
      total: 5,
      open: 4,
      done: 1,
      overdue: 1,
      today: 1,
    });
  });

  it('filtrerar planeringen på status och fritext', () => {
    const tasks = [
      plannerTask({ id: 'a', title: 'Rätta prov' }),
      plannerTask({ id: 'b', title: 'Planera veckan', status: 'klar' }),
    ];
    expect(filterPlannerTasks(tasks, { status: 'klar' }).map((t) => t.id)).toEqual(['b']);
    expect(filterPlannerTasks(tasks, { query: 'veckan' }).map((t) => t.id)).toEqual(['b']);
    expect(filterPlannerTasks(tasks).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('räknar nivå och XP mot serverns värden', () => {
    expect(levelFromXp(0, 100)).toBe(1);
    expect(levelFromXp(99, 100)).toBe(1);
    expect(levelFromXp(100, 100)).toBe(2);
    expect(xpStateFrom(120, 100)).toEqual({
      totalXp: 120,
      level: 2,
      xpPerLevel: 100,
      intoLevel: 20,
      xpToNext: 80,
    });
    // Saknat värde från servern faller tillbaka på 100 per nivå.
    expect(xpStateFrom(50, 0).xpPerLevel).toBe(100);
  });

  it('beräknar nästa mål och antalet upplåsta belöningar', () => {
    const definitions = [
      { id: 'a', name: 'A', description: null, theme: 'it', position: 1, xp_required: 10, bonus_xp: 0, illustration: null, unlocks_items: [], is_final: false },
      { id: 'b', name: 'B', description: null, theme: 'it', position: 2, xp_required: 100, bonus_xp: 0, illustration: null, unlocks_items: [], is_final: false },
    ];
    const unlocks = new Map([
      ['a', { id: 'u1', reward_id: 'a', bonus_xp_awarded: 0, unlocked_at: '2026-10-01T00:00:00Z' }],
    ]);
    const progress = rewardProgress(definitions, unlocks, 30);
    expect(progress.unlockedCount).toBe(1);
    expect(progress.next?.id).toBe('b');
    expect(progress.toNext).toBe(70);
    expect(progress.ratio).toBeCloseTo(0.222, 2);
  });
});

// ---------------------------------------------------------------- uppgifter

describe('tilldelade uppgifter', () => {
  it('kräver ett mål och ett giltigt datum', () => {
    const base = {
      title: 'Träna glosor',
      description: '',
      instructions: '',
      subject: 'Engelska',
      due_date: '',
      student_id: null,
      class_id: null,
    };
    expect(validateAssignment(base)).toMatch(/elev eller en klass/i);
    expect(validateAssignment({ ...base, student_id: 'e1', class_id: 'c1' })).toMatch(
      /antingen/i,
    );
    expect(validateAssignment({ ...base, student_id: 'e1' })).toBeNull();
    expect(validateAssignment({ ...base, class_id: 'c1', due_date: '2026/10/16' })).toMatch(
      /ÅÅÅÅ-MM-DD/,
    );
  });

  it('räknar uppgifter, försenade och inlämningar som väntar på uppföljning', () => {
    const now = new Date(2026, 9, 16);
    const counts = countAssignedTasks(
      [
        assignedTask({ id: 'a', due_date: '2026-10-10' }),
        assignedTask({ id: 'b', status: 'pagar', submitted_at: '2026-10-15T10:00:00Z' }),
        assignedTask({ id: 'c', status: 'klar' }),
        assignedTask({ id: 'd', submitted_at: '2026-10-15T10:00:00Z', followed_up_at: '2026-10-15T11:00:00Z' }),
      ],
      '2026-10-16',
      now,
    );
    expect(counts).toEqual({
      total: 4,
      open: 3,
      done: 1,
      overdue: 1,
      submitted: 2,
      needsFollowUp: 1,
    });
  });

  it('grupperar uppgifter per ämne och samlar ämneslösa under Övrigt', () => {
    const groups = groupTasksBySubject([
      assignedTask({ id: 'a', subject: 'Svenska', title: 'Bokrecension' }),
      assignedTask({ id: 'b', subject: 'Svenska', title: 'Läsa' }),
      assignedTask({ id: 'c', subject: null, title: 'Städa' }),
    ]);
    expect(groups.map((g) => g.subject)).toEqual(['Svenska', 'Övrigt']);
    expect(groups[0].tasks).toHaveLength(2);
  });

  it('filtrerar uppgifter på status, ämne och fritext', () => {
    const tasks = [
      assignedTask({ id: 'a', subject: 'Matte', title: 'Bråk' }),
      assignedTask({ id: 'b', subject: 'Matte', title: 'Geometri', status: 'klar' }),
    ];
    expect(filterAssignedTasks(tasks, { status: 'klar' }).map((t) => t.id)).toEqual(['b']);
    expect(filterAssignedTasks(tasks, { subject: 'Matte', query: 'bråk' }).map((t) => t.id)).toEqual(['a']);
    expect(filterAssignedTasks(tasks, { query: 'finns inte' })).toEqual([]);
  });
});

// ---------------------------------------------------------------- flashcards

describe('flashcards', () => {
  it('validerar kortlek och kort', () => {
    expect(validateDeck('a')).toMatch(/titel/i);
    expect(validateDeck('Glosor')).toBeNull();
    expect(validateCard('', 'svar')).toMatch(/fråga/i);
    expect(validateCard('fråga', '')).toMatch(/svar/i);
    expect(validateCard('fråga', 'svar')).toBeNull();
  });

  it('sammanställer repetitionsstatus', () => {
    const stats = deckStats([
      card({ id: '1', last_result: true }),
      card({ id: '2', last_result: false }),
      card({ id: '3', last_result: null }),
    ]);
    expect(stats).toEqual({ total: 3, known: 1, repeat: 1, unseen: 1 });
    expect(knownRatio(stats)).toBeCloseTo(0.333, 2);
    expect(knownRatio({ total: 0, known: 0, repeat: 0, unseen: 0 })).toBe(0);
  });

  it('väljer nästa kort: okända och att repetera först', () => {
    const cards = [
      card({ id: '1', last_result: true }),
      card({ id: '2', last_result: null }),
      card({ id: '3', last_result: false }),
    ];
    expect(nextCardIndex(cards, 0)).toBe(1);
    expect(nextCardIndex(cards, 1)).toBe(2);
    expect(nextCardIndex([], 0)).toBe(0);
  });
});

// ---------------------------------------------------------------- provträning

describe('provträning', () => {
  const input = {
    prompt: 'Vad är 2 + 2?',
    options: ['3', '4'],
    correct_index: 1,
    explanation: '',
  };

  it('kräver en titel, minst två alternativ och ett markerat rätt svar', () => {
    expect(validateQuizSet('a')).toMatch(/titel/i);
    expect(validateQuizSet('Geometri')).toBeNull();
    expect(validateQuestion({ ...input, options: ['bara ett'] })).toMatch(/minst 2/i);
    expect(
      validateQuestion({ ...input, options: ['1', '2', '3', '4', '5', '6', '7'] }),
    ).toMatch(/högst 6/i);
    expect(validateQuestion({ ...input, options: ['samma', 'samma'] })).toMatch(/olika/i);
    expect(validateQuestion({ ...input, correct_index: 5 })).toMatch(/rätt/i);
    expect(validateQuestion(input)).toBeNull();
  });

  it('räknar procent och ger ett omdöme', () => {
    expect(scorePercent(3, 4)).toBe(75);
    expect(scorePercent(0, 0)).toBe(0);
    expect(scoreLabel(4, 4)).toBe('Alla rätt!');
    expect(scoreLabel(0, 0)).toBe('Inga frågor');
    expect(scoreLabel(1, 4)).toBe('Träna mer');
  });
});

// ---------------------------------------------------------------- dokument

describe('dokument', () => {
  it('validerar filer innan uppladdning', () => {
    expect(validateUpload({ name: '', size: 10, type: 'application/pdf' })).toMatch(/fil/i);
    expect(validateUpload({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toMatch(/tom/i);
    expect(validateUpload({ name: 'a.pdf', size: 20 * 1024 * 1024, type: 'application/pdf' })).toMatch(
      /för stor/i,
    );
    expect(validateUpload({ name: 'a.exe', size: 10, type: 'application/x-msdownload' })).toMatch(
      /filtypen/i,
    );
    expect(validateUpload({ name: 'a.pdf', size: 10, type: 'application/pdf' })).toBeNull();
  });

  it('gör filnamn säkra och visar läsbara storlekar', () => {
    expect(safeFileName('Årsplan 2026.pdf')).toBe('Arsplan-2026.pdf');
    expect(safeFileName('C:\\temp\\prov.docx')).toBe('prov.docx');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2,5 MB');
    expect(formatBytes(null)).toBe('—');
  });
});

// ---------------------------------------------------------------- meddelanden

describe('meddelanden', () => {
  it('validerar meddelandet innan det skickas', () => {
    expect(validateMessage('   ')).toMatch(/skriv/i);
    expect(validateMessage('x'.repeat(4001))).toMatch(/för långt/i);
    expect(validateMessage('Hej!')).toBeNull();
  });

  it('lägger till nya meddelanden utan att tappa historiken', () => {
    const a = { id: '1', sender_id: 'u', sender_username: 'elev', body: 'Hej', created_at: '2026-10-16T10:00:00Z' };
    const b = { id: '2', sender_id: 's', sender_username: 'spec', body: 'Hej själv', created_at: '2026-10-16T10:05:00Z' };

    expect(mergeMessages([a], [b]).map((m) => m.id)).toEqual(['1', '2']);
    // Samma meddelande två gånger blir bara ett.
    expect(mergeMessages([a, b], [a, b])).toHaveLength(2);
    expect(mergeMessages([], [])).toEqual([]);
  });

  it('kortar långa förhandsvisningar', () => {
    const preview = conversationPreview({
      channelId: 'c',
      otherId: 'u',
      otherUsername: 'elev',
      lastBody: 'x'.repeat(200),
      lastAt: null,
    });
    expect(preview.length).toBe(78);
    expect(preview.endsWith('…')).toBe(true);
    expect(
      conversationPreview({ channelId: 'c', otherId: 'u', otherUsername: 'elev', lastBody: null, lastAt: null }),
    ).toBe('Inga meddelanden ännu');
  });
});

// ---------------------------------------------------------------- felmeddelanden

describe('felmeddelanden från databasen', () => {
  it('översätter tekniska fel till begriplig svenska', () => {
    expect(toErrorMessage(new Error('new row violates row-level security policy for table "x"'))).toBe(
      ERR_PERMISSION,
    );
    expect(toErrorMessage('permission denied for table profiles')).toBe(ERR_PERMISSION);
    expect(toErrorMessage('relation "public.student_tasks" does not exist')).toBe(ERR_NOT_READY);
    expect(toErrorMessage(new TypeError('fetch failed'))).toBe(ERR_NETWORK);
    expect(toErrorMessage('duplicate key value violates unique constraint "x"')).toBe(
      'Det finns redan.',
    );
    expect(toErrorMessage('JWT expired')).toBe(ERR_SESSION);
    expect(toErrorMessage(null)).toBe(ERR_UNKNOWN);
  });

  it('visar serverns egna, användarvänliga meddelanden som de är', () => {
    expect(toErrorMessage(new Error('Du har inte tillgång till den konversationen.'))).toBe(
      'Du har inte tillgång till den konversationen.',
    );
    expect(toErrorMessage('Uppgiften är inte tilldelad dig.')).toBe(
      'Uppgiften är inte tilldelad dig.',
    );
  });
});

// ---------------------------------------------------------------- meny och rutter

describe('meny och rutter', () => {
  const panels = ['elev', 'privat', 'larare', 'speciallarar', 'admin'] as const;

  it('varje menyval har en text och kan öppnas via adressfältet', () => {
    for (const panel of panels) {
      for (const category of NAV_CATEGORIES[panel]) {
        for (const item of category.items) {
          expect(labelForPage(panel, item.id)).toBe(item.label);
          expect(isPageInPanel(panel, item.id)).toBe(true);

          const route = formatHashRoute({ panel, page: item.id });
          expect(route).toBe(`#/${panel}/${item.id}`);
          expect(parseHashRoute(route)).toEqual({ panel, page: item.id });
        }
      }
    }
  });

  it('privatelevens meny saknar klass, kamrater och klasschatt', () => {
    const pages = panelPages('privat');
    expect(pages).toContain('planering');
    expect(pages).toContain('uppgifter');
    expect(pages).toContain('framsteg');
    expect(pages).not.toContain('klass');
    expect(pages).not.toContain('klasschatt');
    expect(pages).not.toContain('kamrater');
    expect(pages).not.toContain('meddelanden');
  });

  it('innehåller inga dubbla sid-id:n inom en panel', () => {
    for (const panel of panels) {
      const pages = panelPages(panel);
      expect(new Set(pages).size).toBe(pages.length);
    }
  });

  it('avvisar okända sidor och felaktiga adresser', () => {
    expect(parseHashRoute('#/elev/finnsinte')).toBeNull();
    expect(parseHashRoute('#/fel-panel/start')).toBeNull();
    expect(parseHashRoute('')).toBeNull();
  });
});

// ---------------------------------------------------------------- trädgården

function gardenReward(overrides: Partial<RewardDefinition> = {}): RewardDefinition {
  return {
    id: 'g1',
    name: 'Blomma',
    description: null,
    theme: GARDEN_THEME,
    position: 24,
    xp_required: 25,
    bonus_xp: 0,
    illustration: '🌸',
    unlocks_items: ['blomma'],
    is_final: false,
    ...overrides,
  };
}

describe('trädgården', () => {
  const definitions = [
    gardenReward({ id: 'blomma', name: 'Blomma', xp_required: 25, position: 24 }),
    gardenReward({ id: 'sol', name: 'Sol', xp_required: 50, position: 25, illustration: '☀️' }),
    gardenReward({ id: 'stjarna', name: 'Stjärna', xp_required: 75, position: 26, illustration: '⭐' }),
    gardenReward({ id: 'hjarta', name: 'Hjärta', xp_required: 100, position: 27, illustration: '❤️' }),
    // Belöningar utan trädgårdstema hör inte hit.
    gardenReward({ id: 'it', name: 'IT-hjälten', xp_required: 10, theme: 'it', position: 1 }),
  ];

  it('väljer bara trädgårdens egna belöningar, i XP-ordning', () => {
    const plots = gardenPlots(definitions, new Map());
    expect(plots.map((p) => p.name)).toEqual(['Blomma', 'Sol', 'Stjärna', 'Hjärta']);
    expect(plots.every((p) => p.unlocked === false)).toBe(true);
  });

  it('markerar bara det servern har låst upp', () => {
    const unlocks = new Map([
      ['blomma', { id: 'u1', reward_id: 'blomma', bonus_xp_awarded: 0, unlocked_at: '2026-10-16T10:00:00Z' }],
    ]);
    const plots = gardenPlots(definitions, unlocks);
    expect(plots.find((p) => p.id === 'blomma')?.unlocked).toBe(true);
    expect(plots.find((p) => p.id === 'sol')?.unlocked).toBe(false);
  });

  it('låter trädet växa i steg med XP', () => {
    expect(treeStageIndex(0)).toBe(0);
    expect(treeStageIndex(24)).toBe(0);
    expect(treeStageIndex(25)).toBe(1);
    expect(treeStageIndex(60)).toBe(2);
    expect(treeStageIndex(90)).toBe(3);
    expect(treeStageIndex(120)).toBe(4);
    expect(treeStageIndex(999)).toBe(6);
  });

  it('sammanställer trädgården från XP och upplåsningar', () => {
    const unlocks = new Map([
      ['blomma', { id: 'u1', reward_id: 'blomma', bonus_xp_awarded: 0, unlocked_at: '2026-10-16T10:00:00Z' }],
    ]);
    const summary = gardenSummary(definitions, unlocks, 60);

    expect(summary.plots).toHaveLength(4);
    expect(summary.unlockedPlots).toBe(1);
    expect(summary.stageLabel).toBe('en ung planta');
    expect(summary.xpToNextStage).toBe(15); // nästa steg är 75 XP
    expect(summary.nextPlot?.name).toBe('Sol');
    expect(summary.xpToNextPlot).toBe(0); // Sol kräver 50 XP och 60 är uppnått
  });

  it('klarar en tom belöningslista utan att hitta på föremål', () => {
    const summary = gardenSummary([], new Map(), 30);
    expect(summary.plots).toEqual([]);
    expect(summary.nextPlot).toBeNull();
    expect(summary.xpToNextPlot).toBe(0);
  });
});

// ---------------------------------------------------------------- kalendern

describe('kalendern', () => {
  it('bygger ett sexveckorsrutnät som börjar på måndag', () => {
    const days = monthGrid(2026, 9, '2026-10-16'); // oktober 2026
    expect(days).toHaveLength(42);
    // 1 oktober 2026 är en torsdag, så rutnätet börjar måndagen den 28 september.
    expect(days[0].iso).toBe('2026-09-28');
    expect(days[41].iso).toBe('2026-11-08');
    expect(days.filter((d) => d.inMonth)).toHaveLength(31);
    expect(days.find((d) => d.iso === '2026-10-16')?.isToday).toBe(true);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it('hanterar februari och skottår', () => {
    const days = monthGrid(2028, 1, '2028-02-01');
    expect(days.filter((d) => d.inMonth)).toHaveLength(29);
  });

  it('byter månad över årsskiftet', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 9, 3)).toEqual({ year: 2027, month: 0 });
  });

  it('namnger månader på svenska', () => {
    expect(monthLabel(2026, 9)).toBe('oktober 2026');
    expect(monthLabel(2026, 11)).toBe('december 2026');
  });

  it('räknar poster per dag och poster utan datum', () => {
    const counts = countByDay([
      { due_date: '2026-10-16' },
      { due_date: '2026-10-16' },
      { due_date: '2026-10-20' },
      { due_date: null },
    ]);
    expect(counts.byDay.get('2026-10-16')).toBe(2);
    expect(counts.byDay.get('2026-10-20')).toBe(1);
    expect(counts.withoutDate).toBe(1);
    expect(counts.total).toBe(4);
  });

  it('beskriver en dag för skärmläsare', () => {
    const day = { iso: '2026-10-16', day: 16, inMonth: true, isToday: true };
    expect(dayAriaLabel(day, 0)).toContain('inget inplanerat');
    expect(dayAriaLabel(day, 1)).toContain('1 post');
    expect(dayAriaLabel(day, 3)).toContain('3 poster');
  });
});

// ------------------------------------------------------- uppgiftens läge

describe('uppgiftens läge i flödet', () => {
  it('går från ny till bedömd utan att eleven kan sätta bedömningen själv', () => {
    expect(assignmentStage(assignedTask())).toBe('ny');
    expect(assignmentStage(assignedTask({ status: 'pagar' }))).toBe('pagar');
    expect(assignmentStage(assignedTask({ status: 'klar' }))).toBe('klar');
    expect(assignmentStage(assignedTask({ submitted_at: '2026-10-15T10:00:00Z' }))).toBe('inlamnad');
    // Lärarens uppföljning väger tyngst.
    expect(
      assignmentStage(
        assignedTask({ submitted_at: '2026-10-15T10:00:00Z', followed_up_at: '2026-10-16T10:00:00Z' }),
      ),
    ).toBe('bedomd');
  });

  it('visar återkoppling bara när läraren har lämnat den', () => {
    expect(hasTeacherFeedback(assignedTask())).toBe(false);
    expect(hasTeacherFeedback(assignedTask({ followed_up_at: '2026-10-16T10:00:00Z' }))).toBe(true);
    expect(hasTeacherFeedback(assignedTask({ follow_up_note: 'Bra jobbat!' }))).toBe(true);
  });
});
