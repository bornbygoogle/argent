import { Icon } from './Icon';

interface AccountChipProps {
  /** 'tri' = tri-gradient "all accounts" dot; otherwise a solid hex color. */
  dot?: string;
  name: string;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}

/** Top-bar account selector chip (`.acct-chip` + `.acct-dot` + `.acct-name`). */
export function AccountChip({ dot = 'tri', name, onClick, chevron = true, className = '' }: AccountChipProps) {
  const dotStyle =
    dot === 'tri'
      ? { background: 'linear-gradient(90deg,#4F46E5,#10B981,#F59E0B)' }
      : { background: dot };
  return (
    <button type="button" className={['acct-chip', className].join(' ').trim()} onClick={onClick}>
      <span className="acct-dot" style={dotStyle} />
      <span className="acct-name">{name}</span>
      {chevron && (
        <span style={{ color: 'var(--neutral-400)', display: 'inline-flex' }}>
          <Icon name="ChevronDown" size={16} />
        </span>
      )}
    </button>
  );
}
