import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  unreadTotal: vi.fn(),
}));

vi.mock('./api', () => ({ unreadTotal: mocks.unreadTotal }));

vi.mock('./supabase', () => ({
  supabase: {
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    }),
    removeChannel: vi.fn(),
  },
}));

async function loadModule() {
  vi.resetModules();
  return import('./unread');
}

describe('oläst-räknare', () => {
  beforeEach(() => {
    mocks.unreadTotal.mockReset();
  });

  it('publicerar serverns värde till alla prenumeranter', async () => {
    const { refreshUnread, subscribeUnread, getUnreadTotal } = await loadModule();
    mocks.unreadTotal.mockResolvedValue(4);

    const seen: number[] = [];
    subscribeUnread((value) => seen.push(value));

    await refreshUnread();

    expect(getUnreadTotal()).toBe(4);
    expect(seen).toEqual([0, 4]);
  });

  it('delar samma begäran mellan samtidiga anrop', async () => {
    const { refreshUnread } = await loadModule();
    mocks.unreadTotal.mockResolvedValue(2);

    await Promise.all([refreshUnread(), refreshUnread(), refreshUnread()]);

    expect(mocks.unreadTotal).toHaveBeenCalledTimes(1);
  });

  it('behåller senaste värdet när ett anrop misslyckas', async () => {
    const { refreshUnread, getUnreadTotal } = await loadModule();
    mocks.unreadTotal.mockResolvedValueOnce(3);
    await refreshUnread();

    mocks.unreadTotal.mockRejectedValueOnce(new Error('nätverk'));
    await refreshUnread();

    expect(getUnreadTotal()).toBe(3);
  });

  it('slutar skicka värden efter avregistrering', async () => {
    const { refreshUnread, subscribeUnread } = await loadModule();
    mocks.unreadTotal.mockResolvedValue(1);
    const seen: number[] = [];
    const unsubscribe = subscribeUnread((value) => seen.push(value));
    unsubscribe();

    await refreshUnread();

    expect(seen).toEqual([0]);
  });

  it('visar noll när servern svarar med ett orimligt värde', async () => {
    const { refreshUnread, getUnreadTotal } = await loadModule();
    mocks.unreadTotal.mockResolvedValue(Number.NaN);

    await refreshUnread();

    expect(getUnreadTotal()).toBe(0);
  });
});
