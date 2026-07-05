import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Toggle } from '@/components/ui/Toggle';
import { Sheet } from '@/components/ui/Sheet';
import { AccountChip } from '@/components/ui/AccountChip';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { AccountSwitcher } from '@/features/sheets/AccountSwitcher';
import { useAccountScope } from '@/store/AccountScopeContext';
import { useCategories, useBudget, useMonthExpenses, useAccountMap } from '@/hooks/selectors';
import { categoryLabel } from '@/lib/labels';
import { byCategory } from '@/lib/calc';
import { currentMonth } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { upsertBudget } from '@/lib/budget';
import type { Category, WarningThreshold } from '@/types/models';

const cleanNum = (s: string) => s.replace(/[^0-9.,]/g, '');
const parseNum = (s: string) => Number.parseFloat(s.replace(',', '.')) || 0;

export function Budget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scope, setScope, accounts } = useAccountScope();
  const accountMap = useAccountMap();
  const scopeAccount = scope === 'all' ? accounts[0] : accountMap.get(scope);
  const accountId = scopeAccount?.id;
  const budget = useBudget(accountId);
  const categories = useCategories();
  const monthExpenses = useMonthExpenses(currentMonth(), scope);
  const [scopeOpen, setScopeOpen] = useState(false);

  // Editable state, hydrated once from the loaded budget.
  const [monthlyStr, setMonthlyStr] = useState('0');
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [threshold, setThreshold] = useState(80);
  const [rollover, setRollover] = useState(true);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydrated || !accountId) return;
    const b = budget ?? undefined;
    setMonthlyStr(b ? String(b.monthlyBudget) : '0');
    const lm: Record<string, string> = {};
    for (const c of categories) {
      const found = b?.categoryLimits.find((x) => x.categoryId === c.id);
      lm[c.id] = found?.limit != null ? String(found.limit) : '';
    }
    setLimits(lm);
    setThreshold(b?.warningThreshold.value ?? 80);
    setRollover(b?.rolloverEnabled ?? true);
    setHydrated(true);
  }, [budget, categories, accountId, hydrated]);

  const monthly = parseNum(monthlyStr);
  const allocated = useMemo(
    () => Object.values(limits).reduce((acc, v) => acc + (v ? parseNum(v) : 0), 0),
    [limits],
  );
  const remaining = Math.max(0, monthly - allocated);

  const spentMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of byCategory(monthExpenses)) m.set(s.categoryId, s.total);
    return m;
  }, [monthExpenses]);

  const save = async () => {
    if (!accountId || busy) return;
    setBusy(true);
    try {
      const categoryLimits = categories.map((c) => ({
        categoryId: c.id,
        limit: limits[c.id] ? parseNum(limits[c.id]) : null,
      }));
      const warningThreshold: WarningThreshold = { mode: 'percent', value: threshold };
      await upsertBudget(accountId, {
        monthlyBudget: monthly,
        categoryLimits,
        warningThreshold,
        rolloverEnabled: rollover,
      });
      navigate(-1);
    } finally {
      setBusy(false);
    }
  };

  const scopeLabel = scope === 'all' ? t('scope.all') : scopeAccount?.name ?? t('scope.all');

  return (
    <>
      <TopBar
        left={
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <Icon name="ChevronLeft" size={22} />
          </button>
        }
        title={t('screens.budget')}
        right={
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
            {t('common.save')}
          </button>
        }
      />

      <div className="content" style={{ paddingBottom: 96, gap: 14 }}>
        {/* account scope */}
        <AccountChip
          dot={scope === 'all' ? 'tri' : scopeAccount?.color}
          name={`${t('budget.for')} · ${scopeLabel}`}
          onClick={() => setScopeOpen(true)}
        />

        {/* monthly total */}
        <div className="card text-center">
          <span className="label">{t('budget.monthly')}</span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              gap: 4,
              borderBottom: '2px solid var(--primary-200)',
              padding: '0 16px',
              marginTop: 6,
            }}
          >
            <input
              value={monthlyStr}
              onChange={(e) => setMonthlyStr(cleanNum(e.target.value))}
              inputMode="decimal"
              className="amount tnum"
              style={{
                color: 'var(--primary-600)',
                width: `${Math.max(3, monthlyStr.length)}ch`,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span className="h2 muted">€</span>
          </div>
        </div>

        {/* allocated preview */}
        <div className="card">
          <div className="row-between">
            <span className="body-sm muted">{t('budget.allocated')}</span>
            <span className="amount-md">{formatCurrency(allocated)}</span>
          </div>
          <Progress
            value={monthly > 0 ? allocated / monthly : 0}
            color="var(--primary-500)"
            className="mt-2"
          />
          <div className="row-between" style={{ marginTop: 8 }}>
            <span className="caption">{t('budget.unallocated')}</span>
            <span className="caption" style={{ color: 'var(--success-600)', fontWeight: 600 }}>
              +{formatCurrency(remaining)}
            </span>
          </div>
        </div>

        {/* per-category limits */}
        <div className="section-head">
          <span className="label">{t('budget.categoryLimits')}</span>
        </div>
        <div className="card tight">
          {categories.map((c) => {
            const limit = limits[c.id] ? parseNum(limits[c.id]) : 0;
            const spent = spentMap.get(c.id) ?? 0;
            const ratio = limit > 0 ? spent / limit : 0;
            const color =
              ratio >= 1
                ? 'var(--danger-500)'
                : ratio >= threshold / 100
                  ? 'var(--warning-500)'
                  : 'var(--success-500)';
            return (
              <CategoryLimitRow
                key={c.id}
                category={c}
                limit={limit}
                ratio={ratio}
                color={color}
                onClick={() => setEditingLimit(c.id)}
                label={categoryLabel(t, c)}
              />
            );
          })}
        </div>

        {/* threshold */}
        <div className="card">
          <div className="row-between">
            <span className="h3">{t('budget.alertThreshold')}</span>
            <span className="amount-md" style={{ color: 'var(--primary-600)' }}>{threshold}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: '100%', marginTop: 14, accentColor: 'var(--primary-600)' }}
          />
          <span className="caption" style={{ marginTop: 10, display: 'block' }}>
            {t('budget.alertHint')}
          </span>
        </div>

        {/* rollover */}
        <div className="card tight">
          <div className="row">
            <div className="r-main">
              <div className="r-title">{t('budget.rollover')}</div>
              <div className="r-sub">{t('budget.rolloverHint')}</div>
            </div>
            <Toggle checked={rollover} onChange={setRollover} aria-label={t('budget.rollover')} />
          </div>
        </div>
      </div>

      {/* sticky save */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '12px 16px 28px',
          background: 'linear-gradient(transparent,#fff 30%)',
        }}
      >
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy}>
          {t('budget.save')}
        </button>
      </div>

      <AccountSwitcher open={scopeOpen} onClose={() => setScopeOpen(false)} scope={scope} onPick={setScope} />

      <LimitSheet
        categoryId={editingLimit}
        categories={categories}
        value={editingLimit ? limits[editingLimit] ?? '' : ''}
        onClose={() => setEditingLimit(null)}
        onSave={(id, v) => {
          setLimits((s) => ({ ...s, [id]: v }));
          setEditingLimit(null);
        }}
      />
    </>
  );
}

function CategoryLimitRow({
  category,
  limit,
  ratio,
  color,
  onClick,
  label,
}: {
  category: Category;
  limit: number;
  ratio: number;
  color: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <div className="row" onClick={onClick} style={{ cursor: 'pointer' }}>
      <TintedIcon hex={category.color} icon={category.icon} variant="cat-sm" />
      <div className="r-main">
        <div className="r-title" style={{ fontSize: 14 }}>{label}</div>
        {limit > 0 && <Progress value={ratio} color={color} height={6} className="mt-2" />}
      </div>
      <span className="amount-md" style={{ fontSize: 14 }}>
        {limit > 0 ? formatCurrency(limit) : '—'}
      </span>
    </div>
  );
}

/** Inline editor for one category's monthly limit. */
function LimitSheet({
  categoryId,
  categories,
  value,
  onClose,
  onSave,
}: {
  categoryId: string | null;
  categories: Category[];
  value: string;
  onClose: () => void;
  onSave: (id: string, v: string) => void;
}) {
  const { t } = useTranslation();
  const [str, setStr] = useState(value);
  useEffect(() => setStr(value), [value, categoryId]);
  if (!categoryId) return null;
  const cat = categories.find((c) => c.id === categoryId);

  return (
    <Sheet open onClose={onClose} title={cat ? categoryLabel(t, cat) : t('budget.categoryLimits')}>
      <div style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input
            value={str}
            onChange={(e) => setStr(cleanNum(e.target.value))}
            inputMode="decimal"
            placeholder="0,00"
            className="input tnum"
            style={{ width: '100%', fontSize: 18, paddingRight: 40 }}
          />
          <span
            className="muted"
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 500 }}
          >
            €
          </span>
        </div>
        <div className="col gap-2">
          <Button full onClick={() => onSave(categoryId, str)}>{t('common.save')}</Button>
          <Button variant="ghost" full onClick={() => onSave(categoryId, '')}>{t('budget.removeLimit')}</Button>
        </div>
      </div>
    </Sheet>
  );
}
