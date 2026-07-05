import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/ui/BottomNav';
import { QuickActionSheet, type QuickAction } from '@/features/sheets/QuickActionSheet';

const ACTION_ROUTE: Record<QuickAction, string> = {
  expense: '/add',
  income: '/income',
  transfer: '/transfer',
};

/**
 * Tab-root layout. The `.stage > .screen` shell is provided once at the App
 * level, so here we only render the routed screen (via <Outlet/>, which yields
 * a `.topbar` + `.content`) plus the persistent bottom nav + global quick-action sheet.
 */
export function RootLayout() {
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <>
      <Outlet />
      <BottomNav onAdd={() => setQuickOpen(true)} />
      <QuickActionSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={(a) => navigate(ACTION_ROUTE[a])}
      />
    </>
  );
}
