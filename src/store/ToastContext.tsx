import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  duration: number;
}

export interface ToastApi {
  success: (msg: string, duration?: number) => void;
  error: (msg: string, duration?: number) => void;
  info: (msg: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION = 2500;
const MAX_TOASTS = 3;

const ToastListContext = createContext<Toast[] | null>(null);
const ToastApiContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, duration = DEFAULT_DURATION) => {
      // Counter-based id: Date.now()/Math.random() are fine at runtime, but a
      // monotonic counter guarantees uniqueness even for same-tick bursts.
      seq.current += 1;
      const id = `t${seq.current}`;
      setToasts((list) => [...list, { id, message, tone, duration }].slice(-MAX_TOASTS));
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, d) => push('success', m, d),
      error: (m, d) => push('error', m, d),
      info: (m, d) => push('info', m, d),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastApiContext.Provider value={api}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastApiContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastApiContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function useToastList(): Toast[] {
  const ctx = useContext(ToastListContext);
  if (!ctx) throw new Error('useToastList must be used within ToastProvider');
  return ctx;
}
