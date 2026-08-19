import type { ReactNode } from 'react';

interface FieldProps {
  label?: ReactNode;
  /** Optional hint under the control (units, format, consequence). */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Label + control wrapper (`.field`). The control is passed as children
 * (typically `<input className="input" />`).
 *
 * This renders a real `<label>` wrapping the control, so the association is
 * implicit and needs no id plumbing at the call site — one less thing for a
 * new field to forget. A placeholder is a hint, never a name: it disappears
 * the moment the user types, and the control is left nameless for anyone
 * using a screen reader.
 */
export function Field({ label, hint, children, className = '' }: FieldProps) {
  return (
    <label className={['field', className].join(' ').trim()}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="caption">{hint}</span>}
    </label>
  );
}
