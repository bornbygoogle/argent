import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Progress } from '@/components/ui/Progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAccountScope } from '@/store/AccountScopeContext';
import { useScopedTransactions, useCategoryMap, useBudget } from '@/hooks/selectors';
import { byCategory } from '@/lib/calc';
import {
  dailyExpenses,
  dayLevelBudget,
  dayLevelRelative,
  type HeatLevel,
} from '@/lib/stats';
import { categoryLabel } from '@/lib/labels';
import {
  currentMonth,
  prevMonth,
  nextMonth,
  monthOf,
  daysInMonth,
  elapsedDaysInMonth,
  mondayIndex,
} from '@/lib/date';
import { formatCurrency, formatMonth } from '@/lib/format';

const WEEK_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const R = 46;
const C = 2 * Math.PI * R; // ≈ 289

export function MonthlyOverview() {
  const { t } = useTranslation();
  const { scope, setScope, accounts } = useAccountScope();
  const categoryMap = useCategoryMap();
  const scoped = useScopedTransactions(scope);
  const [month, setMonth] = useState<string>(currentMonth());

  const scopeAccount = scope === 'all' ? accounts[0] : accounts.find((a) => a.id === scope);
  const budget = useBudget(scopeAccount?.id);
  const monthlyBudget = budget?.monthlyBudget ?? 0;

  const expenses = useMemo(() => scoped.filter((tx) => tx.kind === 'expense' && monthOf(tx.date) === month), [scoped, month]);
  const prevExpenses = useMemo(() => scoped.filter((tx) => tx.kind === 'expense' && monthOf(tx.date) === prevMonth(month)), [scoped, month]);

  const curTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const prevTotal = prevExpenses.reduce((a, e) => a + e.amount, 0);

  // Rollover carried from the previous month (if any closure recorded).
  const rollover = useLiveQuery(
    async () => {
      const rows = await db.monthClosures.where('month').equals(prevMonth(month)).toArray();
      return rows.reduce((acc, r) => acc + (r.rolloverAmount || 0), 0);
    },
    [month],
  ) ?? 0;

  // ---- Heatmap ----
  const dailyMap = useMemo(() => dailyExpenses(scoped, month), [scoped, month]);
  const maxDaily = useMemo(() => Math.max(0, ...dailyMap.values()), [dailyMap]);
  const isCurrent = month === currentMonth();
  const today = isCurrent ? new Date().getDate() : 0;
  const dim = daysInMonth(month);
  const [yNum, mNum] = month.split('-').map(Number);
  const firstWeekday = mondayIndex(new Date(yNum, mNum - 1, 1));
  const dailyBudget = monthlyBudget > 0 ? monthlyBudget / dim : 0;

  const cells: { kind: 'blank' | 'day' | 'trail'; day?: number; level?: HeatLevel | 'future' }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ kind: 'blank' });
  for (let d = 1; d <= dim; d++) {
    const spend = dailyMap.get(d) ?? 0;
    let level: HeatLevel | 'future';
    if (isCurrent && d > today) level = 'future';
    else if (spend <= 0) level = 'empty';
    else if (dailyBudget > 0) level = dayLevelBudget(spend, dailyBudget);
    else level = dayLevelRelative(spend, maxDaily);
    cells.push({ kind: 'day', day: d, level });
  }
  // trailing next-month days to complete the last row
  let trail = 1;
  while (cells.length % 7 !== 0) cells.push({ kind: 'trail', day: trail++ });

  // ---- Budget / avg cards ----
  const elapsed = elapsedDaysInMonth(month) || 1;
  const avg = curTotal / elapsed;
  const prevAvg = prevTotal / daysInMonth(prevMonth(month));
  const avgDelta = prevAvg > 0 ? Math.round(((prevAvg - avg) / prevAvg) * 100) : 0;

  // ---- Donut ----
  const cats = byCategory(expenses).slice(0, 5);
  let acc = 0;
  const arcs = cats.map((c) => {
    const dash = c.share * C;
    const offset = -acc;
    acc += dash;
    const cat = categoryMap.get(c.categoryId);
    return { color: cat?.color ?? '#64748B', dash, offset, label: cat ? categoryLabel(t, cat) : t('common.other'), share: c.share };
  });

  const scopeOptions = [
    { value: 'all', label: t('scope.allShort') },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <>
      <TopBar
        left={
          <button type="button" className="icon-btn" onClick={() => setMonth(prevMonth(month))} aria-label={t('common.back')}>
            <Icon name="ChevronLeft" size={22} />
          </button>
        }
        title={<span className="tb-title text-center" style={{ textTransform: 'capitalize' }}>{formatMonth(month)}</span>}
        right={
          <button type="button" className="icon-btn" onClick={() => setMonth(nextMonth(month))} aria-label={t('common.continue')}>
            <Icon name="ChevronRight" size={22} />
          </button>
        }
      />

      <div className="content" style={{ paddingBottom: 96, gap: 14 }}>
        {/* scope */}
        <Segmented value={scope} options={scopeOptions} onChange={(v) => setScope(v)} />

        {/* heatmap */}
        <div className="card">
          <div className="section-head" style={{ marginBottom: 12 }}>
            <span className="label">{t('overview.intensity')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, textAlign: 'center' }}>
            {WEEK_LABELS.map((w, i) => (
              <span key={i} className="caption" style={{ color: 'var(--neutral-400)' }}>{w}</span>
            ))}
            {cells.map((cell, i) => {
              if (cell.kind === 'blank') return <span key={i} />;
              if (cell.kind === 'trail') return <span key={i} className="cal dim">{cell.day}</span>;
              const isTodayCell = isCurrent && cell.day === today;
              return (
                <span key={i} className={`cal ${cell.level}${isTodayCell ? ' today' : ''}`}>{cell.day}</span>
              );
            })}
          </div>
          {/* legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Legend color="var(--neutral-100)" label="0" />
            <Legend color="var(--primary-50)" label={t('overview.low')} />
            <Legend color="var(--primary-200)" label={t('overview.mod')} />
            <Legend color="var(--primary-500)" label={t('overview.high')} />
            <Legend color="var(--danger-500)" label={t('overview.over')} />
          </div>
        </div>

        {/* budget + avg */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card">
            <span className="label">{t('overview.monthTotal')}</span>
            <div className="amount-lg" style={{ marginTop: 4 }}>{formatCurrency(curTotal)}</div>
            {monthlyBudget > 0 && (
              <>
                <Progress value={curTotal / monthlyBudget} color={curTotal > monthlyBudget ? 'var(--danger-500)' : 'var(--success-500)'} className="mt-2" />
                <span className="caption" style={{ marginTop: 6, display: 'block' }}>
                  {t('overview.of')} {formatCurrency(monthlyBudget)}
                </span>
              </>
            )}
            {rollover > 0 && (
              <span
                className="stat-pill"
                style={{ background: 'var(--success-50)', color: 'var(--success-600)', marginTop: 8, display: 'inline-flex' }}
              >
                <Icon name="ArrowRight" size={12} strokeWidth={2.5} />
                +{formatCurrency(rollover)} {t('overview.carried', { m: formatMonth(prevMonth(month)) })}
              </span>
            )}
          </div>
          <div className="card">
            <span className="label">{t('overview.dailyAvg')}</span>
            <div className="amount-lg" style={{ marginTop: 4 }}>{formatCurrency(avg)}</div>
            {prevAvg > 0 && (
              <span className="caption" style={{ marginTop: 8, display: 'block', color: avgDelta >= 0 ? 'var(--success-600)' : 'var(--danger-600)', fontWeight: 600 }}>
                {avgDelta >= 0 ? '▼' : '▲'} {Math.abs(avgDelta)}% vs {formatMonth(prevMonth(month))}
              </span>
            )}
          </div>
        </div>

        {/* donut */}
        {cats.length > 0 ? (
          <div className="card">
            <div className="section-head" style={{ marginBottom: 8 }}>
              <span className="label">{t('overview.topCategories')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <svg width={120} height={120} viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
                <g transform="rotate(-90 60 60)">
                  {arcs.map((a, i) => (
                    <circle
                      key={i}
                      cx={60}
                      cy={60}
                      r={R}
                      fill="none"
                      stroke={a.color}
                      strokeWidth={16}
                      strokeDasharray={`${a.dash} ${C}`}
                      strokeDashoffset={a.offset}
                    />
                  ))}
                </g>
                <text x={60} y={58} textAnchor="middle" fontSize={15} fontWeight={700} fill="#0F172A">
                  {Math.round(curTotal).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}€
                </text>
                <text x={60} y={74} textAnchor="middle" fontSize={9} fill="#94A3B8">
                  {formatMonth(month).slice(0, 4).toLowerCase()}
                </text>
              </svg>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {arcs.map((a, i) => (
                  <div className="row-between" key={i}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i style={{ width: 10, height: 10, borderRadius: 3, background: a.color, display: 'inline-block' }} />
                      <span className="body-sm" style={{ color: 'var(--neutral-700)' }}>{a.label}</span>
                    </span>
                    <span className="amount-md" style={{ fontSize: 14 }}>{Math.round(a.share * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="card">
            <EmptyState icon="Calendar" title={t('overview.noExpenses')} />
          </div>
        )}
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="caption" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <i style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}
