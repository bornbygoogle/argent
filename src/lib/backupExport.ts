import { exportBackup, downloadBackup } from '@/lib/data';

/**
 * Export the whole database and hand it to the browser as a file download.
 * Resolves true on success, false on any failure, so a caller only has to
 * decide what to tell the user.
 */
export async function exportBackupToFile(): Promise<boolean> {
  try {
    downloadBackup(await exportBackup());
    return true;
  } catch {
    return false;
  }
}
