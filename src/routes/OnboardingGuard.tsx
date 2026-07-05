import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSettings } from '@/store/SettingsContext';

/** Forces /onboarding until the user completes first-launch. */
export function OnboardingGuard() {
  const { ready, settings } = useSettings();
  const location = useLocation();

  if (!ready) {
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

  if (!settings.hasOnboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
