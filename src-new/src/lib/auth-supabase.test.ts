import { FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  GENERIC_LOGIN_ERROR,
  PASSWORD_CHANGE_REQUIRED,
  mapFunctionsError,
  mapLoginError,
  mapUser,
  validateLoginInput,
} from './auth-supabase';

function httpError(status: number, body: unknown = {}): FunctionsHttpError {
  return new FunctionsHttpError(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('validateLoginInput', () => {
  it('kräver båda fälten', () => {
    expect(validateLoginInput('', '')).toMatch(/både användarnamn och lösenord/i);
    expect(validateLoginInput('ejentu01', '')).toMatch(/lösenord/i);
    expect(validateLoginInput('', 'hemligt123')).toMatch(/användarnamn/i);
  });

  it('avvisar användarnamn som bryter mot regeln', () => {
    expect(validateLoginInput('Ej', 'hemligt123')).toMatch(/ogiltigt/i);
    expect(validateLoginInput('ej entu 01', 'hemligt123')).toMatch(/ogiltigt/i);
  });

  it('släpper igenom giltiga uppgifter (utan att avslöja om kontot finns)', () => {
    expect(validateLoginInput('ejentu01', 'hemligt123')).toBeNull();
    expect(validateLoginInput('  Ejentu01  ', 'hemligt123')).toBeNull();
  });
});

describe('mapFunctionsError', () => {
  it('ger ett generiskt fel vid 401 — avslöjar inte om kontot finns', async () => {
    const failure = await mapFunctionsError(
      httpError(401, { error: 'Fel användarnamn eller lösenord.' }),
    );
    expect(failure.ok).toBe(false);
    expect(failure.error).toBe(GENERIC_LOGIN_ERROR);
    expect(failure.error).not.toMatch(/finns inte|okänt konto|no such/i);
  });

  it('visar serverns meddelande för 403 och 429', async () => {
    const forbidden = await mapFunctionsError(
      httpError(403, { error: 'Kontot är inaktiverat. Kontakta administratören.' }),
    );
    expect(forbidden.error).toMatch(/inaktiverat/i);

    const throttled = await mapFunctionsError(httpError(429, {}));
    expect(throttled.error).toMatch(/för många försök/i);
  });

  it('hanterar nätverksfel utan att läcka interna detaljer', async () => {
    const network = await mapFunctionsError(new TypeError('fetch failed'));
    expect(network.ok).toBe(false);
    expect(network.error).toMatch(/anslutning/i);
  });
});

describe('mapLoginError', () => {
  it('känner igen kravet på nytt lösenord och lämnar ingen session', async () => {
    const failure = await mapLoginError(
      httpError(409, {
        error: PASSWORD_CHANGE_REQUIRED,
        mustChangePassword: true,
      }),
    );
    expect(failure.ok).toBe(false);
    expect(failure.mustSetNewPassword).toBe(true);
    expect(failure.error).toBe(PASSWORD_CHANGE_REQUIRED);
  });

  it('sätter ingen flagga vid vanliga inloggningsfel', async () => {
    const wrongPassword = await mapLoginError(
      httpError(401, { error: 'Fel användarnamn eller lösenord.' }),
    );
    expect(wrongPassword).toEqual({ ok: false, error: GENERIC_LOGIN_ERROR });

    // 400 utan kravet (t.ex. ett för svagt lösenord) ska visas som det är.
    const weak = await mapLoginError(
      httpError(400, { error: 'Lösenordet måste vara minst 8 tecken.' }),
    );
    expect(weak.mustSetNewPassword).toBeUndefined();
    expect(weak.error).toMatch(/minst 8 tecken/i);
  });
});

describe('mapUser', () => {
  it('läser roll och flaggor från app_metadata (serverstyrt)', () => {
    const withMeta = {
      id: '1',
      email: 'x@y.z',
      app_metadata: { role: 'admin', username: 'ejentu01', must_change_password: true },
      user_metadata: {},
    };
    const mapped = mapUser(withMeta as never);
    expect(mapped).toMatchObject({
      id: '1',
      username: 'ejentu01',
      role: 'admin',
      active: true,
      mustChangePassword: true,
    });
  });

  it('ger rollen "okand" i stället för att gissa när metadata saknas', () => {
    const withoutRole = { id: '2', email: 'a@b.c', app_metadata: {}, user_metadata: {} };
    const mapped = mapUser(withoutRole as never);
    expect(mapped?.role).toBe('okand');
  });
});
