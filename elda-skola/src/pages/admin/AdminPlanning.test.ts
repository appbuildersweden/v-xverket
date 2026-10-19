import { describe, expect, it } from 'vitest';
import { overlaps } from './AdminPlanning';
import type { AdminEvent } from '../../lib/types';

const event = (id: string, start: string, end: string | null, classId: string | null): AdminEvent => ({
  id,
  class_id: classId,
  class_name: null,
  title: `Post ${id}`,
  description: null,
  starts_at: start,
  ends_at: end,
  all_day: false,
  published: true,
  created_by: 'u1',
  creator_name: null,
  created_at: '2026-10-01T10:00:00Z',
});

describe('overlaps', () => {
  it('hittar överlapp i samma klass', () => {
    const a = event('a', '2026-10-20T09:00:00Z', '2026-10-20T10:00:00Z', 'klass-1');
    const b = event('b', '2026-10-20T09:30:00Z', '2026-10-20T10:30:00Z', 'klass-1');
    expect(overlaps(a, b)).toBe(true);
  });

  it('räknar inte angränsande tider som konflikt', () => {
    const a = event('a', '2026-10-20T09:00:00Z', '2026-10-20T10:00:00Z', 'klass-1');
    const b = event('b', '2026-10-20T10:00:00Z', '2026-10-20T11:00:00Z', 'klass-1');
    expect(overlaps(a, b)).toBe(false);
  });

  it('jämför inte poster i olika klasser', () => {
    const a = event('a', '2026-10-20T09:00:00Z', '2026-10-20T10:00:00Z', 'klass-1');
    const b = event('b', '2026-10-20T09:30:00Z', '2026-10-20T10:30:00Z', 'klass-2');
    expect(overlaps(a, b)).toBe(false);
  });

  it('använder en timme som standardlängd när sluttid saknas', () => {
    const a = event('a', '2026-10-20T09:00:00Z', null, null);
    const b = event('b', '2026-10-20T09:45:00Z', null, null);
    expect(overlaps(a, b)).toBe(true);
  });
});
