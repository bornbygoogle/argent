import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SettingsProvider } from '@/store/SettingsContext';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { GoogleAuthProvider } from '@/store/GoogleAuthContext';
import { GoogleAutoBackup } from '@/components/GoogleAutoBackup';
import { OnboardingGuard } from '@/routes/OnboardingGuard';
import { RootLayout } from '@/routes/RootLayout';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Settings } from '@/features/settings/Settings';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { Statistics } from '@/features/statistics/Statistics';
import { MonthlyOverview } from '@/features/overview/MonthlyOverview';
import { Categories } from '@/features/categories/Categories';
import { IncomeTypes } from '@/features/incomeTypes/IncomeTypes';
import { Budget } from '@/features/budget/Budget';
import { Recurring } from '@/features/recurring/Recurring';
import { AddExpense } from '@/features/transactions/AddExpense';
import { AddIncome } from '@/features/transactions/AddIncome';
import { EditExpense } from '@/features/transactions/EditExpense';
import { MovementsList } from '@/features/transactions/MovementsList';
import { Transfer } from '@/features/transactions/Transfer';
import { Accounts } from '@/features/accounts/Accounts';
import { useCurrency } from '@/lib/currency';

function AppRoutes() {
  // Re-render the whole route tree when the active currency changes so every
  // formatted amount re-reads the live value (format helpers read a singleton).
  useCurrency();
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />

      <Route element={<OnboardingGuard />}>
        {/* Tab roots (persistent bottom nav) */}
        <Route element={<RootLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stats" element={<Statistics />} />
          <Route path="/overview" element={<MonthlyOverview />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Pushed screens (no bottom nav) */}
        <Route path="/add" element={<AddExpense />} />
        <Route path="/income" element={<AddIncome />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/transfer/:groupId" element={<Transfer />} />
        <Route path="/expenses" element={<MovementsList />} />
        <Route path="/expenses/:id" element={<EditExpense />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/income-types" element={<IncomeTypes />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Single phone-column shell for every route (tab roots + pushed + onboarding).
  return (
    <SettingsProvider>
      <GoogleAuthProvider>
        <BrowserRouter>
          <AccountScopeProvider>
            {/* Background Drive sync: auto-backup every ~5s + cross-device pull.
                Renders nothing; lives here so it can read db + the google context. */}
            <GoogleAutoBackup />
            <div className="stage">
              <div className="screen">
                <AppRoutes />
              </div>
            </div>
          </AccountScopeProvider>
        </BrowserRouter>
      </GoogleAuthProvider>
    </SettingsProvider>
  );
}
