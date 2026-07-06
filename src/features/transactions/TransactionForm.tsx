import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Numpad, displayAmount, parseAmount } from '@/components/ui/Numpad';
import { Sheet } from '@/components/ui/Sheet';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { TintedIcon } from '@/components/ui/TintedIcon';
import {
  useAccounts,
  useCategories,
  useIncomeTypes,
} from '@/hooks/selectors';
import { useAccountScope } from '@/store/AccountScopeContext';
import { useSettings } from '@/store/SettingsContext';
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
} from '@/lib/transactions';
import { categoryLabel, incomeTypeLabel } from '@/lib/labels';
import { getLocale } from '@/lib/format';
import { todayISO } from '@/lib/date';
import type { Transaction, TransactionKind } from '@/types/models';

interface TransactionFormProps {
  kind: TransactionKind; // 'expense' | 'income'
  transaction?: Transaction; // present in edit mode
}

const QUICK_ADDS = [5, 10, 20, 50];

export function TransactionForm({ kind, transaction }: TransactionFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scope } = useAccountScope();
  const { settings, update } = useSettings();
  const accounts = useAccounts();
  const categories = useCategories();
  const incomeTypes = useIncomeTypes();
  const locale = getLocale();
  const isEdit = Boolean(transaction);
  const isExpense = kind === 'expense';

  const defaultAccount = useMemo(() => {
    if (transaction) return transaction.accountId;
    // Kind-specific default account (Settings) takes priority when defined —
    // it's an explicit user preference, so it beats the scope filter and the
    // last-used heuristic.
    const specific = isExpense
      ? settings.defaultExpenseAccountId
      : settings.defaultIncomeAccountId;
    if (specific && accounts.some((a) => a.id === specific)) return specific;
    if (scope !== 'all') return scope;
    if (settings.lastUsedAccountId && accounts.some((a) => a.id === settings.lastUsedAccountId))
      return settings.lastUsedAccountId;
    return accounts[0]?.id ?? '';
  }, [
    transaction,
    isExpense,
    settings.defaultExpenseAccountId,
    settings.defaultIncomeAccountId,
    scope,
    settings.lastUsedAccountId,
    accounts,
  ]);

  const [amountStr, setAmountStr] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [incomeType, setIncomeType] = useState(transaction?.incomeType ?? 'Autre');
  // For a NEW transaction, keep accountId in sync with the derived default
  // (accounts/settings load asynchronously after mount). A manual pick sets
  // `touchedRef` so we never overwrite the user's choice.
  const touchedRef = useRef(false);
  const [accountId, setAccountId] = useState(defaultAccount);
  useEffect(() => {
    if (isEdit || touchedRef.current) return;
    setAccountId(defaultAccount);
  }, [isEdit, defaultAccount]);
  const pickAccount = (id: string) => {
    touchedRef.current = true;
    setAccountId(id);
  };
  const [date, setDate] = useState(transaction?.date ?? todayISO());
  const [note, setNote] = useState(transaction?.note ?? '');

  const [acctOpen, setAcctOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const amount = parseAmount(amountStr);
  const canSave = amount > 0 && accountId !== '';
  const selectedAccount = accounts.find((a) => a.id === accountId);

  const title = t(
    isEdit ? (isExpense ? 'screens.editExpense' : 'screens.editIncome') : isExpense ? 'screens.addExpense' : 'screens.addIncome',
  );
  const amountColor = isExpense ? 'var(--primary-600)' : 'var(--success-600)';

  const quickAdd = (n: number) => {
    const next = parseAmount(amountStr) + n;
    setAmountStr(String(Math.round(next * 100) / 100));
  };

  const handleSave = async () => {
    if (!canSave) return;
    const payload = {
      amount,
      accountId,
      categoryId: isExpense ? categoryId || 'cat-autre' : undefined,
      incomeType: !isExpense ? incomeType : undefined,
      note,
      date,
    };
    if (transaction) {
      await updateTransaction(transaction.id, payload);
    } else {
      await addTransaction(kind, payload);
      update({ lastUsedAccountId: accountId });
    }
    navigate(-1);
  };

  const handleDelete = async () => {
    if (!transaction) return;
    await deleteTransaction(transaction.id);
    navigate(-1);
  };

  return (
    <>
      <TopBar
        centered
        title={title}
        left={
          isEdit ? (
            <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
              <Icon name="ChevronLeft" size={22} />
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
              {t('common.cancel')}
            </button>
          )
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {isEdit && (
              <button
                type="button"
                className="icon-btn"
                style={{ color: 'var(--danger-600)' }}
                onClick={() => setConfirmOpen(true)}
                aria-label={t('common.delete')}
              >
                <Icon name="Trash2" size={20} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={!canSave}
            >
              {t('common.ok')}
            </button>
          </div>
        }
      />

      <div className="content" style={{ padding: '8px 16px 0', gap: 8 }}>
        {/* Account picker */}
        <div className="card tight row-between" style={{ padding: '8px 12px' }}>
          <span className="body-sm" style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>
            {t('form.account')}
          </span>
          <button
            type="button"
            className="acct-chip"
            style={{ height: 32 }}
            onClick={() => setAcctOpen(true)}
          >
            <span className="acct-dot" style={{ background: selectedAccount?.color ?? '#4F46E5' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {selectedAccount?.name ?? t('form.selectAccount')}
            </span>
            <span style={{ color: 'var(--neutral-400)', display: 'inline-flex' }}>
              <Icon name="ChevronDown" size={14} />
            </span>
          </button>
        </div>

        {/* Amount */}
        <div className="text-center" style={{ paddingTop: 2 }}>
          <span className="label">{t('common.amount')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginTop: 4 }}>
            <span className="amount" style={{ color: amountColor }}>
              {displayAmount(amountStr, locale)}
            </span>
            <span className="h2 muted">€</span>
          </div>
          <div className="chip-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            {QUICK_ADDS.map((n) => (
              <button key={n} type="button" className="chip" onClick={() => quickAdd(n)}>
                +{n}
              </button>
            ))}
          </div>
        </div>

        {/* Category / income-type combo box */}
        {isExpense ? (
          <Select
            label={t('form.category')}
            placeholder={t('form.selectCategory')}
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({
              id: c.id,
              label: categoryLabel(t, c),
              icon: c.icon,
              color: c.color,
            }))}
          />
        ) : (
          <Select
            variant="income"
            label={t('form.incomeType')}
            placeholder={t('form.selectIncomeType')}
            value={incomeType}
            onChange={setIncomeType}
            options={incomeTypes.map((it) => ({
              id: it.key,
              label: incomeTypeLabel(t, it),
              icon: it.icon ?? 'Coins',
              color: it.color ?? '#10B981',
            }))}
          />
        )}

        {/* Note + date */}
        <div className="card tight" style={{ padding: '4px 0' }}>
          <div className="row" style={{ padding: '9px 16px' }}>
            <span
              className="acct-icon"
              style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(100,116,139,.12)', color: '#64748B' }}
            >
              <Icon name="Type" size={16} strokeWidth={2} />
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('form.notePlaceholder')}
              style={{
                flex: 1,
                minWidth: 0,
                height: 32,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 15,
                fontFamily: 'inherit',
                color: 'var(--neutral-900)',
              }}
            />
          </div>
          <div className="divider" />
          <label className="row" style={{ padding: '9px 16px', cursor: 'pointer' }}>
            <span
              className="acct-icon"
              style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(79,70,229,.12)', color: '#4F46E5' }}
            >
              <Icon name="Calendar" size={16} strokeWidth={2} />
            </span>
            <span style={{ fontSize: 15, color: 'var(--neutral-700)' }}>{t('form.date')}</span>
            <span style={{ flex: 1 }} />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 15,
                fontWeight: 500,
                fontFamily: 'inherit',
                color: 'var(--neutral-900)',
                textAlign: 'right',
              }}
            />
          </label>
        </div>
      </div>

      {/* Numpad pinned at the bottom of the screen column */}
      <div style={{ padding: '10px 16px 28px', flexShrink: 0 }}>
        <Numpad value={amountStr} onChange={setAmountStr} />
      </div>

      {/* Account picker sheet */}
      <Sheet open={acctOpen} onClose={() => setAcctOpen(false)} title={t('form.account')}>
        <div className="col" style={{ paddingBottom: 8 }}>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                pickAccount(a.id);
                setAcctOpen(false);
              }}
              className="row"
              style={{ padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <TintedIcon hex={a.color} icon={a.icon} variant="acct" />
              <span className="r-main">
                <span className="r-title">{a.name}</span>
                <span className="r-sub">{t(`accountType.${a.type}`)}</span>
              </span>
              {accountId === a.id && <Icon name="Check" size={18} color="var(--primary-600)" />}
            </button>
          ))}
        </div>
      </Sheet>

      {/* Delete confirm */}
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <div
            className="cat"
            style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', margin: '0 auto 12px' }}
          >
            <Icon name="Trash2" size={22} />
          </div>
          <h2 className="h3" style={{ marginBottom: 4 }}>
            {t('confirm.deleteTitle')}
          </h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>
            {t('confirm.deleteHint')}
          </p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={handleDelete}>
              {t('confirm.delete')}
            </Button>
            <Button variant="secondary" full onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
