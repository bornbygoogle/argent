import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocale } from '@/lib/format';
import type { Locale } from '@/types/models';
import { Icon } from './Icon';

/**
 * Amount entry works on a canonical string of digits with at most one '.':
 *   "" | "12" | "12." | "12.3" | "12.34"
 * The big display localizes the separator; storage always uses '.'.
 */

/** Apply one numpad input. `key` is '0'..'9', '.', or 'back'. */
export function applyKey(value: string, key: string): string {
  if (key === 'back') return value.slice(0, -1);
  if (key === '.') {
    if (value.includes('.')) return value; // only one decimal point
    return value === '' || value === '0' ? '0.' : value + '.';
  }
  // digit
  if (value === '0') return key; // drop a lone leading zero
  const [, dec] = value.split('.');
  if (dec !== undefined && dec.length >= 2) return value; // max 2 decimals
  const intPart = value.split('.')[0];
  if (intPart.replace('-', '').length >= 9) return value; // cap integer width
  return value + key;
}

/** Canonical string → number (0 when empty). */
export function parseAmount(value: string): number {
  if (!value || value === '.') return 0;
  return Number.parseFloat(value) || 0;
}

/** Localize the canonical string for the big display (no thousands grouping). */
export function displayAmount(value: string, locale: Locale = getLocale()): string {
  if (!value) return '0';
  const sep = locale === 'fr' ? ',' : '.';
  const [int, dec] = value.split('.');
  if (dec !== undefined) return (int || '0') + sep + dec;
  if (value.endsWith('.')) return (int || '0') + sep;
  return int;
}

interface NumpadProps {
  value: string;
  onChange: (next: string) => void;
  locale?: Locale;
}

// 4-column calculator layout (matches 03-add-expense.html): 1..9, then '.', '0', '⌫'.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

/** Calculator-style numeric keypad built on the validated mock `.numpad` classes. */
export function Numpad({ value, onChange, locale = getLocale() }: NumpadProps) {
  const { t } = useTranslation();
  const decLabel = locale === 'fr' ? ',' : '.';
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleared = useRef(false);

  const press = (k: string) => {
    const next = applyKey(value, k);
    if (next === value && k !== 'back') {
      // Limit hit (max decimals / width / duplicate point) — signal it.
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
      return;
    }
    onChange(next);
  };

  const startHold = () => {
    cleared.current = false;
    holdTimer.current = setTimeout(() => {
      cleared.current = true;
      onChange(''); // long-press backspace = clear all
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25);
    }, 450);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <div className="numpad">
      {KEYS.map((k) => {
        const isBack = k === 'back';
        const isGhost = k === '.' || isBack;
        const label = isBack ? t('numpad.backspace') : k === '.' ? t('numpad.decimal') : k;
        if (isBack) {
          return (
            <button
              key={k}
              type="button"
              className="key ghost"
              aria-label={label}
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onClick={() => {
                // Suppress the click that follows a long-press clear.
                if (cleared.current) { cleared.current = false; return; }
                press('back');
              }}
            >
              <Icon name="Delete" size={26} strokeWidth={2} />
            </button>
          );
        }
        return (
          <button
            key={k}
            type="button"
            className={['key', isGhost ? 'ghost' : ''].join(' ').trim()}
            aria-label={label}
            onClick={() => press(k)}
          >
            {k === '.' ? decLabel : k}
          </button>
        );
      })}
    </div>
  );
}
