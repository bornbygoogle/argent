import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import App from '@/App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { renderFatalScreen } from '@/lib/fatalScreen';
import '@/index.css';
import { registerSW } from 'virtual:pwa-register';

// Dev aid: surface any module-eval / uncaught async error into the page
// instead of leaving a blank screen. Safe to keep; only fires on error.
// The panel is built with textContent (see lib/fatalScreen) because the text
// it displays is not ours — an error message can quote a third-party payload.
function showFatal(label: string, detail: unknown) {
  const el = document.getElementById('root');
  if (el) renderFatalScreen(el, label, detail);
}
// Cross-origin script errors (e.g. from Google's gsi/picker SDKs loaded from
// accounts.google.com / apis.google.com) arrive as an opaque "Script error."
// with no Error object, filename, or line number. They are almost always SDK
// noise or feature-level failures already handled by the caller's try/catch —
// do NOT let them replace the whole page with a red screen. Log them so they
// can be diagnosed without bricking the app.
function isOpaqueCrossOriginError(e: ErrorEvent): boolean {
  const msg = e.error?.message ?? e.message ?? '';
  return msg === 'Script error.' && (!e.error || !e.error.stack) && !e.filename && !e.lineno;
}

window.addEventListener('error', (e) => {
  if (isOpaqueCrossOriginError(e)) {
    // eslint-disable-next-line no-console
    console.error('[opaque cross-origin error]', e.error ?? e.message, e);
    return;
  }
  showFatal('Uncaught error', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) =>
  showFatal('Unhandled promise rejection', e.reason),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Register the PWA service worker so beforeinstallprompt can fire and the app
// becomes installable + offline-capable in production. Dev is skipped by
// vite-plugin-pwa by default (no SW is emitted there).
registerSW({ immediate: true });
