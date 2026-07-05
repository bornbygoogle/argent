import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Banner } from '@/components/ui/Banner';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import {
  listBackupsInFolder,
  downloadBackupFile,
  type DriveBackupMeta,
} from '@/lib/google/drive';
import { withTokenRefresh } from '@/lib/google/auth';
import { ensureGestionMoneyFolder, getGoogleMeta, setGoogleMeta } from '@/lib/google/folderStore';
import { parseBackupFile, importBackup, type BackupPayload } from '@/lib/data';
import { requestBackupNow } from '@/components/GoogleAutoBackup';

export function GoogleSync() {
  const { t } = useTranslation();
  const {
    configured,
    status,
    email,
    busy,
    signIn,
    signOut,
    getValidAccessToken,
    syncStatus,
    restoredJustNow,
    clearRestoredJustNow,
  } = useGoogleAuth();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Stashed downloaded+validated backup, awaiting destructive confirm.
  const [confirm, setConfirm] = useState<{ payload: BackupPayload; name: string } | null>(null);

  const lastBackupAt = useLiveQuery(async () => (await getGoogleMeta()).lastBackupAt, [], null);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      // Show the real underlying error so Drive failures are debuggable.
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
      // eslint-disable-next-line no-console
      console.error('[GoogleSync]', e);
    }
  };

  const handleSignIn = () =>
    run(async () => {
      await signIn(); // establishes session + email
    });

  const handleBackupNow = () =>
    run(async () => {
      await requestBackupNow();
      setInfo(t('settings.google.backupDone'));
    });

  const handleRestoreLatest = () =>
    run(async () => {
      const token = await getValidAccessToken();
      const folderId = await ensureGestionMoneyFolder(token);
      const files = await withTokenRefresh((tk) => listBackupsInFolder(folderId, tk));
      if (files.length === 0) {
        setErr(t('settings.google.noBackups'));
        return;
      }
      const newest: DriveBackupMeta = files[0]; // list is modifiedTime desc
      const text = await withTokenRefresh((tk) => downloadBackupFile(newest.id, tk));
      const payload = parseBackupFile(text); // validate before prompting
      setConfirm({ payload, name: newest.name });
    });

  const handleRestoreConfirm = () =>
    run(async () => {
      if (!confirm) return;
      try {
        await importBackup(confirm.payload);
        await setGoogleMeta({ lastPulledAt: new Date().toISOString() });
        location.reload();
      } finally {
        setConfirm(null);
      }
    });

  if (!configured) {
    return (
      <div className="card tight">
        <Banner tone="danger" icon="AlertCircle">
          {t('settings.google.notConfigured')}
        </Banner>
      </div>
    );
  }

  return (
    <div className="card tight">
      {/* Restore notice: shown once after an auto/manual restore reloads the app. */}
      {status === 'signed-in' && restoredJustNow && (
        <div style={{ marginBottom: 8 }}>
          <Banner tone="success" icon="CheckCircle2" onDismiss={clearRestoredJustNow}>
            {t('settings.google.restoredFromDrive')}
          </Banner>
        </div>
      )}
      {/* Backup error surfaced from the background loop. */}
      {status === 'signed-in' && syncStatus.lastError && !err && (
        <div style={{ marginBottom: 8 }}>
          <Banner tone="warn" icon="AlertCircle">
            {t('settings.google.backupError')}
          </Banner>
        </div>
      )}
      {err && (
        <div style={{ marginBottom: 8 }}>
          <Banner tone="danger" icon="AlertCircle">{err}</Banner>
        </div>
      )}
      {info && !err && (
        <div style={{ marginBottom: 8 }}>
          <Banner tone="success" icon="CheckCircle2">{info}</Banner>
        </div>
      )}

      {status === 'signed-out' ? (
        <div className="row">
          <TintedIcon hex="#4F46E5" icon="CloudUpload" variant="acct" />
          <span className="r-main">
            <span className="r-title">{t('settings.google.title')}</span>
            <span className="r-sub">{t('settings.google.signInHint')}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={handleSignIn} disabled={busy}>
            {t('settings.google.signIn')}
          </Button>
        </div>
      ) : (
        <>
          <div className="row">
            <TintedIcon hex="#10B981" icon="Cloud" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.title')}</span>
              <span className="r-sub">{t('settings.google.signedInAs', { email: email ?? '' })}</span>
            </span>
          </div>

          {/* Automatic backup status — runs in the background + manual trigger. */}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <TintedIcon hex="#4F46E5" icon="CloudUpload" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.autoBackupTitle')}</span>
              <span className="r-sub">
                {t('settings.google.autoBackupHint')}
                {lastBackupAt
                  ? ` · ${t('settings.google.lastBackup', { time: new Date(lastBackupAt).toLocaleString() })}`
                  : ''}
              </span>
            </span>
            <div style={{ flex: '0 0 100%', marginTop: 8 }}>
              <Button
                variant="secondary"
                full
                onClick={handleBackupNow}
                disabled={busy || syncStatus.backingUp}
              >
                {syncStatus.backingUp
                  ? t('settings.google.backingUp')
                  : t('settings.google.backupNow')}
              </Button>
            </div>
          </div>

          {/* Restore latest — the cross-device sync action. */}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <TintedIcon hex="#10B981" icon="Download" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.restoreLatest')}</span>
              <span className="r-sub">{t('settings.google.restoreLatestHint')}</span>
            </span>
            <div style={{ flex: '0 0 100%', marginTop: 8 }}>
              <Button variant="secondary" full onClick={handleRestoreLatest} disabled={busy}>
                {t('settings.google.restoreLatestBtn')}
              </Button>
            </div>
          </div>

          <div className="row">
            <TintedIcon hex="#64748B" icon="LogOut" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.signOut')}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => signOut()} disabled={busy}>
              {t('settings.google.signOutBtn')}
            </Button>
          </div>
        </>
      )}

      {/* Destructive restore confirm: replaces ALL local data. */}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={t('settings.google.restoreLatest')}>
        <div className="text-center" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
          <p className="body-sm" style={{ marginBottom: 16 }}>
            {confirm ? t('settings.google.restoreConfirmName', { name: confirm.name }) : ''}
          </p>
          <p className="body-sm" style={{ marginBottom: 16 }}>{t('settings.google.restoreConfirmHint')}</p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={handleRestoreConfirm} disabled={busy}>
              {t('settings.google.restoreConfirmBtn')}
            </Button>
            <Button variant="secondary" full onClick={() => setConfirm(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
