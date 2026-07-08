// Background Google Drive sync. Two responsibilities:
//  (a) PUSH — when signed-in domain data changes, upload a backup ~5s later
//      (debounced) into the "GestionMoney" folder, then prune to the 5 newest.
//  (b) PULL — once per sign-in, if Drive's newest backup is strictly newer than
//      this device's last push, import it (cross-device sync). Gated so a device
//      never clobbers its own just-pushed data.
//
// Also exposes a manual "back up now" trigger (requestBackupNow) and reports
// observable status (last backup time, errors, in-flight) to the auth context
// so the Settings UI can notify the user. Mounted inside <GoogleAuthProvider>.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '@/store/ToastContext';
import { db } from '@/db/db';
import { exportBackup, importBackup, parseBackupFile } from '@/lib/data';
import {
  uploadBackupToFolder,
  listBackupsInFolder,
  deleteFile,
  downloadBackupFile,
} from '@/lib/google/drive';
import { withTokenRefresh } from '@/lib/google/auth';
import {
  ensureGestionMoneyFolder,
  getGoogleMeta,
  setGoogleMeta,
  getOrCreateDeviceId,
} from '@/lib/google/folderStore';
import {
  useGoogleAuth,
  setBackingUp,
  markRestoredJustNow,
} from '@/store/GoogleAuthContext';

const PUSH_DEBOUNCE_MS = 5000;
const KEEP_LAST = 5;

// Manual-trigger channel: GoogleSync calls requestBackupNow(); the mounted
// component registers a handler so it runs immediately (no debounce), and the
// promise resolves when the push completes (or rejects with the error message).
let backupNowHandler: ((manual: boolean) => Promise<void>) | null = null;

/** Trigger an immediate backup (no debounce). Resolves on completion. */
export function requestBackupNow(): Promise<void> {
  if (backupNowHandler) return backupNowHandler(true);
  return Promise.reject(new Error('google-backup-not-ready'));
}

export function GoogleAutoBackup() {
  const { status, getValidAccessToken, reportBackupDone, reportBackupError } = useGoogleAuth();
  const { t } = useTranslation();
  const toast = useToast();

  // Heartbeat: a string that changes whenever tracked tables' membership shifts.
  // Folding the newest transaction date also catches in-place edits that keep
  // row counts constant (amount/date changes).
  const heartbeat = useLiveQuery(async () => {
    const [t, a, r, b] = await Promise.all([
      db.transactions.count(),
      db.accounts.count(),
      db.recurrings.count(),
      db.budgets.count(),
    ]);
    let lastTx = 'none';
    try {
      const last = await db.transactions.orderBy('date').last();
      if (last) lastTx = `${last.date}|${last.id}`;
    } catch {
      /* ignore — table may be empty */
    }
    return `${t}|${a}|${r}|${b}|${lastTx}`;
  }, [], null);

  const lastSeen = useRef<string | null>(null);
  const running = useRef(false);
  // Phase gate: the very first thing that must happen after sign-in is the
  // restore/pull check. NO push is allowed to run until this flips true,
  // otherwise an automatic backup could upload local data and then make the
  // pending pull abort (its "Drive not newer" gate) — silently erasing the
  // user's newer data that lives on Drive. Set false on sign-out; set true
  // only once pullOnce() has finished (success, skip, or error).
  const readyToPush = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped when the push gate opens, so the push effect re-evaluates and can
  // flush a change that arrived during the (closed-gate) pull window.
  const [gateNonce, setGateNonce] = useState(0);

  const pushOnce = useCallback(async (manual = false): Promise<void> => {
    // Never push before the initial pull has resolved.
    if (!readyToPush.current) return;
    if (running.current) return;
    running.current = true;
    setBackingUp(true);
    try {
      const token = await getValidAccessToken();
      const folderId = await ensureGestionMoneyFolder(token);
      const deviceId = await getOrCreateDeviceId();
      const payload = await exportBackup(deviceId);
      await withTokenRefresh((tk) => uploadBackupToFolder(folderId, payload, tk));
      const at = new Date().toISOString();
      await setGoogleMeta({ lastBackupAt: at });
      reportBackupDone(at);
      if (manual) toast.success(t('settings.google.toastBackedUp'));

      // Best-effort prune: keep only the KEEP_LAST newest backups.
      try {
        const files = await withTokenRefresh((tk) => listBackupsInFolder(folderId, tk));
        const excess = files.slice(KEEP_LAST);
        await Promise.all(
          excess.map((f) =>
            withTokenRefresh((tk) => deleteFile(f.id, tk)).catch(() => {
              /* pruning is best-effort */
            }),
          ),
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[google] prune failed (non-fatal):', e);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      reportBackupError(message);
      toast.error(t('settings.google.toastBackupFailed'));
      // eslint-disable-next-line no-console
      console.error('[google] backup failed:', message);
      // Network failure: re-arm so the next change retries.
      if (e instanceof TypeError) lastSeen.current = null;
      throw e; // let a manual caller see the failure
    } finally {
      running.current = false;
      setBackingUp(false);
    }
  }, [getValidAccessToken, reportBackupDone, reportBackupError, toast, t]);

  // Register the manual-trigger handler so requestBackupNow() runs immediately.
  useEffect(() => {
    backupNowHandler = () => pushOnce(true);
    return () => {
      backupNowHandler = null;
    };
  }, [pushOnce]);

  const pullOnce = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const token = await getValidAccessToken();
      const folderId = await ensureGestionMoneyFolder(token);
      const files = await withTokenRefresh((tk) => listBackupsInFolder(folderId, tk));
      if (files.length === 0) return; // nothing on Drive yet
      const newest = files[0];
      const meta = await getGoogleMeta();

      // Skip if Drive isn't strictly newer than this device's last push —
      // avoids re-importing our own file or clobbering newer local edits.
      if (meta.lastBackupAt && newest.modifiedTime <= meta.lastBackupAt) return;

      const text = await withTokenRefresh((tk) => downloadBackupFile(newest.id, tk));
      const payload = parseBackupFile(text);
      // Extra guard: never import our own snapshot.
      if (payload.exportedBy && meta.deviceId && payload.exportedBy === meta.deviceId) return;

      await importBackup(payload);
      await setGoogleMeta({
        lastPulledAt: new Date().toISOString(),
        lastBackupAt: newest.modifiedTime,
      });
      // Tell the UI "your data was just pulled from Drive".
      markRestoredJustNow();
      // Dexie's useLiveQuery re-emits after importBackup rewrites the tables, so
      // the UI refreshes without a full page reload (spec §5.3). No location.reload().
      toast.info(t('settings.google.toastPulled'));
    } catch (e) {
      // Auto-pull is best-effort: never disrupt the user on failure.
      // eslint-disable-next-line no-console
      console.warn('[google] auto-pull skipped:', e);
      toast.error(t('settings.google.toastPullFailed'));
    } finally {
      running.current = false;
      // Open the push gate only after the pull has resolved (success, skip, or
      // error). This is the crux: an automatic backup must NEVER fire before
      // the restore check has decided whether Drive holds newer data.
      readyToPush.current = true;
      // Nudge the push effect to re-evaluate now that the gate is open, so a
      // local change made during the pull window gets backed up. (No-op if the
      // local state equals the baseline.)
      setGateNonce((n) => n + 1);
    }
  }, [getValidAccessToken, toast, t]);

  // PUSH: debounced on every heartbeat change while signed in — but ONLY after
  // the initial pull has resolved (readyToPush). Until then, no upload happens,
  // so a pending pull can't be preempted by a backup of stale local data.
  useEffect(() => {
    if (status !== 'signed-in') {
      lastSeen.current = heartbeat;
      return;
    }
    if (heartbeat === null) return; // first emit, no baseline yet
    // Establish the sign-in baseline once (before the pull resolves). Keep it
    // frozen while the gate is closed so that, on gate-open, a real change made
    // during the pull window is still detected as a diff and backed up.
    if (lastSeen.current === null) {
      lastSeen.current = heartbeat;
      return;
    }
    if (!readyToPush.current) return; // pull in progress — hold the baseline
    // Gate is open. If nothing changed since the last tracked value, bail.
    if (heartbeat === lastSeen.current) return;
    lastSeen.current = heartbeat;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void pushOnce(false);
    }, PUSH_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [heartbeat, status, pushOnce, gateNonce]);

  // PULL: once per sign-in transition. This MUST complete (or skip) before any
  // push runs — see readyToPush. Reset the gate on sign-out so the next sign-in
  // re-runs the restore-first ordering.
  const pullFired = useRef(false);
  useEffect(() => {
    if (status !== 'signed-in') {
      pullFired.current = false;
      readyToPush.current = false;
      lastSeen.current = null; // force a fresh baseline on next sign-in
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    if (pullFired.current) return;
    pullFired.current = true;
    void pullOnce();
  }, [status, pullOnce]);

  return null;
}
