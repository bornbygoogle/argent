import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}

/** Everything inside `root` that a Tab can land on, in document order. */
function focusable(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ];
}

/**
 * Bottom sheet built on the validated mock `.scrim` / `.sheet` / `.handle`.
 * Anchors to the nearest positioned ancestor (`.screen`) via position:absolute,
 * so it clips to the phone column on desktop instead of escaping to the viewport.
 * Must be rendered inside a `.screen` subtree.
 *
 * aria-modal hides the page behind this from a screen reader, but it does
 * nothing to the Tab order — so the sheet also has to move focus in, keep it in,
 * and hand it back on close. Without that, a keyboard or switch user opens a
 * layer they cannot reach and then tabs out of it into content they cannot see.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Whatever opened the sheet is where focus belongs again afterwards.
    const opener = document.activeElement as HTMLElement | null;
    // The container, not its first control — that first control is the close
    // button, so focusing it would make Enter dismiss the sheet the instant it
    // opens. From here a screen reader reads the dialog's name and Tab steps
    // into the content in order.
    sheetRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const stops = focusable(sheetRef.current);
      if (stops.length === 0) {
        e.preventDefault();
        return;
      }
      const [first, last] = [stops[0], stops[stops.length - 1]];
      // Only intervene at the ends; in between, let the browser do it.
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!sheetRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim anim-fade" onClick={onClose} />
      <div
        ref={sheetRef}
        className="sheet anim-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <div className="handle" />
        {title && (
          <div className="row-between" style={{ marginBottom: 12, flexShrink: 0 }}>
            <h2 className="h2" id={titleId} style={{ fontSize: 18 }}>
              {title}
            </h2>
            <button type="button" onClick={onClose} className="icon-btn" aria-label={t('common.close')}>
              <Icon name="X" size={20} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto no-scrollbar" style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </>
  );
}
