import { useEffect, useRef } from 'react';
import { db } from '@/db/db';
import { useGoogleAuth } from '@/store/GoogleAuthContext';
import { getCachedAccessToken, requestAccessToken } from '@/lib/google/auth';

/**
 * Boot-time reconnect orchestration (runs once per mount). State machine:
 *  [0] not configured / no remembered email / 0 accounts  → do nothing, ever.
 *  [1] valid cached token still on disk                    → context already flips active.
 *  [2] silent token (prompt:'')                            → invisible reconnect.
 *  [3] consent popup (prompt:'consent')                    → auto popup (often blocked).
 *  [4] both fail                                           → setNeedsReconnect(true) → banner/pill.
 *
 * The GoogleAuthProvider already flips `active` for case [1] via getCachedAccessToken.
 * This hook only needs to handle [2]→[4] when the session is NOT already active.
 */
export function useSilentReconnect(): void {
  const { configured, status, email, signIn, setNeedsReconnect } = useGoogleAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    // Case [0]: never auto-trigger without a remembered account hint.
    if (!configured || !email) return;
    // Already reconnected by the provider (case [1]) — nothing to do.
    if (status === 'signed-in') return;

    ran.current = true;

    void (async () => {
      // Strict trigger condition (spec §2): at least one configured account.
      const accountCount = await db.accounts.count();
      if (accountCount === 0) return;

      // [1] A live token may still exist on disk (belt-and-braces).
      if (getCachedAccessToken()) {
        // signIn() takes the silent-first path and flips active without a popup.
        try {
          await signIn();
          return;
        } catch {
          /* fall through to explicit attempts */
        }
      }

      // [2] Silent token via GIS cookie.
      try {
        await requestAccessToken({ prompt: '' });
        await signIn(); // now getCachedAccessToken() hits → active, no popup
        return;
      } catch {
        /* silent failed — try the popup */
      }

      // [3] Auto consent popup (frequently blocked on mobile).
      try {
        await requestAccessToken({ prompt: 'consent' });
        await signIn();
        return;
      } catch {
        // [4] Everything failed → surface the reconnect banner/pill.
        setNeedsReconnect(true);
      }
    })();
  }, [configured, email, status, signIn, setNeedsReconnect]);
}
