import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

const createAccount = vi.fn();
const update = vi.fn();
const setScope = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/accounts', () => ({ createAccount: (...a: unknown[]) => createAccount(...a) }));
vi.mock('@/store/SettingsContext', () => ({ useSettings: () => ({ update }) }));
vi.mock('@/store/AccountScopeContext', () => ({ useAccountScope: () => ({ setScope }) }));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

import { Onboarding } from '@/features/onboarding/Onboarding';

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  createAccount.mockReset();
  update.mockReset();
  setScope.mockReset();
  navigate.mockReset();
  createAccount.mockResolvedValue('acc-1');
});

/** Render, reach step 1, optionally type a name and a balance, press Create. */
async function submit(balance: string, name?: string) {
  const user = userEvent.setup();
  render(<Onboarding />);
  await user.click(screen.getByRole('button', { name: i18n.t('common.continue') }));
  if (name) await user.type(screen.getByPlaceholderText(i18n.t('onboarding.accountNamePlaceholder')), name);
  const input = screen.getByLabelText(i18n.t('onboarding.openingBalance'));
  if (balance) await user.type(input, balance);
  await user.click(screen.getByRole('button', { name: i18n.t('onboarding.create') }));
}

describe('Onboarding opening balance', () => {
  it.each(['1-2', '1,000,5', '-', ',', '1,2,3', '1.2.3', '--1', '1.2,3'])(
    'rejects the malformed amount %j without creating the account',
    async (bad) => {
      await submit(bad);

      expect(createAccount).not.toHaveBeenCalled();
      expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('onboarding.balanceInvalid'));
      expect(screen.getByRole('button', { name: i18n.t('onboarding.create') })).toBeEnabled();
    },
  );

  it.each([
    ['1250,50', 1250.5],
    ['1250.50', 1250.5],
    ['-12,5', -12.5],
    ['1,000', 1], // comma is the decimal separator: one, written with three decimals
    ['42', 42],
    ['0,05', 0.05],
  ])('stores %j exactly as %d', async (typed, expected) => {
    await submit(typed);

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    expect(createAccount.mock.calls[0][0].openingBalance).toBe(expected);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats an empty field as zero', async () => {
    await submit('');

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    expect(createAccount.mock.calls[0][0].openingBalance).toBe(0);
  });

  it('falls back to the translated account type label when the name is empty', async () => {
    await submit('10');

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    expect(createAccount.mock.calls[0][0].name).toBe(i18n.t('accountType.courant'));
  });

  it('re-enables the create button and tells the user when the write rejects', async () => {
    createAccount.mockRejectedValue(new Error('IDB write failed'));
    await submit('10');

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('onboarding.createFailed'));
    expect(screen.getByRole('button', { name: i18n.t('onboarding.create') })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
