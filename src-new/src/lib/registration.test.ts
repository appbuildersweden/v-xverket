import { describe, expect, it } from 'vitest';
import {
  KIND_LABELS,
  STATUS_LABELS,
  countApplications,
  needsReview,
  type RegistrationApplicationRow,
} from './registration';
import {
  CLASS_CODE_RE,
  countPendingRequests,
  groupStudentsByClass,
  normalizeClassCode,
  type JoinRequest,
  type MyStudent,
} from './classes';

/**
 * Ren logik för ansökningarna och klasskoden. Ingen nätverkstrafik: det som
 * testas är reglerna som avgör vad gränssnittet visar, medan den auktoritativa
 * kontrollen ligger i databasen och i Edge Functions.
 *
 * Själva registreringen (boten, frågorna och lösenordskravet) ligger på
 * hemsidan och testas där: `site/tests/bot.test.mjs`.
 */

describe('etiketter för ansökningarna', () => {
  it('har en svensk etikett för varje kontotyp och status', () => {
    expect(KIND_LABELS.skolelev).toBe('Skolelev');
    expect(KIND_LABELS.privat_elev).toBe('Privat elev');
    expect(KIND_LABELS.larare).toBe('Lärare');
    expect(STATUS_LABELS.vantar).toBe('Väntar på granskning');
    expect(STATUS_LABELS.skapad).toBe('Konto skapat');
  });
});

function application(
  overrides: Partial<RegistrationApplicationRow> = {},
): RegistrationApplicationRow {
  return {
    id: 'a1',
    kind: 'skolelev',
    status: 'vantar',
    full_name: 'Elda Elev',
    summary: 'Skolelev i Ronneby',
    risk_flags: [],
    bot_decision: 'granskas',
    created_at: '2026-10-16T10:00:00Z',
    decided_at: null,
    review_note: null,
    created_username: 'eelda01',
    created_class_code: null,
    ...overrides,
  };
}

describe('ansökningar för admin', () => {
  it('markerar väntande ansökningar och varningssignaler för granskning', () => {
    expect(needsReview(application())).toBe(true);
    expect(needsReview(application({ status: 'skapad', risk_flags: ['kort-motivering'] }))).toBe(
      true,
    );
    expect(needsReview(application({ status: 'skapad' }))).toBe(false);
  });

  it('räknar ansökningar per status', () => {
    const rows = [
      application(),
      application({ id: 'a2', status: 'skapad' }),
      application({ id: 'a3', status: 'godkand', risk_flags: ['stor-klass'] }),
      application({ id: 'a4', status: 'nekad' }),
    ];
    expect(countApplications(rows)).toEqual({
      total: 4,
      pending: 1,
      withFlags: 1,
      created: 2,
    });
    expect(countApplications([])).toEqual({ total: 0, pending: 0, withFlags: 0, created: 0 });
  });
});

describe('klasskoden', () => {
  it('accepterar bara sex tecken ur det läsbara alfabetet', () => {
    expect(CLASS_CODE_RE.test('ABC234')).toBe(true);
    expect(CLASS_CODE_RE.test('abc234')).toBe(false);
    // I, O, 0 och 1 används aldrig — de är lätta att blanda ihop.
    expect(CLASS_CODE_RE.test('ABCI23')).toBe(false);
    expect(CLASS_CODE_RE.test('ABCO23')).toBe(false);
    expect(CLASS_CODE_RE.test('ABC023')).toBe(false);
    expect(CLASS_CODE_RE.test('ABC123')).toBe(false);
    expect(CLASS_CODE_RE.test('ABC23')).toBe(false);
  });

  it('normaliserar koden till versaler utan mellanslag', () => {
    expect(normalizeClassCode(' abc234 ')).toBe('ABC234');
  });
});

function request(overrides: Partial<JoinRequest> = {}): JoinRequest {
  return {
    id: 'r1',
    class_id: 'c1',
    class_name: '8B matematik',
    student_id: 's1',
    student_username: 'eannaad01',
    status: 'vantar',
    requested_at: '2026-10-16T09:00:00Z',
    ...overrides,
  };
}

describe('klassansökningar och elever', () => {
  it('räknar bara de ansökningar som väntar på beslut', () => {
    expect(
      countPendingRequests([
        request(),
        request({ id: 'r2', status: 'godkand' }),
        request({ id: 'r3', status: 'vantar' }),
      ]),
    ).toBe(2);
  });

  it('grupperar eleverna per klass och sorterar dem', () => {
    const students: MyStudent[] = [
      { id: 's2', username: 'ebert01', account_type: 'skola', class_id: 'c1', class_name: '8B' },
      { id: 's1', username: 'eanna01', account_type: 'privat', class_id: 'c1', class_name: '8B' },
      { id: 's3', username: 'ececil01', account_type: 'skola', class_id: 'c2', class_name: '9A' },
    ];
    const groups = groupStudentsByClass(students);
    expect(groups.map((g) => g.className)).toEqual(['8B', '9A']);
    expect(groups[0].students.map((s) => s.username)).toEqual(['eanna01', 'ebert01']);
    expect(groupStudentsByClass([])).toEqual([]);
  });
});
