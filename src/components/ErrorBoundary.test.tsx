import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import en from '@/locales/en/common.json';
import fr from '@/locales/fr/common.json';
import { ErrorBoundary } from './ErrorBoundary';

const SECRET_MESSAGE = 'boom-internal-detail-42';

function Bomb(): never {
  const err = new Error(SECRET_MESSAGE);
  err.stack = `Error: ${SECRET_MESSAGE}\n    at Bomb (/src/features/secret/Module.tsx:12:3)`;
  throw err;
}

function mount() {
  return render(
    <ErrorBoundary>
      <Bomb />
    </ErrorBoundary>,
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('ErrorBoundary hides the error message and stack in production', () => {
    vi.stubEnv('DEV', false);
    const { container } = mount();
    expect(container.textContent).not.toContain(SECRET_MESSAGE);
    expect(container.textContent).not.toContain('/src/features/secret/Module.tsx');
  });

  it('ErrorBoundary shows a reload action in production', () => {
    vi.stubEnv('DEV', false);
    mount();
    expect(screen.getByRole('button', { name: en.common.reload })).toBeInTheDocument();
  });

  it('ErrorBoundary shows the error message in development', () => {
    vi.stubEnv('DEV', true);
    const { container } = mount();
    expect(container.textContent).toContain(SECRET_MESSAGE);
  });

  it('ErrorBoundary crash screen uses theme tokens instead of inline hex colours', () => {
    vi.stubEnv('DEV', false);
    const { container } = mount();
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/);
  });

  it('ErrorBoundary crash strings exist in both the en and fr locales', () => {
    for (const key of ['crashTitle', 'crashBody', 'reload'] as const) {
      expect(en.common[key]).toBeTruthy();
      expect(fr.common[key]).toBeTruthy();
    }
  });
});
