import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/store/SettingsContext';
import { useAccountScope } from '@/store/AccountScopeContext';
import { createAccount } from '@/lib/accounts';
import { ACCOUNT_TYPE_DEFAULTS } from '@/db/seed';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { TintedIcon } from '@/components/ui/TintedIcon';
import type { AccountType } from '@/types/models';

const TYPES: AccountType[] = ['courant', 'épargne', 'espèces', 'autre'];

export function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { update } = useSettings();
  const { setScope } = useAccountScope();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('courant');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    const opening = Number.parseFloat(balance.replace(',', '.')) || 0;
    const id = await createAccount({ name: name || t(`accountType.${type}`), type, openingBalance: opening });
    update({ hasOnboarded: true, lastUsedAccountId: id });
    setScope(id);
    navigate('/', { replace: true });
  };

  if (step === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Skip */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>
            {t('common.skip')}
          </button>
        </div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--primary-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Icon name="Euro" size={16} strokeWidth={2.4} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{t('app.name')}</span>
        </div>

        {/* Illustration + copy */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'var(--primary-50)' }} />
            <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', background: 'var(--primary-100)' }} />
            <div
              style={{
                position: 'relative',
                width: 96,
                height: 96,
                borderRadius: 28,
                background: 'var(--primary-600)',
                boxShadow: 'var(--shadow-fab)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <Icon name="Plus" size={44} strokeWidth={2.2} />
            </div>
            {/* Floating chips */}
            <div
              style={{
                position: 'absolute',
                top: 18,
                left: 6,
                background: '#fff',
                borderRadius: 14,
                boxShadow: 'var(--shadow-md)',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <TintedIcon hex="#10B981" icon="ShoppingCart" variant="cat-sm" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>−8,40&nbsp;€</span>
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 24,
                right: 0,
                background: '#fff',
                borderRadius: 14,
                boxShadow: 'var(--shadow-md)',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <TintedIcon hex="#F59E0B" icon="Utensils" variant="cat-sm" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>−14,00&nbsp;€</span>
            </div>
          </div>

          <h1 className="h1" style={{ marginTop: 32 }}>
            {t('onboarding.splashHeadline')}
          </h1>
          <p className="body muted" style={{ marginTop: 10, maxWidth: 280 }}>
            {t('onboarding.splashBody')}
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 36 }}>
            <span className="dot on" style={{ width: 24, borderRadius: 4 }} />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '20px 16px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(1)}>
            {t('common.continue')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ height: 40 }}
            onClick={() => setStep(1)}
          >
            {t('onboarding.haveAccount')}
          </button>
        </div>
      </div>
    );
  }

  // Step 1 — create first account
  const def = ACCOUNT_TYPE_DEFAULTS[type];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 16px' }} className="no-scrollbar">
        <h1 className="h1" style={{ fontSize: 22, marginBottom: 4 }}>
          {t('onboarding.step1Title')}
        </h1>
        <p className="body-sm" style={{ marginBottom: 24 }}>
          {t('onboarding.step1Hint')}
        </p>

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
                  height: 56,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: `1px solid ${selected ? 'var(--primary-600)' : 'var(--neutral-200)'}`,
                  background: selected ? 'var(--primary-50)' : 'var(--white)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <TintedIcon hex={d.color} icon={d.icon} variant="acct" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{t(`accountType.${ty}`)}</span>
              </button>
            );
          })}
        </div>

        <p className="label" style={{ marginBottom: 6 }}>
          {t('onboarding.openingBalance')}
        </p>
        <div style={{ position: 'relative', marginBottom: 6 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--neutral-400)' }}>
          <Icon name={def.icon} size={12} />
          <span>{t('onboarding.openingBalanceHint')}</span>
        </div>
      </div>

      <div style={{ padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <Button full onClick={finish} disabled={busy}>
          {t('onboarding.create')}
        </Button>
      </div>
    </div>
  );
}
