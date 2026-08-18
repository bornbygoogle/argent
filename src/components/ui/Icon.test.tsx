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
});
