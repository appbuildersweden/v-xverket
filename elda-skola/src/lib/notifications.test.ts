import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: { rpc: mocks.rpc },
  errorMessage: (error: unknown, fallback?: string) =>
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : (fallback ?? 'fel'),
}));

import {
  markAllNotificationsRead,
  markNotificationRead,
  toNotification,
  unreadNotificationCount,
} from './notifications';

describe('toNotification', () => {
  it('mappar databasraden till appens format', () => {
    const notification = toNotification({
      id: 'n1',
      kind: 'new_assignment',
      title: 'Ny uppgift: Matematik',
      body: null,
      target_page: 'uppgifter',
      created_at: '2026-10-20T08:00:00Z',
      read_at: null,
    });

    expect(notification).toEqual({
      id: 'n1',
      kind: 'new_assignment',
      title: 'Ny uppgift: Matematik',
      body: null,
      targetPage: 'uppgifter',
      createdAt: '2026-10-20T08:00:00Z',
      readAt: null,
    });
  });
});

describe('notifikations-RPC', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('markerar en notifikation med dess id', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(markNotificationRead('n1')).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('elda_skola_mark_notification_read', { p_id: 'n1' });
  });

  it('returnerar antal markerade vid markera alla', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });

    await expect(markAllNotificationsRead()).resolves.toBe(3);
    expect(mocks.rpc).toHaveBeenCalledWith('elda_skola_mark_all_notifications_read');
  });

  it('visar ett begripligt fel när servern nekar åtgärden', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    await expect(markNotificationRead('n2')).rejects.toThrow('new row violates row-level security policy');
  });

  it('räknar olästa från databasen och ger noll vid ogiltigt svar', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 5, error: null });
    await expect(unreadNotificationCount()).resolves.toBe(5);

    mocks.rpc.mockResolvedValueOnce({ data: 'abc', error: null });
    await expect(unreadNotificationCount()).resolves.toBe(0);
  });
});
