import { formatSignedCurrency } from '@/lib/format';
import type { Locale } from '@/types/models';

interface AmountTextProps {
  /** Signed amount: positive = income (green), negative = expense (ink). */
  amount: number;
  /** Accepted for back-compat; currently ignored (French-first). */
  locale?: Locale;
  className?: string;
}

/** Signed, color-coded currency: income → `.amt-in`, expense → `.amt-out`. */
export function AmountText({ amount, className = '' }: AmountTextProps) {
  const tone = amount > 0 ? 'amt-in' : amount < 0 ? 'amt-out' : '';
  return <span className={[tone, className].join(' ').trim()}>{formatSignedCurrency(amount)}</span>;
}
