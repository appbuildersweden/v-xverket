import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('./supabase', () => ({
  supabase: { rpc: mock.rpc, auth: { getUser: vi.fn() } },
  errorMessage: (error: unknown) =>
    String((error as { message?: unknown } | null)?.message ?? 'Något gick fel.'),
}));

import { getAdaptationStats, getSchoolSettings, saveSchoolSettings } from './api';

const row = {
  school_name: 'Ronneby skola',
  contact_email: 'skolan@ronneby.se',
  updated_at: '2026-10-20T10:00:00Z',
};

describe('skolans inställningar via API', () => {
  it('mappar raden från serverfunktionen', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(getSchoolSettings()).resolves.toEqual(row);
    expect(mock.rpc).toHaveBeenCalledWith('elda_skola_school_settings');
  });

  it('faller tillbaka på standardvärdet när svaret är tomt', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getSchoolSettings()).resolves.toEqual({
      school_name: 'Elda Skola',
      contact_email: null,
      updated_at: null,
    });
  });

  it('trimmar värdena innan de sparas och returnerar det sparade', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [row], error: null });
    const saved = await saveSchoolSettings({
      schoolName: '  Ronneby skola  ',
      contactEmail: '  skolan@ronneby.se  ',
    });
    expect(mock.rpc).toHaveBeenCalledWith('elda_skola_save_school_settings', {
      p_school_name: 'Ronneby skola',
      p_contact_email: 'skolan@ronneby.se',
    });
    expect(saved.school_name).toBe('Ronneby skola');
  });

  it('skickar null när kontaktadressen är tom', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [row], error: null });
    await saveSchoolSettings({ schoolName: 'Elda Skola', contactEmail: '   ' });
    expect(mock.rpc).toHaveBeenCalledWith('elda_skola_save_school_settings', {
      p_school_name: 'Elda Skola',
      p_contact_email: null,
    });
  });

  it('kastar ett begripligt fel när servern nekar', async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for function elda_skola_save_school_settings' },
    });
    await expect(
      saveSchoolSettings({ schoolName: 'Elda Skola', contactEmail: '' }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('anpassningsstatistik via API', () => {
  it('räknar om värdena till tal', async () => {
    mock.rpc.mockResolvedValueOnce({
      data: [{ total: 4, active: 3, completed: 1, students: 2, last_updated: '2026-10-20T09:00:00Z' }],
      error: null,
    });
    await expect(getAdaptationStats()).resolves.toEqual({
      total: 4,
      active: 3,
      completed: 1,
      students: 2,
      last_updated: '2026-10-20T09:00:00Z',
    });
  });

  it('returnerar null när servern inte ger någon rad (icke-admin)', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getAdaptationStats()).resolves.toBeNull();
  });
});
