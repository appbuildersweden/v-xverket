import { describe, expect, it } from 'vitest';
import { resolveRoute, routeToRender } from './guards';
import { VäxverketUser } from './auth-types';

function user(
  role: VäxverketUser['role'],
  active = true,
  accountType?: VäxverketUser['accountType'],
): VäxverketUser {
  return {
    id: 'u1',
    username: 'ejentu01',
    role,
    active,
    mustChangePassword: false,
    ...(accountType ? { accountType } : {}),
  };
}

describe('resolveRoute', () => {
  it('visar inloggningen när ingen session finns', () => {
    expect(resolveRoute(null, { panel: 'admin', page: 'start' })).toEqual({
      kind: 'login',
    });
  });

  it('nekar ett inaktiverat konto', () => {
    const decision = resolveRoute(user('elev', false), { panel: 'elev', page: 'start' });
    expect(decision.kind).toBe('deny');
  });

  it('nekar en roll appen inte känner igen — utan att gissa admin eller elev', () => {
    const unknown = { ...user('elev'), role: 'okand' as VäxverketUser['role'] };
    const decision = resolveRoute(unknown, { panel: 'elev', page: 'start' });
    expect(decision.kind).toBe('deny');
  });

  it('släpper igenom eleven till sin egen panel', () => {
    expect(resolveRoute(user('elev'), { panel: 'elev', page: 'start' })).toEqual({
      kind: 'allow',
      panel: 'elev',
      page: 'start',
    });
  });

  it('skickar en privat elev till privatelevpanelen', () => {
    expect(
      resolveRoute(user('elev', true, 'privat'), { panel: 'elev', page: 'start' }),
    ).toMatchObject({ kind: 'redirect', panel: 'privat', page: 'start' });
  });

  it('släpper igenom en privat elev i privatelevpanelen', () => {
    expect(
      resolveRoute(user('elev', true, 'privat'), { panel: 'privat', page: 'uppgifter' }),
    ).toEqual({ kind: 'allow', panel: 'privat', page: 'uppgifter' });
  });

  it('nekar en privat elev klassrutten även via en direktadress', () => {
    const decision = resolveRoute(
      { ...user('elev', true, 'privat'), accountType: 'privat' },
      { panel: 'elev', page: 'klass' },
    );
    expect(decision).toMatchObject({ kind: 'redirect', panel: 'privat' });
  });

  it('släpper inte in en skolelev i privatelevpanelen', () => {
    const decision = resolveRoute(user('elev'), { panel: 'privat', page: 'start' });
    expect(decision).toMatchObject({ kind: 'redirect', panel: 'elev' });
  });

  it('skickar eleven till elevpanelen när adminpanelen begärs', () => {
    const decision = resolveRoute(user('elev'), { panel: 'admin', page: 'roller' });
    expect(decision).toMatchObject({
      kind: 'redirect',
      panel: 'elev',
      page: 'start',
    });
  });

  it('skickar eleven till elevpanelen när speciallärarpanelen begärs', () => {
    const decision = resolveRoute(user('elev'), {
      panel: 'speciallarar',
      page: 'hem',
    });
    expect(decision).toMatchObject({ kind: 'redirect', panel: 'elev' });
  });

  it('skickar specialläraren till speciallärarpanelen när admin begärs', () => {
    const decision = resolveRoute(user('speciallärare'), {
      panel: 'admin',
      page: 'anvandare',
    });
    expect(decision).toMatchObject({
      kind: 'redirect',
      panel: 'speciallarar',
      page: 'hem',
    });
  });

  it('ger läraren lärarpanelen som start', () => {
    expect(resolveRoute(user('lärare'), { panel: 'larare', page: 'hem' })).toEqual({
      kind: 'allow',
      panel: 'larare',
      page: 'hem',
    });
  });

  it('släpper inte in läraren i adminpanelen', () => {
    const decision = resolveRoute(user('lärare'), {
      panel: 'admin',
      page: 'ansokningar',
    });
    expect(decision).toMatchObject({
      kind: 'redirect',
      panel: 'larare',
      page: 'hem',
    });
  });

  it('släpper inte in eleven i lärarpanelen', () => {
    const decision = resolveRoute(user('elev'), { panel: 'larare', page: 'klasser' });
    expect(decision).toMatchObject({ kind: 'redirect', panel: 'elev', page: 'start' });
  });

  it('släpper igenom admin till alla paneler', () => {
    for (const panel of ['elev', 'larare', 'speciallarar', 'admin'] as const) {
      const decision = resolveRoute(user('admin'), { panel, page: 'start' });
      // 'start' finns i elev- och adminmenyn men inte i lärar- eller
      // speciallärarmenyn (där startsidan heter 'hem').
      if (panel === 'elev' || panel === 'admin') {
        expect(decision).toMatchObject({ kind: 'allow', panel });
      } else {
        expect(decision.kind).toBe('redirect');
      }
    }
  });

  it('skickar vidare till egen panel när sidan inte finns i panelen', () => {
    const decision = resolveRoute(user('elev'), { panel: 'elev', page: 'roller' });
    expect(decision).toMatchObject({ kind: 'redirect', panel: 'elev', page: 'start' });
  });

  it('ger alltid ett tillåtet mål — omdirigeringen kan inte loopa', () => {
    const cases: Array<Parameters<typeof resolveRoute>[1]> = [
      { panel: 'admin', page: 'roller' },
      { panel: 'speciallarar', page: 'hem' },
      { panel: 'elev', page: 'roller' },
    ];
    for (const requested of cases) {
      const first = resolveRoute(user('elev'), requested);
      const target = routeToRender(first);
      expect(target).not.toBeNull();
      const second = resolveRoute(user('elev'), target!);
      expect(second.kind).toBe('allow');
    }
  });
});
