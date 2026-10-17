import { describe, expect, it } from 'vitest';
import {
  accountTypeLabel,
  accountsWithRoles,
  activationQuestion,
  assignableRolesFor,
  countAccounts,
  displayName,
  filterByAccountType,
  filterByStatus,
  isCreatableRole,
  normalizeCreateAccount,
  roleLabel,
  searchAccounts,
  sortAccounts,
  validateCreateAccount,
} from './accounts';
import { AuthAccount } from './auth-types';

const accounts: AuthAccount[] = [
  { id: '1', username: 'ejentu01', role: 'admin', active: true, createdAt: '2026-01-01' },
  { id: '2', username: 'eannaad01', role: 'elev', active: true, createdAt: '2026-01-02' },
  { id: '3', username: 'elisaka01', role: 'elev', active: false, createdAt: null },
  { id: '4', username: 'espec01', role: 'speciallärare', active: true, createdAt: '2026-01-03' },
  { id: '5', username: 'elara01', role: 'lärare', active: true, createdAt: '2026-01-04' },
];

describe('countAccounts', () => {
  it('räknar konton per roll och status', () => {
    expect(countAccounts(accounts)).toEqual({
      total: 5,
      active: 4,
      inactive: 1,
      elev: 2,
      larare: 1,
      speciallarare: 1,
      admin: 1,
      utanRoll: 0,
    });
  });

  it('räknar konton utan giltig roll separat', () => {
    const odd = [
      { id: '9', username: 'x', role: 'okand' as never, active: true, createdAt: null },
    ];
    expect(countAccounts(odd).utanRoll).toBe(1);
  });

  it('tål en tom lista', () => {
    expect(countAccounts([])).toMatchObject({ total: 0, active: 0 });
  });
});

describe('sortAccounts', () => {
  it('sorterar på användarnamn utan att mutera indata', () => {
    const sorted = sortAccounts(accounts);
    expect(sorted.map((a) => a.username)).toEqual([
      'eannaad01',
      'ejentu01',
      'elara01',
      'elisaka01',
      'espec01',
    ]);
    expect(accounts[0].username).toBe('ejentu01');
  });
});

describe('validateCreateAccount', () => {
  const base = {
    username: 'enyuser01',
    password: 'hemligt123',
    confirmation: 'hemligt123',
    role: 'elev',
  };

  it('kräver användarnamn enligt regeln', () => {
    expect(validateCreateAccount({ ...base, username: '' })).toMatch(/användarnamn/i);
    expect(validateCreateAccount({ ...base, username: 'ab' })).toMatch(/3–32/);
    expect(validateCreateAccount({ ...base, username: 'Elda Admin' })).toMatch(/3–32/);
  });

  it('kräver lösenord och bekräftelse', () => {
    expect(validateCreateAccount({ ...base, password: '' })).toMatch(/lösenord/i);
    expect(validateCreateAccount({ ...base, password: 'kort' })).toMatch(/minst 8/);
    expect(
      validateCreateAccount({ ...base, password: 'hemligt123', confirmation: 'hemligt124' }),
    ).toMatch(/stämmer inte/i);
  });

  it('avvisar vanliga och självklara lösenord', () => {
    expect(
      validateCreateAccount({ ...base, password: 'student123', confirmation: 'student123' }),
    ).toMatch(/vanligt/i);
    expect(
      validateCreateAccount({
        ...base,
        username: 'hemligt123',
        password: 'hemligt123',
        confirmation: 'hemligt123',
      }),
    ).toMatch(/användarnamn/i);
  });

  it('kräver en giltig roll', () => {
    expect(validateCreateAccount({ ...base, role: '' })).toMatch(/roll/i);
    expect(validateCreateAccount({ ...base, role: 'superadmin' })).toMatch(/roll/i);
  });

  it('släpper igenom giltiga uppgifter och normaliserar dem', () => {
    expect(validateCreateAccount(base)).toBeNull();
    expect(
      normalizeCreateAccount({ ...base, username: '  EnYuser01 ' }),
    ).toEqual({ username: 'enyuser01', password: 'hemligt123', role: 'elev' });
  });

  it('tillåter inte administratörsrollen i kontoformuläret', () => {
    expect(isCreatableRole('admin')).toBe(false);
    expect(validateCreateAccount({ ...base, role: 'admin' })).toMatch(/roll/i);
  });

  it('kan låta servern skapa lösenordet i stället', () => {
    const input = { ...base, password: '', confirmation: '', generatePassword: true };
    expect(validateCreateAccount(input)).toBeNull();
    expect(normalizeCreateAccount(input)).toEqual({
      username: 'enyuser01',
      password: undefined,
      role: 'elev',
    });
  });
});

describe('filter och sökning i kontolistor', () => {
  it('filtrerar på aktiv status', () => {
    expect(filterByStatus(accounts, 'aktiva').map((a) => a.username)).toEqual([
      'ejentu01',
      'eannaad01',
      'espec01',
      'elara01',
    ]);
    expect(filterByStatus(accounts, 'inaktiva').map((a) => a.username)).toEqual(['elisaka01']);
    expect(filterByStatus(accounts, 'alla')).toHaveLength(5);
  });

  it('filtrerar elevkonton på kontotyp', () => {
    const withTypes = [
      ...accounts,
      {
        id: '6',
        username: 'eprivat01',
        role: 'elev' as const,
        active: true,
        createdAt: null,
        accountType: 'privat' as const,
      },
    ];
    expect(filterByAccountType(withTypes, 'privat').map((a) => a.username)).toEqual([
      'eprivat01',
    ]);
    // Konton utan kontotyp räknas som skolelever — samma tolkning som servern.
    expect(filterByAccountType(withTypes, 'skola').map((a) => a.username)).toEqual([
      'eannaad01',
      'elisaka01',
    ]);
    expect(filterByAccountType(withTypes, 'alla')).toHaveLength(6);
  });

  it('söker på användarnamn och namn', () => {
    const named = [
      { id: '1', username: 'ejentu02', role: 'elev' as const, active: true, createdAt: null, firstName: 'Jens', lastName: 'Turesson' },
    ];
    expect(searchAccounts(named, 'TURe').map((a) => a.username)).toEqual(['ejentu02']);
    expect(searchAccounts(named, 'ejent').map((a) => a.username)).toEqual(['ejentu02']);
    expect(searchAccounts(named, 'andersson')).toHaveLength(0);
    expect(searchAccounts(named, '  ')).toHaveLength(1);
  });

  it('väljer konton med givna roller, sorterade', () => {
    expect(accountsWithRoles(accounts, ['speciallärare', 'lärare']).map((a) => a.username)).toEqual([
      'elara01',
      'espec01',
    ]);
    expect(accountsWithRoles(accounts, ['elev']).map((a) => a.username)).toEqual([
      'eannaad01',
      'elisaka01',
    ]);
  });
});

describe('text och skydd för konton', () => {
  it('visar roll och kontotyp på svenska', () => {
    expect(roleLabel('admin')).toBe('Administratör');
    expect(roleLabel('elev')).toBe('Elev');
    expect(accountTypeLabel(accounts[1])).toBe('Skolelev');
    expect(accountTypeLabel(accounts[0])).toBe('—'); // admin har ingen elevtyp
  });

  it('bygger ett fullt namn bara när det finns ett', () => {
    expect(displayName({ ...accounts[1], firstName: 'Jens', lastName: 'Turesson' })).toBe(
      'Jens Turesson',
    );
    expect(displayName({ ...accounts[1], firstName: '  ', lastName: null })).toBeNull();
  });

  it('förklarar vad en statusändring innebär', () => {
    expect(activationQuestion(accounts[1])).toMatch(/inaktivera eannaad01/i);
    expect(activationQuestion(accounts[2])).toMatch(/aktivera elisaka01/i);
  });

  it('låser det egna kontots roll men öppnar andras', () => {
    expect(assignableRolesFor(accounts[1], '2')).toEqual(['elev']);
    expect(assignableRolesFor(accounts[1], '9')).toEqual([
      'admin',
      'lärare',
      'speciallärare',
      'elev',
    ]);
  });
});
