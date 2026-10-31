import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';

interface State {
  error: Error | null;
}

/**
 * Catches render errors and shows a calm fallback instead of a blank page.
 * The raw message and stack are rendered (as text, never HTML) only in dev;
 * in production they stay in the console via componentDidCatch.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          padding: 24,
          color: 'var(--danger-600)',
          background: 'var(--danger-50)',
          minHeight: '100dvh',
          wordBreak: 'break-word',
        }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>{i18n.t('common.crashTitle')}</h2>
        <p style={{ marginBottom: 16, color: 'var(--neutral-700)' }}>{i18n.t('common.crashBody')}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {i18n.t('common.reload')}
        </button>
        {import.meta.env.DEV && (
          <div style={{ marginTop: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{error.message}</div>
            <pre style={{ fontSize: 11, lineHeight: 1.4 }}>{error.stack}</pre>
          </div>
        )}
      </div>
    );
  }
}
