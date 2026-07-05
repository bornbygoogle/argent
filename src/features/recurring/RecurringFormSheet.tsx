import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { AccountPickerSheet } from '@/features/sheets/AccountPickerSheet';
import { useAccounts, useCategories, useIncomeTypes } from '@/hooks/selectors';
import { useAccountScope } from '@/store/AccountScopeContext';
import { categoryLabel, incomeTypeLabel } from '@/lib/labels';
import { createRecurring, updateRecurring, deleteRecurring } from '@/lib/recurring';
import type { Cadence, RecurringDirection, Recurring as RecurringT } from '@/types/models';

type Target = 'new' | RecurringT;
const cleanNum = (s: string) => s.replace(/[^0-9.,]/g, '');
const parseNum = (s: string) => Number.parseFloat(s.replace(',', '.')) || 0;

const CADENCES: Cadence[] = ['mensuel', 'hebdo', 'annuel'];

export function RecurringFormSheet({ target, onClose }: { target: Target; onClose: () => void }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const categories = useCategories();
  const incomeTypes = useIncomeTypes();
  const { scope } = useAccountScope();
  const existing = target === 'new' ? undefined : target;

  const scopeAccount = scope !== 'all' ? accounts.find((a) => a.id === scope) : undefined;
  const firstAccount = scopeAccount ?? accounts[0];

  const [label, setLabel] = useState(existing?.label ?? '');
  const [direction, setDirection] = useState<RecurringDirection>(existing?.direction ?? 'expense');
  const [amountStr, setAmountStr] = useState(existing ? String(existing.amount) : '');
  const [cadence, setCadence] = useState<Cadence>(existing?.cadence ?? 'mensuel');
  const [accountId, setAccountId] = useState(existing?.accountId ?? firstAccount?.id ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id);
  const [incomeType, setIncomeType] = useState<string>(existing?.incomeType ?? 'Salaire');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // When the sheet is reused for a different target, reset derived state.
  useEffect(() => {
    if (existing) {
      setLabel(existing.label);
      setDirection(existing.direction);
      setAmountStr(String(existing.amount));
      setCadence(existing.cadence);
      setAccountId(existing.accountId);
      setCategoryId(existing.categoryId ?? categories[0]?.id);
      setIncomeType(existing.incomeType ?? 'Salaire');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const account = accounts.find((a) => a.id === accountId);
  const cat = categories.find((c) => c.id === categoryId);
  const tileHex = direction === 'expense' ? cat?.color ?? '#64748B' : '#10B981';
  const tileIcon = direction === 'expense' ? cat?.icon ?? 'CircleDashed' : 'Coins';

  const save = async () => {
    if (busy || !accountId) return;
    setBusy(true);
    try {
      const amount = parseNum(amountStr);
      const common = {
        label,
        amount,
        cadence,
        categoryId: direction === 'expense' ? categoryId : undefined,
        incomeType: direction === 'income' ? incomeType : undefined,
        icon: tileIcon,
        color: tileHex,
      };
      if (existing) await updateRecurring(existing.id, common);
      else await createRecurring({ accountId, direction, ...common });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteRecurring(existing.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open onClose={confirmOpen ? () => {} : onClose} title={t(existing ? 'recurring.edit' : 'recurring.new')}>
        <div style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {/* direction */}
          <Segmented<RecurringDirection>
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'expense', label: t('recurring.expense') },
              { value: 'income', label: t('recurring.income') },
            ]}
          />

          {/* label + amount */}
          <div className="card tight" style={{ marginTop: 12, padding: '4px 0' }}>
            <div className="row" style={{ padding: '9px 16px' }}>
              <TintedIcon hex={tileHex} icon={tileIcon} variant="acct" />
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('recurring.labelPlaceholder')}
                style={{ flex: 1, minWidth: 0, height: 32, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', color: 'var(--neutral-900)' }}
              />
            </div>
            <div className="divider" />
            <div className="row" style={{ padding: '9px 16px' }}>
              <span style={{ fontSize: 15, color: 'var(--neutral-700)' }}>{t('common.amount')}</span>
              <span style={{ flex: 1 }} />
              <div style={{ position: 'relative' }}>
                <input
                  value={amountStr}
                  onChange={(e) => setAmountStr(cleanNum(e.target.value))}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="tnum"
                  style={{ width: 110, height: 32, background: 'transparent', border: 'none', outline: 'none', fontSize: 16, fontWeight: 600, fontFamily: 'inherit', color: 'var(--neutral-900)', textAlign: 'right', paddingRight: 16 }}
                />
                <span className="muted" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', fontWeight: 500 }}>€</span>
              </div>
            </div>
          </div>

          {/* account */}
          <button type="button" className="card tight" onClick={() => setPickerOpen(true)} style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
            <TintedIcon hex={account?.color ?? '#4F46E5'} icon={account?.icon ?? 'Wallet'} variant="acct" />
            <div className="r-main">
              <div className="r-sub">{t('form.account')}</div>
              <div className="r-title">{account?.name ?? t('form.selectAccount')}</div>
            </div>
            <Icon name="ChevronDown" size={16} color="var(--neutral-400)" />
          </button>

          {/* cadence */}
          <p className="label" style={{ marginTop: 16, marginBottom: 8 }}>{t('recurring.cadenceLabel')}</p>
          <Segmented<Cadence>
            value={cadence}
            onChange={setCadence}
            options={CADENCES.map((c) => ({ value: c, label: t(`recurring.cadence.${c}`) }))}
          />

          {/* category / income type combo box */}
          <div style={{ marginTop: 16 }}>
            {direction === 'expense' ? (
              <Select
                label={t('form.category')}
                placeholder={t('form.selectCategory')}
                value={categoryId}
                onChange={setCategoryId}
                options={categories.map((c) => ({ id: c.id, label: categoryLabel(t, c), icon: c.icon, color: c.color }))}
              />
            ) : (
              <Select
                variant="income"
                label={t('form.incomeType')}
                placeholder={t('form.selectIncomeType')}
                value={incomeType}
                onChange={setIncomeType}
                options={incomeTypes.map((it) => ({ id: it.key, label: incomeTypeLabel(t, it), icon: it.icon ?? 'Coins', color: it.color ?? '#10B981' }))}
              />
            )}
          </div>

          <Button full onClick={save} disabled={busy || !label.trim() || !amountStr} style={{ marginTop: 20 }}>
            {t('common.save')}
          </Button>

          {existing && (
            <>
              <div className="divider" style={{ margin: '16px 0' }} />
              <Button variant="danger" full onClick={() => setConfirmOpen(true)} disabled={busy}>
                <Icon name="Trash2" size={18} />
                {t('recurring.delete')}
              </Button>
            </>
          )}
        </div>
      </Sheet>

      <AccountPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('form.account')}
        selectedId={accountId}
        onPick={setAccountId}
      />

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <div className="cat" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', margin: '0 auto 12px' }}>
            <Icon name="Trash2" size={22} />
          </div>
          <h2 className="h3" style={{ marginBottom: 4 }}>{t('recurring.delete')}</h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>{t('recurring.deleteHint')}</p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={remove} disabled={busy}>{t('common.delete')}</Button>
            <Button variant="secondary" full onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
