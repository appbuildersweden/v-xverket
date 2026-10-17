import { describe, expect, it, vi } from 'vitest';
import {
  ERR_NETWORK,
  ERR_NOT_READY,
  ERR_PERMISSION,
  ERR_SESSION,
  query,
  toErrorMessage,
  withClient,
} from './db';

/**
 * Databaslagret får aldrig förvandla ett fel till en tom, lyckad lista.
 *
 * Ett tomt svar ska bara komma när servern faktiskt svarade utan fel — annars
 * skulle en panel visa "du har inga uppgifter" när sanningen är att hämtningen
 * misslyckades. Det här testet är därför skilt från panelproven: det mäter
 * själva felöversättningen, som alla sidor delar.
 */
const mocks = vi.hoisted(() => ({
  response: { data: null as unknown[] | null, error: null as unknown },
  thrown: null as unknown,
}));

vi.mock('./auth-supabase', () => ({
  getOrCreateSupabaseClient: () => ({
    from: () => ({
      select: async () => {
        if (mocks.thrown) throw mocks.thrown;
        return mocks.response;
      },
    }),
  }),
}));

function reset() {
  mocks.response = { data: null, error: null };
  mocks.thrown = null;
}

describe('query', () => {
  it('returnerar en tom lista bara när servern svarade utan fel', async () => {
    reset();
    mocks.response = { data: null, error: null };

    const result = await query((sup) =>
      (sup as unknown as { from: () => { select: () => Promise<unknown> } })
        .from()
        .select() as never,
    );

    expect(result).toEqual({ ok: true, data: [] });
  });

  it('gör ett databasfel till ett fel — inte till en tom lista', async () => {
    reset();
    mocks.response = {
      data: null,
      error: { message: 'new row violates row-level security policy' },
    };

    const result = await query((sup) =>
      (sup as unknown as { from: () => { select: () => Promise<unknown> } })
        .from()
        .select() as never,
    );

    expect(result).toEqual({ ok: false, error: ERR_PERMISSION });
  });

  it('fångar ett kastat undantag i stället för att låtsas att det gick bra', async () => {
    reset();
    mocks.thrown = new Error('Failed to fetch');

    const result = await query((sup) =>
      (sup as unknown as { from: () => { select: () => Promise<unknown> } })
        .from()
        .select() as never,
    );

    expect(result).toEqual({ ok: false, error: ERR_NETWORK });
  });
});

describe('withClient', () => {
  it('skickar vidare resultatet när anropet lyckas', async () => {
    reset();

    const result = await withClient(async () => 42);

    expect(result).toEqual({ ok: true, data: 42 });
  });

  it('gör ett kastat fel till ett fel', async () => {
    reset();

    const result = await withClient(async () => {
      throw new Error('permission denied for table tasks');
    });

    expect(result).toEqual({ ok: false, error: ERR_PERMISSION });
  });
});

describe('toErrorMessage', () => {
  it('känner igen behörighetsfel', () => {
    expect(toErrorMessage({ message: 'permission denied for table classes' })).toBe(
      ERR_PERMISSION,
    );
    expect(toErrorMessage('not authorized')).toBe(ERR_PERMISSION);
  });

  it('känner igen en migrering som inte är körd', () => {
    expect(toErrorMessage({ message: 'could not find the function public.list_my_tasks' })).toBe(
      ERR_NOT_READY,
    );
  });

  it('känner igen nätverksfel', () => {
    expect(toErrorMessage({ message: 'TypeError: Failed to fetch' })).toBe(ERR_NETWORK);
  });

  it('känner igen en utgången session', () => {
    expect(toErrorMessage({ message: 'JWT expired' })).toBe(ERR_SESSION);
  });

  it('visar serverns eget, läsbara meddelande', () => {
    expect(toErrorMessage({ message: 'Endast administratörer får granska ansökningar.' })).toBe(
      'Endast administratörer får granska ansökningar.',
    );
  });

  it('ger ett begripligt meddelande när felet är tomt', () => {
    expect(toErrorMessage(null)).toBe('Något gick fel. Försök igen.');
    expect(toErrorMessage({ message: '   ' })).toBe('Något gick fel. Försök igen.');
  });
});
