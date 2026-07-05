import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCategories, useAllTransactions, useBudget } from '@/hooks/selectors';
import { useAccountScope } from '@/store/AccountScopeContext';
import { categoryLabel } from '@/lib/labels';
import { formatCurrency } from '@/lib/format';
import { createCategory, updateCategory, deleteCategory } from '@/lib/categories';
import type { Category } from '@/types/models';

/** Icon choices offered when creating/editing a custom category. */
const ICON_CHOICES = [
  'ShoppingCart', 'Utensils', 'Car', 'Home', 'BookOpen', 'Heart',
  'Receipt', 'Film', 'Lightbulb', 'Smartphone', 'Euro', 'CreditCard',
];
const COLOR_CHOICES = [
  '#10B981', '#F59E0B', '#0EA5E9', '#14B8A6', '#8B5CF6', '#EC4899',
  '#EF4444', '#4F46E5', '#F97316', '#64748B',
];

type EditTarget = 'new' | Category;

export function Categories() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const categories = useCategories();
  const allTx = useAllTransactions();
  const { scope, accounts } = useAccountScope();
  const scopeAccount = scope === 'all' ? accounts[0] : accounts.find((a) => a.id === scope);
  const budget = useBudget(scopeAccount?.id);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  // categoryId → expense count
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of allTx) {
      if (tx.kind === 'expense' && tx.categoryId) m.set(tx.categoryId, (m.get(tx.categoryId) ?? 0) + 1);
    }
    return m;
  }, [allTx]);

  const limitMap = useMemo(
    () => new Map((budget?.categoryLimits ?? []).map((c) => [c.categoryId, c.limit])),
    [budget],
  );

  const defaults = categories.filter((c) => c.isDefault);
  const customs = categories.filter((c) => !c.isDefault);
  const totalTx = useMemo(
    () => allTx.filter((tx) => tx.kind === 'expense').length,
    [allTx],
  );

  const subFor = (c: Category): string => {
    const limit = limitMap.get(c.id);
    const budgetPart =
      limit != null && limit > 0
        ? `${t('categories.budget')} ${formatCurrency(limit)}`
        : t('categories.noBudget');
    const n = counts.get(c.id) ?? 0;
    return `${budgetPart} · ${n} ${t('categories.transactions')}`;
  };

  return (
    <>
      <TopBar
        left={
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <Icon name="ChevronLeft" size={22} />
          </button>
        }
        title={t('screens.categories')}
        right={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')}>
            + {t('categories.new')}
          </button>
        }
      />

      <div className="content" style={{ paddingBottom: 24, gap: 16 }}>
        {/* summary */}
        <div className="card tight row-between">
          <div>
            <span className="h3" style={{ fontSize: 18 }}>{categories.length}</span>{' '}
            <span className="body-sm">{t('categories.titlePlural')}</span>
          </div>
          <div>
            <span className="h3" style={{ fontSize: 18 }}>{totalTx}</span>{' '}
            <span className="body-sm">{t('categories.transactions')}</span>
          </div>
        </div>

        {categories.length === 0 ? (
          <EmptyState icon="LayoutGrid" title={t('categories.empty')} />
        ) : (
          <>
            {/* default */}
            {defaults.length > 0 && (
              <>
                <div className="section-head">
                  <span className="label">{t('categories.default')} · {defaults.length}</span>
                </div>
                <div className="card tight">
                  {defaults.map((c) => (
                    <div className="row" key={c.id} onClick={() => setEditing(c)} style={{ cursor: 'pointer' }}>
                      <TintedIcon hex={c.color} icon={c.icon} variant="cat" />
                      <div className="r-main">
                        <div className="r-title">{categoryLabel(t, c)}</div>
                        <div className="r-sub">{subFor(c)}</div>
                      </div>
                      <Icon name="ChevronRight" size={16} color="var(--neutral-300)" />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* custom */}
            {customs.length > 0 && (
              <>
                <div className="section-head">
                  <span className="label">{t('categories.custom')} · {customs.length}</span>
                </div>
                <div className="card tight">
                  {customs.map((c) => (
                    <div className="row" key={c.id} onClick={() => setEditing(c)} style={{ cursor: 'pointer' }}>
                      <TintedIcon hex={c.color} icon={c.icon} variant="cat" />
                      <div className="r-main">
                        <div className="r-title">{categoryLabel(t, c)}</div>
                        <div className="r-sub">{subFor(c)}</div>
                      </div>
                      <Icon name="ChevronRight" size={16} color="var(--neutral-300)" />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {editing !== null && (
        <CategoryFormSheet
          target={editing}
          onClose={() => setEditing(null)}
          onDeleted={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CategoryFormSheet({
  target,
  onClose,
  onDeleted,
}: {
  target: EditTarget;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const existing = target === 'new' ? undefined : target;

  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? 'ShoppingCart');
  const [color, setColor] = useState(existing?.color ?? '#10B981');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (existing) await updateCategory(existing.id, { name, icon, color });
      else await createCategory({ name, icon, color });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteCategory(existing.id);
      onDeleted();
    } finally {
      setBusy(false);
    }
  };

  const iconBtn = (active: boolean): React.CSSProperties => ({
    width: 48,
    height: 48,
    borderRadius: 12,
    border: `1px solid ${active ? 'var(--primary-600)' : 'var(--neutral-200)'}`,
    background: active ? 'var(--primary-50)' : 'var(--white)',
    color: active ? 'var(--primary-600)' : 'var(--neutral-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  });

  return (
    <>
      <Sheet open onClose={confirmOpen ? () => {} : onClose} title={t(existing ? 'categories.edit' : 'categories.add')}>
        <div style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <p className="label" style={{ marginBottom: 6 }}>{t('categories.name')}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('categories.namePlaceholder')}
            className="input"
            style={{ width: '100%', marginBottom: 20 }}
          />

          <p className="label" style={{ marginBottom: 8 }}>{t('categories.icon')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 20 }}>
            {ICON_CHOICES.map((ic) => (
              <button key={ic} type="button" style={iconBtn(icon === ic)} onClick={() => setIcon(ic)} aria-label={ic}>
                <Icon name={ic} size={20} />
              </button>
            ))}
          </div>

          <p className="label" style={{ marginBottom: 8 }}>{t('categories.color')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                style={{
                  width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: color === c ? '3px solid var(--neutral-900)' : '3px solid transparent',
                  boxShadow: color === c ? '0 0 0 1px #fff inset' : 'none',
                }}
              />
            ))}
          </div>

          {/* preview */}
          <div className="card tight" style={{ marginBottom: 20 }}>
            <div className="row" style={{ padding: '4px 0' }}>
              <TintedIcon hex={color} icon={icon} variant="cat" />
              <div className="r-main">
                <div className="r-title">{name || t('categories.namePlaceholder')}</div>
              </div>
            </div>
          </div>

          <Button full onClick={save} disabled={busy || !name.trim()}>
            {t('common.save')}
          </Button>

          {existing && existing.id !== 'cat-autre' && (
            <>
              <div className="divider" style={{ margin: '16px 0' }} />
              <Button variant="danger" full onClick={() => setConfirmOpen(true)} disabled={busy}>
                <Icon name="Trash2" size={18} />
                {t('categories.delete')}
              </Button>
            </>
          )}
        </div>
      </Sheet>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <div className="cat" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', margin: '0 auto 12px' }}>
            <Icon name="Trash2" size={22} />
          </div>
          <h2 className="h3" style={{ marginBottom: 4 }}>{t('categories.delete')}</h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>{t('categories.deleteHint')}</p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={remove} disabled={busy}>{t('common.delete')}</Button>
            <Button variant="secondary" full onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
