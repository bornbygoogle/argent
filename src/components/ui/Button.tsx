import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** 'sm' → 36px; otherwise the default 48px. 'lg' is kept as an alias of md. */
  size?: Size;
  full?: boolean;
  children: ReactNode;
}

/** Button built on the validated mock `.btn` classes. */
export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={['btn', VARIANT[variant], size === 'sm' ? 'btn-sm' : '', full ? 'btn-block' : '', className].join(' ').trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
