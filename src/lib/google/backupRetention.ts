// Which Drive backups to delete after a push.
//
// The policy this replaces kept the 5 newest files. Because a snapshot is
// uploaded a few seconds after *every* edit, those 5 files spanned the last
// five edits — minutes of history. A deletion or a bad sync noticed the next
// morning had already pushed every good snapshot out of the folder.
//
// So retention is tiered by *time* instead of by count. The file count barely
// moves (5 -> ~14) but the horizon goes from minutes to a month:
//
//   newest 3        — "undo the last thing", and the guard that stops this
//                     function ever emptying the folder
//   1 per day  x 7  — recover from something noticed a few days later
//   1 per week x 4  — recover from something noticed a few weeks later
//
// Buckets are derived from Drive's `modifiedTime`, never from the filename:
// `backupFileName` stamps the *local* clock of whichever device pushed, so two
// devices in different timezones would bucket the same instant differently and
// prune each other's files.

import type { DriveBackupMeta } from './drive';

/** Newest files kept unconditionally, whatever their age. */
export const KEEP_NEWEST = 3;
/** Days for which the newest backup of each day is kept. */
export const DAILY_DAYS = 7;
/** Weeks for which the newest backup of each week is kept. */
export const WEEKLY_WEEKS = 4;

const DAY_MS = 24 * 3600_000;

/**
 * Pick the backups that may be deleted, newest-first ordering applied
 * internally so the caller can pass Drive's list as-is.
 *
 * Returns the file objects themselves rather than ids, so the caller keeps the
 * name and timestamp for logging without a second lookup.
 */
export function selectBackupsToPrune(
  files: DriveBackupMeta[],
  now: Date = new Date(),
): DriveBackupMeta[] {
  const sorted = [...files].sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  const keep = new Set<string>();

  // Tier 1 — the newest few, unconditionally. This is also what guarantees the
  // folder is never emptied: after a long absence every file falls outside the
  // time tiers, and without this the function would delete all of them.
  for (const f of sorted.slice(0, KEEP_NEWEST)) keep.add(f.id);

  // Tiers 2 and 3 — the newest file of each recent day, then of each recent
  // week. `sorted` is newest-first, so the first file seen in a bucket is that
  // bucket's newest and the rest of the bucket falls through to be pruned.
  const seenDay = new Set<number>();
  const seenWeek = new Set<number>();
  for (const f of sorted) {
    const age = now.getTime() - Date.parse(f.modifiedTime);
    // A future timestamp (clock skew between devices) reads as a negative age;
    // clamp it into today's bucket rather than letting it match no tier and be
    // deleted for being "older" than everything.
    const days = Math.floor(Math.max(0, age) / DAY_MS);
    if (days < DAILY_DAYS) {
      if (!seenDay.has(days)) {
        seenDay.add(days);
        keep.add(f.id);
      }
      continue;
    }
    const week = Math.floor(days / 7);
    if (week < WEEKLY_WEEKS && !seenWeek.has(week)) {
      seenWeek.add(week);
      keep.add(f.id);
    }
  }

  return sorted.filter((f) => !keep.has(f.id));
}
