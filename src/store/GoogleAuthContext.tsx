import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { isGoogleConfigured } from '@/lib/google/env';
import {
  fetchSession,
  getValidAccessToken,
  startSignIn,
  serverSignOut,
  AuthRevokedError,
  AuthOfflineError,
} from '@/lib/google/auth';
import { purgeLegacyGoogleStorage } from '@/lib/google/legacyCleanup';
import { getOrCreateDeviceId } from '@/lib/google/folderStore';

const SS_RESTORED_FLAG = 'argent.google.restoredJustNow';

export type GoogleAuthStatus = 'signed-out' | 'signed-in';

/** Ephemeral, observable backup/sync status for UI feedback. */
export interface GoogleSyncStatus {
  /** ISO time of the last successful push, or null. */
  lastBackupAt: string | null;
  /** Last error from a push attempt (cleared on next success). Null = OK. */
  lastError: string | null;
  /** True while a push is in flight (manual or automatic). */
  backingUp: boolean;
}

export interface UseGoogleAuth {
  configured: boolean;
  status: GoogleAuthStatus;
  email: string | null;
  busy: boolean;
  /** Start the consent flow. Full-page redirect — this frame is going away. */
  signIn: () => void;
  /** Sign out: revoke at Google + drop the server session cookie. */
  signOut: () => Promise<void>;
  /** Silent, cached token for background use — never shows a popup. */
  getValidAccessToken: () => Promise<string>;
  /** Observable sync status for the UI (last backup time, errors, in-flight). */
  syncStatus: GoogleSyncStatus;
  /** Mark a backup as done (called by the background loop). */
  reportBackupDone: (at: string) => void;
  /** Report a backup error (called by the background loop). */
  reportBackupError: (message: string) => void;
  /** True once per session right after an auto/manual restore reloaded the app. */
  restoredJustNow: boolean;
  /** Acknowledge the "restored" notice (hides it). */
  clearRestoredJustNow: () => void;
  /**
   * True ONLY when the server reports the Google grant is genuinely revoked.
   * Being offline or hitting a transient upstream error must never set this —
   * conflating them is what asked the user to reconnect on every refresh.
   */
  needsReconnect: boolean;
  /** Set/clear the reconnect-required flag. */
  setNeedsReconnect: (v: boolean) => void;
  /** True when the last token attempt failed at the network layer. */
  offline: boolean;
}

const GoogleAuthContext = createContext<UseGoogleAuth | null>(null);

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isGoogleConfigured();
  const [status, setStatus] = useState<GoogleAuthStatus>('signed-out');
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncStatus, setSyncStatus] = useState<GoogleSyncStatus>({
    lastBackupAt: null,
    lastError: null,
    backingUp: false,
  });
  // sessionStorage survives the location.reload() that follows a restore, so the
  // banner can tell the user "your data was just pulled from Drive".
  const [restoredJustNow, setRestoredJustNow] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SS_RESTORED_FLAG) === '1';
    } catch {
      return false;
    }
  });

  // Ensure the device id exists before any push/pull happens.
  useEffect(() => {
    if (!configured) return;
    void getOrCreateDeviceId().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[google] device id init failed:', e);
    });
  }, [configured]);

  // Boot probe. ONE request to /api/auth/token establishes the session from the
  // httpOnly refresh-token cookie — no popup, no GIS, no third-party cookies,
  // and no sibling effect racing this one. The previous implementation ran a
  // reconnect state machine in a *descendant* component, whose effect fired
  // before this provider's, so it always saw 'signed-out' and destroyed the
  // still-valid token it was supposed to reuse.
  useEffect(() => {
    if (!configured) return;
    purgeLegacyGoogleStorage();
    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchSession();
        if (cancelled) return;
        setEmail(session.email);
        setStatus('signed-in');
        setNeedsReconnect(false);
        setOffline(false);
      } catch (e) {
        if (cancelled) return;
        setStatus('signed-out');
        // Only a genuinely dead grant prompts the user.
        setNeedsReconnect(e instanceof AuthRevokedError);
        setOffline(e instanceof AuthOfflineError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const signIn = useCallback((): void => {
    setBusy(true);
    startSignIn();
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await serverSignOut();
    } finally {
      setStatus('signed-out');
      setEmail(null);
      setNeedsReconnect(false);
      setBusy(false);
    }
  }, []);

  const reportBackupDone = useCallback((at: string) => {
    setSyncStatus({ lastBackupAt: at, lastError: null, backingUp: false });
  }, []);

  const reportBackupError = useCallback((message: string) => {
    setSyncStatus((s) => ({ ...s, lastError: message, backingUp: false }));
  }, []);

  const setBackingUp = useCallback((v: boolean) => {
    setSyncStatus((s) => ({ ...s, backingUp: v }));
  }, []);

  const clearRestoredJustNow = useCallback(() => {
    setRestoredJustNow(false);
    try {
      sessionStorage.removeItem(SS_RESTORED_FLAG);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<UseGoogleAuth>(
    () => ({
      configured,
      status,
      email: status === 'signed-in' ? email : null,
      busy,
      signIn,
      signOut,
      getValidAccessToken,
      syncStatus,
      reportBackupDone,
      reportBackupError,
      restoredJustNow,
      clearRestoredJustNow,
      needsReconnect,
      setNeedsReconnect,
      offline,
    }),
    [
      configured,
      status,
      email,
      busy,
      signIn,
      signOut,
      syncStatus,
      reportBackupDone,
      reportBackupError,
      restoredJustNow,
      clearRestoredJustNow,
      needsReconnect,
      offline,
    ],
  );

  // Register the in-flight-flag setter so the background loop can toggle
  // `backingUp` without it being part of the memoised context value (avoids
  // re-rendering all consumers on every toggle).
  useEffect(() => {
    backingUpSetterRef.current = setBackingUp;
    return () => {
      backingUpSetterRef.current = null;
    };
  }, [setBackingUp]);

  // Register the "restored just now" setter so a same-session background pull
  // can flip the live flag without it being part of the memoised context value.
  useEffect(() => {
    restoredSetterRef.current = setRestoredJustNow;
    return () => {
      restoredSetterRef.current = null;
    };
  }, []);

  return <GoogleAuthContext.Provider value={value}>{children}</GoogleAuthContext.Provider>;
}

// Internal: lets the background loop toggle the "backingUp" flag without it being
// part of the memoised context value (avoids re-rendering all consumers on toggle).
const backingUpSetterRef: { current: ((v: boolean) => void) | null } = { current: null };

// Internal: lets markRestoredJustNow update the live "restored" flag without it
// being part of the memoised context value (mirrors backingUpSetterRef).
const restoredSetterRef: { current: ((v: boolean) => void) | null } = { current: null };

/** Toggle the in-flight backup flag (used by the background loop). */
export function setBackingUp(v: boolean): void {
  backingUpSetterRef.current?.(v);
}

/**
 * Flag + surface a just-completed restore (sessionStorage for the next mount,
 * live state for the current one).
 */
export function markRestoredJustNow(): void {
  try {
    sessionStorage.setItem(SS_RESTORED_FLAG, '1');
  } catch {
    /* ignore */
  }
  restoredSetterRef.current?.(true);
}

export function useGoogleAuth(): UseGoogleAuth {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) throw new Error('useGoogleAuth must be used within GoogleAuthProvider');
  return ctx;
}
