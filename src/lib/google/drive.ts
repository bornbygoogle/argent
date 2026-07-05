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
  if (!res.ok) {
    // Surface Google's real status + error body instead of an opaque string.
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(`google-upload-failed (${res.status}) ${detail}`);
  }
  return (await res.json()) as { id: string; name: string };
}

/** Download a file's text content (used to restore a chosen backup). */
export async function downloadBackupFile(fileId: string, token: string): Promise<string> {
  const res = await fetch(`${DRIVE_FILES}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`google-download-failed (${res.status}) ${detail}`);
  }
  return res.text();
}

export interface DriveBackupMeta {
  id: string;
  name: string;
  modifiedTime: string;
}

/** List our timestamped backup files inside a folder, newest first. */
export async function listBackupsInFolder(
  folderId: string,
  token: string,
): Promise<DriveBackupMeta[]> {
  const q = `'${folderId}' in parents and trashed = false and name contains 'argent-backup-'`;
  const url =
    `${DRIVE_FILES}?q=${encodeURIComponent(q)}` +
    `&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`google-list-failed (${res.status}) ${detail}`);
  }
  const json = (await res.json()) as { files?: DriveBackupMeta[] };
  return json.files ?? [];
}

/** Delete a file by id (used to prune backups older than the keep-last-5). */
export async function deleteFile(fileId: string, token: string): Promise<void> {
  const res = await fetch(`${DRIVE_FILES}/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 204 = deleted. 404 = already gone (treat as success — idempotent prune).
  if (!res.ok && res.status !== 404) {
    throw new Error(`google-delete-failed (${res.status})`);
  }
}

/** Find a folder by name. Under `drive.file`, only app-created folders match. */
export async function findFolderByName(
  name: string,
  token: string,
): Promise<{ id: string } | null> {
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`;
  const url = `${DRIVE_FILES}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`google-find-folder-failed (${res.status}) ${detail}`);
  }
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0] ?? null;
}

/** Create a folder at the root of My Drive. Returns its id. */
export async function createFolder(name: string, token: string): Promise<{ id: string }> {
  const res = await fetch(`${DRIVE_FILES}?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`google-create-folder-failed (${res.status}) ${detail}`);
  }
  return (await res.json()) as { id: string };
}
