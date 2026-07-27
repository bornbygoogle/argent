import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useGoBack } from '@/hooks/useGoBack';

function Screen({ fallback }: { fallback: string }) {
  const goBack = useGoBack(fallback);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <button type="button" onClick={goBack}>
        back
      </button>
      <button type="button" onClick={() => navigate('/add')}>
        to-add
      </button>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Screen fallback="/" />} />
        <Route path="/settings" element={<Screen fallback="/settings" />} />
        <Route path="/add" element={<Screen fallback="/settings" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const path = () => screen.getByTestId('path');

describe('useGoBack', () => {
  it('pops history when the user arrived from inside the app', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByText('to-add'));
    expect(path()).toHaveTextContent('/add');

    await user.click(screen.getByText('back'));

    expect(path()).toHaveTextContent('/');
  });

  it('goes to the fallback when the screen is the first entry in history', async () => {
    const user = userEvent.setup();
    // Deep link, PWA launch or refresh: there is nothing of ours behind this
    // entry, so popping would leave the app.
    renderAt('/add');

    await user.click(screen.getByText('back'));

    expect(path()).toHaveTextContent('/settings');
  });

  it('replaces rather than pushes, so back does not bounce onto the dead entry', async () => {
    const user = userEvent.setup();
    renderAt('/add');

    await user.click(screen.getByText('back'));
    expect(path()).toHaveTextContent('/settings');

    // The /add entry was replaced, so there is nothing to return to.
    await user.click(screen.getByText('back'));

    expect(path()).toHaveTextContent('/settings');
  });

  it('defaults the fallback to the dashboard', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/add']}>
        <Routes>
          <Route path="/" element={<Screen fallback="/" />} />
          {/* No explicit fallback — the hook should choose the dashboard. */}
          <Route path="/add" element={<DefaultScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('back'));

    expect(path()).toHaveTextContent('/');
  });
});

function DefaultScreen() {
  const goBack = useGoBack();
  const location = useLocation();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <button type="button" onClick={goBack}>
        back
      </button>
    </div>
  );
}
