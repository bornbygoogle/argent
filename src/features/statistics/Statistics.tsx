import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAccountScope } from '@/store/AccountScopeContext';
import { useScopedTransactions, useCategoryMap } from '@/hooks/selectors';
import { byCategory } from '@/lib/calc';
import { topMerchants } from '@/lib/stats';
import { categoryLabel } from '@/lib/labels';
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
  const categoryMap = useCategoryMap();
  const scoped = useScopedTransactions(scope);
  const [period, setPeriod] = useState<Period>('month');

  const expenses = useMemo(() => scoped.filter((tx) => tx.kind === 'expense'), [scoped]);

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

  const cats = byCategory(view.inCur).slice(0, 5);
  const maxCat = cats[0]?.total ?? 0;
  const merchants = topMerchants(view.inCur, 3);
  const maxBucket = Math.max(1, ...view.buckets.map((b) => b.total));

  const handleExport = async () => {
    downloadBackup(await exportBackup());
  };

  return (
    <>
      <TopBar
        left={<span className="tb-title">{t('screens.statistics')}</span>}
        right={
          <button type="button" className="icon-btn" onClick={handleExport} aria-label={t('settings.export')}>
            <Icon name="Download" size={22} />
          </button>
        }
      />

      <div className="content" style={{ paddingBottom: 96, gap: 14 }}>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: t('stats.month') },
            { value: 'week', label: t('stats.week') },
            { value: 'year', label: t('stats.year') },
          ]}
        />

        {expenses.length === 0 ? (
          <EmptyState icon="ChartColumnIncreasing" title={t('stats.empty')} hint={t('stats.emptyHint')} />
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

            {/* top categories */}
            {cats.length > 0 && (
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
                          <div style={{ width: `${Math.round((c.total / maxCat) * 100)}%`, height: '100%', background: cat?.color ?? '#64748B' }} />
                        </div>
                        <span className="amount-md" style={{ fontSize: 13, width: 64, textAlign: 'right' }}>{formatCurrency(c.total)}</span>
                      </div>
                    );
                  })}
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
      </div>
    </>
  );
}
