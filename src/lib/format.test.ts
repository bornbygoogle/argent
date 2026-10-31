import { describe, it, expect } from 'vitest';
import * as format from '@/lib/format';

describe('removed format exports', () => {
  it('no longer exports formatTime', () => {
    expect('formatTime' in format).toBe(false);
  });
});
