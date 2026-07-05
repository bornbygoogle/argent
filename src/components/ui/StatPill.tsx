import type { CSSProperties, ReactNode } from 'react';

type Tone = 'warn' | 'success' | 'danger' | 'neutral';

const TONE: Record<Tone, CSSProperties> = {
  warn: { background: 'var(--warning-50)', color: 'var(--warning-700)' },
  success: { background: 'var(--success-50)', color: 'var(--success-600)' },
  danger: { background: 'var(--danger-50)', color: 'var(--danger-600)' },
  neutral: { background: 'var(--neutral-100)', color: 'var(--neutral-700)' },
};

interface StatPillProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/** Small tinted pill badge (`.stat-pill`). */
export function StatPill({ tone = 'neutral', children, className = '' }: StatPillProps) {
  return (
    <span className={['stat-pill', className].join(' ').trim()} style={TONE[tone]}>
      {children}
    </span>
  );
}
