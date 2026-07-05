// Reads Google Cloud credentials from Vite env. These are *public* client
// credentials (OAuth Client ID + browser API key) — they ship in the bundle by
// design and are secured via authorized origins/referrers in Google Cloud.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

/** OAuth scope: the app may only touch files it created or the user picks. */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const GOOGLE_CLIENT_ID = CLIENT_ID;
export const GOOGLE_API_KEY = API_KEY;

/** True only when both credentials are present (feature is usable). */
export const isGoogleConfigured = (): boolean =>
  CLIENT_ID.trim().length > 0 && API_KEY.trim().length > 0;
