import { NavLink, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';

interface BottomNavProps {
  /** Center FAB handler (opens quick-action sheet). */
  onAdd?: () => void;
}

const slot = (active: boolean) => (active ? 'bn-slot active' : 'bn-slot');

/** Bottom navigation: Accueil · Stats · [FAB] · Calendrier · Réglages. */
export function BottomNav({ onAdd }: BottomNavProps) {
  const { t } = useTranslation();
  const [params] = useSearchParams();

  // The account scope is app-wide but lives in the URL, so a bare tab link
  // would silently reset it — and Statistics has no picker to notice it by.
  // Only `account` travels: params like `?category=` belong to one screen.
  const account = params.get('account');
  const to = (pathname: string) =>
    account
      ? { pathname, search: `?${new URLSearchParams({ account }).toString()}` }
      : pathname;

  return (
    <>
      <nav className="bottomnav">
        <NavLink to={to('/')} end className={({ isActive }) => slot(isActive)} aria-label={t('nav.home')}>
          <Icon name="Home" size={22} strokeWidth={2} />
          <span className="bn-label">{t('nav.home')}</span>
        </NavLink>

        <NavLink to={to('/stats')} className={({ isActive }) => slot(isActive)} aria-label={t('nav.stats')}>
          <Icon name="ChartColumnIncreasing" size={22} strokeWidth={2} />
          <span className="bn-label">{t('nav.stats')}</span>
        </NavLink>

        {/* Middle column reserves space for the centered FAB. */}
        <div className="bn-slot fab-slot">
          <span className="bn-spacer" />
        </div>

        <NavLink to={to('/overview')} className={({ isActive }) => slot(isActive)} aria-label={t('nav.calendar')}>
          <Icon name="Calendar" size={22} strokeWidth={2} />
          <span className="bn-label">{t('nav.calendar')}</span>
        </NavLink>

        <NavLink to={to('/settings')} className={({ isActive }) => slot(isActive)} aria-label={t('nav.settings')}>
          <Icon name="Settings" size={22} strokeWidth={2} />
          <span className="bn-label">{t('nav.settings')}</span>
        </NavLink>
      </nav>

      <button type="button" className="fab center" onClick={onAdd} aria-label={t('nav.add')}>
        <Icon name="Plus" size={26} strokeWidth={2.4} />
      </button>
    </>
  );
}
