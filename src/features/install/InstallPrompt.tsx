import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useSettings } from '@/store/SettingsContext';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Detect standalone mode (already installed / added to home screen). */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari uses a different display-mode when launched from the home screen.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** PWA install nudge. Surfaces after the user logs a few expenses, until they
 *  dismiss for the session or permanently. Uses the real beforeinstallprompt
 *  event when the browser offers one. */
export function InstallPrompt() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const expenseCount = useLiveQuery(() => db.transactions.where('kind').equals('expense').count(), []) ?? 0;
  const [open, setOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const shown = useRef(false);
  // iOS Safari never fires beforeinstallprompt — detect it once to show the
  // correct "Add to Home Screen" instructions in the fallback block.
  const nav = navigator as Navigator & { standalone?: boolean };
  const isIos =
    /iphone|ipad|ipod/i.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  // Pop once the user is engaged (≥3 expenses), unless permanently dismissed
  // or already running as an installed app (no point prompting then).
  useEffect(() => {
    if (shown.current) return;
    if (settings.installPromptDismissed === 'permanent') return;
    if (isStandalone()) return;
    if (expenseCount >= 3) {
      shown.current = true;
      setOpen(true);
    }
  }, [expenseCount, settings.installPromptDismissed]);

  const install = async () => {
    const ev = deferred.current;
    if (ev) {
      await ev.prompt();
      try {
        await ev.userChoice;
      } catch {
        /* ignore */
      }
      deferred.current = null;
      setCanInstall(false);
    }
    setOpen(false);
  };

  const benefit = (icon: string, tint: string, title: string, sub: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className="cat sm" style={{ background: `var(--${tint}-50)`, color: `var(--${tint}-600)` }}>
        <Icon name={icon} size={16} strokeWidth={2} />
      </span>
      <div>
        <div className="h3" style={{ fontSize: 14 }}>{title}</div>
        <div className="caption">{sub}</div>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onClose={() => setOpen(false)}>
      <div style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'linear-gradient(135deg,var(--primary-600),var(--primary-500))',
              boxShadow: 'var(--shadow-fab)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', marginBottom: 14,
            }}
          >
            <Icon name="Download" size={36} strokeWidth={2.2} />
          </div>
          <h2 className="h2">{t('install.title', { app: t('app.name') })}</h2>
          <p className="body-sm" style={{ marginTop: 6, maxWidth: 280 }}>{t('install.body')}</p>
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {benefit('WifiOff', 'success', t('install.b1Title'), t('install.b1Sub'))}
          {benefit('Smartphone', 'primary', t('install.b2Title'), t('install.b2Sub'))}
          {benefit('ShieldCheck', 'neutral', t('install.b3Title'), t('install.b3Sub'))}
        </div>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canInstall ? (
            <button type="button" className="btn btn-primary btn-block" onClick={install}>
              <Icon name="Download" size={20} />
              {t('install.install')}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="body-sm" style={{ textAlign: 'center', color: 'var(--neutral-600)' }}>
                {t('install.manualBody', { app: t('app.name') })}
              </p>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                  background: 'var(--neutral-50)', borderRadius: 12,
                  fontSize: 14, color: 'var(--neutral-700)',
                }}
              >
                <Icon name={isIos ? 'Share' : 'EllipsisVertical'} size={18} />
                <span>{isIos ? t('install.manualIos') : t('install.manualChrome')}</span>
              </div>
            </div>
          )}
          <div className="row-between">
            <button type="button" className="btn btn-ghost" style={{ height: 40 }} onClick={() => setOpen(false)}>
              {t('install.later')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ height: 40, color: 'var(--neutral-500)' }}
              onClick={() => {
                update({ installPromptDismissed: 'permanent' });
                setOpen(false);
              }}
            >
              {t('install.never')}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
