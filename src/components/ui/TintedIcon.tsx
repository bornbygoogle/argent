import { Icon } from './Icon';

type Variant = 'cat' | 'cat-sm' | 'acct' | 'acct-lg';

interface TintedIconProps {
  hex: string;
  icon: string;
  variant?: Variant;
  /** Background alpha; mocks use ~0.12 for accounts, ~0.15 for some categories. */
  alpha?: number;
  size?: number;
  className?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const VARIANT_CLASS: Record<Variant, string> = {
  cat: 'cat',
  'cat-sm': 'cat sm',
  acct: 'acct-icon',
  'acct-lg': 'acct-icon lg',
};
const VARIANT_SIZE: Record<Variant, number> = { cat: 20, 'cat-sm': 16, acct: 18, 'acct-lg': 22 };

/**
 * Tinted icon tile: `rgba(hex,alpha)` background + hex-colored icon.
 * The single most-repeated pattern across the validated mocks (every row icon,
 * every account icon). Emits `.cat` / `.cat.sm` / `.acct-icon` / `.acct-icon.lg`.
 */
export function TintedIcon({
  hex,
  icon,
  variant = 'cat',
  alpha = 0.12,
  size,
  className = '',
}: TintedIconProps) {
  return (
    <span
      className={[VARIANT_CLASS[variant], className].join(' ').trim()}
      style={{ background: hexToRgba(hex, alpha), color: hex }}
    >
      <Icon name={icon} size={size ?? VARIANT_SIZE[variant]} strokeWidth={2} />
    </span>
  );
}
