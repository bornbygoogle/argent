// Google Drive REST helpers (multipart upload + media download). The app only
// ever transports the existing BackupPayload JSON produced by lib/data.ts.

import type { BackupPayload } from '@/lib/data';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_FILES = 'https://www.googleapis.com/upload/drive/v3/files';

/** Timestamped filename, stable format: argent-backup-YYYY-MM-DDTHH-MM.json */
export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}`;
  return `argent-backup-${stamp}.json`;
}

/** Build a multipart/related body (metadata + JSON content) as a Blob. */
function buildMultipart(meta: Record<string, unknown>, content: string): Blob {
  const boundary = 'argent_' + Math.random().toString(36).slice(2);
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  // The Blob's type carries the boundary; do NOT set Content-Type in fetch headers.
  return new Blob([head, content, tail], { type: 'multipart/related; boundary=' + boundary });
}

/** Create a backup file inside the chosen folder. Returns Drive file id + name. */
export async function uploadBackupToFolder(
  folderId: string,
  payload: BackupPayload,
  token: string,
): Promise<{ id: string; name: string }> {
  const body = buildMultipart(
    { name: backupFileName(), parents: [folderId] },
    JSON.stringify(payload),
  );
  const res = await fetch(`${UPLOAD_FILES}?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error('google-upload-failed');
  return (await res.json()) as { id: string; name: string };
}

/** Download a file's text content (used to restore a chosen backup). */
export async function downloadBackupFile(fileId: string, token: string): Promise<string> {
  const res = await fetch(`${DRIVE_FILES}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('google-download-failed');
  return res.text();
}
