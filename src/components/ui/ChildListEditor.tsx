import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Button } from './Button';
import { Sheet } from './Sheet';

export interface ChildItem {
  id: string;
  name: string;
}

interface ChildListEditorProps {
  items: ChildItem[];
  onAdd: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Shown in place of the list when there is nothing yet. */
  emptyText: string;
  /** Label of the add button, and the aria-label of the draft field. */
  addLabel: string;
  placeholder: string;
  /** Explains what deleting costs, shown in the confirm sheet. */
  deleteHint: string;
}

/**
 * Inline list editor for the named children of one parent — a category's
 * sub-categories, an income type's sub-types. Rename happens on blur, adding
 * from the bottom row, deleting behind a confirm.
 *
 * The name fields are uncontrolled and keyed by id so the live query that
 * re-renders the list never clobbers what is being typed.
 */
export function ChildListEditor({
  items,
  onAdd,
  onRename,
  onDelete,
  emptyText,
  addLabel,
  placeholder,
  deleteHint,
}: ChildListEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChildItem | null>(null);

  const add = async () => {
    const clean = draft.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await onAdd(clean);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card tight" style={{ marginBottom: 20 }}>
        {items.length === 0 && (
          <p className="body-sm" style={{ padding: '6px 4px', color: 'var(--neutral-500)' }}>
            {emptyText}
          </p>
        )}

        {items.map((item) => (
          <div className="row" key={item.id} style={{ padding: '6px 0' }}>
            <Icon name="CornerDownRight" size={16} color="var(--neutral-400)" />
            <input
              defaultValue={item.name}
              aria-label={item.name}
              onBlur={(e) => {
                const next = e.target.value.trim();
                // A blank rename is refused by the write layer, so put the
                // stored name back rather than leaving an empty box that
                // misreports what was saved.
                if (!next) {
                  e.target.value = item.name;
                  return;
                }
                if (next !== item.name) onRename(item.id, next);
              }}
              className="input"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              className="icon-btn"
              style={{ color: 'var(--danger-600)' }}
              onClick={() => setPendingDelete(item)}
              aria-label={`${t('common.delete')} ${item.name}`}
            >
              <Icon name="Trash2" size={18} />
            </button>
          </div>
        ))}

        <div className="row" style={{ padding: '6px 0' }}>
          <Icon name="Plus" size={16} color="var(--neutral-400)" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            aria-label={addLabel}
            className="input"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={add}
            disabled={busy || !draft.trim()}
          >
            {addLabel}
          </button>
        </div>
      </div>

      <Sheet open={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <div
            className="cat"
            style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', margin: '0 auto 12px' }}
          >
            <Icon name="Trash2" size={22} />
          </div>
          <h2 className="h3" style={{ marginBottom: 4 }}>{pendingDelete?.name}</h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>{deleteHint}</p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={confirmDelete} disabled={busy}>
              {t('common.delete')}
            </Button>
            <Button variant="secondary" full onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
