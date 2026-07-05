import { useCallback, useRef, useState } from 'react';
import { isGoogleConfigured } from '@/lib/google/env';
import { requestAccessToken, revokeAccessToken, fetchDriveUser } from '@/lib/google/auth';

const LS_EMAIL = 'argent.google.email';

export type GoogleAuthStatus = 'signed-out' | 'signed-in';

export interface UseGoogleAuth {
  configured: boolean;
  status: GoogleAuthStatus;
  email: string | null;
  busy: boolean;
  /** Request a token (+ ensure the account email is known). Returns the token. */
  getToken: () => Promise<string>;
  signOut: () => Promise<void>;
}

export function useGoogleAuth(): UseGoogleAuth {
  const configured = isGoogleConfigured();
  const lastToken = useRef<string | null>(null);
  const [email, setEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_EMAIL);
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);

  const getToken = useCallback(async (): Promise<string> => {
    setBusy(true);
    try {
      const token = await requestAccessToken();
      lastToken.current = token;
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
      return token;
    } finally {
      setBusy(false);
    }
  }, [email]);

  const signOut = useCallback(async () => {
    if (lastToken.current) {
      revokeAccessToken(lastToken.current);
      lastToken.current = null;
    }
    try {
      localStorage.removeItem(LS_EMAIL);
    } catch {
      /* ignore */
    }
    setEmail(null);
  }, []);

  return {
    configured,
    status: email ? 'signed-in' : 'signed-out',
    email,
    busy,
    getToken,
    signOut,
  };
}
