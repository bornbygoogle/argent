interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
  'aria-label'?: string;
}

/** 44×24 switch built on the validated mock `.toggle` / `.toggle.on`. */
export function Toggle({ checked, onChange, className = '', ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      className={['toggle', checked ? 'on' : '', className].join(' ').trim()}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      {...rest}
    />
  );
}
