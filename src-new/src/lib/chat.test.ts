import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatMessage,
  conversationPreview,
  mergeMessages,
  subscribeToChannel,
  validateMessage,
} from './chat';

/**
 * Chatten: rena hjälpfunktioner och realtidssignalen.
 *
 * Realtiden testas mot en låtsad klient, så att testet ser exakt vilken kanal
 * och vilken händelse som prenumereras på. Att händelser bara når behöriga
 * användare avgörs av radnivåsäkerheten på servern — den kan bara provas mot en
 * riktig databas.
 */
const mocks = vi.hoisted(() => ({
  handler: null as null | ((payload: unknown) => void),
  subscribed: false,
  removed: [] as unknown[],
  channelName: '',
  filter: undefined as unknown,
  table: '',
  event: '',
  throwOnChannel: false,
}));

vi.mock('./auth-supabase', () => ({
  getOrCreateSupabaseClient: () => {
    if (mocks.throwOnChannel) throw new Error('ingen klient');
    const channel = {
      on: (event: string, config: Record<string, unknown>, handler: (p: unknown) => void) => {
        mocks.event = event;
        mocks.table = String(config.table);
        mocks.filter = config.filter;
        mocks.handler = handler;
        return channel;
      },
      subscribe: () => {
        mocks.subscribed = true;
        return channel;
      },
    };
    return {
      channel: (name: string) => {
        mocks.channelName = name;
        return channel;
      },
      removeChannel: async (ch: unknown) => {
        mocks.removed.push(ch);
      },
    };
  },
}));

beforeEach(() => {
  mocks.handler = null;
  mocks.subscribed = false;
  mocks.removed = [];
  mocks.channelName = '';
  mocks.filter = undefined;
  mocks.table = '';
  mocks.event = '';
  mocks.throwOnChannel = false;
});

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    sender_id: 'u1',
    sender_username: 'eanna01',
    body: 'Hej!',
    created_at: '2026-10-17T08:00:00Z',
    ...overrides,
  };
}

describe('meddelanden', () => {
  it('kräver text och begränsar längden', () => {
    expect(validateMessage('   ')).toMatch(/skriv ett meddelande/i);
    expect(validateMessage('x'.repeat(4001))).toMatch(/för långt/i);
    expect(validateMessage('Hej klassen!')).toBeNull();
  });

  it('lägger till nya meddelanden utan dubbletter och i rätt ordning', () => {
    const first = message({ id: 'm1', created_at: '2026-10-17T08:00:00Z' });
    const second = message({
      id: 'm2',
      body: 'Nästa',
      created_at: '2026-10-17T08:01:00Z',
      sender_username: 'ebert01',
    });
    const merged = mergeMessages([first], [second, first]);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(merged).toHaveLength(2);
  });

  it('behåller historiken när inget nytt kommit', () => {
    const list = [message()];
    expect(mergeMessages(list, [])).toEqual(list);
  });

  it('visar en kort förhandsvisning av ett samtal', () => {
    expect(
      conversationPreview({
        channelId: 'c1',
        otherId: 'u2',
        otherUsername: 'ebert01',
        lastBody: '',
        lastAt: null,
      }),
    ).toMatch(/inga meddelanden/i);

    const long = 'ord '.repeat(40);
    const preview = conversationPreview({
      channelId: 'c1',
      otherId: 'u2',
      otherUsername: 'ebert01',
      lastBody: long,
      lastAt: '2026-10-17T08:00:00Z',
    });
    expect(preview.length).toBeLessThanOrEqual(80);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('realtid', () => {
  it('prenumererar på nya meddelanden i rätt kanal', () => {
    const signal = vi.fn();
    subscribeToChannel('kanal-1', signal);

    expect(mocks.subscribed).toBe(true);
    expect(mocks.channelName).toBe('meddelanden:kanal-1');
    expect(mocks.event).toBe('postgres_changes');
    expect(mocks.table).toBe('messages');
    expect(mocks.filter).toBe('channel_id=eq.kanal-1');

    // En händelse ger en signal att hämta om — innehållet hämtas sedan via
    // den skyddade funktionen, aldrig direkt ur händelsen.
    mocks.handler?.({ new: { id: 'm9' } });
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it('stänger prenumerationen när vyn lämnas', () => {
    const unsubscribe = subscribeToChannel('kanal-2', vi.fn());
    unsubscribe();
    expect(mocks.removed).toHaveLength(1);
  });

  it('fungerar utan realtid när klienten inte kan prenumerera', () => {
    mocks.throwOnChannel = true;
    const signal = vi.fn();
    const unsubscribe = subscribeToChannel('kanal-3', signal);

    expect(() => unsubscribe()).not.toThrow();
    expect(signal).not.toHaveBeenCalled();
  });
});
