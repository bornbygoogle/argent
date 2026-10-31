import { formatSignedCurrency } from '@/lib/format';

interface AmountTextProps {
  /** Signed amount: positive = income (green), negative = expense (ink). */
  amount: number;
  className?: string;
}

/** Signed, color-coded currency: income → `.amt-in`, expense → `.amt-out`. */
export function AmountText({ amount, className = '' }: AmountTextProps) {
  const tone = amount > 0 ? 'amt-in' : amount < 0 ? 'amt-out' : '';
  return <span className={[tone, className].join(' ').trim()}>{formatSignedCurrency(amount)}</span>;
}
