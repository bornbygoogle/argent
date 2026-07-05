import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches render errors and shows them (dev aid) instead of a blank page. */
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
      <div style={{ padding: 24, fontFamily: 'monospace', color: '#b91c1c', background: '#fef2f2', minHeight: '100dvh', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Render error</h2>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{error.message}</div>
        <pre style={{ fontSize: 11, lineHeight: 1.4 }}>{error.stack}</pre>
      </div>
    );
  }
}
