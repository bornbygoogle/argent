import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface FabProps {
  center?: boolean;
  badge?: number | string;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/** Floating action button (`.fab` / `.fab.center`) with an optional `.badge`. */
export function Fab({ center, badge, onClick, children, className = '', ...rest }: FabProps) {
  return (
    <button
      type="button"
      className={['fab', center ? 'center' : '', className].join(' ').trim()}
      onClick={onClick}
      {...rest}
    >
      {children ?? <Icon name="Plus" size={26} strokeWidth={2.4} />}
      {badge !== undefined && (
        <span className="badge" style={{ position: 'absolute', top: -4, right: -4 }}>
          {badge}
        </span>
      )}
    </button>
  );
}
