import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

type Tone = 'warn' | 'danger' | 'success';

interface BannerProps {
  tone: Tone;
  icon?: string;
  children: ReactNode;
  className?: string;
  /** Optional dismiss handler — renders a close (×) button when provided. */
  onDismiss?: () => void;
}

/** Alert / status banner (`.banner.warn|danger|success`) with a leading icon. */
export function Banner({ tone, icon, children, className = '', onDismiss }: BannerProps) {
  const { t } = useTranslation();

  return (
    <div className={['banner', tone, className].join(' ').trim()}>
      {icon && <Icon name={icon} size={18} strokeWidth={2} />}
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common.close')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            marginLeft: 4,
            color: 'inherit',
            opacity: 0.7,
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
