import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { useIncomeTypes, useAllTransactions } from '@/hooks/selectors';
import { incomeTypeLabel } from '@/lib/labels';
import { createIncomeType, updateIncomeType, deleteIncomeType } from '@/lib/incomeTypes';
import type { IncomeType } from '@/types/models';

/** Icon choices offered when creating/editing an income type. */
const ICON_CHOICES = [
  'Coins', 'Banknote', 'Wallet', 'PiggyBank', 'CircleDollarSign', 'Euro',
  'Briefcase', 'Gift', 'TrendingUp', 'Landmark', 'Receipt', 'Smartphone',
];
const COLOR_CHOICES = [
  '#10B981', '#22C55E', '#0EA5E9', '#4F46E5', '#8B5CF6', '#EC4899',
  '#F59E0B', '#F97316', '#EF4444', '#14B8A6',
];
/** Default visual when a record has no icon/color (e.g. seeded defaults). */
const DEFAULT_ICON = 'Coins';
const DEFAULT_COLOR = '#10B981';

type EditTarget = 'new' | IncomeType;

export function IncomeTypes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const incomeTypes = useIncomeTypes();
  const allTx = useAllTransactions();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  // key → income-transaction count
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of allTx) {
      if (tx.kind === 'income' && tx.incomeType) m.set(tx.incomeType, (m.get(tx.incomeType) ?? 0) + 1);
    }
    return m;
  }, [allTx]);

  const totalIncome = useMemo(() => allTx.filter((tx) => tx.kind === 'income').length, [allTx]);

  const subFor = (it: IncomeType): string => {
    const n = counts.get(it.key) ?? 0;
    return `${n} ${t('incomeTypes.transactions')}`;
  };

  return (
    <>
      <TopBar
        left={
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <Icon name="ChevronLeft" size={22} />
          </button>
        }
        title={t('screens.incomeTypes')}
        right={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')}>
            + {t('incomeTypes.new')}
          </button>
        }
      />

      <div className="content" style={{ paddingBottom: 24, gap: 16 }}>
        {/* summary */}
        <div className="card tight row-between">
          <div>
            <span className="h3" style={{ fontSize: 18 }}>{incomeTypes.length}</span>{' '}
            <span className="body-sm">{t('incomeTypes.titlePlural')}</span>
          </div>
          <div>
            <span className="h3" style={{ fontSize: 18 }}>{totalIncome}</span>{' '}
            <span className="body-sm">{t('incomeTypes.transactions')}</span>
          </div>
        </div>

        {incomeTypes.length === 0 ? (
          <EmptyState icon="Coins" title={t('incomeTypes.empty')} hint={t('incomeTypes.emptyHint')} />
        ) : (
          <div className="card tight">
            {incomeTypes.map((it) => (
              <div className="row" key={it.id} onClick={() => setEditing(it)} style={{ cursor: 'pointer' }}>
                <TintedIcon hex={it.color ?? DEFAULT_COLOR} icon={it.icon ?? DEFAULT_ICON} variant="cat" />
                <div className="r-main">
                  <div className="r-title">{incomeTypeLabel(t, it)}</div>
                  <div className="r-sub">{subFor(it)}</div>
                </div>
                <Icon name="ChevronRight" size={16} color="var(--neutral-300)" />
              </div>
            ))}
          </div>
        )}

        <span className="caption" style={{ textAlign: 'center', display: 'block' }}>
          {t('incomeTypes.hint')}
        </span>
      </div>

      {editing !== null && (
        <IncomeTypeFormSheet
          target={editing}
          onClose={() => setEditing(null)}
          onDeleted={() => setEditing(null)}
        />
      )}
    </>
  );
}

function IncomeTypeFormSheet({
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

  const [label, setLabel] = useState(existing?.label ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? DEFAULT_ICON);
  const [color, setColor] = useState(existing?.color ?? DEFAULT_COLOR);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // "Autre" is the fallback sink — editable but not deletable.
  const canDelete = !!existing && existing.key !== 'Autre';

  const save = async () => {
    setBusy(true);
    try {
      if (existing) await updateIncomeType(existing.id, { label, icon, color });
      else await createIncomeType({ label, icon, color });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteIncomeType(existing.id);
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
      <Sheet open onClose={confirmOpen ? () => {} : onClose} title={t(existing ? 'incomeTypes.edit' : 'incomeTypes.add')}>
        <div style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <p className="label" style={{ marginBottom: 6 }}>{t('incomeTypes.name')}</p>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('incomeTypes.namePlaceholder')}
            className="input"
            style={{ width: '100%', marginBottom: 20 }}
          />

          <p className="label" style={{ marginBottom: 8 }}>{t('incomeTypes.icon')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 20 }}>
            {ICON_CHOICES.map((ic) => (
              <button key={ic} type="button" style={iconBtn(icon === ic)} onClick={() => setIcon(ic)} aria-label={ic}>
                <Icon name={ic} size={20} />
              </button>
            ))}
          </div>

          <p className="label" style={{ marginBottom: 8 }}>{t('incomeTypes.color')}</p>
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
                <div className="r-title">{label || t('incomeTypes.namePlaceholder')}</div>
              </div>
            </div>
          </div>

          <Button full onClick={save} disabled={busy || !label.trim()}>
            {t('common.save')}
          </Button>

          {canDelete && (
            <>
              <div className="divider" style={{ margin: '16px 0' }} />
              <Button variant="danger" full onClick={() => setConfirmOpen(true)} disabled={busy}>
                <Icon name="Trash2" size={18} />
                {t('incomeTypes.delete')}
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
          <h2 className="h3" style={{ marginBottom: 4 }}>{t('incomeTypes.delete')}</h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>{t('incomeTypes.deleteHint')}</p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={remove} disabled={busy}>{t('common.delete')}</Button>
            <Button variant="secondary" full onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
