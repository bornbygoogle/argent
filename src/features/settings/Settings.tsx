import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useSettings } from '@/store/SettingsContext';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { Sheet } from '@/components/ui/Sheet';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { useRecurrings } from '@/hooks/selectors';
import { isConfirmedIn } from '@/lib/recurring';
import { currentMonth } from '@/lib/date';
import {
  CURATED_CURRENCIES,
  currencySymbol,
  previewCurrency,
  isValidCurrencyCode,
} from '@/lib/currency';
import {
  exportBackup,
  downloadBackup,
  parseBackupFile,
  importBackup,
  clearAllData,
} from '@/lib/data';
import type { Locale, ThemePref } from '@/types/models';
import { GoogleSync } from './GoogleSync';

const rowBtn = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
} as const;

function NavRow({
  icon,
  tint,
  title,
  sub,
  subTone,
  value,
  to,
  chevron = true,
  titleTone,
  onClick,
}: {
  icon: string;
  tint: string;
  title: string;
  sub?: string;
  subTone?: 'warning';
  value?: string;
  to?: string;
  chevron?: boolean;
  titleTone?: 'danger';
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button type="button" className="row" style={rowBtn} onClick={() => (to ? navigate(to) : onClick?.())}>
      <TintedIcon hex={tint} icon={icon} variant="acct" />
      <span className="r-main">
        <span className="r-title" style={titleTone === 'danger' ? { color: 'var(--danger-600)' } : undefined}>
          {title}
        </span>
        {sub && (
          <span className="r-sub" style={subTone === 'warning' ? { color: 'var(--warning-600)' } : undefined}>
            {sub}
          </span>
        )}
      </span>
      {value && <span className="body-sm">{value}</span>}
      {chevron && <Icon name="ChevronRight" size={16} color="var(--neutral-300)" />}
    </button>
  );
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const { settings, setLocale, setTheme, setCurrency, update } = useSettings();

  const counts = useLiveQuery(async () => {
    const [categories, incomeTypes, accounts] = await Promise.all([
      db.categories.count(),
      db.incomeTypes.count(),
      db.accounts.count(),
    ]);
    return { categories, incomeTypes, accounts };
  }, []);

  const activeLocale: Locale | 'auto' = settings.locale ?? 'auto';
  const isFr = i18n.language?.startsWith('fr');

  const recurrings = useRecurrings();
  const todoCount = recurrings.filter((r) => !isConfirmedIn(r, currentMonth())).length;

  const fileRef = useRef<HTMLInputElement>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearTyped, setClearTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clearWord = t('settings.clearConfirmWord');

  const handleExport = async () => {
    setErr(null);
    try {
      downloadBackup(await exportBackup());
    } catch {
      setErr(t('settings.exportError'));
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const payload = parseBackupFile(await file.text());
      await importBackup(payload);
      location.reload();
    } catch {
      setBusy(false);
      setErr(t('settings.importError'));
    }
  };

  const handleClear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearAllData();
      location.reload();
    } catch {
      setBusy(false);
      setErr(t('settings.clearError'));
    }
  };

  // ---- Currency picker ----
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [addCode, setAddCode] = useState('');

  const allCurrencies = useMemo(
    () =>
      Array.from(
        new Set([...CURATED_CURRENCIES.map((c) => c.code), ...settings.customCurrencies]),
      ),
    [settings.customCurrencies],
  );
  const activeCurrencyLabel = `${t(`currency.name.${settings.currency}`, {
    defaultValue: settings.currency,
  })} · ${currencySymbol(settings.currency)}`;
  const trimmedCode = addCode.trim().toUpperCase();
  const addValid = isValidCurrencyCode(trimmedCode);
  const addExists = allCurrencies.includes(trimmedCode);
  const canAdd = addValid && !addExists;

  const handleAddCurrency = () => {
    if (!canAdd) return;
    const code = trimmedCode;
    update({ customCurrencies: [...settings.customCurrencies, code] });
    setCurrency(code);
    setAddCode('');
    setCurrencyOpen(false);
  };

  return (
    <>
      <TopBar title={t('screens.settings')} />

      <div className="content" style={{ paddingBottom: 96, gap: 20 }}>
        {/* Preferences */}
        <section>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <span className="label">{t('settings.preferences')}</span>
          </div>
          <div className="card tight">
            <NavRow
              icon="CircleDollarSign"
              tint="#64748B"
              title={t('settings.currency')}
              value={activeCurrencyLabel}
              onClick={() => setCurrencyOpen(true)}
            />
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <TintedIcon hex="#4F46E5" icon="Moon" variant="acct" />
              <span className="r-main">
                <span className="r-title">{t('settings.theme')}</span>
              </span>
              <div style={{ flex: '0 0 100%', marginTop: 10 }}>
                <Segmented<ThemePref>
                  value={settings.theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: t('theme.light') },
                    { value: 'dark', label: t('theme.dark') },
                    { value: 'system', label: t('theme.system') },
                  ]}
                />
              </div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <TintedIcon hex="#10B981" icon="Languages" variant="acct" />
              <span className="r-main">
                <span className="r-title">{t('settings.language')}</span>
              </span>
              <div style={{ flex: '0 0 100%', marginTop: 10 }}>
                <Segmented<Locale | 'auto'>
                  value={activeLocale}
                  onChange={(v) => setLocale(v === 'auto' ? null : v)}
                  options={[
                    { value: 'auto', label: t('language.followSystem') },
                    { value: 'fr', label: t('language.french') },
                    { value: 'en', label: t('language.english') },
                  ]}
                />
              </div>
              <span className="r-sub" style={{ flex: '0 0 100%' }}>
                {t('language.detected')}: {isFr ? t('language.french') : t('language.english')}
              </span>
            </div>
          </div>
        </section>

        {/* Organization */}
        <section>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <span className="label">{t('settings.organization')}</span>
          </div>
          <div className="card tight">
            <NavRow
              icon="LayoutGrid"
              tint="#4F46E5"
              title={t('settings.categories')}
              value={counts ? `${counts.categories}` : undefined}
              to="/categories"
            />
            <NavRow
              icon="Coins"
              tint="#10B981"
              title={t('settings.incomeTypes')}
              value={counts ? `${counts.incomeTypes}` : undefined}
              to="/income-types"
            />
            <NavRow
              icon="Wallet"
              tint="#4F46E5"
              title={t('settings.accounts')}
              value={counts ? `${counts.accounts}` : undefined}
              to="/accounts"
            />
            <NavRow icon="PiggyBank" tint="#10B981" title={t('settings.budget')} to="/budget" />
            <NavRow
              icon="Repeat"
              tint="#F59E0B"
              title={t('settings.recurring')}
              sub={todoCount > 0 ? t('settings.recurringToConfirm', { count: todoCount }) : undefined}
              subTone={todoCount > 0 ? 'warning' : undefined}
              to="/recurring"
            />
          </div>
        </section>

        {/* Google Drive backup / restore (optional; needs VITE_GOOGLE_* creds). */}
        <section>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <span className="label">{t('settings.google.title')}</span>
          </div>
          <GoogleSync />
        </section>

        {/* Data — export / import / wipe. Local-first, no app server. Cloud
            backup/restore to the user's own Google Drive lives in its own
            section above (GoogleSync). Export/Import exchange a local JSON file. */}
        <section>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <span className="label">{t('settings.data')}</span>
          </div>
          {err && (
            <div style={{ marginBottom: 8 }}>
              <Banner tone="danger" icon="AlertCircle">{err}</Banner>
            </div>
          )}
          <div className="card tight">
            <NavRow
              icon="Download"
              tint="#64748B"
              title={t('settings.export')}
              sub={t('settings.exportHint')}
              chevron={false}
              onClick={handleExport}
            />
            <NavRow
              icon="Upload"
              tint="#64748B"
              title={t('settings.import')}
              sub={t('settings.importHint')}
              onClick={() => fileRef.current?.click()}
            />
            <NavRow
              icon="Trash2"
              tint="#EF4444"
              title={t('settings.clearAll')}
              titleTone="danger"
              chevron={false}
              onClick={() => {
                setClearTyped('');
                setClearOpen(true);
              }}
            />
          </div>
        </section>

        {/* About */}
        <section>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <span className="label">{t('settings.about')}</span>
          </div>
          <div className="card tight">
            <NavRow icon="Info" tint="#64748B" title={t('settings.version')} value="1.0.0" chevron={false} />
            <NavRow
              icon="ShieldCheck"
              tint="#10B981"
              title={t('settings.privacy')}
              sub={t('settings.privacyHint')}
              chevron={false}
            />
          </div>
          <p className="caption text-center" style={{ marginTop: 12 }}>
            {t('app.name')} · {t('settings.offlineNote')}
          </p>
        </section>
      </div>

      {/* Hidden file picker for JSON import. */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleImportFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* Destructive-wipe confirm: user must type the confirmation word. */}
      <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title={t('settings.clearAll')}>
        <div className="text-center" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
          <div
            className="cat"
            style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', margin: '0 auto 12px' }}
          >
            <Icon name="Trash2" size={22} />
          </div>
          <p className="body-sm" style={{ marginBottom: 16 }}>{t('settings.clearHint')}</p>
          <p className="body-sm" style={{ marginBottom: 8 }}>
            {t('settings.clearTypePrompt', { word: clearWord })}
          </p>
          <input
            value={clearTyped}
            onChange={(e) => setClearTyped(e.target.value)}
            placeholder={clearWord}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="input"
            style={{ width: '100%', textAlign: 'center', marginBottom: 20, textTransform: 'uppercase' }}
          />
          <div className="col gap-2">
            <Button
              variant="danger"
              full
              onClick={handleClear}
              disabled={busy || clearTyped.trim().toUpperCase() !== clearWord.toUpperCase()}
            >
              {t('settings.clearAll')}
            </Button>
            <Button variant="secondary" full onClick={() => setClearOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Currency picker: curated quick-pick + add a custom ISO code. */}
      <Sheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} title={t('settings.currency')}>
        <div className="col" style={{ gap: 16, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
          <div className="col">
            {allCurrencies.map((code) => {
              const active = code === settings.currency;
              return (
                <button
                  key={code}
                  type="button"
                  className="row"
                  style={rowBtn}
                  onClick={() => {
                    setCurrency(code);
                    setCurrencyOpen(false);
                  }}
                >
                  <span
                    className="acct-icon"
                    style={{ background: 'var(--neutral-100)', color: 'var(--neutral-700)' }}
                  >
                    <Icon name="CircleDollarSign" size={18} />
                  </span>
                  <span className="r-main">
                    <span className="r-title">
                      {t(`currency.name.${code}`, { defaultValue: code })}
                    </span>
                    <span className="r-sub tnum">
                      {code} · {currencySymbol(code)} · {previewCurrency(code)}
                    </span>
                  </span>
                  {active && <Icon name="Check" size={18} color="var(--primary-600)" />}
                </button>
              );
            })}
          </div>

          <div className="field">
            <span className="label">{t('currency.add')}</span>
            <div className="row-between" style={{ gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 0 }}
                value={addCode}
                onChange={(e) => setAddCode(e.target.value.toUpperCase().slice(0, 3))}
                placeholder={t('currency.codePlaceholder')}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button variant="secondary" size="sm" onClick={handleAddCurrency} disabled={!canAdd}>
                {t('currency.addBtn')}
              </Button>
            </div>
            {trimmedCode && (
              <span className="r-sub">
                {addValid
                  ? addExists
                    ? t('currency.exists')
                    : `${t('currency.preview')}: ${previewCurrency(trimmedCode)}`
                  : t('currency.invalid')}
              </span>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
