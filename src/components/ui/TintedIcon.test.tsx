import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TintedIcon } from '@/components/ui/TintedIcon';

/**
 * The tile used to parse its colour with parseInt, so it could only ever be
 * given a literal hex. That is why ~30 call sites hardcode cold-slate values
 * the "Ink & Signal" re-skin never reached: passing a token was impossible,
 * not an oversight. It now takes any CSS colour, so theme-aware tokens work
 * and a user's stored category hex keeps working unchanged.
 */
describe('TintedIcon', () => {
  const tile = (el: HTMLElement) => el.querySelector('span')!;

  it('still accepts a stored category hex', () => {
    const { container } = render(<TintedIcon color="#2F8F62" icon="Wallet" />);

    expect(tile(container).style.getPropertyValue('--tint')).toBe('#2F8F62');
  });

  it('accepts a theme token, so the tint follows light and dark', () => {
    const { container } = render(<TintedIcon color="var(--neutral-500)" icon="Wallet" />);

    expect(tile(container).style.getPropertyValue('--tint')).toBe('var(--neutral-500)');
  });

  it('keeps the tint translucent so the icon stays legible on it', () => {
    const { container } = render(<TintedIcon color="var(--neutral-500)" icon="Wallet" alpha={0.12} />);

    expect(tile(container).style.getPropertyValue('--tint-a')).toBe('12%');
  });
});
