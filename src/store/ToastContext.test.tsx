import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, useToastList } from '@/store/ToastContext';

let api: ReturnType<typeof useToast>;

function Consumer() {
  api = useToast();
  const list = useToastList();
  return (
    <ul>
      {list.map((t) => (
        <li key={t.id}>{t.message}</li>
      ))}
    </ul>
  );
}

const mount = () =>
  render(
    <ToastProvider>
      <Consumer />
    </ToastProvider>,
  );

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ToastProvider', () => {
  it('clears pending toast timers when the provider unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = mount();

    act(() => api.info('one', 1000));
    act(() => api.info('two', 2000));
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a toast with zero duration visible instead of dismissing it at once', () => {
    vi.useFakeTimers();
    mount();

    act(() => api.info('zero', 0));
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('zero')).toBeInTheDocument();
  });

  it('keeps a toast with negative duration visible instead of dismissing it at once', () => {
    vi.useFakeTimers();
    mount();

    act(() => api.info('negative', -5));
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('negative')).toBeInTheDocument();
  });
});
