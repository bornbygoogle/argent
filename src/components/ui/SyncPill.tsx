import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';

type PillState = 'synced' | 'syncing' | 'paused' | 'error';

const VISUAL: Record<PillState, { icon: string; color: string; spin?: boolean }> = {
  synced: { icon: 'Cloud', color: 'var(--success-600)' },
  syncing: { icon: 'RefreshCw', color: 'var(--primary-600)', spin: true },
  paused: { icon: 'CloudOff', color: 'var(--warning-600)' },
  error: { icon: 'AlertCircle', color: 'var(--danger-600)' },
};

/** Discrete Google-sync status pill for the Dashboard TopBar (replaces the dead bell). */
export function SyncPill() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { configured, status, syncStatus, needsReconnect, signIn } = useGoogleAuth();

  // Hidden when Google is not configured or the user is not signed in / not reconnecting.
  if (!configured) return null;
  if (status !== 'signed-in' && !needsReconnect) return null;

  let state: PillState;
  if (needsReconnect) state = 'paused';
  else if (syncStatus.backingUp) state = 'syncing';
  else if (syncStatus.lastError) state = 'error';
  else state = 'synced';

  const v = VISUAL[state];
  const onClick = () => {
    if (state === 'paused') void signIn();
    else navigate('/settings');
  };

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onClick}
      aria-label={t(`settings.google.pill.${state}`)}
      title={t(`settings.google.pill.${state}`)}
    >
      <Icon name={v.icon} size={22} color={v.color} className={v.spin ? 'spin' : undefined} />
    </button>
  );
}
