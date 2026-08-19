import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import i18n from '@/i18n';
import { Sheet } from '@/components/ui/Sheet';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

/**
 * The sheet already stopped background scroll and closed on Escape, but it did
 * nothing about focus: it opened with focus still behind it, let Tab walk into
 * the page it was covering, and dropped focus at the document root on close.
 * For anyone driving this by keyboard or switch, an open modal was a layer you
 * could not reach and could not escape from in order.
 */
describe('Sheet', () => {
  const Harness = () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open the sheet</button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Category">
          <button type="button">First inside</button>
          <button type="button">Last inside</button>
        </Sheet>
      </>
    );
  };

  it('names itself, so it is not announced as an unlabelled dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the sheet' }));

    expect(screen.getByRole('dialog', { name: 'Category' })).toBeInTheDocument();
  });

  it('labels its close button in the active language', async () => {
    await i18n.changeLanguage('fr');
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the sheet' }));

    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('button', { name: 'Fermer' }));
  });

  it('moves focus to itself when it opens, not onto its close button', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the sheet' }));

    // Focusing the first control would put Enter on "close" the moment it opens.
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('wraps Tab from its last control back to its first, not out to the page', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the sheet' }));

    screen.getByRole('button', { name: 'Last inside' }).focus();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('wraps Shift+Tab from its first control back to its last', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the sheet' }));

    screen.getByRole('button', { name: 'Close' }).focus();
    await userEvent.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Last inside' })).toHaveFocus();
  });

  it('gives focus back to whatever opened it', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open the sheet' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');

    expect(opener).toHaveFocus();
  });
});
