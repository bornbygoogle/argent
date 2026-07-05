import type { ReactNode } from 'react';
import { Icon } from './Icon';

type Variant = 'default' | 'income';

interface ChipProps {
  selected: boolean;
  /** Optional leading icon (rendered inline in currentColor, like the mocks). */
  icon?: string;
  /** Unused for default rendering since the mock chips inherit color; kept for API compat. */
  tint?: string;
  variant?: Variant;
  label: ReactNode;
  onClick?: () => void;
}

/** Selectable pill (`.chip` / `.chip.active`) for categories, income types, filters. */
export function Chip({ selected, icon, variant = 'default', label, onClick }: ChipProps) {
  const cls = ['chip', variant === 'income' ? 'income' : '', selected ? 'active' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={cls}>
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      <span>{label}</span>
    </button>
  );
}
