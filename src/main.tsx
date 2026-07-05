import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import App from '@/App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '@/index.css';

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
window.addEventListener('error', (e) => showFatal('Uncaught error', e.error ?? e.message));
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
