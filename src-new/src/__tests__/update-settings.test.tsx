import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Update } from '@tauri-apps/plugin-updater';
import { UpdateSettings } from '../components/UpdateSettings';
import { isNewerVersion } from '../lib/update';

/**
 * Uppdateringsrutan i inställningarna.
 *
 * Två miljöer prövas: den installerade appen (Tauri kan svara och installera)
 * och en webbläsare (ingen uppdaterare finns — då jämförs byggets version med
 * det publicerade manifestet). Testerna beskriver vad användaren ser och vilka
 * anrop som skickas.
 */
const mocks = vi.hoisted(() => ({
  tauri: false,
  current: '0.2.6',
  fetchPublishedUpdate: vi.fn(),
  checkForUpdateResource: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
}));

vi.mock('../lib/update', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/update')>();
  return {
    ...actual,
    isTauri: () => mocks.tauri,
    currentBuiltVersion: () => mocks.current,
    loadCurrentVersion: async () => mocks.current,
    fetchPublishedUpdate: mocks.fetchPublishedUpdate,
    checkForUpdateResource: mocks.checkForUpdateResource,
    downloadUpdate: mocks.downloadUpdate,
    installUpdate: mocks.installUpdate,
  };
});

beforeEach(() => {
  mocks.tauri = false;
  mocks.current = '0.2.6';
  mocks.fetchPublishedUpdate.mockReset();
  mocks.checkForUpdateResource.mockReset();
  mocks.downloadUpdate.mockReset();
  mocks.installUpdate.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('versionsjämförelse', () => {
  it('svarar ja bara när den publicerade versionen är nyare', () => {
    expect(isNewerVersion('0.2.7', '0.2.6')).toBe(true);
    expect(isNewerVersion('0.3.0', '0.2.6')).toBe(true);
    expect(isNewerVersion('1.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.2.6', '0.2.6')).toBe(false);
    expect(isNewerVersion('0.2.5', '0.2.6')).toBe(false);
  });

  it('svarar nej när ett versionsnummer inte går att läsa', () => {
    expect(isNewerVersion('', '0.2.6')).toBe(false);
    expect(isNewerVersion('senaste', '0.2.6')).toBe(false);
    expect(isNewerVersion('0.2.7', null)).toBe(false);
  });
});

describe('uppdateringar i inställningarna', () => {
  it('visar installerad version och säger till när den är den senaste', async () => {
    mocks.fetchPublishedUpdate.mockResolvedValue({
      info: { version: '0.2.6', notes: null, date: null, url: null },
      error: null,
    });

    render(<UpdateSettings />);

    const current = await screen.findByTestId('update-current-version');
    expect(current.textContent).toBe('0.2.6');

    fireEvent.click(screen.getByTestId('update-check'));

    expect(await screen.findByText(/Du har den senaste versionen \(0\.2\.6\)/)).toBeTruthy();
    expect(screen.queryByTestId('update-install')).toBeNull();
  });

  it('berättar i webbläsaren att en nyare version installeras i desktopappen', async () => {
    mocks.current = '0.2.5';
    mocks.fetchPublishedUpdate.mockResolvedValue({
      info: { version: '0.2.6', notes: 'Halloween-trädgården', date: null, url: null },
      error: null,
    });

    render(<UpdateSettings />);
    fireEvent.click(screen.getByTestId('update-check'));

    expect(await screen.findByText(/Ny version 0\.2\.6 finns/)).toBeTruthy();
    expect(screen.getByText(/desktopappen/)).toBeTruthy();
    // Utan Tauri kan rutan inte installera något — ingen knapp som lovar för mycket.
    expect(screen.queryByTestId('update-install')).toBeNull();
    expect(screen.getByText('Halloween-trädgården')).toBeTruthy();
  });

  it('laddar ner och installerar i den installerade appen', async () => {
    mocks.tauri = true;
    mocks.current = '0.2.5';
    const update = { version: '0.2.6' } as unknown as Update;
    mocks.checkForUpdateResource.mockResolvedValue({
      result: {
        available: true,
        currentVersion: '0.2.5',
        latestVersion: '0.2.6',
        date: null,
        body: 'Fixar trädgården',
        error: null,
      },
      update,
    });
    mocks.downloadUpdate.mockImplementation(
      async (target: Update, onProgress: (event: unknown) => void) => {
        onProgress({ event: 'Started', data: { contentLength: 100 } });
        onProgress({ event: 'Progress', data: { chunkLength: 60 } });
        onProgress({ event: 'Finished' });
        return target;
      },
    );
    mocks.installUpdate.mockResolvedValue(undefined);

    render(<UpdateSettings />);
    fireEvent.click(screen.getByTestId('update-check'));

    const install = await screen.findByTestId('update-install');
    expect(screen.getByText(/Ny version 0\.2\.6 finns/)).toBeTruthy();
    expect(screen.getByText('Fixar trädgården')).toBeTruthy();

    fireEvent.click(install);

    await waitFor(() => expect(mocks.installUpdate).toHaveBeenCalledWith(update));
    expect(mocks.downloadUpdate).toHaveBeenCalledWith(update, expect.any(Function));
    expect(await screen.findByText(/Installerar och startar om Elda/)).toBeTruthy();
  });

  it('visar felet och låter användaren försöka igen', async () => {
    mocks.fetchPublishedUpdate.mockResolvedValue({
      info: null,
      error: 'Servern svarade 503.',
    });

    render(<UpdateSettings />);
    fireEvent.click(screen.getByTestId('update-check'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/503/);
    const button = screen.getByTestId('update-check') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
