// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { db, DEFAULT_SETTINGS } from '@/db/db';
import type { ThemePref } from '@/types/models';

const seedDefaults = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('@/db/seed', () => ({ seedDefaults }));
vi.mock('@/i18n', () => ({
  i18n: { language: 'en', changeLanguage: vi.fn(async () => undefined) },
}));

import { SettingsProvider, useSettings } from '@/store/SettingsContext';

/** A controllable prefers-color-scheme: dark media query. */
let osDark = false;
let listeners: Set<() => void>;

function stubMatchMedia() {
  listeners = new Set();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return osDark;
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })) as unknown as typeof window.matchMedia;
}

function flipOs(dark: boolean) {
  osDark = dark;
  act(() => {
    for (const cb of [...listeners]) cb();
  });
}

const isDarkClass = () => document.documentElement.classList.contains('dark');

let api: ReturnType<typeof useSettings>;
function Probe() {
  api = useSettings();
  return <span data-testid="ready">{String(api.ready)}</span>;
}

async function mount(theme: ThemePref | null) {
  await db.settings.clear();
  if (theme) await db.settings.put({ key: 'app', state: { ...DEFAULT_SETTINGS, theme } });
  render(
    <SettingsProvider>
      <Probe />
    </SettingsProvider>,
  );
  // Generous timeout: the first Dexie open on fake-indexeddb is slow when the
  // whole suite runs in parallel, and the 1s default made this flaky.
  await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'), {
    timeout: 15_000,
  });
}

beforeEach(() => {
  osDark = false;
  stubMatchMedia();
  seedDefaults.mockReset();
  seedDefaults.mockResolvedValue(undefined);
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Every test mounts a provider over a real (fake-indexeddb) Dexie database.
vi.setConfig({ testTimeout: 20_000 });

describe('SettingsProvider OS theme listener', () => {
  it('keeps the stored dark theme when the OS flips to light', async () => {
    osDark = true;
    await mount('dark');
    expect(isDarkClass()).toBe(true);

    flipOs(false);

    expect(isDarkClass()).toBe(true);
  });

  it('keeps the stored light theme when the OS flips to dark', async () => {
    osDark = false;
    await mount('light');
    expect(isDarkClass()).toBe(false);

    flipOs(true);

    expect(isDarkClass()).toBe(false);
  });

  it('follows the OS change while the stored theme is system', async () => {
    await mount('system');
    expect(isDarkClass()).toBe(false);

    flipOs(true);
    expect(isDarkClass()).toBe(true);

    flipOs(false);
    expect(isDarkClass()).toBe(false);
  });

  it('follows the OS after setTheme switches to system, and stops after switching to light', async () => {
    await mount('light');

    act(() => api.setTheme('system'));
    flipOs(true);
    expect(isDarkClass()).toBe(true);

    act(() => api.setTheme('light'));
    expect(isDarkClass()).toBe(false);
    flipOs(false);
    flipOs(true);
    expect(isDarkClass()).toBe(false);
    expect(listeners.size).toBe(0);
  });
});

describe('SettingsProvider hydration', () => {
  it('seeds defaults once, even after settings change', async () => {
    await mount('system');
    act(() => api.setTheme('dark'));
    act(() => api.setTheme('system'));

    expect(seedDefaults).toHaveBeenCalledTimes(1);
  });

  it('logs a seed failure and still reaches ready', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedDefaults.mockRejectedValue(new Error('seed boom'));

    await mount('dark');

    expect(err).toHaveBeenCalled();
    expect(api.ready).toBe(true);
    expect(api.settings.theme).toBe('dark');
  });
});
