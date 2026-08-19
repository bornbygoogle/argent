import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from '@/components/ui/Icon';

/**
 * The icon map is curated by hand to keep the bundle small, so a name that is
 * not in it renders the CircleDashed fallback instead of failing — silently, and
 * only visible on screen. These pin the names whose absence would go unnoticed.
 */
describe('Icon', () => {
  it('renders the collapse chevron rather than the fallback', () => {
    const { container } = render(<Icon name="ChevronUp" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('chevron-up');
  });

  it('falls back to a placeholder for an unknown name', () => {
    const { container } = render(<Icon name="NotAnIcon" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('circle-dashed');
  });

  /**
   * Almost every icon here sits beside its own visible text label, so a screen
   * reader announcing it just repeats that label. Decorative is the sane
   * default; the standalone cases opt in to a name instead.
   */
  it('hides a decorative icon from the accessibility tree by default', () => {
    const { container } = render(<Icon name="Wallet" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names an icon that stands alone, and stops hiding it', () => {
    const { container } = render(<Icon name="Wallet" label="Accounts" />);
    const svg = container.querySelector('svg')!;

    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Accounts');
    expect(svg).not.toHaveAttribute('aria-hidden');
  });
});
