// Keys written by the pre-serverless GIS implementation. The access token used
// to be persisted in localStorage; it is now memory-only, behind an httpOnly
// cookie the browser's JavaScript cannot read. Purge the stale keys so an
// upgrading device does not carry a dead token around.
const LEGACY_KEYS = [
  'argent.google.token',
  'argent.google.tokenExpiresAt',
  'argent.google.email',
];

export function purgeLegacyGoogleStorage(): void {
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* private mode / quota — nothing to clean up in that case anyway */
    }
  }
}
