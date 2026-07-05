interface ProgressProps {
  /** 0..1 */
  value: number;
  /** Fill color (CSS color); defaults to success-500. */
  color?: string;
  /** Override the 10px height (e.g. 6 for the thin variant). */
  height?: number | string;
  className?: string;
}

/** Progress bar (`.progress`) with a width-driven fill span. */
export function Progress({ value, color = 'var(--success-500)', height, className = '' }: ProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={['progress', className].join(' ').trim()} style={height ? { height } : undefined}>
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
