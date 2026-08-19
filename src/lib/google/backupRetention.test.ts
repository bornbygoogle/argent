// Retention policy for Drive backups.
//
// The old policy — keep the 5 newest — measured history in *edits*, not time:
// every edit uploads a snapshot, so five expenses entered in one evening
// pushed out every backup predating that evening. A mistake noticed the next
// morning was then unrecoverable. These cases pin the tiered policy that
// replaces it, and the ones that matter most are the two failure modes it must
// never have: never prune everything, and never lose the newest file.
//
// Several fixtures carry three "filler" files at the top. That is deliberate:
// the newest-3 tier would otherwise hold the entire fixture and the case would
// pass without exercising the daily/weekly tiers it claims to test.

import { describe, it, expect } from 'vitest';
import { selectBackupsToPrune } from '@/lib/google/backupRetention';
import type { DriveBackupMeta } from '@/lib/google/drive';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** A Drive file `ageMs` older than NOW. Name is deliberately unrelated to the
 *  timestamp — the policy must bucket on modifiedTime, never on the filename. */
function file(id: string, ageMs: number): DriveBackupMeta {
  return {
    id,
    name: `argent-backup-${id}.json`,
    modifiedTime: new Date(NOW.getTime() - ageMs).toISOString(),
  };
}

/** Three recent files, to absorb the newest-3 tier in cases testing older ones. */
const filler = () => [file('fill0', 0), file('fill1', HOUR), file('fill2', 2 * HOUR)];

const ids = (files: DriveBackupMeta[]) => files.map((f) => f.id).sort();

describe('selectBackupsToPrune', () => {
  it('prunes nothing when there are only a handful of backups', () => {
    expect(selectBackupsToPrune(filler(), NOW)).toEqual([]);
  });

  it('keeps the newest backups even when every file is older than the window', () => {
    // The user was away for three months. Every file falls outside the daily
    // and weekly tiers — pruning them all would leave zero backups on Drive,
    // which is the one outcome a retention policy must never produce.
    const files = [file('a', 90 * DAY), file('b', 91 * DAY), file('c', 92 * DAY), file('d', 93 * DAY)];
    expect(ids(selectBackupsToPrune(files, NOW))).toEqual(['d']);
  });

  it('collapses a burst of edits to the newest few, instead of losing history', () => {
    // Ten snapshots inside one hour — the exact scenario that used to destroy
    // every older backup. Only the 3 newest survive from the burst.
    const burst = Array.from({ length: 10 }, (_, i) => file(`burst${i}`, i * 60_000));
    const older = [file('yesterday', DAY), file('lastweek', 8 * DAY)];
    const pruned = selectBackupsToPrune([...burst, ...older], NOW);
    // The older tiers survive the burst — this is the whole point of the change.
    expect(ids(pruned)).not.toContain('yesterday');
    expect(ids(pruned)).not.toContain('lastweek');
    expect(ids(pruned)).toEqual(
      ['burst3', 'burst4', 'burst5', 'burst6', 'burst7', 'burst8', 'burst9'].sort(),
    );
  });

  it('keeps one backup per day across the last week', () => {
    // Two per day for six days; the newer of each pair must survive.
    const files = Array.from({ length: 6 }, (_, d) => [
      file(`d${d}-early`, d * DAY + 6 * HOUR),
      file(`d${d}-late`, d * DAY),
    ]).flat();
    const pruned = selectBackupsToPrune(files, NOW);
    for (let d = 0; d < 6; d++) expect(ids(pruned)).not.toContain(`d${d}-late`);
    // And the older half of each pair is dropped, once past the newest-3 tier.
    for (let d = 2; d < 6; d++) expect(ids(pruned)).toContain(`d${d}-early`);
  });

  it('keeps one backup per week beyond the daily window', () => {
    const files = [
      ...filler(),
      file('w1a', 9 * DAY),
      file('w1b', 10 * DAY),
      file('w2a', 16 * DAY),
      file('w2b', 17 * DAY),
    ];
    // One survivor per weekly bucket, the newest of each.
    expect(ids(selectBackupsToPrune(files, NOW))).toEqual(['w1b', 'w2b'].sort());
  });

  it('prunes backups older than the weekly window', () => {
    const files = [...filler(), file('ancient', 200 * DAY)];
    expect(ids(selectBackupsToPrune(files, NOW))).toEqual(['ancient']);
  });

  it('buckets on modifiedTime, not on the filename', () => {
    // A device in another timezone stamps names with its own local clock, so a
    // name-derived bucket would group these two wrongly. Both land in the same
    // day bucket; only the newer may survive.
    const files: DriveBackupMeta[] = [
      ...filler(),
      { id: 'x', name: 'argent-backup-2026-08-19T23-00.json', modifiedTime: new Date(NOW.getTime() - 10 * DAY).toISOString() },
      { id: 'y', name: 'argent-backup-2026-08-19T01-00.json', modifiedTime: new Date(NOW.getTime() - 10 * DAY - HOUR).toISOString() },
    ];
    expect(ids(selectBackupsToPrune(files, NOW))).toEqual(['y']);
  });

  it('never prunes the newest file, whatever the input order', () => {
    const files = [file('old', 40 * DAY), file('newest', 0), file('a', HOUR), file('b', 2 * HOUR)];
    const pruned = selectBackupsToPrune(files, NOW);
    expect(ids(pruned)).not.toContain('newest');
    expect(ids(pruned)).toContain('old');
  });

  it('keeps a file dated in the future rather than pruning it', () => {
    // Clock skew between devices is real; a future stamp must not be read as
    // infinitely old and deleted.
    const files = [file('future', -HOUR), ...filler(), file('old', 90 * DAY)];
    expect(ids(selectBackupsToPrune(files, NOW))).not.toContain('future');
  });

  it('returns whole file objects, so the caller can delete by id', () => {
    const ancient = file('b', 200 * DAY);
    expect(selectBackupsToPrune([...filler(), ancient], NOW)).toEqual([ancient]);
  });
});
