/**
 * Flashcards och repetition.
 *
 * En kortlek ägs av den som skapar den. Delade kortlekar (`is_shared`) kan övas
 * av alla inloggade — det är så lärarens material når eleverna. Själva korten
 * kan bara ändras av ägaren, medan repetitionsstatusen alltid är personlig och
 * sparas per användare i `flashcard_progress`.
 */
import { Result, withClient } from './db';

export interface FlashcardDeck {
  id: string;
  owner_id: string;
  title: string;
  subject: string | null;
  is_shared: boolean;
  created_at: string;
  /** Sant om den inloggade äger kortleken (får då redigera den). */
  isMine: boolean;
  cardCount: number;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  question: string;
  answer: string;
  position: number;
  known_count: number;
  repeat_count: number;
  last_result: boolean | null;
}

export interface DeckStats {
  total: number;
  known: number;
  repeat: number;
  unseen: number;
}

export const MAX_QUESTION_LENGTH = 500;
export const MAX_ANSWER_LENGTH = 1000;

export function validateDeck(title: string): string | null {
  if (title.trim().length < 2) return 'Ge kortleken en titel (minst 2 tecken).';
  if (title.trim().length > 120) return 'Titeln är för lång (max 120 tecken).';
  return null;
}

export function validateCard(question: string, answer: string): string | null {
  if (question.trim().length < 1) return 'Skriv en fråga.';
  if (question.trim().length > MAX_QUESTION_LENGTH) {
    return `Frågan är för lång (max ${MAX_QUESTION_LENGTH} tecken).`;
  }
  if (answer.trim().length < 1) return 'Skriv ett svar.';
  if (answer.trim().length > MAX_ANSWER_LENGTH) {
    return `Svaret är för långt (max ${MAX_ANSWER_LENGTH} tecken).`;
  }
  return null;
}

export async function listDecks(): Promise<Result<FlashcardDeck[]>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id ?? '';

    const { data, error } = await sup
      .from('flashcard_decks')
      .select('id, owner_id, title, subject, is_shared, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as Array<Omit<FlashcardDeck, 'isMine' | 'cardCount'>>;
    if (rows.length === 0) return [];

    const { data: cards, error: cardErr } = await sup
      .from('flashcards')
      .select('id, deck_id')
      .in('deck_id', rows.map((r) => r.id));
    if (cardErr) throw cardErr;

    const counts = new Map<string, number>();
    for (const c of (cards ?? []) as Array<{ deck_id: string }>) {
      counts.set(c.deck_id, (counts.get(c.deck_id) ?? 0) + 1);
    }

    return rows.map((row) => ({
      ...row,
      isMine: row.owner_id === uid,
      cardCount: counts.get(row.id) ?? 0,
    }));
  });
}

export async function createDeck(input: {
  title: string;
  subject?: string;
  is_shared?: boolean;
}): Promise<Result<FlashcardDeck>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data, error } = await sup
      .from('flashcard_decks')
      .insert({
        owner_id: uid,
        title: input.title.trim(),
        subject: input.subject?.trim() || null,
        is_shared: input.is_shared === true,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as Omit<FlashcardDeck, 'isMine' | 'cardCount'>;
    return { ...row, isMine: true, cardCount: 0 };
  });
}

export async function updateDeck(
  id: string,
  patch: { title?: string; subject?: string | null; is_shared?: boolean },
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup
      .from('flashcard_decks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

export async function deleteDeck(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('flashcard_decks').delete().eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

/** Korten i en lek, med den inloggade användarens repetitionsstatus. */
export async function listCards(deckId: string): Promise<Result<Flashcard[]>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id ?? '';

    const { data: cards, error } = await sup
      .from('flashcards')
      .select('id, deck_id, question, answer, position')
      .eq('deck_id', deckId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = (cards ?? []) as Array<Omit<Flashcard, 'known_count' | 'repeat_count' | 'last_result'>>;
    if (rows.length === 0) return [];

    const { data: progress, error: progressErr } = await sup
      .from('flashcard_progress')
      .select('card_id, known_count, repeat_count, last_result')
      .eq('user_id', uid)
      .in('card_id', rows.map((r) => r.id));
    if (progressErr) throw progressErr;

    const byCard = new Map<string, { known_count: number; repeat_count: number; last_result: boolean | null }>();
    for (const p of (progress ?? []) as Array<{
      card_id: string;
      known_count: number;
      repeat_count: number;
      last_result: boolean | null;
    }>) {
      byCard.set(p.card_id, {
        known_count: p.known_count,
        repeat_count: p.repeat_count,
        last_result: p.last_result,
      });
    }

    return rows.map((row) => ({
      ...row,
      known_count: byCard.get(row.id)?.known_count ?? 0,
      repeat_count: byCard.get(row.id)?.repeat_count ?? 0,
      last_result: byCard.get(row.id)?.last_result ?? null,
    }));
  });
}

export async function addCard(
  deckId: string,
  question: string,
  answer: string,
  position = 0,
): Promise<Result<Flashcard>> {
  return withClient(async (sup) => {
    const { data, error } = await sup
      .from('flashcards')
      .insert({
        deck_id: deckId,
        question: question.trim(),
        answer: answer.trim(),
        position,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as Omit<Flashcard, 'known_count' | 'repeat_count' | 'last_result'>;
    return { ...row, known_count: 0, repeat_count: 0, last_result: null };
  });
}

export async function updateCard(
  id: string,
  patch: { question?: string; answer?: string; position?: number },
): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('flashcards').update(patch).eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

export async function deleteCard(id: string): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { error } = await sup.from('flashcards').delete().eq('id', id);
    if (error) throw error;
    return true as const;
  });
}

/**
 * Sparar repetitionsstatus för ett kort. Räknaren ökar — den ersätter aldrig
 * tidigare resultat, så eleven kan se hur många gånger kortet gått bra eller
 * behövt repeteras.
 */
export async function saveCardResult(cardId: string, known: boolean): Promise<Result<true>> {
  return withClient(async (sup) => {
    const { data: userData } = await sup.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('Din session har gått ut. Logga in igen.');

    const { data: existing } = await sup
      .from('flashcard_progress')
      .select('known_count, repeat_count')
      .eq('user_id', uid)
      .eq('card_id', cardId)
      .maybeSingle();

    const knownCount = Number((existing as { known_count?: number } | null)?.known_count ?? 0) + (known ? 1 : 0);
    const repeatCount = Number((existing as { repeat_count?: number } | null)?.repeat_count ?? 0) + (known ? 0 : 1);

    const { error } = await sup.from('flashcard_progress').upsert(
      {
        user_id: uid,
        card_id: cardId,
        known_count: knownCount,
        repeat_count: repeatCount,
        last_result: known,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,card_id' },
    );
    if (error) throw error;
    return true as const;
  });
}

/** Sammanställning av en leks repetition. Ren funktion. */
export function deckStats(cards: readonly Flashcard[]): DeckStats {
  let known = 0;
  let repeat = 0;
  let unseen = 0;
  for (const card of cards) {
    if (card.last_result === true) known += 1;
    else if (card.last_result === false) repeat += 1;
    else unseen += 1;
  }
  return { total: cards.length, known, repeat, unseen };
}

/** Nästa kort att öva: först okända, sedan de som behöver repeteras. */
export function nextCardIndex(cards: readonly Flashcard[], current: number): number {
  if (cards.length === 0) return 0;
  const order = cards.map((card, index) => ({ card, index }));
  const priority = (card: Flashcard) =>
    card.last_result === null ? 0 : card.last_result === false ? 1 : 2;
  order.sort((a, b) => {
    const diff = priority(a.card) - priority(b.card);
    if (diff !== 0) return diff;
    return a.index - b.index;
  });
  const next = order.find((entry) => entry.index !== current);
  return next ? next.index : current;
}

/** Procent klara kort, för förloppsindikatorn. */
export function knownRatio(stats: DeckStats): number {
  if (stats.total === 0) return 0;
  return Math.min(stats.known / stats.total, 1);
}
