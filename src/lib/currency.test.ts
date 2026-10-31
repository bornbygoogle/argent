import { describe, it, expect } from 'vitest';
import * as currency from '@/lib/currency';

describe('removed currency exports', () => {
  it('no longer exports isCurated', () => {
    expect('isCurated' in currency).toBe(false);
  });
});
