import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { unreadTotal } from './api';

/**
 * Delad oläst-räknare.
 *
 * Räknaren ägs av servern (`elda_skola_unread_total`) och hålls uppdaterad när
 * ett meddelande läsmarkeras, skickas eller kommer in via realtime. Alla vyer
 * som visar samma siffra prenumererar på samma värde, så menyn och
 * meddelandesidan kan aldrig visa olika antal.
 */
let total = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(value: number) => void>();

function emit() {
  for (const listener of listeners) listener(total);
}

export function getUnreadTotal(): number {
  return total;
}

/** Hämtar räknaren från servern. Samtidiga anrop delar samma begäran. */
export async function refreshUnread(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = unreadTotal()
    .then((value) => {
      total = Number.isFinite(value) ? value : 0;
      emit();
    })
    .catch(() => {
      // Räknaren är en bekvämlighet – ett nätverksfel får inte krascha vyn.
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function subscribeUnread(listener: (value: number) => void): () => void {
  listeners.add(listener);
  listener(total);
  return () => {
    listeners.delete(listener);
  };
}

/** Räknaren som React-tillstånd, med ett första serveranrop. */
export function useUnreadTotal(): number {
  const [value, setValue] = useState(total);
  useEffect(() => {
    const unsubscribe = subscribeUnread(setValue);
    void refreshUnread();
    return unsubscribe;
  }, []);
  return value;
}

/**
 * Realtid för meddelanden. Prenumerationen ligger på servern; saknas realtime i
 * databasen händer ingenting och räknaren uppdateras i stället när vyn hämtar
 * data igen.
 */
export function useMessageRealtime(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshUnread(), 250);
    };

    const channel = supabase
      .channel('elda-skola-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, schedule)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'school_message_recipients' },
        schedule,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, schedule)
      .subscribe();

    // Synka när fliken får fokus igen, så siffran stämmer även utan realtime.
    const onFocus = () => schedule();
    window.addEventListener('focus', onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
