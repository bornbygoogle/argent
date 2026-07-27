import { Navigate, Outlet, useLocation } from 'react-router';
import { useSettings } from '@/store/SettingsContext';

/** Shown while settings are being read — routing cannot be decided before then,
 *  and flashing the wrong screen is worse than a moment of nothing. */
function Loading() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="animate-spin"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '3px solid var(--neutral-200)',
          borderTopColor: 'var(--primary-600)',
        }}
      />
    </div>
  );
}

/** Forces /onboarding until the user completes first-launch. */
export function OnboardingGuard() {
  const { ready, settings } = useSettings();
  const location = useLocation();

  if (!ready) return <Loading />;

  if (!settings.hasOnboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

/**
 * The other half of the guard: keeps an onboarded user *out* of the wizard.
 *
 * Finishing onboarding creates an account and rewrites the last-used account,
 * so re-entering it leaves a duplicate account behind. A bookmark, a stale
 * link or browser autocomplete is enough to land there, so the route refuses
 * rather than relying on the user not to arrive.
 *
 * Wiping all data resets `hasOnboarded`, which is the supported way back in.
 */
export function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { ready, settings } = useSettings();

  if (!ready) return <Loading />;
  if (settings.hasOnboarded) return <Navigate to="/" replace />;

  return <>{children}</>;
}
