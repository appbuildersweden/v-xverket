/**
 * Den lokala klienten i demoläget.
 *
 * Klienten har samma form som `SupabaseClient` för de anrop appen faktiskt gör,
 * men den pratar aldrig med nätverket. All data ligger i en tabelluppsättning i
 * minnet (se `data.ts`) och försvinner när sidan laddas om. Ingenting skrivs
 * till Supabase, och det finns ingen genväg förbi autentiseringen i den riktiga
 * appen: klienten skapas bara när demoläget begärs i utvecklingsbygget.
 *
 * Filen laddas med en dynamisk import från `demo-mode.ts` och når därför aldrig
 * en vanlig produktionsanvändning.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_AI_ANSWER, DEMO_UID, DEMO_USER, buildDemoTables, demoDocAnswer } from './data';
import type { DemoRow, DemoTables } from './data';

type Filter =
  | { col: string; kind: 'eq' | 'neq'; value: unknown }
  | { col: string; kind: 'in'; value: unknown[] };

interface Order {
  col: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

function clone<T>(value: T): T {
  return value;
}

function matches(row: DemoRow, filters: readonly Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.kind === 'in') return filter.value.includes(row[filter.col]);
    if (filter.kind === 'neq') return row[filter.col] !== filter.value;
    return row[filter.col] === filter.value;
  });
}

function compareRows(a: DemoRow, b: DemoRow, orders: readonly Order[]): number {
  for (const order of orders) {
    const left = a[order.col];
    const right = b[order.col];
    if (left === right) continue;

    const leftEmpty = left === null || left === undefined;
    const rightEmpty = right === null || right === undefined;
    if (leftEmpty || rightEmpty) {
      // PostgREST lägger tomma värden sist i stigande ordning om inget annat
      // anges, och först i fallande.
      const emptyLast = order.nullsFirst === undefined ? order.ascending : !order.nullsFirst;
      return (leftEmpty ? 1 : -1) * (emptyLast ? 1 : -1);
    }

    const result = left < right ? -1 : 1;
    return order.ascending ? result : -result;
  }
  return 0;
}

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  return `${prefix}-${random}`;
}

/** En kedjebar fråga med samma metodnamn som supabase-js använder här. */
function createQuery(tables: DemoTables, table: string) {
  const filters: Filter[] = [];
  const orders: Order[] = [];
  let mode: Mode = 'select';
  let payload: DemoRow[] = [];
  let limit: number | null = null;
  let returning = false;
  let cardinality: 'single' | 'maybe' | null = null;
  let conflictColumns: string[] = ['id'];

  const rows = (): DemoRow[] => {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  };

  const run = (): { data: unknown; error: null } => {
    const all = rows();

    if (mode === 'insert' || mode === 'upsert') {
      const now = new Date().toISOString();
      const written: DemoRow[] = [];
      for (const raw of payload) {
        if (mode === 'upsert') {
          const existing = all.find((row) =>
            conflictColumns.every((column) => row[column] === raw[column]),
          );
          if (existing) {
            Object.assign(existing, raw, { updated_at: now });
            written.push(existing);
            continue;
          }
        }
        const row: DemoRow = {
          id: newId(table),
          created_at: now,
          updated_at: now,
          ...raw,
        };
        all.push(row);
        written.push(row);
      }
      return { data: cardinality ? written[0] ?? null : written, error: null };
    }

    if (mode === 'update') {
      const patch = payload[0] ?? {};
      const changed = all.filter((row) => matches(row, filters));
      for (const row of changed) Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return { data: returning ? changed : null, error: null };
    }

    if (mode === 'delete') {
      tables[table] = all.filter((row) => !matches(row, filters));
      return { data: null, error: null };
    }

    let result = all.filter((row) => matches(row, filters));
    if (orders.length > 0) {
      result = [...result].sort((a, b) => compareRows(a, b, orders));
    }
    if (limit !== null) result = result.slice(0, limit);

    if (cardinality === 'single') {
      return { data: result[0] ? clone(result[0]) : null, error: null };
    }
    if (cardinality === 'maybe') {
      return { data: result[0] ? clone(result[0]) : null, error: null };
    }
    return { data: result.map((row) => clone(row)), error: null };
  };

  const builder = {
    select(_columns?: string) {
      returning = true;
      return builder;
    },
    insert(values: DemoRow | DemoRow[]) {
      mode = 'insert';
      payload = Array.isArray(values) ? values : [values];
      return builder;
    },
    update(patch: DemoRow) {
      mode = 'update';
      payload = [patch];
      return builder;
    },
    upsert(values: DemoRow | DemoRow[], options?: { onConflict?: string }) {
      mode = 'upsert';
      payload = Array.isArray(values) ? values : [values];
      conflictColumns = options?.onConflict
        ? options.onConflict.split(',').map((column) => column.trim())
        : ['id'];
      return builder;
    },
    delete() {
      mode = 'delete';
      return builder;
    },
    eq(col: string, value: unknown) {
      filters.push({ col, kind: 'eq', value });
      return builder;
    },
    neq(col: string, value: unknown) {
      filters.push({ col, kind: 'neq', value });
      return builder;
    },
    in(col: string, value: unknown[]) {
      filters.push({ col, kind: 'in', value });
      return builder;
    },
    order(col: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
      orders.push({
        col,
        ascending: options?.ascending !== false,
        nullsFirst: options?.nullsFirst,
      });
      return builder;
    },
    limit(count: number) {
      limit = count;
      return builder;
    },
    single() {
      cardinality = 'single';
      return builder;
    },
    maybeSingle() {
      cardinality = 'maybe';
      return builder;
    },
    then(
      onFulfilled?: (value: { data: unknown; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve()
        .then(() => run())
        .then(onFulfilled, onRejected);
    },
  };

  return builder;
}

/** Bygger en ny lokal klient med färsk exempeldata. */
export function createDemoClient(): SupabaseClient {
  const tables = buildDemoTables();
  const session = {
    access_token: 'demo-session',
    refresh_token: 'demo-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: DEMO_USER,
  };

  const totalXp = (): number => {
    const row = (tables.user_xp ?? []).find((r) => r.user_id === DEMO_UID);
    return Number(row?.total_xp ?? 0);
  };

  const addXp = (amount: number, note: string): void => {
    if (!tables.user_xp) tables.user_xp = [];
    const row = tables.user_xp.find((r) => r.user_id === DEMO_UID);
    if (row) row.total_xp = totalXp() + amount;
    else tables.user_xp.push({ user_id: DEMO_UID, total_xp: amount });
    if (!tables.xp_transactions) tables.xp_transactions = [];
    tables.xp_transactions.push({
      id: newId('demo-xp'),
      user_id: DEMO_UID,
      amount,
      source: 'task',
      note,
      created_at: new Date().toISOString(),
    });
  };

  const rpc = (name: string, args?: Record<string, unknown>) => {
    const run = (): { data: unknown; error: { message: string } | null } => {
      const a = args ?? {};

      if (name === 'complete_task') {
        const id = String(a.p_task_id ?? '');
        const task = (tables.spec_tasks ?? []).find((r) => r.id === id);
        if (!task) return { data: null, error: { message: 'Uppgiften finns inte.' } };
        let awarded = 0;
        if (task.status !== 'klar') {
          task.status = 'klar';
          task.completed_at = new Date().toISOString();
          task.xp_awarded = true;
          awarded = 10;
          addXp(awarded, String(task.title ?? 'Egen post'));
        }
        return {
          data: { xp_awarded: awarded, total_xp: totalXp(), level: Math.floor(totalXp() / 100) + 1, unlocks: [] },
          error: null,
        };
      }

      if (name === 'reopen_task') {
        const id = String(a.p_task_id ?? '');
        const task = (tables.spec_tasks ?? []).find((r) => r.id === id);
        if (!task) return { data: null, error: { message: 'Uppgiften finns inte.' } };
        task.status = 'ej_paborjad';
        task.completed_at = null;
        return { data: null, error: null };
      }

      if (name === 'student_set_task_status') {
        const id = String(a.p_task_id ?? '');
        const task = (tables.student_tasks ?? []).find((r) => r.id === id);
        if (!task) return { data: null, error: { message: 'Uppgiften finns inte.' } };
        let awarded = 0;
        const next = a.p_status === null || a.p_status === undefined ? null : String(a.p_status);
        if (next) task.status = next;
        if (typeof a.p_submission === 'string' && a.p_submission.trim()) {
          task.submission = a.p_submission.trim();
          task.submitted_at = new Date().toISOString();
        }
        if (task.status === 'klar' && !task.xp_awarded) {
          task.xp_awarded = true;
          task.completed_at = new Date().toISOString();
          awarded = 10;
          addXp(awarded, String(task.title ?? 'Uppgift'));
        }
        return {
          data: {
            status: task.status,
            xp_awarded: awarded,
            total_xp: totalXp(),
            level: Math.floor(totalXp() / 100) + 1,
            unlocks: [],
          },
          error: null,
        };
      }

      if (name === 'get_quiz_questions') {
        const setId = String(a.p_set ?? '');
        const questions = (tables.quiz_questions ?? [])
          .filter((row) => row.set_id === setId)
          .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
          .map((row) => ({
            id: row.id,
            prompt: row.prompt,
            options: row.options,
            position: row.position,
          }));
        return { data: questions, error: null };
      }

      if (name === 'submit_quiz_attempt') {
        const setId = String(a.p_set ?? '');
        const answers = Array.isArray(a.p_answers) ? (a.p_answers as Array<Record<string, unknown>>) : [];
        const chosen = new Map(answers.map((answer) => [String(answer.question_id ?? ''), answer.choice]));
        const questions = (tables.quiz_questions ?? []).filter((row) => row.set_id === setId);
        const results = questions.map((question) => {
          const choice = chosen.has(String(question.id)) ? Number(chosen.get(String(question.id))) : null;
          const correctIndex = Number(question.correct_index ?? 0);
          return {
            question_id: question.id,
            prompt: question.prompt,
            options: question.options,
            choice,
            correct_index: correctIndex,
            correct: choice === correctIndex,
            explanation: question.explanation ?? null,
          };
        });
        const score = results.filter((r) => r.correct).length;
        if (!tables.quiz_attempts) tables.quiz_attempts = [];
        tables.quiz_attempts.push({
          id: newId('demo-attempt'),
          user_id: DEMO_UID,
          set_id: setId,
          score,
          total: results.length,
          completed_at: new Date().toISOString(),
        });
        return { data: { score, total: results.length, results }, error: null };
      }

      if (name === 'mark_follow_up') {
        return { data: null, error: null };
      }

      return { data: null, error: { message: 'Demoläget har inte den funktionen.' } };
    };

    return {
      then(
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve()
          .then(() => run())
          .then(onFulfilled, onRejected);
      },
    };
  };

  const signedUrl = (path: string): string => {
    const text = [
      'Det här är en demofil.',
      '',
      `Filen "${path.split('/').pop() ?? path}" finns bara i demoläget.`,
      'Ingen riktig fil ligger bakom länken, och inget hämtas från Supabase.',
    ].join('\n');
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    }
    return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
  };

  const client = {
    auth: {
      async getUser() {
        return { data: { user: DEMO_USER }, error: null };
      },
      async getSession() {
        return { data: { session }, error: null };
      },
      async refreshSession() {
        return { data: { session, user: DEMO_USER }, error: null };
      },
      onAuthStateChange() {
        return {
          data: { subscription: { unsubscribe() {} } },
        };
      },
      async signOut() {
        // Att lämna demoläget är samma sak som att logga ut: ingen riktig
        // session finns att avsluta, så sidan går tillbaka till inloggningen.
        const { leaveDemo } = await import('../lib/demo-mode');
        leaveDemo();
        return { error: null };
      },
      async updateUser() {
        return {
          data: { user: null },
          error: { message: 'Demoläget sparar inget. Byt lösenord i den riktiga appen.' },
        };
      },
    },

    from(table: string) {
      return createQuery(tables, table);
    },

    rpc,

    functions: {
      async invoke(name: string, options?: { body?: Record<string, unknown> }) {
        if (name === 'ai-chat') {
          const kind = options?.body?.docKind;
          return {
            data: {
              content: typeof kind === 'string' ? demoDocAnswer(kind) : DEMO_AI_ANSWER,
            },
            error: null,
          };
        }
        return {
          data: null,
          error: { message: 'Demoläget har ingen serverfunktion.' },
        };
      },
    },

    storage: {
      from() {
        return {
          async list() {
            return { data: [], error: null };
          },
          async upload(path: string) {
            return { data: { path }, error: null };
          },
          async remove() {
            return { data: [], error: null };
          },
          async createSignedUrl(path: string) {
            return { data: { signedUrl: signedUrl(path) }, error: null };
          },
        };
      },
    },
  };

  return client as unknown as SupabaseClient;
}
