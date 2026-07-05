import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Numpad, displayAmount, parseAmount } from '@/components/ui/Numpad';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { AccountPickerSheet } from '@/features/sheets/AccountPickerSheet';
import { useAccounts, useTransfer } from '@/hooks/selectors';
import { useAccountScope } from '@/store/AccountScopeContext';
import { useSettings } from '@/store/SettingsContext';
import { addTransfer, deleteTransfer, updateTransfer } from '@/lib/transactions';
import { todayISO } from '@/lib/date';
import { getLocale } from '@/lib/format';

type Picker = 'from' | 'to' | null;

export function Transfer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const { scope } = useAccountScope();
  const { settings, update } = useSettings();
  const accounts = useAccounts();
  const legs = useTransfer(groupId);
  const locale = getLocale();
  const isEdit = Boolean(groupId);

  const outLeg = legs.find((l) => l.transferRole === 'out');
  const inLeg = legs.find((l) => l.transferRole === 'in');

  const defaults = useMemo(() => {
    const first = accounts[0]?.id ?? '';
    const from =
      scope !== 'all' && accounts.some((a) => a.id === scope)
        ? scope
        : settings.lastUsedAccountId && accounts.some((a) => a.id === settings.lastUsedAccountId)
          ? settings.lastUsedAccountId
          : first;
    const to = accounts.find((a) => a.id !== from)?.id ?? '';
    return { from, to };
  }, [accounts, scope, settings.lastUsedAccountId]);

  const [fromId, setFromId] = useState(defaults.from);
  const [toId, setToId] = useState(defaults.to);
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !outLeg || !inLeg) return;
    setFromId(outLeg.accountId);
    setToId(inLeg.accountId);
    setAmountStr(String(outLeg.amount));
    setDate(outLeg.date);
    setNote(outLeg.note ?? '');
    setHydrated(true);
  }, [outLeg, inLeg, hydrated]);

  const amount = parseAmount(amountStr);
  const sameAccount = fromId === toId;
  const canSave = amount > 0 && Boolean(fromId) && Boolean(toId) && !sameAccount;
  const fromAccount = accounts.find((a) => a.id === fromId);
  const toAccount = accounts.find((a) => a.id === toId);

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const handleSave = async () => {
    if (!canSave) return;
    const payload = { fromAccountId: fromId, toAccountId: toId, amount, date, note };
    if (groupId) {
      await updateTransfer(groupId, payload);
    } else {
      await addTransfer(payload);
      update({ lastUsedAccountId: fromId });
    }
    navigate(-1);
  };

  const handleDelete = async () => {
    if (!groupId) return;
    await deleteTransfer(groupId);
    navigate(-1);
  };

  return (
    <>
      <TopBar
        centered
        title={t(isEdit ? 'screens.editTransfer' : 'screens.transfer')}
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
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={!canSave}>
              {t('common.ok')}
            </button>
          </div>
        }
      />

      <div className="content" style={{ padding: '8px 16px 0', gap: 8 }}>
        {/* Amount */}
        <div className="text-center" style={{ paddingTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
            <span className="amount" style={{ color: 'var(--primary-600)', fontSize: 34 }}>
              {displayAmount(amountStr, locale)}
            </span>
            <span className="h2 muted">€</span>
          </div>
        </div>

        {sameAccount && (
          <p className="text-center" style={{ color: 'var(--danger-600)', fontSize: 12 }}>
            {t('transfer.sameAccount')}
          </p>
        )}

        {/* From / swap / To */}
        <div className="col" style={{ gap: 8, marginTop: 8 }}>
          <AccountLine label={t('transfer.from')} account={fromAccount} onClick={() => setPicker('from')} />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: -6, marginBottom: -6, zIndex: 2 }}>
            <button
              type="button"
              onClick={swap}
              aria-label="swap"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '3px solid var(--neutral-50)',
                background: 'var(--primary-50)',
                color: 'var(--primary-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="ArrowLeftRight" size={16} />
            </button>
          </div>
          <AccountLine label={t('transfer.to')} account={toAccount} onClick={() => setPicker('to')} />
        </div>

        {/* Date + note */}
        <div className="card tight" style={{ padding: '4px 0', marginTop: 8 }}>
          <label className="row" style={{ padding: '9px 16px', cursor: 'pointer' }}>
            <MetaTile icon="Calendar" tint="#4F46E5" />
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
          <div className="divider" />
          <div className="row" style={{ padding: '9px 16px' }}>
            <MetaTile icon="Type" tint="#64748B" />
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
        </div>
      </div>

      {/* Numpad */}
      <div style={{ padding: '10px 16px 28px', flexShrink: 0 }}>
        <Numpad value={amountStr} onChange={setAmountStr} />
      </div>

      {/* Account pickers */}
      <AccountPickerSheet
        open={picker === 'from'}
        onClose={() => setPicker(null)}
        title={t('transfer.from')}
        selectedId={fromId}
        excludeId={toId}
        onPick={setFromId}
      />
      <AccountPickerSheet
        open={picker === 'to'}
        onClose={() => setPicker(null)}
        title={t('transfer.to')}
        selectedId={toId}
        excludeId={fromId}
        onPick={setToId}
      />

      {/* Delete confirm */}
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <div className="cat" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', margin: '0 auto 12px' }}>
            <Icon name="Trash2" size={22} />
          </div>
          <h2 className="h3" style={{ marginBottom: 4 }}>
            {t('confirm.deleteTransferTitle')}
          </h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>
            {t('confirm.deleteHint')}
          </p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={handleDelete}>
              {t('common.delete')}
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

function MetaTile({ icon, tint }: { icon: string; tint: string }) {
  const r = parseInt(tint.slice(1, 3), 16);
  const g = parseInt(tint.slice(3, 5), 16);
  const b = parseInt(tint.slice(5, 7), 16);
  return (
    <span
      className="acct-icon"
      style={{ width: 28, height: 28, borderRadius: 8, background: `rgba(${r},${g},${b},.12)`, color: tint }}
    >
      <Icon name={icon} size={16} strokeWidth={2} />
    </span>
  );
}

function AccountLine({
  label,
  account,
  onClick,
}: {
  label: string;
  account?: { name: string; color: string; icon: string };
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="card tight"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <TintedIcon hex={account?.color ?? '#4F46E5'} icon={account?.icon ?? 'Wallet'} variant="acct" />
      <span className="r-main">
        <span className="r-sub">{label}</span>
        <span className="r-title">{account?.name ?? t('form.selectAccount')}</span>
      </span>
      <Icon name="ChevronDown" size={16} color="var(--neutral-400)" />
    </button>
  );
}
