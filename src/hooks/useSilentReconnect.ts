import { useEffect, useRef } from 'react';
import { db } from '@/db/db';
import { useGoogleAuth } from '@/store/GoogleAuthContext';
import { getCachedAccessToken, requestAccessToken } from '@/lib/google/auth';

const LS_EMAIL = 'argent.google.email';

/** Raw persisted email hint (survives reloads independent of session state). */
function rememberedEmail(): string | null {
  try {
    return localStorage.getItem(LS_EMAIL);
  } catch {
    return null;
  }
}

/**
 * Boot-time reconnect orchestration (runs once per mount). State machine:
 *  [0] not configured / no remembered email / 0 accounts  → do nothing, ever.
 *  [1] valid cached token still on disk                    → context already flips active.
 *  [2] silent token (prompt:'')                            → invisible reconnect.
 *  [3] consent popup (prompt:'consent')                    → auto popup (often blocked).
 *  [4] both fail                                           → setNeedsReconnect(true) → banner/pill.
 *
 * The trigger gate uses the RAW localStorage email hint, not the context's
 * session-gated `email` (which is `active ? email : null` and is therefore
 * always null on a fresh load with an expired token — the exact case this
 * hook exists to handle). The GoogleAuthProvider already flips `active` for
 * case [1] via getCachedAccessToken. This hook only needs to handle [2]→[4]
 * when the session is NOT already active.
 */
export function useSilentReconnect(): void {
  const { configured, status, signIn, setNeedsReconnect } = useGoogleAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    // Case [0]: never auto-trigger without a remembered account hint.
    if (!configured || !rememberedEmail()) return;
    // Already reconnected by the provider (case [1]) — nothing to do.
    if (status === 'signed-in') return;

    ran.current = true;

    void (async () => {
      // Strict trigger condition (spec §2): at least one configured account.
      const accountCount = await db.accounts.count();
      if (accountCount === 0) return;

      // [1] Belt-and-braces: a live token may already exist on disk, but a
      // render-order race could mean the provider hasn't flipped `status` to
      // 'signed-in' yet by the time this effect runs. In the normal case the
      // `status !== 'signed-in'` guard above already gates this out, so this
      // branch is defensive rather than the primary path.
      if (getCachedAccessToken()) {
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
        // signIn()'s internal call also uses prompt:'' (silent-first), so this
        // stays a silent network call, not a cache hit — but it means no
        // second popup appears here.
        await signIn();
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
  }, [configured, status, signIn, setNeedsReconnect]);
}
