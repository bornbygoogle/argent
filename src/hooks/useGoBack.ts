import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Back handler for pushed screens.
 *
 * `navigate(-1)` alone is only safe when the user reached the screen from
 * inside the app. Every pushed screen is also a real URL — a deep link, a PWA
 * launch, a refresh, a shared link — and there `-1` walks out of the app
 * entirely, leaving a blank page with no way back.
 *
 * React Router gives the entry the router booted on the key `'default'`, which
 * is exactly the "nothing of ours behind this" signal. In that case we go to
 * the screen's parent instead, replacing the entry so pressing back again does
 * not bounce onto the one we just left.
 *
 * @param fallback where to land when there is no in-app history to pop.
 */
export function useGoBack(fallback: string = '/'): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();

  return useCallback(() => {
    if (key === 'default') navigate(fallback, { replace: true });
    else navigate(-1);
  }, [navigate, key, fallback]);
}
