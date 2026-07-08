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
  requestAccessToken,
  revokeAccessToken,
  fetchDriveUser,
  getValidAccessToken,
  getCachedAccessToken,
  clearCachedAccessToken,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
} from '@/lib/google/auth';
import { getOrCreateDeviceId } from '@/lib/google/folderStore';

const LS_EMAIL = 'argent.google.email';
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
  /** Explicit sign-in: opens the Google consent popup once, resolves the email. */
  signIn: () => Promise<void>;
  /** Sign out: revoke + drop cached token and persisted email. */
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
  /** True when silent + auto-popup reconnect both failed; drives the reconnect banner/pill. */
  needsReconnect: boolean;
  /** Set/clear the reconnect-required flag (used by useSilentReconnect + signIn success). */
  setNeedsReconnect: (v: boolean) => void;
}

const GoogleAuthContext = createContext<UseGoogleAuth | null>(null);

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isGoogleConfigured();
  // `email` is a *remembered* account hint (persists across reloads) — purely so
  // we can greet a returning user. It does NOT imply an active session.
  const [email, setEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_EMAIL);
    } catch {
      return null;
    }
  });
  // `active` is true ONLY when a valid token exists in *this* session (set by an
  // explicit signIn). It is false on a fresh load, so the app never touches Google
  // until the user chooses to connect. This is what gates auto-backup/pull.
  const [active, setActive] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
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
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Ensure the device id exists before any push/pull happens.
  useEffect(() => {
    if (!configured) return;
    void getOrCreateDeviceId().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[google] device id init failed:', e);
    });
  }, [configured]);

  // Silent re-activation on load: if a still-valid access token was persisted
  // in the previous tab/visit (cachedExpiresAt not yet reached), flip `active`
  // to true WITHOUT any GIS call. This is the crux of fixing "must re-login on
  // every refresh": as long as the GIS token (lives ≤1h) hasn't expired, the
  // session survives a reload — no popup, no 12s slot occupation, no Drive op
  // fired before the user opened the feature (the background loop's pull-only-
  // on-status-flip still gates real network work). If no valid token persists
  // (long absence, Brave blocked the cookie, first ever load) `active` stays
  // false and the user clicks "Se connecter" once — silent-first inside signIn
  // reconnects without a popup when the GIS cookie allows it.
  useEffect(() => {
    if (!configured) return;
    // `email` is just a *hint* — having it doesn't prove the session is alive
    // (the persisted token is the proof). But requiring it avoids flipping
    // active for a user who wiped state. The token is the real gate.
    if (email && getCachedAccessToken() && !active) setActive(true);
  }, [configured, email, active]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      // Returning user: try a SILENT token first (no popup). If Google still
      // grants one from its GIS cookie, we're reconnected invisibly. Only if
      // that fails do we fall back to an explicit consent popup. This keeps
      // the GIS slot free until the user actually clicks "Se connecter" — so
      // automatic page loads never tie up the single callback channel for 12s
      // (which previously broke concurrent Restore / manual sign-in attempts).
      let token: string;
      try {
        token = await requestAccessToken({ prompt: '' });
      } catch {
        token = await requestAccessToken({ prompt: 'consent' });
      }
      if (!email) {
        const user = await fetchDriveUser(token);
        if (user.email) {
          setEmail(user.email);
          try {
            localStorage.setItem(LS_EMAIL, user.email);
          } catch {
            /* ignore quota errors */
          }
        }
      }
      // Mark the session active only after a real token is in hand.
      setActive(true);
      setNeedsReconnect(false);
    } finally {
      setBusy(false);
    }
  }, [email]);

  const signOut = useCallback(async () => {
    const t = getCachedAccessToken();
    if (t) revokeAccessToken(t);
    clearCachedAccessToken();
    try {
      localStorage.removeItem(LS_EMAIL);
    } catch {
      /* ignore */
    }
    setEmail(null);
    setActive(false);
    setNeedsReconnect(false);
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
      // `signed-in` requires an active session THIS load — not just a remembered
      // email. This is the gate that prevents auto-backup/pull from firing on a
      // stale localStorage hint before the user has chosen to connect.
      status: active && email ? 'signed-in' : 'signed-out',
      email: active ? email : null,
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
    }),
    [
      configured,
      active,
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

  return <GoogleAuthContext.Provider value={value}>{children}</GoogleAuthContext.Provider>;
}

// Internal: lets the background loop toggle the "backingUp" flag without it being
// part of the memoised context value (avoids re-rendering all consumers on toggle).
const backingUpSetterRef: { current: ((v: boolean) => void) | null } = { current: null };

/** Toggle the in-flight backup flag (used by the background loop). */
export function setBackingUp(v: boolean): void {
  backingUpSetterRef.current?.(v);
}

/** Set the "restored just now" flag before a restore-induced reload. */
export function markRestoredJustNow(): void {
  try {
    sessionStorage.setItem(SS_RESTORED_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function useGoogleAuth(): UseGoogleAuth {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) throw new Error('useGoogleAuth must be used within GoogleAuthProvider');
  return ctx;
}
