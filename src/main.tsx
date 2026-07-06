import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import App from '@/App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '@/index.css';
import { registerSW } from 'virtual:pwa-register';

// Dev aid: surface any module-eval / uncaught async error into the page
// instead of leaving a blank screen. Safe to keep; only fires on error.
function showFatal(label: string, detail: unknown) {
  const err = detail instanceof Error ? detail : new Error(String(detail));
  const el = document.getElementById('root');
  const html = `<div style="padding:24px;font-family:monospace;color:#b91c1c;background:#fef2f2;min-height:100dvh;white-space:pre-wrap;word-break:break-word">
<h2 style="font-size:16px;margin:0 0 8px">${label}</h2>
<div style="font-weight:700;margin-bottom:8px">${err.message}</div>
<pre style="font-size:11px;line-height:1.4">${err.stack ?? ''}</pre></div>`;
  if (el) el.innerHTML = html;
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
