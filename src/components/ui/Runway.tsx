import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import type { Runway as RunwayData } from '@/lib/runway';

/**
 * The runway bar. One hairline track carrying two facts at once:
 *  - the fill  = how much of the budget is spent
 *  - the notch = how far through the month you are
 * Fill past the notch means you are spending faster than the month is passing.
 * That comparison is the whole point; either number alone is close to useless.
 */
export function Runway({ data }: { data: RunwayData }) {
  const { t } = useTranslation();
  if (data.budget <= 0) return null;

  const fillPct = Math.round(data.spentRatio * 100);
  const notchPct = Math.round(data.monthRatio * 100);

  const status = data.over
    ? t('dashboard.overBy', { amount: formatCurrency(Math.abs(data.remaining)) })
    : data.aheadOfPace
      ? t('dashboard.aheadOfPace')
      : t('dashboard.perDay', { amount: formatCurrency(data.perDay) });

  return (
    <div className="runway">
      <div
        className="runway-track"
        role="img"
        aria-label={t('dashboard.runwayAria', { spent: fillPct, month: notchPct })}
      >
        <span
          className={['runway-fill', data.over ? 'is-over' : ''].join(' ').trim()}
          style={{ width: `${fillPct}%` }}
        />
        <span className="runway-notch" style={{ left: `${notchPct}%` }} />
      </div>
      <div className="runway-legend">
        <span>{status}</span>
        <span>{t('dashboard.daysLeft', { count: data.daysLeft })}</span>
      </div>
    </div>
  );
}
