// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { IncomeTypes } from '@/features/incomeTypes/IncomeTypes';
import { db } from '@/db/db';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.incomeTypes.add({ id: 'it-1', key: 'custom-1', label: 'Salaire', order: 0 });
  await db.incomeSubtypes.add({ id: 'is-1', incomeTypeKey: 'custom-1', name: 'Bonus', sortOrder: 0 });
});

describe('IncomeTypes — edit sheet preview', () => {
  it('separates the label from its sub-type in the income type preview title', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <IncomeTypes />
      </MemoryRouter>,
    );

    await user.click(await screen.findByText('Salaire'));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.querySelector('.r-title')?.textContent).toBe('Salaire (Bonus)');
    });
    expect(within(dialog).queryByText('Salaire(Bonus)')).not.toBeInTheDocument();
  });
});
