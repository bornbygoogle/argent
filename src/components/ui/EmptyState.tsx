import type { ReactNode } from 'react';
import { TintedIcon } from './TintedIcon';

interface EmptyStateProps {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}

/** Centered empty-list / first-run state (mock-flavored: tinted icon tile + text). */
export function EmptyState({ icon = 'CircleDashed', title, hint, action }: EmptyStateProps) {
  return (
    <div className="col text-center" style={{ alignItems: 'center', padding: '48px 32px', gap: 12 }}>
      <TintedIcon hex="#94A3B8" icon={icon} variant="cat" alpha={0.12} />
      <h3 className="h3">{title}</h3>
      {hint && (
        <p className="body-sm" style={{ maxWidth: 280 }}>
          {hint}
        </p>
      )}
      {action}
    </div>
  );
}
