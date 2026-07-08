import { Icon } from '@/components/ui/Icon';
import { useToast, useToastList, type ToastTone } from '@/store/ToastContext';

const ICON: Record<ToastTone, string> = {
  success: 'CheckCircle2',
  error: 'AlertCircle',
  info: 'Info',
};

/** Fixed stack of ephemeral toasts, above the bottom nav, safe-area aware. */
export function ToastContainer() {
  const toasts = useToastList();
  const { dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast-${t.tone}`}
          onClick={() => dismiss(t.id)}
        >
          <Icon name={ICON[t.tone]} size={18} strokeWidth={2} />
          <span className="toast-msg">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
