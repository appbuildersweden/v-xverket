import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, supabase } from './supabase';

/**
 * Gemensam notifikationstjänst (klientdel).
 *
 * Notifikationer skapas enbart av databasen från verkliga händelser. Klienten
 * kan bara läsa sina egna rader och markera dem som lästa via serverfunktioner.
 * Mottagare och behörigheter avgörs i databasen (se migrationen för notifications).
 */

export type NotificationKind =
  | 'new_message'
  | 'new_assignment'
  | 'assignment_feedback'
  | 'announcement_published';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** Appens sidnyckel, t.ex. 'uppgifter' eller 'meddelanden'. */
  targetPage: string;
  createdAt: string;
  readAt: string | null;
}

export const NOTIFICATION_LIMIT = 30;

interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  target_page: string;
  created_at: string;
  read_at: string | null;
}

export function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    targetPage: row.target_page,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function listNotifications(limit = NOTIFICATION_LIMIT): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, target_page, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(errorMessage(error, 'Notifikationerna kunde inte hämtas.'));
  return ((data ?? []) as NotificationRow[]).map(toNotification);
}

/** Antalet olästa, räknat i databasen (inte begränsat av listans storlek). */
export async function unreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc('elda_skola_unread_notifications');
  if (error) throw new Error(errorMessage(error, 'Antalet olästa kunde inte hämtas.'));
  const value = Number(data ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('elda_skola_mark_notification_read', { p_id: id });
  if (error) throw new Error(errorMessage(error, 'Notifikationen kunde inte markeras som läst.'));
  return Boolean(data);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('elda_skola_mark_all_notifications_read');
  if (error) throw new Error(errorMessage(error, 'Notifikationerna kunde inte markeras som lästa.'));
  return Number(data ?? 0);
}

export interface NotificationState {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  error: string | null;
  /** true när realtidsprenumerationen är aktiv. Annars uppdateras listan vid fokus. */
  live: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * Hook för ringklockan. Hämtar listan och räknaren, lyssnar på realtid och
 * avbryter prenumerationen när komponenten avmonteras.
 */
export function useNotifications(enabled = true): NotificationState {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const mounted = useRef(true);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([listNotifications(), unreadNotificationCount()]);
      if (!mounted.current || current !== requestId.current) return;
      setItems(list);
      setUnread(count);
      setError(null);
    } catch (caught) {
      if (!mounted.current || current !== requestId.current) return;
      // Visa inte gamla siffror som om de vore aktuella: behåll listan men markera felet.
      setError(caught instanceof Error ? caught.message : 'Något gick fel. Försök igen.');
    } finally {
      if (mounted.current && current === requestId.current) setLoading(false);
    }
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await markNotificationRead(id);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Något gick fel. Försök igen.');
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Något gick fel. Försök igen.');
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250);
    };

    void refresh();

    // RLS gäller även för realtid, så varje mottagare får bara sina egna händelser.
    const channel = supabase
      .channel('elda-skola-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, schedule)
      .subscribe((status) => {
        if (!mounted.current) return;
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') void refresh();
      });

    const onFocus = () => schedule();
    window.addEventListener('focus', onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { items, unread, loading, error, live, refresh, markRead, markAllRead };
}
