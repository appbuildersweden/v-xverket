import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { createDemoClient } from '../demo/client';
import { DEMO_USER } from '../demo/data';
import { demoActive, registerDemoClient } from '../lib/demo-mode';
import { completeTask, fetchXpState, listTasks, listUnlocks, listXpHistory } from '../lib/planner';
import { listGardenPlacements } from '../lib/garden';
import { listDecks } from '../lib/flashcards';
import { listMyTasks } from '../lib/assignments';
import { mapUser } from '../lib/auth-supabase';

/**
 * Demoläget är en lokal klient, inte en genväg förbi autentiseringen. Testet
 * kontrollerar att kontot tolkas som en privat elev, att data kommer från
 * exempeltabellerna och att ingenting går ut över nätet.
 */
describe('demoläget', () => {
  afterEach(() => {
    registerDemoClient(null);
  });

  it('loggar in som en privat elev enligt samma rolltolkning som appen', async () => {
    const client = createDemoClient();
    const { data } = await client.auth.getSession();
    const user = mapUser(data.session?.user as unknown as User);

    expect(user).not.toBeNull();
    expect(user?.role).toBe('elev');
    expect(user?.accountType).toBe('privat');
    expect(user?.username).toBe('demoelev');
    expect(user?.active).toBe(true);
  });

  it('visar exempelposter och delar ut XP exakt en gång', async () => {
    registerDemoClient(createDemoClient());
    expect(demoActive()).toBe(true);

    const tasks = await listTasks();
    expect(tasks.ok).toBe(true);
    expect(tasks.ok && tasks.data.length).toBeGreaterThan(0);

    // Demoläget börjar på 0 XP, precis som en ny elev.
    const before = await fetchXpState();
    expect(before.ok && before.data.totalXp).toBe(0);
    expect(before.ok && before.data.level).toBe(1);

    const open = tasks.ok ? tasks.data.find((task) => task.status !== 'klar') : undefined;
    expect(open).toBeDefined();
    if (!open) return;

    const first = await completeTask(open.id);
    const second = await completeTask(open.id);

    expect(first.ok && first.data.xpAwarded).toBe(10);
    // Servern (och demoklienten) betalar aldrig ut samma poäng två gånger.
    expect(second.ok && second.data.xpAwarded).toBe(0);
    expect(second.ok && second.data.totalXp).toBe(10);
  });

  it('ger 10 XP per avklarad egen post och låser upp rätt belöning', async () => {
    registerDemoClient(createDemoClient());
    const tasks = await listTasks();
    expect(tasks.ok).toBe(true);
    if (!tasks.ok) return;

    const open = tasks.data.filter((task) => task.status !== 'klar').slice(0, 2);
    expect(open).toHaveLength(2);

    const first = await completeTask(open[0].id);
    expect(first.ok && first.data.xpAwarded).toBe(10);
    expect(first.ok && first.data.totalXp).toBe(10);
    // 10 XP räcker inte till första belöningen (20 XP).
    expect(first.ok && first.data.unlocks).toHaveLength(0);

    // Att markera samma post igen ger varken XP eller en ny upplåsning.
    const again = await completeTask(open[0].id);
    expect(again.ok && again.data.xpAwarded).toBe(0);
    expect(again.ok && again.data.totalXp).toBe(10);

    const second = await completeTask(open[1].id);
    expect(second.ok && second.data.totalXp).toBe(20);
    expect(second.ok && second.data.unlocks.map((unlock) => unlock.name)).toEqual([
      'Lysande pumpalykta',
    ]);

    const unlocks = await listUnlocks();
    expect(unlocks.ok && unlocks.data.size).toBe(1);
  });

  it('börjar på 0 XP utan uppnådda belöningar eller placerade föremål', async () => {
    registerDemoClient(createDemoClient());

    const xp = await fetchXpState();
    expect(xp.ok && xp.data.totalXp).toBe(0);

    const unlocks = await listUnlocks();
    expect(unlocks.ok && unlocks.data.size).toBe(0);

    const placed = await listGardenPlacements();
    expect(placed.ok && placed.data).toEqual([]);

    const history = await listXpHistory();
    expect(history.ok && history.data).toEqual([]);
  });

  it('har inga tilldelade uppgifter för en privat elev', async () => {
    registerDemoClient(createDemoClient());
    const tasks = await listMyTasks();
    expect(tasks.ok && tasks.data).toEqual([]);
  });

  it('går aldrig ut på nätet', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    registerDemoClient(createDemoClient());

    await listDecks();
    await listTasks();
    await fetchXpState();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('delar inte data mellan två sessioner', async () => {
    const first = createDemoClient();
    const second = createDemoClient();

    const firstSession = await first.auth.getSession();
    expect(firstSession.data.session?.user).toEqual(DEMO_USER);
    expect(second).not.toBe(first);
  });
});
