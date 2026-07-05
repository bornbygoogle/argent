import { useSyncExternalStore } from 'react';
import { i18n } from '@/i18n';

/* ============================================================
   Currency registry + reactive live-currency store.

   - CURATED_CURRENCIES: quick-pick list paired with a canonical locale so
     each renders in its native format via Intl (full per-currency format:
     EUR → "3 842,50 €", USD → "$1,240.50", JPY → "¥1,240").
   - getCurrency()/setCurrencyStore(): module singleton read by the format
     layer (format.ts) and hydrated by SettingsContext.
   - useCurrency(): a single subscription mounted at the route root; when the
     active currency changes the whole rendered tree re-renders and every
     formatted amount re-reads the live value.
   ============================================================ */

export interface CurrencyDef {
  code: string; // ISO 4217
  locale: string; // home locale → native formatting
}

export const CURATED_CURRENCIES: CurrencyDef[] = [
  { code: 'EUR', locale: 'fr-FR' },
  { code: 'USD', locale: 'en-US' },
  { code: 'GBP', locale: 'en-GB' },
  { code: 'CHF', locale: 'fr-CH' },
  { code: 'CAD', locale: 'en-CA' },
  { code: 'JPY', locale: 'ja-JP' },
];

const CURATED_BY_CODE = new Map(CURATED_CURRENCIES.map((c) => [c.code, c]));

/** The app's active locale as a BCP-47 tag (used to format custom currencies). */
function appLocaleTag(): string {
  const lng = i18n.language || 'en';
  return lng.startsWith('fr') ? 'fr-FR' : 'en-US';
}

/** Locale used to format a currency: curated → its home locale; custom → app locale. */
export function currencyLocale(code: string): string {
  const c = CURATED_BY_CODE.get((code || 'EUR').toUpperCase());
  return c ? c.locale : appLocaleTag();
}

/** Whether a code is a known ISO 4217 currency (Intl throws on invalid codes). */
export function isCurated(code: string): boolean {
  return CURATED_BY_CODE.has((code || '').toUpperCase());
}

/** Validate a 3-letter ISO 4217 code by asking Intl to format it. */
export function isValidCurrencyCode(code: string): boolean {
  const c = (code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: c }).format(1);
    return true;
  } catch {
    return false;
  }
}

/** Preview string for the picker (always the same sample amount), e.g. "3 842,50 €". */
export function previewCurrency(code: string): string {
  const c = (code || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(currencyLocale(c), {
      style: 'currency',
      currency: c,
    }).format(3842.5);
  } catch {
    return c;
  }
}

/** Extract the currency symbol, e.g. "€" / "$" / "£" / "¥". */
export function currencySymbol(code: string): string {
  const c = (code || 'EUR').toUpperCase();
  try {
    const parts = new Intl.NumberFormat(currencyLocale(c), {
      style: 'currency',
      currency: c,
    }).formatToParts(1);
    const sym = parts.find((p) => p.type === 'currency');
    return sym ? sym.value : c;
  } catch {
    return c;
  }
}

// ---- Reactive live-currency singleton ----
let current = 'EUR';
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Current active currency code (read by the format layer). */
export function getCurrency(): string {
  return current;
}

/** Update the active currency and notify subscribers (no-op if unchanged). */
export function setCurrencyStore(code: string): void {
  const next = (code || 'EUR').toUpperCase();
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

/**
 * Subscribe to active-currency changes. Mounted once at the route root so the
 * entire rendered tree re-renders (and re-reads the format singleton) whenever
 * the currency changes. The format helpers read the live value automatically.
 */
export function useCurrency(): string {
  return useSyncExternalStore(subscribe, getCurrency, () => 'EUR');
}
