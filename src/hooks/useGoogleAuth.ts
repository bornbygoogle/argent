// Re-export the context-backed hook so existing import sites keep working.
// The auth state (cached token, email, busy) is hoisted into GoogleAuthProvider
// so the background backup loop and the Settings UI share one source of truth.
export { useGoogleAuth, type UseGoogleAuth, type GoogleAuthStatus } from '@/store/GoogleAuthContext';
