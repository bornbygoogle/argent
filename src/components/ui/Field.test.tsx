import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from '@/components/ui/Field';

/**
 * Every text input in the app used to be labelled by its placeholder alone.
 * A placeholder vanishes the moment the user types, and it is not a reliable
 * accessible name — so the control had no name at all for a screen reader.
 * Field is the one place that association is made; these pin it.
 */
describe('Field', () => {
  it('gives the control it wraps an accessible name', () => {
    render(
      <Field label="Account name">
        <input className="input" />
      </Field>,
    );

    expect(screen.getByLabelText('Account name')).toHaveClass('input');
  });

  it('moves focus to the control when the visible label is clicked', async () => {
    render(
      <Field label="Account name">
        <input className="input" />
      </Field>,
    );

    await userEvent.click(screen.getByText('Account name'));

    expect(screen.getByLabelText('Account name')).toHaveFocus();
  });

  it('keeps the label visible, so it survives the user typing', async () => {
    render(
      <Field label="Account name">
        <input className="input" />
      </Field>,
    );

    await userEvent.type(screen.getByLabelText('Account name'), 'Courant');

    expect(screen.getByText('Account name')).toBeVisible();
  });
});
