import type { ReactNode } from 'react';

type Variant = 'row' | 'recur';

interface RowProps {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  variant?: Variant;
  onClick?: () => void;
  className?: string;
}

/** List row (`.row`) or recurring row (`.recur`) with `.r-main/.r-title/.r-sub` slots. */
export function Row({ icon, title, sub, trailing, variant = 'row', onClick, className = '' }: RowProps) {
  return (
    <div
      className={[variant, className].join(' ').trim()}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {icon}
      <div className="r-main">
        <div className="r-title">{title}</div>
        {sub && <div className="r-sub">{sub}</div>}
      </div>
      {trailing}
    </div>
  );
}
