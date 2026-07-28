import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Build a path that keeps the app-wide account scope.
 *
 * The scope lives in the URL as `?account=`, so any navigation that writes a
 * bare pathname silently drops it and dumps the user back on "All accounts" —
 * which is easy to miss on a screen with no account picker to notice it by.
 *
 * Only `account` travels. Params like `?category=` belong to the screen that
 * set them and must not follow the user around.
 */
export function useScopedPath(): (pathname: string) => string {
  const [params] = useSearchParams();
  const account = params.get('account');

  return useCallback(
    (pathname: string) =>
      account ? `${pathname}?${new URLSearchParams({ account }).toString()}` : pathname,
    [account],
  );
}
