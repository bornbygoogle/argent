import type { CSSProperties } from 'react';
import { Icon } from './Icon';

type Variant = 'cat' | 'cat-sm' | 'acct' | 'acct-lg';

interface TintedIconProps {
  /** Any CSS colour: a stored category hex, or a theme token via var(). */
  color: string;
  icon: string;
  variant?: Variant;
  /** Background alpha; mocks use ~0.12 for accounts, ~0.15 for some categories. */
  alpha?: number;
  size?: number;
  className?: string;
}

const VARIANT_CLASS: Record<Variant, string> = {
  cat: 'cat',
  'cat-sm': 'cat sm',
  acct: 'acct-icon',
  'acct-lg': 'acct-icon lg',
};
const VARIANT_SIZE: Record<Variant, number> = { cat: 20, 'cat-sm': 16, acct: 18, 'acct-lg': 22 };

/**
 * Tinted icon tile: translucent background + icon in the same colour.
 *
 * The colour is handed to CSS as `--tint` rather than mixed here. The old
 * version ran parseInt over the value, so it only ever accepted a literal hex
 * — which is why ~30 call sites hardcode cold-slate values the "Ink & Signal"
 * re-skin never reached. Any CSS colour works now, tokens included, and the
 * mixing lives in the stylesheet where the theme can reach it.
 * The single most-repeated pattern across the validated mocks (every row icon,
 * every account icon). Emits `.cat` / `.cat.sm` / `.acct-icon` / `.acct-icon.lg`.
 */
export function TintedIcon({
  color,
  icon,
  variant = 'cat',
  alpha = 0.12,
  size,
  className = '',
}: TintedIconProps) {
  return (
    <span
      className={[VARIANT_CLASS[variant], className].join(' ').trim()}
      style={{ '--tint': color, '--tint-a': `${Math.round(alpha * 100)}%` } as CSSProperties}
    >
      <Icon name={icon} size={size ?? VARIANT_SIZE[variant]} strokeWidth={2} />
    </span>
  );
}
