import { useTranslation } from 'react-i18next';
import { TintedIcon } from '@/components/ui/TintedIcon';

interface PlaceholderProps {
  /** i18n key under `screens.` for the title. */
  titleKey: string;
  icon?: string;
}

/** Stand-in for screens built in later phases. Renders as the scrollable `.content`. */
export function Placeholder({ titleKey, icon = 'CircleDashed' }: PlaceholderProps) {
  const { t } = useTranslation();
  return (
    <div className="content">
      <div
        className="col text-center"
        style={{ alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}
      >
        <TintedIcon hex="#94A3B8" icon={icon} variant="cat" alpha={0.12} />
        <h2 className="h2">{t(`screens.${titleKey}`)}</h2>
        <p className="body-sm" style={{ maxWidth: 280 }}>
          {t('common.comingSoonHint')}
        </p>
      </div>
    </div>
  );
}
