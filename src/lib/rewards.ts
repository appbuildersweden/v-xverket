// Växverket steg 4 — datalagret för speciallärarens planering, XP och belöningar.
//
// Allt går mot Supabase. XP och upplåsningar beräknas HELT serversidigt i
// security definer-funktioner (se migrationen 20261016000000_rewards.sql) —
// klienten kan aldrig skriva XP eller låsa upp belöningar på egen hand.

import { getOrCreateSupabaseClient } from './auth-supabase';

export type TaskStatus = 'ej_paborjad' | 'pagar' | 'klar';
export type TaskPriority = 'lag' | 'medel' | 'hog';

export interface PlannerTask {
  id: string;
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
}

export interface RewardDefinition {
  id: string;
  name: string;
  description: string | null;
  theme: 'it' | 'halloween' | 'special' | 'jul';
  position: number;
  xp_required: number;
  bonus_xp: number;
  illustration: string | null;
  unlocks_items: string[];
  is_final: boolean;
}

export interface RewardUnlock {
  id: string;
  reward_id: string;
  bonus_xp_awarded: number;
  unlocked_at: string;
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

/** Nyckel → nivågräns. xp_per_level hämtas från reward_settings serversidigt. */
const FALLBACK_XP_PER_LEVEL = 100;

function err(message: string): string {
  return message || 'Något gick fel. Försök igen.';
}

// ----------------------------------------------------------------
// Uppgifter
// ----------------------------------------------------------------

export async function fetchTasks(): Promise<PlannerTask[]> {
  const sup = getOrCreateSupabaseClient();
  const { data, error } = await sup
    .from('spec_tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(err(error.message));
  return (data ?? []) as PlannerTask[];
}

export async function createTask(input: NewTaskInput): Promise<PlannerTask> {
  const sup = getOrCreateSupabaseClient();
  const { data: userData } = await sup.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Ej inloggad.');

  const { data, error } = await sup
    .from('spec_tasks')
    .insert({
      user_id: uid,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      due_date: input.due_date || null,
      priority: input.priority ?? 'medel',
      category: input.category?.trim() || 'arbetsomrade',
    })
    .select()
    .single();
  if (error) throw new Error(err(error.message));
  return data as PlannerTask;
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<PlannerTask, 'id' | 'user_id'>>,
): Promise<void> {
  const sup = getOrCreateSupabaseClient();
  const { error } = await sup
    .from('spec_tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(err(error.message));
}

export async function deleteTask(id: string): Promise<void> {
  const sup = getOrCreateSupabaseClient();
  const { error } = await sup.from('spec_tasks').delete().eq('id', id);
  if (error) throw new Error(err(error.message));
}

/**
 * Markera uppgift som klar. Går via den serversidiga funktionen complete_task,
 * som betalar XP exakt en gång och låser upp belöningar atomärt.
 */
export async function completeTask(id: string): Promise<CompleteResult> {
  const sup = getOrCreateSupabaseClient();
  const { data, error } = await sup.rpc('complete_task', { p_task_id: id });
  if (error) throw new Error(err(error.message));
  const r = (data ?? {}) as {
    xp_awarded?: number;
    total_xp?: number;
    level?: number;
    unlocks?: Array<{
      id: string;
      name: string;
      description: string | null;
      theme: string;
      illustration: string | null;
      bonus_xp: number;
      items: string[];
    }>;
  };
  return {
    xpAwarded: r.xp_awarded ?? 0,
    totalXp: r.total_xp ?? 0,
    level: r.level ?? 1,
    unlocks: (r.unlocks ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      description: u.description,
      theme: u.theme,
      illustration: u.illustration,
      bonusXp: u.bonus_xp ?? 0,
      items: u.items ?? [],
    })),
  };
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

/** Återupppna en uppgift. Redan betald XP återbetalas aldrig (serversidigt). */
export async function reopenTask(id: string): Promise<void> {
  const sup = getOrCreateSupabaseClient();
  const { error } = await sup.rpc('reopen_task', { p_task_id: id });
  if (error) throw new Error(err(error.message));
}

// ----------------------------------------------------------------
// XP och nivåer
// ----------------------------------------------------------------

export async function fetchXpState(): Promise<XpState> {
  const sup = getOrCreateSupabaseClient();
  const { data: userData } = await sup.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { totalXp: 0, level: 1, xpPerLevel: FALLBACK_XP_PER_LEVEL, intoLevel: 0, xpToNext: FALLBACK_XP_PER_LEVEL };

  const [xpRes, setRes] = await Promise.all([
    sup.from('user_xp').select('total_xp').eq('user_id', uid).maybeSingle(),
    sup.from('reward_settings').select('value').eq('key', 'xp_per_level').maybeSingle(),
  ]);

  const total = Number(xpRes.data?.total_xp ?? 0);
  const xpPerLevel =
    Number((setRes.data?.value as { 0?: number } | null)?.[0] ?? 0) || FALLBACK_XP_PER_LEVEL;

  const level = Math.floor(total / xpPerLevel) + 1;
  const intoLevel = total % xpPerLevel;
  return {
    totalXp: total,
    level,
    xpPerLevel,
    intoLevel,
    xpToNext: xpPerLevel - intoLevel,
  };
}

// ----------------------------------------------------------------
// Belöningar
// ----------------------------------------------------------------

export async function fetchRewardDefinitions(): Promise<RewardDefinition[]> {
  const sup = getOrCreateSupabaseClient();
  const { data, error } = await sup
    .from('reward_definitions')
    .select('*')
    .order('position', { ascending: true });
  if (error) throw new Error(err(error.message));
  return (data ?? []) as RewardDefinition[];
}

export async function fetchUnlocks(): Promise<Map<string, RewardUnlock>> {
  const sup = getOrCreateSupabaseClient();
  const { data: userData } = await sup.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return new Map();
  const { data, error } = await sup
    .from('reward_unlocks')
    .select('*')
    .eq('user_id', uid);
  if (error) throw new Error(err(error.message));
  const map = new Map<string, RewardUnlock>();
  for (const row of (data ?? []) as RewardUnlock[]) map.set(row.reward_id, row);
  return map;
}

export async function fetchUnlockedItems(): Promise<Set<string> > {
  const sup = getOrCreateSupabaseClient();
  const { data: userData } = await sup.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return new Set();
  const { data, error } = await sup
    .from('unlocked_decorations')
    .select('item_key')
    .eq('user_id', uid);
  if (error) throw new Error(err(error.message));
  return new Set((data ?? []).map((r) => String((r as { item_key: string }).item_key)));
}

export async function fetchXpHistory(limit = 30): Promise<
  Array<{ id: string; amount: number; source: string; note: string | null; created_at: string }>
> {
  const sup = getOrCreateSupabaseClient();
  const { data: userData } = await sup.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return [];
  const { data, error } = await sup
    .from('xp_transactions')
    .select('id, amount, source, note, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(err(error.message));
  return (data ?? []) as Array<{
    id: string;
    amount: number;
    source: string;
    note: string | null;
    created_at: string;
  }>;
}
