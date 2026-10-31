import { describe, it, expect } from 'vitest';
import { DAY_MS, addDays, addDaysISO, localDateOf, todayISO, utcDay } from '@/lib/date';

describe('localDateOf', () => {
  // The helper exists because iso.slice(0, 10) is the UTC date, which is a day
  // off near local midnight. Instants are built from local components so the
  // expectation holds in any timezone.
  it('returns the local calendar date late in the local day', () => {
    expect(localDateOf(new Date(2026, 0, 15, 23, 30).toISOString())).toBe('2026-01-15');
  });

  it('returns the local calendar date just after local midnight', () => {
    expect(localDateOf(new Date(2026, 0, 15, 0, 30).toISOString())).toBe('2026-01-15');
  });

  it('falls back to the first 10 characters for an unparseable string', () => {
    expect(localDateOf('not-a-date-at-all')).toBe('not-a-date');
  });
});

describe('addDays', () => {
  it('crosses a month boundary forwards', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a month boundary backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('has no leap day in a common year', () => {
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('leaves the date unchanged for 0 days', () => {
    expect(addDays('2026-05-17', 0)).toBe('2026-05-17');
  });
});

describe('utcDay', () => {
  it('is the UTC midnight of the date in ms', () => {
    expect(utcDay('2026-03-05')).toBe(Date.UTC(2026, 2, 5));
    expect(utcDay('2026-03-06') - utcDay('2026-03-05')).toBe(DAY_MS);
  });
});

describe('addDaysISO', () => {
  it('is today shifted by the offset', () => {
    for (const n of [-2, -1, 0]) {
      expect(addDaysISO(n)).toBe(addDays(todayISO(), n));
    }
  });
});
