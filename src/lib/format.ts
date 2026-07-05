import type { Locale } from '@/types/models';
import { i18n } from '@/i18n';
import { isToday } from '@/lib/date';
import { currencyLocale, getCurrency } from '@/lib/currency';

/** Resolve the active locale from i18n (falls back to 'en'). */
export function getLocale(): Locale {
  const lng = i18n.language || 'en';
  return lng.startsWith('fr') ? 'fr' : 'en';
}

const localeTag = (loc: Locale) => (loc === 'fr' ? 'fr-FR' : 'en-US');

// Currency formatting uses Intl with each currency's native locale (full
// per-currency format). The sign is applied manually to preserve the mock's
// U+2212 minus ("−1 240,00 €") and the "+amount" convention for signed values.
const MINUS = '−';

/** Format an amount in a currency (Intl, native format) with a manual sign. */
export function formatMoney(amount: number, currency: string = getCurrency()): string {
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const body = new Intl.NumberFormat(currencyLocale(currency), {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(abs);
  return (neg ? MINUS : '') + body;
}

/** Signed money: prepends + / − on non-zero values ("+2 150,00 €" / "−1 240 €"). */
export function formatSignedMoney(amount: number, currency: string = getCurrency()): string {
  if (amount === 0) return formatMoney(0, currency);
  const sign = amount > 0 ? '+' : MINUS;
  return sign + formatMoney(Math.abs(amount), currency);
}

/**
 * Format an amount in the active currency. (The `locale` arg is accepted for
 * back-compat with existing call sites but currently ignored.)
 */
export function formatCurrency(amount: number, _locale: Locale = getLocale()): string {
  return formatMoney(amount);
}

/** Signed currency in the active currency. */
export function formatSignedCurrency(amount: number, _locale: Locale = getLocale()): string {
  return formatSignedMoney(amount);
}

/** Compact integer-ish number (e.g. counts). */
export function formatNumber(n: number, locale: Locale = getLocale()): string {
  return new Intl.NumberFormat(localeTag(locale)).format(n);
}

/** Percentage with no decimals. */
export function formatPercent(ratio: number, locale: Locale = getLocale()): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
}

export type DateStyle = 'short' | 'long' | 'weekday';

/** Format a 'YYYY-MM-DD' date. */
export function formatDate(
  iso: string,
  style: DateStyle = 'long',
  locale: Locale = getLocale(),
): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : style === 'weekday'
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(localeTag(locale), opts).format(date);
}

/** Human "today / yesterday / weekday + day-month" for list day headers. */
export function formatDayHeader(iso: string, locale: Locale = getLocale()): string {
  if (isToday(iso)) return locale === 'fr' ? "Aujourd'hui" : 'Today';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return locale === 'fr' ? 'Hier' : 'Yesterday';
  }
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/** Short time HH:mm (optionally from a full ISO timestamp). */
export function formatTime(iso: string, locale: Locale = getLocale()): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(localeTag(locale), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Localized long month + year, e.g. "Juin 2026" / "June 2026". */
export function formatMonth(month: string, locale: Locale = getLocale()): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: 'long',
    year: 'numeric',
  }).format(date);
}
