import type { ReactNode } from 'react';

type Dir = 'in' | 'out' | 'trf';

interface DirectionBadgeProps {
  dir: Dir;
  children?: ReactNode;
  className?: string;
}

/** Direction pill (`.dir.in|out|trf`) — Revenu / Dépense / Virement. */
export function DirectionBadge({ dir, children, className = '' }: DirectionBadgeProps) {
  return <span className={['dir', dir, className].join(' ').trim()}>{children}</span>;
}
