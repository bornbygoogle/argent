import { describe, it, expect, beforeEach } from 'vitest';
import { renderFatalScreen } from './fatalScreen';

function root(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderFatalScreen', () => {
  it('shows the label, the message and the stack', () => {
    const el = root();
    const err = new Error('boom');
    err.stack = 'Error: boom\n  at somewhere';
    renderFatalScreen(el, 'Uncaught error', err);

    expect(el.querySelector('h2')?.textContent).toBe('Uncaught error');
    expect(el.textContent).toContain('boom');
    expect(el.querySelector('pre')?.textContent).toContain('at somewhere');
  });

  // The message can carry a third-party response body verbatim — Drive errors
  // embed Google's JSON payload. It must never be parsed as markup.
  it('does not create elements from markup inside the message', () => {
    const el = root();
    const err = new Error('<img src=x onerror="globalThis.pwned = true">');
    err.stack = '';
    renderFatalScreen(el, 'Unhandled promise rejection', err);

    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=');
  });

  it('does not create elements from markup inside the stack', () => {
    const el = root();
    const err = new Error('failed');
    err.stack = 'Error: failed\n  at <script>globalThis.pwned = true</script>';
    renderFatalScreen(el, 'Uncaught error', err);

    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('pre')?.textContent).toContain('<script>');
  });

  it('does not create elements from markup inside the label', () => {
    const el = root();
    renderFatalScreen(el, '<iframe src="javascript:void 0"></iframe>', new Error('x'));

    expect(el.querySelector('iframe')).toBeNull();
  });

  // A non-Error rejection value (a string, an object) must render too, not throw.
  it('accepts a non-Error detail without throwing', () => {
    const el = root();
    renderFatalScreen(el, 'Unhandled promise rejection', 'plain string reason');

    expect(el.textContent).toContain('plain string reason');
  });

  it('replaces whatever was in the container', () => {
    const el = root();
    el.appendChild(document.createElement('main'));
    renderFatalScreen(el, 'Uncaught error', new Error('x'));

    expect(el.querySelector('main')).toBeNull();
  });
});
