import { describe, expect, it } from 'vitest';
import { audienceLabel } from './AdminPublications';
import { suggestSlug } from './AdminOrganisations';
import type { SchoolOrganisation } from '../../lib/types';

const organisations = [
  { id: 'org-1', name: 'Elda Skola' },
  { id: 'org-2', name: 'Ronneby Skola' },
] as SchoolOrganisation[];

describe('suggestSlug', () => {
  it('gör ett kortnamn av svenska tecken och mellanslag', () => {
    expect(suggestSlug('Ronneby Skola')).toBe('ronneby-skola');
    expect(suggestSlug('Ängelholms Gymnasium')).toBe('angelholms-gymnasium');
    expect(suggestSlug('  Östra  Skolan  ')).toBe('ostra-skolan');
  });

  it('tar bort inledande och avslutande bindestreck', () => {
    expect(suggestSlug('--Skola--')).toBe('skola');
  });

  it('begränsar längden', () => {
    expect(suggestSlug('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('audienceLabel', () => {
  it('säger alla skolor när ingen skola är vald', () => {
    expect(
      audienceLabel(
        { audience_organisation_ids: null, audience_roles: null, audience_user_ids: null },
        organisations,
      ),
    ).toBe('alla skolor');
  });

  it('räknar upp valda skolor med namn', () => {
    expect(
      audienceLabel(
        { audience_organisation_ids: ['org-2'], audience_roles: null, audience_user_ids: null },
        organisations,
      ),
    ).toBe('Ronneby Skola');
  });

  it('kombinerar skolor, roller och enskilda konton', () => {
    const text = audienceLabel(
      {
        audience_organisation_ids: ['org-1', 'org-2'],
        audience_roles: ['lärare'],
        audience_user_ids: ['user-1', 'user-2'],
      },
      organisations,
    );
    expect(text).toContain('Elda Skola, Ronneby Skola');
    expect(text).toContain('roller: lärare');
    expect(text).toContain('2 enskilda konton');
  });

  it('markerar en skola som inte finns kvar', () => {
    expect(
      audienceLabel(
        { audience_organisation_ids: ['borttagen'], audience_roles: null, audience_user_ids: null },
        organisations,
      ),
    ).toBe('okänd skola');
  });
});
