import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHOOL_SETTINGS,
  applySchoolSettings,
  cachedSchoolSettings,
  subscribeSchoolSettings,
  validateSchoolSettings,
} from './school-settings';

describe('validateSchoolSettings', () => {
  it('godkänner rimliga värden', () => {
    const result = validateSchoolSettings({
      schoolName: 'Elda Skola',
      contactEmail: 'skolan@exempel.se',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('kräver ett namn på 2–80 tecken', () => {
    expect(validateSchoolSettings({ schoolName: ' ', contactEmail: '' }).errors.schoolName).toBeTruthy();
    expect(validateSchoolSettings({ schoolName: 'A', contactEmail: '' }).ok).toBe(false);
    expect(
      validateSchoolSettings({ schoolName: 'x'.repeat(81), contactEmail: '' }).errors.schoolName,
    ).toBeTruthy();
  });

  it('tillåter tom kontaktadress men avvisar felaktig', () => {
    expect(validateSchoolSettings({ schoolName: 'Elda', contactEmail: '   ' }).ok).toBe(true);
    expect(
      validateSchoolSettings({ schoolName: 'Elda', contactEmail: 'inte-en-adress' }).errors
        .contactEmail,
    ).toBeTruthy();
    expect(
      validateSchoolSettings({ schoolName: 'Elda', contactEmail: 'a@b' }).errors.contactEmail,
    ).toBeTruthy();
  });
});

describe('cache för skolans inställningar', () => {
  it('börjar med standardvärdet och meddelar lyssnare', () => {
    const updates: string[] = [];
    const unsubscribe = subscribeSchoolSettings((settings) => updates.push(settings.school_name));

    expect(cachedSchoolSettings()).toEqual(DEFAULT_SCHOOL_SETTINGS);
    applySchoolSettings({
      school_name: 'Ronneby skola',
      contact_email: 'skolan@ronneby.se',
      updated_at: '2026-10-20T10:00:00Z',
    });
    expect(cachedSchoolSettings().school_name).toBe('Ronneby skola');
    expect(updates).toEqual(['Ronneby skola']);

    unsubscribe();
    applySchoolSettings(DEFAULT_SCHOOL_SETTINGS);
    expect(updates).toEqual(['Ronneby skola']);
  });
});
