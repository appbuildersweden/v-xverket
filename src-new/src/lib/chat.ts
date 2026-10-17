/**
 * Meddelanden: global chatt, klasschatt och privata samtal.
 *
 * En kanal har en typ: 'global' (alla inloggade), 'klass' (klassens medlemmar)
 * eller 'direkt' (två personer). All åtkomst kontrolleras av servern —
 * `list_messages` och `send_message` vägrar lämna ut eller ta emot meddelanden i
 * en kanal användaren inte tillhör, och RLS skyddar tabellen direkt.
 *
 * Meddelandena hämtas alltid genom de skyddade funktionerna i databasen. Nya
 * meddelanden upptäcks dessutom via Supabase Realtime när tabellen är publicerad
 * i projektet (se migreringen `20261022000000_chat_realtime.sql`) — händelsen
 * används då bara som en signal att hämta om, så att det som visas alltid har
 * gått genom åtkomstkontrollen. Är realtid inte påslagen fungerar chatten
 * likadant, men uppdateras i stället med jämna mellanrum.
 */
import { RealtimeChannel } from '@supabase/supabase-js';
import { getOrCreateSupabaseClient } from './auth-supabase';
import { Result, query, withClient } from './db';
import { formatShortStamp, formatTime } from './dates';

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_username: string;
  body: string;
  created_at: string;
}

export interface DirectConversation {
  channelId: string;
  otherId: string;
  otherUsername: string;
  lastBody: string | null;
  lastAt: string | null;
}

export const MAX_MESSAGE_LENGTH = 4000;
export const POLL_INTERVAL_MS = 10_000;

/** Validerar ett meddelande innan det skickas. Null betyder att allt är ok. */
export function validateMessage(body: string): string | null {
  const text = body.trim();
  if (!text) return 'Skriv ett meddelande först.';
  if (text.length > MAX_MESSAGE_LENGTH) {
    return `Meddelandet är för långt (max ${MAX_MESSAGE_LENGTH} tecken).`;
  }
  return null;
}

/** Hämtar den globala kanalens id. Kanalen skapas av migreringen. */
export async function getGlobalChannelId(): Promise<Result<string>> {
  const result = await query<{ id: string }>((sup) =>
    sup.from('chat_channels').select('id').eq('kind', 'global').limit(1),
  );
  if (!result.ok) return result;
  const id = result.data?.[0]?.id;
  if (!id) {
    return {
      ok: false,
      error: 'Den globala chatten är inte skapad i databasen ännu. Be en administratör köra migreringen.',
    };
  }
  return { ok: true, data: id };
}

export async function listMessages(
  channelId: string,
  limit = 200,
): Promise<Result<ChatMessage[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_messages', {
      p_channel: channelId,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as ChatMessage[]).map((m) => ({
      id: String(m.id),
      sender_id: String(m.sender_id),
      sender_username: m.sender_username ?? 'okänd',
      body: m.body,
      created_at: m.created_at,
    }));
  });
}

export async function sendMessage(
  channelId: string,
  body: string,
): Promise<Result<ChatMessage>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('send_message', {
      p_channel: channelId,
      p_body: body.trim(),
    });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? ''),
      sender_id: String(r.sender_id ?? ''),
      sender_username: String(r.sender_username ?? 'du'),
      body: String(r.body ?? ''),
      created_at: String(r.created_at ?? new Date().toISOString()),
    };
  });
}

/** Öppnar (eller hittar) det privata samtalet med en person. */
export async function openDirectChannel(otherId: string): Promise<Result<string>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('open_direct_channel', { p_other: otherId });
    if (error) throw error;
    const id = typeof data === 'string' ? data : '';
    if (!id) throw new Error('Samtalet kunde inte öppnas.');
    return id;
  });
}

export async function listDirectConversations(): Promise<Result<DirectConversation[]>> {
  return withClient(async (sup) => {
    const { data, error } = await sup.rpc('list_my_direct_channels');
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      channelId: String(row.channel_id),
      otherId: String(row.other_id),
      otherUsername: String(row.other_username ?? 'okänd'),
      lastBody: typeof row.last_body === 'string' ? row.last_body : null,
      lastAt: typeof row.last_at === 'string' ? row.last_at : null,
    }));
  });
}

/** Tiden mellan två hämtningar som en realtidshändelse får utlösa. */
export const REALTIME_DEBOUNCE_MS = 800;

/**
 * Signalerar när ett nytt meddelande har skrivits i kanalen.
 *
 * Händelsen används som en signal — innehållet hämtas därefter via
 * `list_messages`, så att det som visas alltid är kontrollerat av servern.
 * Prenumerationen tål att realtid inte är påslagen: då händer ingenting, och
 * chatten uppdateras som förut med jämna mellanrum.
 *
 * Returnerar en funktion som stänger prenumerationen.
 */
export function subscribeToChannel(channelId: string, onSignal: () => void): () => void {
  let channel: RealtimeChannel | null = null;

  try {
    channel = getOrCreateSupabaseClient()
      .channel(`meddelanden:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => onSignal(),
      )
      .subscribe();
  } catch {
    // Realtid är en bonus, inte ett krav: misslyckas den fortsätter chatten
    // precis som förut.
    channel = null;
  }

  return () => {
    if (!channel) return;
    try {
      void getOrCreateSupabaseClient().removeChannel(channel);
    } catch {
      /* prenumerationen stängs när sidan lämnas i vilket fall */
    }
  };
}

/**
 * Lägger till nya meddelanden utan att skriva över historiken. Används vid
 * uppdatering så att listan inte hoppar och inte tappar meddelanden.
 */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return [...current];
  const byId = new Map<string, ChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
}

/** Visar meddelandets tid: klockslag idag, annars kort datum. */
export function messageStamp(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? formatTime(value) : formatShortStamp(value);
}

/** Kort sammanfattning av ett samtals sista meddelande. */
export function conversationPreview(conversation: DirectConversation): string {
  if (!conversation.lastBody) return 'Inga meddelanden ännu';
  const text = conversation.lastBody.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
