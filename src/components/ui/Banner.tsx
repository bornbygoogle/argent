import type { ReactNode } from 'react';
import { Icon } from './Icon';

type Tone = 'warn' | 'danger' | 'success';

interface BannerProps {
  tone: Tone;
  icon?: string;
  children: ReactNode;
  className?: string;
}

/** Alert / status banner (`.banner.warn|danger|success`) with a leading icon. */
export function Banner({ tone, icon, children, className = '' }: BannerProps) {
  return (
    <div className={['banner', tone, className].join(' ').trim()}>
      {icon && <Icon name={icon} size={18} strokeWidth={2} />}
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}
