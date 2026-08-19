import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Select, type SelectOption } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAccountScope } from '@/store/AccountScopeContext';
import {
  useScopedTransactions,
  useCategories,
  useCategoryMap,
  useSubcategoriesByCategory,
  useSubcategoryMap,
} from '@/hooks/selectors';
import { byCategory } from '@/lib/calc';
import { bySubcategory, filterByCategory, topMerchants, UNSPECIFIED_SUB } from '@/lib/stats';
import { categoryLabel, subcategoryLabel } from '@/lib/labels';
import {
  currentMonth,
  prevMonth,
  monthOf,
  daysInMonth,
  todayISO,
} from '@/lib/date';
import { formatCurrency, formatMonth } from '@/lib/format';
import { exportBackup, downloadBackup } from '@/lib/data';

type Period = 'month' | 'week' | 'year';
const DAY_MS = 86_400_000;
const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() - n * DAY_MS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function Statistics() {
  const { t } = useTranslation();
  const { scope } = useAccountScope();
  const categories = useCategories();
  const categoryMap = useCategoryMap();
  const subsByCategory = useSubcategoriesByCategory();
  const subcategoryMap = useSubcategoryMap();
  const scoped = useScopedTransactions(scope);
  const [period, setPeriod] = useState<Period>('month');
  // '' = no narrowing. A sub-category only ever qualifies its own parent, so
  // changing the category always clears it.
  const [catId, setCatId] = useState('');
  const [subId, setSubId] = useState('');
  const [allCats, setAllCats] = useState(false);

  const allExpenses = useMemo(() => scoped.filter((tx) => tx.kind === 'expense'), [scoped]);
  const expenses = useMemo(
    () => filterByCategory(allExpenses, catId || undefined, subId || undefined),
    [allExpenses, catId, subId],
  );

  const catOptions: SelectOption[] = [
    { id: '', label: t('stats.allCategories'), icon: 'LayoutGrid' },
    ...categories.map((c) => ({ id: c.id, label: categoryLabel(t, c), icon: c.icon, color: c.color })),
  ];
  const selectedCat = catId ? categoryMap.get(catId) : undefined;
  const ownSubs = catId ? (subsByCategory.get(catId) ?? []) : [];
  const subOptions: SelectOption[] = [
    { id: '', label: t('stats.allSubcategories'), icon: 'LayoutGrid', color: selectedCat?.color },
    ...ownSubs.map((s) => ({
      id: s.id,
      label: subcategoryLabel(s),
      icon: selectedCat?.icon,
      color: selectedCat?.color,
    })),
    { id: UNSPECIFIED_SUB, label: t('stats.noSubcategory'), icon: 'CircleDashed' },
  ];

  const pickCategory = (id: string) => {
    setCatId(id);
    setSubId('');
  };

  // Current + previous period sets + bar buckets.
  const view = useMemo(() => {
    const cur = currentMonth();
    const year = Number(cur.slice(0, 4));

    if (period === 'month') {
      const inCur = expenses.filter((e) => monthOf(e.date) === cur);
      const inPrev = expenses.filter((e) => monthOf(e.date) === prevMonth(cur));
      const dim = daysInMonth(cur);
      const buckets = Array.from({ length: dim }, (_, i) => {
        const day = i + 1;
        const total = inCur
          .filter((e) => Number(e.date.slice(8, 10)) === day)
          .reduce((a, e) => a + e.amount, 0);
        return { key: String(day), total };
      });
      return { inCur, inPrev, buckets, prevLabel: formatMonth(prevMonth(cur)) };
    }
    if (period === 'year') {
      const yr = String(year);
      const inCur = expenses.filter((e) => e.date.slice(0, 4) === yr);
      const inPrev = expenses.filter((e) => e.date.slice(0, 4) === String(year - 1));
      const buckets = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, '0');
        const total = inCur.filter((e) => e.date.slice(5, 7) === m).reduce((a, e) => a + e.amount, 0);
        return { key: t(`stats.monthShort.${i + 1}`), total };
      });
      return { inCur, inPrev, buckets, prevLabel: String(year - 1) };
    }
    // week: last 7 days vs the 7 before
    const todayN = new Date();
    todayN.setHours(0, 0, 0, 0);
    const inCur = expenses.filter((e) => e.date >= isoDaysAgo(6) && e.date <= todayISO());
    const inPrev = expenses.filter((e) => e.date >= isoDaysAgo(13) && e.date < isoDaysAgo(6));
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const iso = isoDaysAgo(6 - i);
      const total = inCur.filter((e) => e.date === iso).reduce((a, e) => a + e.amount, 0);
      const wd = new Date(iso);
      return { key: t(`stats.weekShort.${(wd.getDay() + 6) % 7}`), total };
    });
    return { inCur, inPrev, buckets, prevLabel: t('stats.lastWeek') };
  }, [expenses, period, t]);

  const curTotal = view.inCur.reduce((a, e) => a + e.amount, 0);
  const prevTotal = view.inPrev.reduce((a, e) => a + e.amount, 0);
  const savings = prevTotal - curTotal;
  const pct = prevTotal > 0 ? Math.abs(savings) / prevTotal : 0;
  const good = savings >= 0;

  const allSlices = byCategory(view.inCur);
  const cats = allCats ? allSlices : allSlices.slice(0, 5);
  const maxCat = allSlices[0]?.total ?? 0;
  // Only inside a category, and only while it is still a breakdown: once a
  // single sub-category is picked the card would just restate the headline.
  const catSlices = catId && !subId ? bySubcategory(view.inCur, catId) : [];
  // A lone unspecified bucket is the category restated, not a breakdown.
  const subSlices = catSlices.some((s) => s.subcategoryId) ? catSlices : [];
  const maxSub = subSlices[0]?.total ?? 0;
  const merchants = topMerchants(view.inCur, 3);
  const maxBucket = Math.max(1, ...view.buckets.map((b) => b.total));

  const handleExport = async () => {
    downloadBackup(await exportBackup());
  };

  return (
    <>
      <TopBar
        left={<h1 className="tb-title">{t('screens.statistics')}</h1>}
        right={
          <button type="button" className="icon-btn" onClick={handleExport} aria-label={t('settings.export')}>
            <Icon name="Download" size={22} />
          </button>
        }
      />

      <main className="content" style={{ paddingBottom: 96, gap: 14 }}>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: t('stats.month') },
            { value: 'week', label: t('stats.week') },
            { value: 'year', label: t('stats.year') },
          ]}
        />

        {allExpenses.length > 0 && (
          <>
            <Select
              value={catId}
              options={catOptions}
              onChange={pickCategory}
              label={t('stats.category')}
              emptyIcon="LayoutGrid"
            />
            {catId && ownSubs.length > 0 && (
              <Select
                value={subId}
                options={subOptions}
                onChange={setSubId}
                label={t('stats.subcategory')}
                emptyIcon="LayoutGrid"
              />
            )}
          </>
        )}

        {allExpenses.length === 0 ? (
          <EmptyState icon="ChartColumnIncreasing" title={t('stats.empty')} hint={t('stats.emptyHint')} />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="ChartColumnIncreasing"
            title={t('stats.emptyFilter')}
            hint={t('stats.emptyFilterHint')}
          />
        ) : (
          <>
            {/* trend */}
            <div className="card">
              <div className="row-between">
                <div>
                  <span className="label">{t('stats.trend')}</span>
                  <div className="amount-lg" style={{ marginTop: 2 }}>{formatCurrency(curTotal)}</div>
                </div>
                {prevTotal > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: good ? 'var(--success-50)' : 'var(--danger-50)',
                      color: good ? 'var(--success-600)' : 'var(--danger-600)',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    <Icon name={curTotal > prevTotal ? 'ArrowUpRight' : 'ArrowDownRight'} size={14} strokeWidth={2.5} />
                    {Math.round(pct * 100)}%
                  </span>
                )}
              </div>

              {/* bar chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, marginTop: 12 }}>
                {view.buckets.map((b, i) => {
                  const h = Math.round((b.total / maxBucket) * 70) + (b.total > 0 ? 4 : 0);
                  const isLast = i === view.buckets.length - 1;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                      <div
                        style={{
                          width: '100%',
                          height: Math.max(2, h),
                          borderRadius: 3,
                          background: isLast && b.total > 0 ? 'var(--primary-600)' : 'var(--primary-200)',
                          opacity: b.total > 0 ? 1 : 0.4,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {prevTotal > 0 && (
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="caption">vs {formatCurrency(prevTotal)} {t('stats.in')} {view.prevLabel}</span>
                  <span className="caption" style={{ color: good ? 'var(--success-600)' : 'var(--danger-600)', fontWeight: 600 }}>
                    {formatCurrency(Math.abs(savings))} {good ? t('stats.saved') : t('stats.more')}
                  </span>
                </div>
              )}
            </div>

            {/* insight */}
            <div className="card" style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-100)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="Lightbulb" size={20} color="var(--primary-600)" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <span className="body" style={{ color: 'var(--primary-700)', fontWeight: 600 }}>
                    {good ? t('stats.insightGoodTitle') : t('stats.insightBadTitle')}
                  </span>
                  <p className="body-sm" style={{ color: 'var(--primary-700)', marginTop: 2 }}>
                    {good
                      ? t('stats.insightGoodBody', { pct: Math.round(pct * 100) })
                      : t('stats.insightBadBody', { pct: Math.round(pct * 100) })}
                  </p>
                </div>
              </div>
            </div>

            {/* breakdown of the selected category, in place of the category list */}
            {subSlices.length > 0 && (
              <div>
                <div className="section-head" style={{ marginBottom: 8 }}>
                  <span className="label">{t('stats.topSubcategories')}</span>
                </div>
                <div className="card tight">
                  {subSlices.map((s) => {
                    const sub = s.subcategoryId ? subcategoryMap.get(s.subcategoryId) : undefined;
                    return (
                      <div className="row" style={{ alignItems: 'center' }} key={s.subcategoryId ?? UNSPECIFIED_SUB}>
                        <span className="r-title" style={{ flex: 1, fontSize: 14 }}>
                          {sub ? subcategoryLabel(sub) : t('stats.noSubcategory')}
                        </span>
                        <div style={{ flex: 1.4, height: 8, background: 'var(--neutral-100)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((s.total / maxSub) * 100)}%`, height: '100%', background: selectedCat?.color ?? 'var(--accent-ink)' }} />
                        </div>
                        <span className="amount-md" style={{ fontSize: 13, width: 64, textAlign: 'right' }}>{formatCurrency(s.total)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* top categories */}
            {!catId && cats.length > 0 && (
              <div>
                <div className="section-head" style={{ marginBottom: 8 }}>
                  <span className="label">{t('stats.topCategories')}</span>
                </div>
                <div className="card tight">
                  {cats.map((c) => {
                    const cat = categoryMap.get(c.categoryId);
                    return (
                      <div className="row" style={{ alignItems: 'center' }} key={c.categoryId}>
                        <span className="r-title" style={{ flex: 1, fontSize: 14 }}>
                          {cat ? categoryLabel(t, cat) : t('common.other')}
                        </span>
                        <div style={{ flex: 1.4, height: 8, background: 'var(--neutral-100)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((c.total / maxCat) * 100)}%`, height: '100%', background: cat?.color ?? 'var(--accent-ink)' }} />
                        </div>
                        <span className="amount-md" style={{ fontSize: 13, width: 64, textAlign: 'right' }}>{formatCurrency(c.total)}</span>
                      </div>
                    );
                  })}
                  {allSlices.length > 5 && (
                    <button
                      type="button"
                      className="row"
                      onClick={() => setAllCats((v) => !v)}
                      style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 4px' }}
                    >
                      <span className="r-title" style={{ flex: 1, fontSize: 13, color: 'var(--primary-600)', fontWeight: 600, textAlign: 'left' }}>
                        {allCats ? t('stats.showLess') : t('stats.showAll', { count: allSlices.length })}
                      </span>
                      <Icon name={allCats ? 'ChevronUp' : 'ChevronDown'} size={16} color="var(--primary-600)" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* top merchants */}
            {merchants.length > 0 && (
              <div>
                <div className="section-head" style={{ marginBottom: 8 }}>
                  <span className="label">{t('stats.topMerchants')}</span>
                </div>
                <div className="card tight">
                  {merchants.map((m, i) => (
                    <div className="row" key={m.name}>
                      <span className="cat sm" style={{ background: 'var(--neutral-100)', color: 'var(--neutral-700)', fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                      <div className="r-main">
                        <div className="r-title" style={{ fontSize: 14 }}>{m.name}</div>
                        <div className="r-sub">{t('stats.visits', { count: m.count })}</div>
                      </div>
                      <span className="amount-md" style={{ fontSize: 14 }}>−{formatCurrency(m.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
