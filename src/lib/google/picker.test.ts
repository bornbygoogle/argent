import { describe, it, expect } from 'vitest';
import * as picker from './picker';

describe('removed picker exports', () => {
  it('no longer exports pickFile', () => {
    expect('pickFile' in picker).toBe(false);
  });
});
