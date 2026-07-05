import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Banner } from '@/components/ui/Banner';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { pickFolder, pickFile } from '@/lib/google/picker';
import { uploadBackupToFolder, downloadBackupFile } from '@/lib/google/drive';
import { exportBackup, parseBackupFile, importBackup, type BackupPayload } from '@/lib/data';

export function GoogleSync() {
  const { t } = useTranslation();
  const { configured, status, email, busy, getToken, signOut } = useGoogleAuth();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Stashed downloaded+validated backup text, awaiting destructive confirm.
  const [confirm, setConfirm] = useState<{ text: string; payload: BackupPayload } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setErr(t('settings.googleErrors.generic'));
      // eslint-disable-next-line no-console
      console.error('[GoogleSync]', e);
    }
  };

  const handleSignIn = () =>
    run(async () => {
      await getToken(); // establishes session + email
    });

  const handleBackup = () =>
    run(async () => {
      const token = await getToken();
      const folder = await pickFolder(token, t('settings.google.pickFolder'));
      if (!folder) return; // user cancelled the picker
      const payload = await exportBackup();
      const file = await uploadBackupToFolder(folder.id, payload, token);
      setInfo(t('settings.google.backupSuccess', { name: file.name }));
    });

  const handleRestorePick = () =>
    run(async () => {
      const token = await getToken();
      const file = await pickFile(token, t('settings.google.pickFile'));
      if (!file) return; // user cancelled
      const text = await downloadBackupFile(file.id, token);
      const parsedPayload = parseBackupFile(text); // validate before prompting — never confirm a bad file
      setConfirm({ text, payload: parsedPayload }); // Stash payload for direct use, avoid re-parsing
    });

  const handleRestoreConfirm = () =>
    run(async () => {
      if (!confirm) return;
      try {
        await importBackup(confirm.payload);
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

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <TintedIcon hex="#4F46E5" icon="Upload" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.backup')}</span>
              <span className="r-sub">{t('settings.google.backupHint')}</span>
            </span>
            <div style={{ flex: '0 0 100%', marginTop: 8 }}>
              <Button variant="secondary" full onClick={handleBackup} disabled={busy}>
                {t('settings.google.backupBtn')}
              </Button>
            </div>
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <TintedIcon hex="#10B981" icon="Download" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.restore')}</span>
              <span className="r-sub">{t('settings.google.restoreHint')}</span>
            </span>
            <div style={{ flex: '0 0 100%', marginTop: 8 }}>
              <Button variant="secondary" full onClick={handleRestorePick} disabled={busy}>
                {t('settings.google.restoreBtn')}
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
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={t('settings.google.restore')}>
        <div className="text-center" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
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
