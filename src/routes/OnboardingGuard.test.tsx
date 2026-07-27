import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { OnboardingGuard, OnboardingRoute } from '@/routes/OnboardingGuard';

// The real provider seeds the database, applies the theme and drives i18n.
// None of that decides routing, so the guard is tested against the one input
// that does.
const state = vi.hoisted(() => ({ ready: true, hasOnboarded: true }));
vi.mock('@/store/SettingsContext', () => ({
  useSettings: () => ({ ready: state.ready, settings: { hasOnboarded: state.hasOnboarded } }),
}));

beforeEach(() => {
  state.ready = true;
  state.hasOnboarded = true;
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/onboarding"
          element={
            <OnboardingRoute>
              <div>wizard</div>
            </OnboardingRoute>
          }
        />
        <Route element={<OnboardingGuard />}>
          <Route path="/" element={<div>dashboard</div>} />
          <Route path="/budget" element={<div>budget</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('OnboardingGuard', () => {
  it('sends a user who has not onboarded to the wizard', () => {
    state.hasOnboarded = false;
    renderAt('/budget');
    expect(screen.getByText('wizard')).toBeInTheDocument();
  });

  it('lets an onboarded user through to the app', () => {
    renderAt('/budget');
    expect(screen.getByText('budget')).toBeInTheDocument();
  });

  it('shows neither screen until settings are read', () => {
    state.ready = false;
    renderAt('/budget');
    expect(screen.queryByText('budget')).not.toBeInTheDocument();
    expect(screen.queryByText('wizard')).not.toBeInTheDocument();
  });
});

describe('OnboardingRoute', () => {
  it('shows the wizard to a user who has not onboarded', () => {
    state.hasOnboarded = false;
    renderAt('/onboarding');
    expect(screen.getByText('wizard')).toBeInTheDocument();
  });

  // Re-running the wizard creates a second account and rewrites the last-used
  // account, so a stray link or a bookmark must not be able to reach it.
  it('sends an already-onboarded user to the dashboard instead of re-running setup', () => {
    renderAt('/onboarding');
    expect(screen.queryByText('wizard')).not.toBeInTheDocument();
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('waits for settings before deciding', () => {
    state.ready = false;
    renderAt('/onboarding');
    expect(screen.queryByText('wizard')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  });
});
