import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from '@/components/ui/TopBar';

/**
 * The screen's own name was a plain <div>, so no screen here had a level-1
 * heading and the heading outline started at whatever a card happened to use.
 * Some screens carry their name in the bar; the ones built around a hero carry
 * it only for assistive tech, which is what screenName is for.
 */
describe('TopBar', () => {
  it('makes a visible title the screen heading', () => {
    render(<TopBar title="Accounts" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
  });

  it('still names a screen whose design has no visible title', () => {
    render(<TopBar screenName="Home" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toHaveClass('sr-only');
  });

  it('does not announce the name twice when a title is shown', () => {
    render(<TopBar title="Accounts" screenName="Accounts" />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
})
