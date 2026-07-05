import type { ReactNode } from 'react';

interface FieldProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control wrapper (`.field`). The control is passed as children
 *  (typically `<input className="input" />`). */
export function Field({ label, children, className = '' }: FieldProps) {
  return (
    <div className={['field', className].join(' ').trim()}>
      {label && <span className="label">{label}</span>}
      {children}
    </div>
  );
}
