import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}

/**
 * Bottom sheet built on the validated mock `.scrim` / `.sheet` / `.handle`.
 * Anchors to the nearest positioned ancestor (`.screen`) via position:absolute,
 * so it clips to the phone column on desktop instead of escaping to the viewport.
 * Must be rendered inside a `.screen` subtree.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim anim-fade" onClick={onClose} />
      <div className="sheet anim-sheet" role="dialog" aria-modal="true">
        <div className="handle" />
        {title && (
          <div className="row-between" style={{ marginBottom: 12, flexShrink: 0 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>
              {title}
            </h2>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
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
