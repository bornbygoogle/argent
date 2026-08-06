import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useGoBack } from '@/hooks/useGoBack';
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
  useAllTransactions,
} from '@/hooks/selectors';
import {
  isConfirmedIn,
  confirmRecurring,
  unconfirmRecurring,
} from '@/lib/recurring';
import { dueDateFor, clampedDay, occurrenceOf } from '@/lib/recurringSchedule';
import { currentMonth } from '@/lib/date';
import { monthlyNet, topUpNeeded } from '@/lib/recurringTotals';
import { accountBalance } from '@/lib/calc';
import { formatCurrency, formatSignedCurrency, formatDate } from '@/lib/format';
import { useToast } from '@/store/ToastContext';
import type { Account, Cadence, Recurring as RecurringT } from '@/types/models';

type Mode = 'todo' | 'all' | 'history';

const cadenceLabel = (t: (k: string) => string, c: Cadence): string => t(`recurring.cadence.${c}`);

export function Recurring() {
  const { t } = useTranslation();
  const goBack = useGoBack('/settings');
  const navigate = useNavigate();
  const toast = useToast();
  const recurrings = useRecurrings();
  const accounts = useAccounts();
  const accountMap = useAccountMap();
  const allTx = useAllTransactions();
  const month = currentMonth();
  const [mode, setMode] = useState<Mode>('todo');
  const [editing, setEditing] = useState<'new' | RecurringT | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ r: RecurringT; on: boolean } | null>(null);

  const order = useMemo(() => {
    const idx = new Map(accounts.map((a, i) => [a.id, i]));
    return (a: Account, b: Account) => (idx.get(a.id) ?? 99) - (idx.get(b.id) ?? 99);
  }, [accounts]);

  // Summary — always over the full set. The due day orders the list and dates
  // the transaction; it deliberately does not gate what is shown. A bill due on
  // the 30th is still this month's work on the 28th, and hiding it until its
  // day turns the screen into a count of zero while the month fills up.
  const todo = recurrings.filter((r) => !isConfirmedIn(r, month));
  const done = recurrings.filter((r) => isConfirmedIn(r, month));
  const todoAmount = todo.reduce((acc, r) => acc + r.amount, 0);
  const doneAmount = done.reduce((acc, r) => acc + r.amount, 0);

  const byDueDay = (a: RecurringT, b: RecurringT) =>
    clampedDay(a.dueDay ?? 1, month) - clampedDay(b.dueDay ?? 1, month);

  // The heading figure covers the rows actually listed, so it always adds up to
  // what is underneath it. The top-up figure deliberately does not: funding an
  // account is about its whole commitment, not just this tab's slice.
  // An account's commitments are the ones it pays *and* the ones paid into it:
  // money it is due to receive is money it does not have to find elsewhere.
  const topUpFor = (accountId: string) => {
    const account = accountMap.get(accountId);
    if (!account) return 0;
    const owned = recurrings.filter(
      (r) => r.accountId === accountId || r.receiverAccountId === accountId,
    );
    return topUpNeeded(owned, accountBalance(account, allTx), accountId);
  };

  // Group a list by account, ordered like the account list. A charge naming a
  // receiver belongs to two groups — it leaves one account and lands in the
  // other — so `mirrors` asks for the receiving side to be listed as well.
  const group = (list: RecurringT[], mirrors: boolean) => {
    const m = new Map<string, RecurringT[]>();
    const place = (accountId: string, r: RecurringT) => {
      const arr = m.get(accountId) ?? [];
      arr.push(r);
      m.set(accountId, arr);
    };
    for (const r of list) {
      place(r.accountId, r);
      if (mirrors && r.receiverAccountId) place(r.receiverAccountId, r);
    }
    return [...m.entries()]
      .map(([aid, items]) => ({ account: accountMap.get(aid), items: [...items].sort(byDueDay) }))
      .filter((g): g is { account: Account; items: RecurringT[] } => !!g.account)
      .sort((a, b) => order(a.account, b.account));
  };

  const visible = mode === 'todo' ? todo : mode === 'all' ? recurrings : [];
  // Only the full list mirrors. "To confirm" is a list of work to do, and the
  // receiving side is not work — it settles when the payer's row is logged.
  const groups = group(visible, mode === 'all');

  // History: flatten confirmed entries across all recurrings, newest month first.
  const history = useMemo(() => {
    const rows: { occurrence: string; label: string; amount: number; direction: 'expense' | 'income'; color: string; icon: string }[] = [];
    for (const r of recurrings) {
      for (const h of r.history) {
        if (!h.transactionId) continue;
        // The instalment settled, not the month the button was pressed.
        rows.push({ occurrence: occurrenceOf(h, r), label: r.label, amount: h.amount, direction: r.direction, color: r.color, icon: r.icon });
      }
    }
    return rows.sort((a, b) => (a.occurrence < b.occurrence ? 1 : -1));
  }, [recurrings]);

  // 'full' is not a failure to report as one: the row genuinely reads as unpaid
  // — a due-day edit reopened a month already settled twice — so a press is
  // reasonable. What it must not do is claim a transaction was recorded.
  type Outcome = 'confirmed' | 'unconfirmed' | 'full';

  const toggle = async (r: RecurringT): Promise<Outcome> => {
    setPending(r.id);
    try {
      if (isConfirmedIn(r, month)) {
        await unconfirmRecurring(r, dueDateFor(r, month));
        return 'unconfirmed';
      }
      return (await confirmRecurring(r)) === null ? 'full' : 'confirmed';
    } finally {
      setPending(null);
    }
  };

  // One account's block of rows. A row is shown whenever this month's
  // instalment is unpaid, whatever its day — paying early is normal, and a bill
  // due later this month is still work the screen must admit to.
  const renderGroup = (g: { account: Account; items: RecurringT[] }) => (
    // The gap is the group's own, not the heading's: a 36px control in the
    // heading used to sit flush against the card, since .section-head carries
    // no bottom margin and the list below it starts immediately.
    <div key={g.account.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="section-head">
        <span className="label">{g.account.name}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span
            className="label tnum"
            style={{
              color:
                monthlyNet(g.items, g.account.id) >= 0
                  ? 'var(--success-600)'
                  : 'var(--neutral-500)',
            }}
          >
            {formatSignedCurrency(monthlyNet(g.items, g.account.id))}
          </span>
          {topUpFor(g.account.id) > 0 && (
            // Same shape as the dashboard's "Manage" — a section heading is a
            // quiet label row, and a filled pill in it outshouts the Log
            // buttons on the rows themselves, which are the real actions here.
            <button
              type="button"
              className="body-sm"
              style={{
                color: 'var(--primary-600)',
                fontWeight: 600,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
              onClick={() =>
                navigate(
                  `/transfer?to=${encodeURIComponent(g.account.id)}&amount=${topUpFor(g.account.id)}`,
                )
              }
            >
              {t('recurring.topUp', { amount: formatCurrency(topUpFor(g.account.id)) })}
            </button>
          )}
        </span>
      </div>
      <div className="card tight">
        {g.items.map((r) => {
          const confirmed = isConfirmedIn(r, month);
          const last = [...r.history].sort((a, b) => (a.month < b.month ? 1 : -1))[0];
          const modified = last != null && Math.abs(last.amount - r.amount) > 0.005;
          // The same template read from the receiving end: money arriving, and
          // nothing to press — it is settled from the account that pays it.
          const incoming = r.accountId !== g.account.id;
          const arriving = incoming || r.direction === 'income';
          const counterpart = accountMap.get(
            incoming ? r.accountId : (r.receiverAccountId ?? ''),
          );
          return (
            <div className="recur" key={r.id}>
              <TintedIcon hex={r.color} icon={r.icon} variant="cat" />
              <div className="r-main" onClick={() => setEditing(r)} style={{ cursor: 'pointer', minWidth: 0 }}>
                <div className="r-title">{r.label}</div>
                <div className="r-sub">
                  {cadenceLabel(t, r.cadence)} · {formatCurrency(r.amount)}
                  {counterpart &&
                    ` · ${t(incoming ? 'recurring.incomingFrom' : 'recurring.transferTo', {
                      account: counterpart.name,
                    })}`}
                  {r.dueDay != null &&
                    ` · ${t('recurring.dueOn', { date: formatDate(dueDateFor(r, month), 'weekday') })}`}
                  {modified && (
                    <>
                      {' → '}
                      <span style={{ color: 'var(--primary-600)', fontWeight: 600 }}>{t('recurring.modified')}</span>
                    </>
                  )}
                </div>
              </div>
              <span
                className={`amount-md ${arriving ? 'amt-in' : 'amt-out'}`}
                style={{ color: arriving ? 'var(--success-600)' : undefined }}
              >
                {formatSignedCurrency(arriving ? r.amount : -r.amount)}
              </span>
              {!incoming && (
                <button
                  type="button"
                  className={`confirm-btn${confirmed ? ' done' : ''}`}
                  onClick={() => setPendingConfirm({ r, on: !isConfirmedIn(r, month) })}
                  disabled={pending === r.id}
                >
                  <Icon name="Check" size={14} strokeWidth={2.5} />
                  {confirmed ? t('recurring.confirmedBtn') : t('recurring.confirmBtn')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <TopBar
        left={
          <button type="button" className="icon-btn" onClick={() => goBack()} aria-label={t('common.back')}>
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
            groups.map((g) => renderGroup(g))
          )
        ) : history.length === 0 ? (
          <EmptyState icon="Repeat" title={t('recurring.historyEmpty')} />
        ) : (
          <div className="card tight">
            {history.map((h, i) => (
              <div className="row" key={`${h.label}-${h.occurrence}-${i}`}>
                <TintedIcon hex={h.color} icon={h.icon} variant="cat-sm" />
                <div className="r-main">
                  <div className="r-title" style={{ fontSize: 14 }}>{h.label}</div>
                  <div className="r-sub">{formatDate(h.occurrence, 'weekday')}</div>
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
            {/* A charge naming a receiver settles as a transfer touching two
                accounts, and undoing it takes both legs back. Both halves of
                that have to be said out loud before the user presses. */}
            {pendingConfirm?.on
              ? t(
                  pendingConfirm.r.receiverAccountId
                    ? 'recurring.confirmTransferBody'
                    : 'recurring.confirmBody',
                  {
                    amount: formatSignedCurrency(
                      pendingConfirm.r.direction === 'income'
                        ? pendingConfirm.r.amount
                        : -pendingConfirm.r.amount,
                    ),
                    account: accountMap.get(pendingConfirm.r.accountId)?.name ?? '',
                    receiver:
                      accountMap.get(pendingConfirm.r.receiverAccountId ?? '')?.name ?? '',
                  },
                )
              : t(
                  pendingConfirm?.r.receiverAccountId
                    ? 'recurring.unconfirmTransferBody'
                    : 'recurring.unconfirmBody',
                )}
          </p>
          <div className="col gap-2">
            <Button
              full
              onClick={async () => {
                if (!pendingConfirm) return;
                const { r } = pendingConfirm;
                setPendingConfirm(null);
                const outcome = await toggle(r);
                if (outcome === 'full') {
                  toast.error(t('recurring.monthFullToast', { label: r.label }));
                } else {
                  toast.success(
                    outcome === 'confirmed'
                      ? t('recurring.confirmedToast')
                      : t('recurring.unconfirmedToast'),
                  );
                }
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
