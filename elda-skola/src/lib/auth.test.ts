import { describe, expect, it } from 'vitest';
import { identityFromUser, schoolAccess } from './auth';
import type { User } from '@supabase/supabase-js';
import { validateNewPassword } from './password';

function user(appMetadata: Record<string, unknown>, extra: Partial<User> = {}): User {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    app_metadata: appMetadata,
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-10-01T10:00:00Z',
    email: 'egon@vaxverket.local',
    ...extra,
  } as User;
}

describe('identityFromUser', () => {
  it('läser roll, kontotyp och status från serverstyrda metadata', () => {
    const identity = identityFromUser(
      user({ username: 'egon01', role: 'elev', account_type: 'skola', active: true }),
    );
    expect(identity).toMatchObject({
      username: 'egon01',
      role: 'elev',
      accountType: 'skola',
      active: true,
    });
  });

  it('gör okänd roll till okand i stället för att gissa', () => {
    expect(identityFromUser(user({ role: 'hacker' }))?.role).toBe('okand');
    expect(identityFromUser(user({}))?.role).toBe('okand');
  });

  it('behandlar saknad kontotyp som skolelev', () => {
    expect(identityFromUser(user({ role: 'elev' }))?.accountType).toBe('skola');
    expect(identityFromUser(user({ role: 'elev', account_type: 'privat' }))?.accountType).toBe(
      'privat',
    );
  });

  it('returnerar null utan användare', () => {
    expect(identityFromUser(null)).toBeNull();
  });
});

describe('schoolAccess', () => {
  const base = {
    id: '1',
    username: 'elev01',
    role: 'elev' as const,
    accountType: 'skola' as const,
    active: true,
    mustChangePassword: false,
    lastSignInAt: null,
  };

  it('släpper in lärare och skolelever', () => {
    expect(schoolAccess({ ...base, role: 'lärare', username: 'larare01' }).access).toBe('teacher');
    expect(schoolAccess(base).access).toBe('student');
  });

  it('stänger ute privata elevkonton', () => {
    const result = schoolAccess({ ...base, accountType: 'privat' });
    expect(result.access).toBe('denied');
    expect(result.reason).toMatch(/privat elevkonto/);
  });

  it('ger systemadministratören adminpanelen och specialläraren sin egen panel', () => {
    expect(schoolAccess({ ...base, role: 'admin' }).access).toBe('admin');
    expect(schoolAccess({ ...base, role: 'speciallärare' }).access).toBe('specialteacher');
  });

  it('stänger ute okänd roll', () => {
    const result = schoolAccess({ ...base, role: 'okand' });
    expect(result.access).toBe('denied');
    expect(result.reason).toMatch(/skolroll/);
  });

  it('stänger ute inaktiva konton även för admin och speciallärare', () => {
    expect(schoolAccess({ ...base, role: 'admin', active: false }).access).toBe('denied');
    expect(schoolAccess({ ...base, role: 'speciallärare', active: false }).access).toBe('denied');
  });

  it('stänger ute inaktiva konton', () => {
    expect(schoolAccess({ ...base, active: false }).access).toBe('denied');
  });
});

describe('validateNewPassword', () => {
  it('kräver minst åtta tecken och samma bekräftelse', () => {
    expect(validateNewPassword('kort', 'kort')).toMatch(/minst 8/);
    expect(validateNewPassword('långtlösen', 'annatlösen')).toMatch(/stämmer inte/);
    expect(validateNewPassword('långtlösen', 'långtlösen')).toBeNull();
  });

  it('avvisar lösenord som är användarnamnet', () => {
    expect(validateNewPassword('egon1234', 'egon1234', 'egon1234')).toMatch(/användarnamn/);
  });
});
