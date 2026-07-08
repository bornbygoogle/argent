import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { RecurringFormSheet } from './RecurringFormSheet';
import {
  useRecurrings,
  useAccounts,
  useAccountMap,
} from '@/hooks/selectors';
import {
  isConfirmedIn,
  confirmRecurring,
  unconfirmRecurring,
} from '@/lib/recurring';
import { currentMonth } from '@/lib/date';
import { formatCurrency, formatSignedCurrency, formatMonth } from '@/lib/format';
import { useToast } from '@/store/ToastContext';
import type { Account, Cadence, Recurring as RecurringT } from '@/types/models';

type Mode = 'todo' | 'all' | 'history';

const cadenceLabel = (t: (k: string) => string, c: Cadence): string => t(`recurring.cadence.${c}`);

export function Recurring() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const recurrings = useRecurrings();
  const accounts = useAccounts();
  const accountMap = useAccountMap();
  const month = currentMonth();
  const [mode, setMode] = useState<Mode>('todo');
  const [editing, setEditing] = useState<'new' | RecurringT | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ r: RecurringT; on: boolean } | null>(null);

  const order = useMemo(() => {
    const idx = new Map(accounts.map((a, i) => [a.id, i]));
    return (a: Account, b: Account) => (idx.get(a.id) ?? 99) - (idx.get(b.id) ?? 99);
  }, [accounts]);

  // Summary — always over the full set.
  const todo = recurrings.filter((r) => !isConfirmedIn(r, month));
  const done = recurrings.filter((r) => isConfirmedIn(r, month));
  const todoAmount = todo.reduce((acc, r) => acc + r.amount, 0);
  const doneAmount = done.reduce((acc, r) => acc + r.amount, 0);

  // Group a list by account, ordered like the account list.
  const group = (list: RecurringT[]) => {
    const m = new Map<string, RecurringT[]>();
    for (const r of list) {
      const arr = m.get(r.accountId) ?? [];
      arr.push(r);
      m.set(r.accountId, arr);
    }
    return [...m.entries()]
      .map(([aid, items]) => ({ account: accountMap.get(aid), items }))
      .filter((g): g is { account: Account; items: RecurringT[] } => !!g.account)
      .sort((a, b) => order(a.account, b.account));
  };

  const visible = mode === 'todo' ? todo : mode === 'all' ? recurrings : [];
  const groups = group(visible);

  // History: flatten confirmed entries across all recurrings, newest month first.
  const history = useMemo(() => {
    const rows: { month: string; label: string; amount: number; direction: 'expense' | 'income'; color: string; icon: string }[] = [];
    for (const r of recurrings) {
      for (const h of r.history) {
        if (!h.transactionId) continue;
        rows.push({ month: h.month, label: r.label, amount: h.amount, direction: r.direction, color: r.color, icon: r.icon });
      }
    }
    return rows.sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [recurrings]);

  const toggle = async (r: RecurringT) => {
    setPending(r.id);
    try {
      if (isConfirmedIn(r, month)) await unconfirmRecurring(r, month);
      else await confirmRecurring(r, month);
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <TopBar
        left={
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <Icon name="ChevronLeft" size={22} />
          </button>
        }
        title={t('screens.recurring')}
        right={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')}>
            + {t('recurring.new')}
          </button>
        }
      />

      <div className="content" style={{ paddingBottom: 24, gap: 14 }}>
        {/* summary */}
        <div className="card tight row-between">
          <div>
            <span className="caption">{t('recurring.toConfirmMonth')}</span>
            <div className="amount-md" style={{ color: 'var(--warning-600)' }}>
              {todo.length} · {formatCurrency(todoAmount)}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--neutral-100)' }} />
          <div style={{ textAlign: 'right' }}>
            <span className="caption">{t('recurring.confirmedMonth')}</span>
            <div className="amount-md" style={{ color: 'var(--success-600)' }}>
              {done.length} · {formatCurrency(doneAmount)}
            </div>
          </div>
        </div>

        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'todo', label: t('recurring.toConfirm') },
            { value: 'all', label: t('recurring.all') },
            { value: 'history', label: t('recurring.history') },
          ]}
        />

        {mode !== 'history' ? (
          groups.length === 0 ? (
            <EmptyState icon="Repeat" title={t('recurring.empty')} hint={t('recurring.emptyHint')} />
          ) : (
            groups.map((g) => (
              <div key={g.account.id}>
                <div className="section-head">
                  <span className="label">{g.account.name}</span>
                </div>
                <div className="card tight">
                  {g.items.map((r) => {
                    const confirmed = isConfirmedIn(r, month);
                    const last = [...r.history].sort((a, b) => (a.month < b.month ? 1 : -1))[0];
                    const modified = last != null && Math.abs(last.amount - r.amount) > 0.005;
                    return (
                      <div className="recur" key={r.id}>
                        <TintedIcon hex={r.color} icon={r.icon} variant="cat" />
                        <div className="r-main" onClick={() => setEditing(r)} style={{ cursor: 'pointer', minWidth: 0 }}>
                          <div className="r-title">{r.label}</div>
                          <div className="r-sub">
                            {cadenceLabel(t, r.cadence)} · {formatCurrency(r.amount)}
                            {modified && (
                              <>
                                {' → '}
                                <span style={{ color: 'var(--primary-600)', fontWeight: 600 }}>{t('recurring.modified')}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span
                          className={`amount-md ${r.direction === 'income' ? 'amt-in' : 'amt-out'}`}
                          style={{ color: r.direction === 'income' ? 'var(--success-600)' : undefined }}
                        >
                          {formatSignedCurrency(r.direction === 'income' ? r.amount : -r.amount)}
                        </span>
                        <button
                          type="button"
                          className={`confirm-btn${confirmed ? ' done' : ''}`}
                          onClick={() => setPendingConfirm({ r, on: !isConfirmedIn(r, month) })}
                          disabled={pending === r.id}
                        >
                          <Icon name="Check" size={14} strokeWidth={2.5} />
                          {confirmed ? t('recurring.confirmedBtn') : t('recurring.confirmBtn')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )
        ) : history.length === 0 ? (
          <EmptyState icon="Repeat" title={t('recurring.historyEmpty')} />
        ) : (
          <div className="card tight">
            {history.map((h, i) => (
              <div className="row" key={`${h.label}-${h.month}-${i}`}>
                <TintedIcon hex={h.color} icon={h.icon} variant="cat-sm" />
                <div className="r-main">
                  <div className="r-title" style={{ fontSize: 14 }}>{h.label}</div>
                  <div className="r-sub">{formatMonth(h.month)}</div>
                </div>
                <span className="amount-md" style={{ fontSize: 14, color: h.direction === 'income' ? 'var(--success-600)' : undefined }}>
                  {formatSignedCurrency(h.direction === 'income' ? h.amount : -h.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        <span className="caption" style={{ textAlign: 'center', display: 'block' }}>
          {t('recurring.modifiedHint')}
        </span>
      </div>

      {editing !== null && (
        <RecurringFormSheet target={editing} onClose={() => setEditing(null)} />
      )}

      <Sheet open={!!pendingConfirm} onClose={() => setPendingConfirm(null)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <h2 className="h3" style={{ marginBottom: 4 }}>
            {pendingConfirm?.on
              ? t('recurring.confirmTitle')
              : t('recurring.unconfirmTitle')}
          </h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>
            {pendingConfirm?.on
              ? t('recurring.confirmBody', {
                  amount: formatSignedCurrency(
                    pendingConfirm.r.direction === 'income'
                      ? pendingConfirm.r.amount
                      : -pendingConfirm.r.amount,
                  ),
                  account: accountMap.get(pendingConfirm.r.accountId)?.name ?? '',
                })
              : t('recurring.unconfirmBody')}
          </p>
          <div className="col gap-2">
            <Button
              full
              onClick={async () => {
                if (!pendingConfirm) return;
                const { r, on } = pendingConfirm;
                setPendingConfirm(null);
                await toggle(r);
                toast.success(on ? t('recurring.confirmedToast') : t('recurring.unconfirmedToast'));
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button variant="secondary" full onClick={() => setPendingConfirm(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
