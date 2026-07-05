import type { ReactNode } from 'react';

interface HeroProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Indigo-gradient hero card (`.hero`) for balance / net-worth headlines. */
export function Hero({ label, children, className = '' }: HeroProps) {
  return (
    <div className={['hero', className].join(' ').trim()}>
      {label && (
        <span className="label" style={{ color: 'rgba(255,255,255,.8)' }}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
