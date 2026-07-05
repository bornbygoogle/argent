import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { db, DEFAULT_SETTINGS, type SettingsRecord } from '@/db/db';
import { seedDefaults } from '@/db/seed';
import { i18n } from '@/i18n';
import { setCurrencyStore } from '@/lib/currency';
import type { Locale, SettingsState, ThemePref } from '@/types/models';

const LS_KEY = 'argent.settings';

interface SettingsContextValue {
  ready: boolean;
  settings: SettingsState;
  setTheme: (t: ThemePref) => void;
  /** null = follow browser; otherwise force a locale. */
  setLocale: (l: Locale | null) => void;
  /** Set the active currency (ISO 4217 code). */
  setCurrency: (code: string) => void;
  update: (patch: Partial<SettingsState>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function isDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyTheme(pref: ThemePref) {
  document.documentElement.classList.toggle('dark', isDark(pref));
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const firstApply = useRef(true);

  // Load once, seed defaults, apply current theme/locale.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Seed must never block the app from rendering: even on failure we fall
      // through to ready=true so the user sees the UI (and the error is logged).
      try {
        await seedDefaults();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[seedDefaults] failed (non-fatal):', err);
      }
      const rec = await db.settings.get('app');
      // Merge stored state over defaults so fields added later (currency, …)
      // are backfilled rather than undefined for existing users.
      const state = { ...DEFAULT_SETTINGS, ...(rec?.state ?? {}) };
      if (!alive) return;
      setSettings(state);
      setReady(true);
      applyTheme(state.theme);
      if (state.locale) await i18n.changeLanguage(state.locale);
      else if (!i18n.language) await i18n.changeLanguage('en');
    })();
    // React to OS theme changes when in system mode.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (document.documentElement && settings.theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => {
      alive = false;
      mq.removeEventListener('change', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist + re-apply whenever settings change (skip the initial hydration).
  useEffect(() => {
    if (!ready) return;
    if (firstApply.current) {
      firstApply.current = false;
    }
    const rec: SettingsRecord = { key: 'app', state: settings };
    db.settings.put(rec).catch(() => {});
    // Mirror to localStorage for the pre-paint FOUC script.
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rec));
    } catch {
      /* ignore quota errors */
    }
    applyTheme(settings.theme);
    // Keep the format layer's currency singleton in sync with persisted state.
    setCurrencyStore(settings.currency);
  }, [settings, ready]);

  const setTheme = useCallback((t: ThemePref) => {
    setSettings((s) => ({ ...s, theme: t }));
  }, []);

  const setCurrency = useCallback((code: string) => {
    const c = (code || 'EUR').toUpperCase();
    setSettings((s) => ({ ...s, currency: c }));
  }, []);

  const setLocale = useCallback((l: Locale | null) => {
    setSettings((s) => ({ ...s, locale: l }));
    if (l) void i18n.changeLanguage(l);
    else {
      // Clear the override → fall back to browser detection.
      try {
        localStorage.removeItem('argent.locale');
      } catch {
        /* ignore */
      }
      const nav =
        (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
      void i18n.changeLanguage(nav.startsWith('fr') ? 'fr' : 'en');
    }
  }, []);

  const update = useCallback((patch: Partial<SettingsState>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const value = useMemo(
    () => ({ ready, settings, setTheme, setLocale, setCurrency, update }),
    [ready, settings, setTheme, setLocale, setCurrency, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
