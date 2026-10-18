/**
 * Planering, XP och belöningar.
 *
 * Datamodellen finns redan i databasen (`spec_tasks`, `xp_transactions`,
 * `user_xp`, `reward_definitions`, `reward_unlocks`). XP och upplåsningar
 * beräknas helt serversidigt i security definer-funktionen `complete_task` —
 * klienten kan aldrig skriva XP eller låsa upp något på egen hand.
 *
 * Tabellen `spec_tasks` är varje användares egen planering: RLS ger bara
 * åtkomst till egna rader. Personal får XP för slutförda poster; elever får sin
 * XP från uppgifter som personalen har tilldelat (se assignments.ts), så att XP
 * inte kan samlas genom att skapa egna att-göra-poster.
 */
import { Result, query, withClient } from './db';

export type TaskStatus = 'ej_paborjad' | 'pagar' | 'klar';
export type TaskPriority = 'lag' | 'medel' | 'hog';

export interface PlannerTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  category: string;
  completed_at: string | null;
  xp_awarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewTaskInput {
  title: string;
  description?: string;
  notes?: string;
  due_date?: string | null;
  priority?: TaskPriority;
  category?: string;
}

export interface XpState {
  totalXp: number;
  level: number;
  xpPerLevel: number;
  intoLevel: number;
  xpToNext: number;
}

export interface RewardDefinition {
  id: string;
  name: string;
  description: string | null;
  theme: string;
  position: number;
  xp_required: number;
  bonus_xp: number;
  illustration: string | null;
  unlocks_items: string[];
  /** Raritet från migreringen; äldre rader saknar värdet och blir 'vanlig'. */
  rarity?: string | null;
  /**
   * false = belöningen är avstängd och visas inte. Äldre rader saknar värdet
   * och räknas då som aktiva.
   */
  active?: boolean | null;
  is_final: boolean;
}

export interface RewardUnlock {
  id: string;
  reward_id: string;
  bonus_xp_awarded: number;
  unlocked_at: string;
  /** Uppgiften som utlöste upplåsningen (finns från Halloween-migreringen). */
  source_task_title?: string | null;
  source_kind?: 'spec' | 'student' | null;
}

export interface UnlockCelebration {
  id: string;
  name: string;
  description: string | null;
  theme: string;
  illustration: string | null;
  bonusXp: number;
  items: string[];
}

export interface CompleteResult {
  xpAwarded: number;
  totalXp: number;
  level: number;
  unlocks: UnlockCelebration[];
}

export interface XpEntry {
  id: string;
  amount: number;
  source: string;
  note: string | null;
  created_at: string;
}

const FALLBACK_XP_PER_LEVEL = 100;

export const PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  lag: 'Låg',
  medel: 'Medel',
  hog: 'Hög',
};

export const STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  ej_paborjad: 'Ej påbörjad',
  pagar: 'Pågår',
  klar: 'Klar',
};

// ---------------------------------------------------------------- Validering

export interface TaskFormInput {
  title: string;
  description: string;
  due_date: string;
  priority: TaskPriority;
}

/** Validerar formuläret för en planeringspost. Null betyder att allt är ok. */
export function validateTask(input: TaskFormInput): string | null {
  if (input.title.trim().length < 2) return 'Ge uppgiften en rubrik (minst 2 tecken).';
  if (input.title.trim().length > 200) return 'Rubriken är för lång (max 200 tecken).';
  if (input.description.length > 4000) return 'Beskrivningen är för lång (max 4000 tecken).';
  if (input.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) {
    return 'Datumet måste vara i formatet ÅÅÅÅ-MM-DD.';
  }
  return null;
}

// ---------------------------------------------------------------- Sortering

const PRIORITY_ORDER: Record<TaskPriority, number> = { hog: 0, medel: 1, lag: 2 };

/**
 * Sorterar planeringen: oavslutade först, med förfallodatum i stigande ordning,
 * därefter prioritet och sist skapad. Klara poster hamnar sist.
 */
export function sortPlannerTasks(tasks: readonly PlannerTask[]): PlannerTask[] {
  return [...tasks].sort((a, b) => {
    if (a.status === 'klar' !== (b.status === 'klar')) return a.status === 'klar' ? 1 : -1;

    const aDue = a.due_date ?? '9999-12-31';
    const bDue = b.due_date ?? '9999-12-31';
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;

    if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    }
    return a.created_at < b.created_at ? -1 : 1;
  });
}

export interface PlannerGroups {
  overdue: PlannerTask[];
  today: PlannerTask[];
  upcoming: PlannerTask[];
  noDate: PlannerTask[];
  done: PlannerTask[];
}

/** Delar upp planeringen i grupper för översikter och filter. */
export function groupPlannerTasks(
  tasks: readonly PlannerTask[],
  today: string,
): PlannerGroups {
  const groups: PlannerGroups = { overdue: [], today: [], upcoming: [], noDate: [], done: [] };

  for (const task of sortPlannerTasks(tasks)) {
    if (task.status === 'klar') {
      groups.done.push(task);
      continue;
    }
    if (!task.due_date) {
      groups.noDate.push(task);
      continue;
    }
    if (task.due_date < today) groups.overdue.push(task);
    else if (task.due_date === today) groups.today.push(task);
    else groups.upcoming.push(task);
  }
  return groups;
}

export interface PlannerCounts {
  total: number;
  open: number;
  done: number;
  overdue: number;
  today: number;
}

export function countPlannerTasks(
  tasks: readonly PlannerTask[],
  today: string,
): PlannerCounts {
  const groups = groupPlannerTasks(tasks, today);
  return {
    total: tasks.length,
    open: groups.overdue.length + groups.today.length + groups.upcoming.length + groups.noDate.length,
    done: groups.done.length,
    overdue: groups.overdue.length,
    today: groups.today.length,
  };
}

/** Filtrerar planeringen på status och fritext. */
export function filterPlannerTasks(
  tasks: readonly PlannerTask[],
  options: { status?: 'alla' | TaskStatus; query?: string } = {},
): PlannerTask[] {
  const status = options.status ?? 'alla';
  const text = (options.query ?? '').trim().toLowerCase();
  return tasks.filter((task) => {
    if (status !== 'alla' && task.status !== status) return false;
    if (text) {
      const haystack = `${task.title} ${task.description ?? ''} ${task.notes ?? ''}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- Uppgifter

export async function listTasks(): Promise<Result<PlannerTask[]>> {
  return query<PlannerTask>((sup) =>
    sup
      .from('spec_tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
  );
}

export async function createTask(input: NewTaskInput): Promise<Result<PlannerTask>> {
  return withClient(async (sup) => {
    const { data: userData, error: userErr } = await sup.auth.getUser();
    if (userErr || !userData.user) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup
      .from('spec_tasks')
      .insert({
        user_id: userData.user.id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        notes: input.notes?.trim() || null,
        due_date: input.due_date || null,
        priority: input.priority ?? 'medel',
        category: input.category?.trim() || 'arbetsomrade',
      })
      .select()
      .single();
    if (error) throw error;
    return data as PlannerTask;
  });
}

export type TaskPatch = Partial<
  Pick<PlannerTask, 'title' | 'description' | 'notes' | 'due_date' | 'priority' | 'status'>
>;

export async function updateTask(id: string, patch: TaskPatch): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup
      .from('spec_tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

export async function deleteTask(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('spec_tasks').delete().eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

/** Läser upplåsningar från serverns svar (samma form i alla funktioner). */
export function mapUnlocks(raw: unknown): UnlockCelebration[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((u) => {
    const r = (u ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Belöning'),
      description: typeof r.description === 'string' ? r.description : null,
      theme: String(r.theme ?? 'it'),
      illustration: typeof r.illustration === 'string' ? r.illustration : null,
      bonusXp: Number(r.bonus_xp ?? 0),
      items: Array.isArray(r.items) ? r.items.map((i) => String(i)) : [],
    };
  });
}

/**
 * Markera en planeringspost som klar. Går via serverfunktionen `complete_task`
 * som betalar XP exakt en gång och låser upp belöningar atomärt.
 */
export async function completeTask(id: string): Promise<Result<CompleteResult>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('complete_task', { p_task_id: id });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      xpAwarded: Number(r.xp_awarded ?? 0),
      totalXp: Number(r.total_xp ?? 0),
      level: Number(r.level ?? 1),
      unlocks: mapUnlocks(r.unlocks),
    };
  });
}

/** Återuppta en post. Redan utbetald XP betalas aldrig tillbaka (serversidigt). */
export async function reopenTask(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.rpc('reopen_task', { p_task_id: id });
    if (error) throw error;
    return true as const;
  });
}

// ---------------------------------------------------------------- XP

export function levelFromXp(totalXp: number, xpPerLevel: number): number {
  const per = xpPerLevel > 0 ? xpPerLevel : FALLBACK_XP_PER_LEVEL;
  return Math.floor(totalXp / per) + 1;
}

/** Bygger XP-läget från servervärden (används av både sida och test). */
export function xpStateFrom(totalXp: number, xpPerLevel: number): XpState {
  const per = xpPerLevel > 0 ? xpPerLevel : FALLBACK_XP_PER_LEVEL;
  const intoLevel = totalXp % per;
  return {
    totalXp,
    level: levelFromXp(totalXp, per),
    xpPerLevel: per,
    intoLevel,
    xpToNext: per - intoLevel,
  };
}

export async function fetchXpState(): Promise<Result<XpState>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const [xpRes, setRes] = await Promise.all([
      sup.from('user_xp').select('total_xp').eq('user_id', uid).maybeSingle(),
      sup.from('reward_settings').select('value').eq('key', 'xp_per_level').maybeSingle(),
    ]);

    const total = Number(xpRes.data?.total_xp ?? 0);
    const setting = (setRes.data?.value ?? null) as unknown;
    const per = Array.isArray(setting) ? Number(setting[0]) : Number(setting ?? 0);
    return xpStateFrom(Number.isFinite(total) ? total : 0, Number.isFinite(per) ? per : 0);
  });
}

// ---------------------------------------------------------------- Belöningar

export async function listRewardDefinitions(): Promise<Result<RewardDefinition[]>> {
  return query<RewardDefinition>((sup) =>
    sup.from('reward_definitions').select('*').order('position', { ascending: true }),
  );
}

export async function listUnlocks(): Promise<Result<Map<string, RewardUnlock>>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup.from('reward_unlocks').select('*').eq('user_id', uid);
    if (error) throw error;

    const map = new Map<string, RewardUnlock>();
    for (const row of (data ?? []) as RewardUnlock[]) map.set(row.reward_id, row);
    return map;
  });
}

export async function listXpHistory(limit = 20): Promise<Result<XpEntry[]>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup
      .from('xp_transactions')
      .select('id, amount, source, note, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as XpEntry[];
  });
}

/**
 * Beräknar nästa mål och hur många belöningar som är upplåsta. Ren funktion
 * som används av både belöningssidan och översikterna.
 */
export function rewardProgress(
  definitions: readonly RewardDefinition[],
  unlocks: ReadonlyMap<string, RewardUnlock>,
  totalXp: number,
): { unlockedCount: number; next: RewardDefinition | null; toNext: number; ratio: number } {
  const sorted = [...definitions].sort((a, b) => a.position - b.position);
  const unlockedCount = sorted.filter((d) => unlocks.has(d.id)).length;
  const next = sorted.find((d) => !unlocks.has(d.id)) ?? null;
  const toNext = next ? Math.max(next.xp_required - totalXp, 0) : 0;
  const floor = sorted.length > 0 ? Math.max(sorted[0].xp_required, 0) : 0;
  const ratio = next
    ? Math.min(Math.max((totalXp - floor) / Math.max(next.xp_required - floor, 1), 0), 1)
    : 1;
  return { unlockedCount, next, toNext, ratio };
}

// ---------------------------------------------------------------- Trädgården

/**
 * Belöningstemat för trädgården. Belöningarna med det här temat visas som
 * föremål i trädgården i stället för som rutor i listan — samma data, samma
 * regler och samma upplåsningar som resten av belöningssystemet.
 */
export const GARDEN_THEME = 'tradgard';

/** XP-nivåerna där trädet byter skepnad. */
export const GARDEN_TREE_STAGES: readonly number[] = [0, 25, 50, 75, 100, 150, 220];

/** Vad trädet heter i respektive skede, i texten till skärmläsare. */
export const GARDEN_TREE_LABELS: readonly string[] = [
  'ett litet frö',
  'en grodd',
  'en ung planta',
  'ett litet träd',
  'ett träd med knoppar',
  'ett blommande träd',
  'ett stort träd i full blom',
];

/** Vilket skede trädet är i, utifrån användarens riktiga XP. */
export function treeStageIndex(totalXp: number): number {
  let stage = 0;
  GARDEN_TREE_STAGES.forEach((xp, index) => {
    if (totalXp >= xp) stage = index;
  });
  return stage;
}

export interface GardenPlot {
  id: string;
  name: string;
  description: string | null;
  illustration: string;
  xpRequired: number;
  unlocked: boolean;
}

/** Föremålen i trädgården: belöningarna med trädgårdstemat, i XP-ordning. */
export function gardenPlots(
  definitions: readonly RewardDefinition[],
  unlocks: ReadonlyMap<string, RewardUnlock>,
): GardenPlot[] {
  return definitions
    .filter((definition) => definition.theme === GARDEN_THEME)
    .sort((a, b) => a.xp_required - b.xp_required || a.position - b.position)
    .map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      illustration: definition.illustration ?? '🌱',
      xpRequired: definition.xp_required,
      unlocked: unlocks.has(definition.id),
    }));
}

export interface GardenSummary {
  /** Trädets skede (index i GARDEN_TREE_STAGES). */
  stage: number;
  /** Trädets skede i ord. */
  stageLabel: string;
  /** Närmaste skede och hur många XP som återstår dit (null när toppen är nådd). */
  nextStage: number | null;
  xpToNextStage: number;
  plots: GardenPlot[];
  unlockedPlots: number;
  nextPlot: GardenPlot | null;
  xpToNextPlot: number;
}

/** Sammanställer trädgården ur serverns XP och upplåsningar. Ren funktion. */
export function gardenSummary(
  definitions: readonly RewardDefinition[],
  unlocks: ReadonlyMap<string, RewardUnlock>,
  totalXp: number,
): GardenSummary {
  const plots = gardenPlots(definitions, unlocks);
  const stage = treeStageIndex(totalXp);
  const nextStageXp = GARDEN_TREE_STAGES[stage + 1] ?? null;
  const nextPlot = plots.find((plot) => !plot.unlocked) ?? null;

  return {
    stage,
    stageLabel: GARDEN_TREE_LABELS[Math.min(stage, GARDEN_TREE_LABELS.length - 1)],
    nextStage: nextStageXp === null ? null : stage + 1,
    xpToNextStage: nextStageXp === null ? 0 : Math.max(nextStageXp - totalXp, 0),
    plots,
    unlockedPlots: plots.filter((plot) => plot.unlocked).length,
    nextPlot,
    xpToNextPlot: nextPlot ? Math.max(nextPlot.xpRequired - totalXp, 0) : 0,
  };
}
