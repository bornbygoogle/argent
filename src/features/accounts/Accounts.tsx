import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Hero } from '@/components/ui/Hero';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useAccountsIncludingArchived,
  useAllTransactions,
} from '@/hooks/selectors';
import { accountBalance, totalBalance } from '@/lib/calc';
import { formatCurrency } from '@/lib/format';
import {
  createAccount,
  deleteAccountWithReassign,
  setAccountArchived,
  updateAccount,
} from '@/lib/accounts';
import { ACCOUNT_TYPE_DEFAULTS } from '@/db/seed';
import { useSettings } from '@/store/SettingsContext';
import type { Account, AccountType } from '@/types/models';

const TYPES: AccountType[] = ['courant', 'épargne', 'espèces', 'autre'];

type EditTarget = 'new' | Account;

export function Accounts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { update } = useSettings();
  const accounts = useAccountsIncludingArchived();
  const allTx = useAllTransactions();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const netWorth = totalBalance(accounts, allTx);

  return (
    <>
      <TopBar
        title={t('screens.accounts')}
        left={
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <Icon name="ChevronLeft" size={22} />
          </button>
        }
        right={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')}>
            + {t('common.add')}
          </button>
        }
      />

      <div className="content" style={{ paddingBottom: 24, gap: 16 }}>
        <Hero label={t('dashboard.balance')}>
          <div className="amount" style={{ color: '#fff', fontSize: 34, marginTop: 4 }}>
            {formatCurrency(netWorth)}
          </div>
          <div className="caption" style={{ color: 'rgba(255,255,255,.85)', marginTop: 6 }}>
            {accounts.length} · €
          </div>
        </Hero>

        <div className="section-head">
          <span className="label">{t('accounts.activeTitle')}</span>
        </div>

        {active.length === 0 ? (
          <EmptyState icon="Wallet" title={t('accounts.empty')} hint={t('accounts.emptyHint')} />
        ) : (
          <div className="col gap-3">
            {active.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                balance={accountBalance(a, allTx)}
                onClick={() => setEditing(a)}
              />
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <>
            <div className="section-head" style={{ marginTop: 8 }}>
              <span className="label">{t('accounts.archivedTitle')}</span>
            </div>
            <div className="col gap-3">
              {archived.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  balance={accountBalance(a, allTx)}
                  dimmed
                  onClick={() => setEditing(a)}
                />
              ))}
            </div>
          </>
        )}

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/transfer')}>
            <Icon name="ArrowLeftRight" size={18} />
            {t('screens.transfer')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/income')}>
            <Icon name="Euro" size={18} />
            {t('dashboard.income')}
          </button>
        </div>
      </div>

      {editing !== null && (
        <AccountFormSheet
          target={editing}
          onClose={() => setEditing(null)}
          onDelete={(acct) => {
            setEditing(null);
            setDeleting(acct);
          }}
        />
      )}

      {deleting && (
        <DeleteAccountSheet
          account={deleting}
          others={accounts.filter((a) => a.id !== deleting.id)}
          onClose={() => setDeleting(null)}
          onDeleted={(deletedId) => {
            setDeleting(null);
            if (deletedId) update({ lastUsedAccountId: null });
          }}
        />
      )}
    </>
  );
}

function AccountCard({
  account,
  balance,
  dimmed = false,
  onClick,
}: {
  account: Account;
  balance: number;
  dimmed?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card" onClick={onClick} style={{ cursor: 'pointer', opacity: dimmed ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="GripVertical" size={18} color="var(--neutral-300)" />
        <TintedIcon hex={account.color} icon={account.icon} variant="acct" />
        <div className="r-main">
          <div className="r-title">{account.name}</div>
          <div className="r-sub">{t(`accountType.${account.type}`)}</div>
        </div>
      </div>
      <div className="row-between" style={{ marginTop: 10, paddingLeft: 30 }}>
        <span className="amount-md" style={{ fontSize: 20 }}>
          {formatCurrency(balance)}
        </span>
        <Icon name="ChevronRight" size={18} color="var(--neutral-300)" />
      </div>
    </div>
  );
}

/** Add / edit an account. For edit: also archive/restore + delete (with reassign). */
function AccountFormSheet({
  target,
  onClose,
  onDelete,
}: {
  target: EditTarget;
  onClose: () => void;
  onDelete: (account: Account) => void;
}) {
  const { t } = useTranslation();
  const existing = target === 'new' ? undefined : target;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'courant');
  const [balance, setBalance] = useState(existing ? String(existing.openingBalance) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const opening = Number.parseFloat(balance.replace(',', '.')) || 0;
    try {
      if (existing) {
        await updateAccount(existing.id, { name, type, openingBalance: opening });
      } else {
        await createAccount({
          name: name || t(`accountType.${type}`),
          type,
          openingBalance: opening,
        });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t(existing ? 'accounts.edit' : 'accounts.add')}>
      <div style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <p className="label" style={{ marginBottom: 6 }}>
          {t('onboarding.accountName')}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('onboarding.accountNamePlaceholder')}
          className="input"
          style={{ width: '100%', marginBottom: 20 }}
        />

        <p className="label" style={{ marginBottom: 6 }}>
          {t('onboarding.accountType')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {TYPES.map((ty) => {
            const d = ACCOUNT_TYPE_DEFAULTS[ty];
            const selected = type === ty;
            return (
              <button
                key={ty}
                type="button"
                onClick={() => setType(ty)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  height: 52,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: `1px solid ${selected ? 'var(--primary-600)' : 'var(--neutral-200)'}`,
                  background: selected ? 'var(--primary-50)' : 'var(--white)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <TintedIcon hex={d.color} icon={d.icon} variant="acct" />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t(`accountType.${ty}`)}</span>
              </button>
            );
          })}
        </div>

        <p className="label" style={{ marginBottom: 6 }}>
          {t('onboarding.openingBalance')}
        </p>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input
            value={balance}
            onChange={(e) => setBalance(e.target.value.replace(/[^0-9,.-]/g, ''))}
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

        <Button full onClick={save} disabled={busy}>
          {t('common.save')}
        </Button>

        {existing && (
          <>
            <div className="divider" style={{ margin: '16px 0' }} />
            <div className="col gap-2">
              <Button
                variant="secondary"
                full
                onClick={async () => {
                  await setAccountArchived(existing.id, !existing.archived);
                  onClose();
                }}
              >
                <Icon name={existing.archived ? 'ArchiveRestore' : 'Archive'} size={18} />
                {existing.archived ? t('accounts.unarchive') : t('accounts.archive')}
              </Button>
              <Button variant="danger" full onClick={() => onDelete(existing)}>
                {t('accounts.delete')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Delete-with-reassign: pick where this account's movements should go. */
function DeleteAccountSheet({
  account,
  others,
  onClose,
  onDeleted,
}: {
  account: Account;
  others: Account[];
  onClose: () => void;
  onDeleted: (deletedId: string) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string>(others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await deleteAccountWithReassign(account.id, target);
      onDeleted(account.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('accounts.delete')}>
      <div style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div
          className="cat"
          style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', margin: '0 auto 12px' }}
        >
          <Icon name="Trash2" size={22} />
        </div>
        <p className="body-sm text-center" style={{ marginBottom: 16 }}>
          {t('accounts.reassignHint', { name: account.name })}
        </p>

        <div className="card tight" style={{ marginBottom: 20 }}>
          {others.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setTarget(a.id)}
              className="row"
              style={{ padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <TintedIcon hex={a.color} icon={a.icon} variant="acct" />
              <span className="r-main">
                <span className="r-title">{a.name}</span>
                <span className="r-sub">{t(`accountType.${a.type}`)}</span>
              </span>
              {target === a.id && <Icon name="Check" size={18} color="var(--primary-600)" />}
            </button>
          ))}
        </div>

        <div className="col gap-2">
          <Button variant="danger" full onClick={confirm} disabled={!target || busy}>
            {t('accounts.delete')}
          </Button>
          <Button variant="secondary" full onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
