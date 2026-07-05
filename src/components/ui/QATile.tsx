import { Icon } from './Icon';

interface QATileProps {
  hex: string;
  icon: string;
  label: string;
  onClick?: () => void;
  className?: string;
}

/** Quick-action tile (`.qa` / `.qa-ic` / `.qa-lbl`). */
export function QATile({ hex, icon, label, onClick, className = '' }: QATileProps) {
  return (
    <button type="button" className={['qa', className].join(' ').trim()} onClick={onClick}>
      <span className="qa-ic" style={{ background: hex }}>
        <Icon name={icon} size={24} strokeWidth={2.2} />
      </span>
      <span className="qa-lbl">{label}</span>
    </button>
  );
}
