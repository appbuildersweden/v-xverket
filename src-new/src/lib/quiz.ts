/**
 * Provträning.
 *
 * En övning består av frågor med svarsalternativ. Facit ligger i databasen och
 * lämnas aldrig ut till den som ska öva: eleven får frågorna utan rätt svar via
 * `get_quiz_questions`, och rättningen sker serversidigt i
 * `submit_quiz_attempt`. Därför kan resultatet inte påverkas från klienten.
 *
 * En elev (eller lärare) kan skapa egna övningar och öva på dem, och delade
 * övningar kan alla inloggade använda.
 */
import { Result, withClient } from './db';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export interface QuizSet {
  id: string;
  owner_id: string;
  title: string;
  subject: string | null;
  description: string | null;
  is_shared: boolean;
  created_at: string;
  isMine: boolean;
  questionCount: number;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  position: number;
}

export interface OwnerQuestion extends QuizQuestion {
  correct_index: number;
  explanation: string | null;
}

export interface QuizAnswerResult {
  question_id: string;
  prompt: string;
  options: string[];
  choice: number | null;
  correct_index: number;
  correct: boolean;
  explanation: string | null;
}

export interface QuizResult {
  score: number;
  total: number;
  results: QuizAnswerResult[];
}

export interface QuizAttempt {
  id: string;
  set_id: string;
  score: number;
  total: number;
  completed_at: string;
  set_title?: string | null;
}

export interface NewQuestionInput {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface AnswerInput {
  question_id: string;
  choice: number;
}

export function validateQuizSet(title: string): string | null {
  if (title.trim().length < 2) return 'Ge övningen en titel (minst 2 tecken).';
  if (title.trim().length > 120) return 'Titeln är för lång (max 120 tecken).';
  return null;
}

export function validateQuestion(input: NewQuestionInput): string | null {
  if (input.prompt.trim().length < 2) return 'Skriv en fråga (minst 2 tecken).';
  if (input.prompt.trim().length > 500) return 'Frågan är för lång (max 500 tecken).';

  const options = input.options.map((o) => o.trim());
  if (options.some((o) => !o)) return 'Fyll i alla svarsalternativ.';
  if (options.length < MIN_OPTIONS) return `Ange minst ${MIN_OPTIONS} svarsalternativ.`;
  if (options.length > MAX_OPTIONS) return `Ange högst ${MAX_OPTIONS} svarsalternativ.`;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return 'Svarsalternativen måste vara olika varandra.';
  }
  if (input.correct_index < 0 || input.correct_index >= options.length) {
    return 'Markera vilket alternativ som är rätt.';
  }
  return null;
}

export async function listQuizSets(): Promise<Result<QuizSet[]>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id ?? '';

    const { data, error } = await sup
      .from('quiz_sets')
      .select('id, owner_id, title, subject, description, is_shared, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as Array<Omit<QuizSet, 'isMine' | 'questionCount'>>;
    if (rows.length === 0) return [];

    const { data: questions, error: questionErr } = await sup
      .from('quiz_questions')
      .select('id, set_id')
      .in('set_id', rows.map((r) => r.id));
    if (questionErr) {
      // En elev får inte läsa frågorna (facit) — antalet visas då som 0.
      return rows.map((row) => ({ ...row, isMine: row.owner_id === uid, questionCount: 0 }));
    }

    const counts = new Map<string, number>();
    for (const q of (questions ?? []) as Array<{ set_id: string }>) {
      counts.set(q.set_id, (counts.get(q.set_id) ?? 0) + 1);
    }

    return rows.map((row) => ({
      ...row,
      isMine: row.owner_id === uid,
      questionCount: counts.get(row.id) ?? 0,
    }));
  });
}

export async function createQuizSet(input: {
  title: string;
  subject?: string;
  description?: string;
  is_shared?: boolean;
}): Promise<Result<QuizSet>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup
      .from('quiz_sets')
      .insert({
        owner_id: uid,
        title: input.title.trim(),
        subject: input.subject?.trim() || null,
        description: input.description?.trim() || null,
        is_shared: input.is_shared === true,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as Omit<QuizSet, 'isMine' | 'questionCount'>;
    return { ...row, isMine: true, questionCount: 0 };
  });
}

export async function updateQuizSet(
  id: string,
  patch: { title?: string; subject?: string | null; description?: string | null; is_shared?: boolean },
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('quiz_sets').update(patch).eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

export async function deleteQuizSet(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('quiz_sets').delete().eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

/** Frågorna med facit — bara för ägaren (används i redigeringsvyn). */
export async function listOwnQuestions(setId: string): Promise<Result<OwnerQuestion[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup
      .from('quiz_questions')
      .select('id, prompt, options, correct_index, explanation, position')
      .eq('set_id', setId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      prompt: String(row.prompt),
      options: Array.isArray(row.options) ? (row.options as string[]) : [],
      correct_index: Number(row.correct_index ?? 0),
      explanation: typeof row.explanation === 'string' ? row.explanation : null,
      position: Number(row.position ?? 0),
    }));
  });
}

export async function addQuestion(
  setId: string,
  input: NewQuestionInput,
  position = 0,
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('quiz_questions').insert({
      set_id: setId,
      prompt: input.prompt.trim(),
      options: input.options.map((o) => o.trim()),
      correct_index: input.correct_index,
      explanation: input.explanation.trim() || null,
      position,
    });
    if (error) throw error;
    return true as const;
  });
}

export async function deleteQuestion(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('quiz_questions').delete().eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

/** Frågorna utan facit, för den som ska öva. */
export async function getQuizQuestions(setId: string): Promise<Result<QuizQuestion[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('get_quiz_questions', { p_set: setId });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      prompt: String(row.prompt),
      options: Array.isArray(row.options) ? (row.options as string[]) : [],
      position: Number(row.position ?? 0),
    }));
  });
}

/** Skickar in svaren och får tillbaka serverrättat resultat. */
export async function submitQuizAttempt(
  setId: string,
  answers: readonly AnswerInput[],
): Promise<Result<QuizResult>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('submit_quiz_attempt', {
      p_set: setId,
      p_answers: answers,
    });
    if (error) throw error;

    const r = (data ?? {}) as Record<string, unknown>;
    const rawResults = Array.isArray(r.results) ? r.results : [];
    return {
      score: Number(r.score ?? 0),
      total: Number(r.total ?? 0),
      results: rawResults.map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        const choice = row.choice === null || row.choice === undefined ? null : Number(row.choice);
        return {
          question_id: String(row.question_id ?? ''),
          prompt: String(row.prompt ?? ''),
          options: Array.isArray(row.options) ? (row.options as string[]) : [],
          choice,
          correct_index: Number(row.correct_index ?? 0),
          correct: row.correct === true,
          explanation: typeof row.explanation === 'string' ? row.explanation : null,
        };
      }),
    };
  });
}

export async function listMyAttempts(limit = 10): Promise<Result<QuizAttempt[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup
      .from('quiz_attempts')
      .select('id, set_id, score, total, completed_at')
      .order('completed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      id: string;
      set_id: string;
      score: number;
      total: number;
      completed_at: string;
    }>;
    if (rows.length === 0) return [];

    const setIds = [...new Set(rows.map((r) => r.set_id))];
    const { data: sets } = await sup.from('quiz_sets').select('id, title').in('id', setIds);
    const titles = new Map<string, string>();
    for (const s of (sets ?? []) as Array<{ id: string; title: string }>) {
      titles.set(s.id, s.title);
    }

    return rows.map((row) => ({
      id: row.id,
      set_id: row.set_id,
      score: row.score,
      total: row.total,
      completed_at: row.completed_at,
      set_title: titles.get(row.set_id) ?? null,
    }));
  });
}

/** Procent rätt. Ren funktion. */
export function scorePercent(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 100);
}

/** Kort omdöme efter ett försök. Ren funktion. */
export function scoreLabel(score: number, total: number): string {
  const percent = scorePercent(score, total);
  if (total === 0) return 'Inga frågor';
  if (percent === 100) return 'Alla rätt!';
  if (percent >= 80) return 'Mycket bra';
  if (percent >= 60) return 'Bra';
  if (percent >= 40) return 'På väg';
  return 'Träna mer';
}
