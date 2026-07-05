# Google Drive Backup & Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sauvegarde Google" section to the Settings screen that lets a user sign in with Google, back their data up into a Drive folder they choose, and restore from a backup file they choose.

**Architecture:** Pure client-side (no backend). Google Identity Services (GIS) token client authorizes scope `drive.file`; the Google Drive Picker lets the user select a folder (save) or file (restore); Drive REST v3 (via `fetch`) uploads/downloads a single JSON. The app's existing `exportBackup()` / `parseBackupFile()` / `importBackup()` in `src/lib/data.ts` remain the single source of truth for serialization — the Google layer only transports that JSON. Google scripts are injected lazily on first use, so there are **no new npm dependencies**.

**Tech Stack:** React 18 + TypeScript + Vite + VitePWA, Dexie (IndexedDB), i18next (fr/en). External (runtime-injected): Google Identity Services (`gsi/client`), Google Picker (`picker.js`), Google Drive REST v3.

## Global Constraints

(From the approved spec `docs/superpowers/specs/2026-07-03-google-drive-sync-design.md`. Every task's requirements implicitly include these.)

- **No backend.** Data lives in IndexedDB via Dexie. Cloud storage = the user's own Google Drive.
- **No new npm runtime dependencies.** Google SDKs are injected at runtime via `<script>` tags (see `loadScripts.ts`). Do not `npm install` anything.
- **OAuth scope is exactly `https://www.googleapis.com/auth/drive.file`.** The app may only touch files it created or that the user explicitly picks. Never request broader scopes.
- **Reuse serialization.** Do not reimplement backup/restore logic — call `exportBackup`, `parseBackupFile`, `importBackup` from `src/lib/data.ts`.
- **i18n: every user-facing string in BOTH** `src/locales/fr/common.json` and `src/locales/en/common.json`.
- **Two credentials are required** (public, frontend-embedded by nature): `VITE_GOOGLE_CLIENT_ID` (OAuth Web client) and `VITE_GOOGLE_API_KEY` (browser-restricted API key — the Picker requires a developer key).
- **Quality gate per task:** `npm run typecheck` must finish clean. This project has **no test runner** (established pattern: typecheck + manual verification). Google-API-coupled code is verified via the manual checklist in Task 11, not unit tests. Keep pure helpers pure so they are trivially testable later.
- **No git in this repo.** "Commit" steps are checkpoints — run the typecheck; commit only if git has been initialized.

## File Structure

New files (each one responsibility):

| File | Responsibility |
|---|---|
| `.env.example` | Documents the two required `VITE_GOOGLE_*` vars (committed). |
| `src/vite-env.d.ts` (modify) | Types `import.meta.env.VITE_GOOGLE_*`. |
| `src/lib/google/env.ts` | Reads credentials + scope; `isGoogleConfigured()`. |
| `src/lib/google/loadScripts.ts` | Lazy, de-duping injection of `gsi/client` + `picker.js`. |
| `src/lib/google/google.d.ts` | Minimal ambient typings for the vendor SDKs. |
| `src/lib/google/auth.ts` | GIS token client: `requestAccessToken`, `revokeAccessToken`, `fetchDriveUser`. |
| `src/lib/google/drive.ts` | Drive REST: `uploadBackupToFolder`, `downloadBackupFile`, + pure `backupFileName`. |
| `src/lib/google/picker.ts` | Picker: `pickFolder`, `pickFile`. |
| `src/hooks/useGoogleAuth.ts` | React state: configured, status, email, busy, `getToken`, `signOut`. |
| `src/features/settings/GoogleSync.tsx` | The Settings section UI (sign-in, status, back up, restore, confirm, sign-out). |
| `docs/google-setup.md` | Step-by-step Google Cloud setup for the app owner. |

Modified files:
- `src/features/settings/Settings.tsx` — render `<GoogleSync />` in a new section; update the now-stale "fictional cloud" comment.
- `src/locales/fr/common.json`, `src/locales/en/common.json` — new keys.
- `docs/superpowers/specs/2026-07-03-google-drive-sync-design.md` — add the API-key prerequisite (keep spec & plan consistent).

---

### Task 1: Config foundation & env typing

**Files:**
- Create: `.env.example`
- Create: `src/lib/google/env.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Produces: `GOOGLE_CLIENT_ID: string`, `GOOGLE_API_KEY: string`, `DRIVE_FILE_SCOPE: string`, `isGoogleConfigured(): boolean` from `@/lib/google/env`.

- [ ] **Step 1: Create `.env.example`**

```
# Google Drive backup/restore (Settings → Sauvegarde Google).
# Both values come from ONE Google Cloud project (see docs/google-setup.md).
# These are PUBLIC client credentials — they ship in the browser bundle by design;
# restrict them in Google Cloud to your authorized origins (Client ID) and HTTP
# referrers (API key).
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_API_KEY=
```

- [ ] **Step 2: Augment Vite env types in `src/vite-env.d.ts`**

Replace the file's single line with:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Create `src/lib/google/env.ts`**

```ts
// Reads Google Cloud credentials from Vite env. These are *public* client
// credentials (OAuth Client ID + browser API key) — they ship in the bundle by
// design and are secured via authorized origins/referrers in Google Cloud.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

/** OAuth scope: the app may only touch files it created or the user picks. */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const GOOGLE_CLIENT_ID = CLIENT_ID;
export const GOOGLE_API_KEY = API_KEY;

/** True only when both credentials are present (feature is usable). */
export const isGoogleConfigured = (): boolean =>
  CLIENT_ID.trim().length > 0 && API_KEY.trim().length > 0;
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If `tsc` complains it cannot find the new file, ensure `tsconfig.app.json` includes `src` (it does by default).

- [ ] **Step 5: Checkpoint**

Create a real `.env` (not committed) with your own values when you have them; for now `.env.example` documents the contract. Commit if using git.

---

### Task 2: Lazy Google-script loader

**Files:**
- Create: `src/lib/google/loadScripts.ts`

**Interfaces:**
- Produces: `loadGsi(): Promise<void>`, `loadPicker(): Promise<void>` from `@/lib/google/loadScripts`.

- [ ] **Step 1: Create `src/lib/google/loadScripts.ts`**

```ts
// Lazy, de-duping loader for the two Google scripts we need. Scripts are only
// injected the first time a Google action is used, so users who never open the
// feature pay zero cost.

const gsiUrl = 'https://accounts.google.com/gsi/client';
const pickerUrl = 'https://apis.google.com/js/picker.js';

const cache = new Map<string, Promise<void>>();

function inject(url: string): Promise<void> {
  const existing = cache.get(url);
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    const found = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
    if (found) {
      found.addEventListener('load', () => resolve());
      found.addEventListener('error', () => reject(new Error(`google-script-load-failed:${url}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`google-script-load-failed:${url}`));
    document.head.appendChild(s);
  });

  cache.set(url, p);
  return p;
}

export function loadGsi(): Promise<void> {
  return inject(gsiUrl);
}

export function loadPicker(): Promise<void> {
  return inject(pickerUrl);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 3: Ambient typings for the Google SDKs

**Files:**
- Create: `src/lib/google/google.d.ts`

**Interfaces:**
- Produces (global): `Window.google?: GoogleGlobal`, plus the `GoogleGlobal` / `TokenClient` / `PickerBuilder` / `DocsView` / `PickerResponseData` / `PickerDocument` types used by `auth.ts` and `picker.ts`.

- [ ] **Step 1: Create `src/lib/google/google.d.ts`**

```ts
// Minimal ambient typings for the Google Identity Services + Picker SDKs
// (loaded at runtime via loadScripts.ts). Only the members we touch are typed.

declare global {
  interface Window {
    google?: GoogleGlobal;
  }

  interface GoogleGlobal {
    accounts: {
      oauth2: {
        initTokenClient: (config: TokenClientConfig) => TokenClient;
        revoke: (token: string, done?: () => void) => void;
      };
    };
    picker?: {
      PickerBuilder: new () => PickerBuilder;
      ViewId: { FOLDERS: string; DOCS: string };
      Response: { ACTION: 'action'; DOCUMENTS: 'docs' };
      Action: { PICKED: 'picked'; CANCEL: 'cancel' };
      DocsView: new (viewId?: string) => DocsView;
      DocsViewMode: { GRID: 'grid'; LIST: 'list' };
    };
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (resp: { error: string }) => void;
  }

  interface TokenResponse {
    access_token?: string;
    expires_in?: string;
    error?: string;
    error_description?: string;
  }

  interface TokenClient {
    requestAccessToken: (override?: { prompt?: string }) => void;
  }

  interface PickerDocument {
    id: string;
    name: string;
  }

  interface PickerResponseData {
    [key: string]: unknown;
    action?: string;
    docs?: PickerDocument[];
  }

  interface PickerBuilder {
    setOAuthToken: (token: string) => PickerBuilder;
    setDeveloperKey: (key: string) => PickerBuilder;
    addView: (view: unknown) => PickerBuilder;
    setCallback: (cb: (data: PickerResponseData) => void) => PickerBuilder;
    setTitle: (title: string) => PickerBuilder;
    build: () => { setVisible: (v: boolean) => void };
  }

  interface DocsView {
    setIncludeFolders: (v: boolean) => DocsView;
    setSelectFolderEnabled: (v: boolean) => DocsView;
    setMimeTypes: (m: string) => DocsView;
    setMode: (m: string) => DocsView;
  }
}

export {};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 4: Auth module (GIS token client)

**Files:**
- Create: `src/lib/google/auth.ts`

**Interfaces:**
- Consumes: `GOOGLE_CLIENT_ID`, `DRIVE_FILE_SCOPE` from `@/lib/google/env`; `loadGsi` from `@/lib/google/loadScripts`.
- Produces: `requestAccessToken(): Promise<string>`, `revokeAccessToken(token: string): void`, `fetchDriveUser(token: string): Promise<DriveUser>`.

- [ ] **Step 1: Create `src/lib/google/auth.ts`**

```ts
// Google Identity Services token client wrapper. Returns a short-lived
// access_token authorised for drive.file. A fresh token is requested per
// action; the token is never persisted.

import { GOOGLE_CLIENT_ID, DRIVE_FILE_SCOPE } from './env';
import { loadGsi } from './loadScripts';

let tokenClient: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

async function ensureClient(): Promise<void> {
  await loadGsi();
  if (tokenClient || !window.google) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_FILE_SCOPE,
    callback: (resp: TokenResponse) => {
      if (!pending) return;
      if (resp.error || !resp.access_token) {
        pending.reject(new Error(resp.error || 'google-auth-failed'));
      } else {
        pending.resolve(resp.access_token);
      }
      pending = null;
    },
    error_callback: (err) => {
      if (!pending) return;
      pending.reject(new Error(err.error || 'google-auth-error'));
      pending = null;
    },
  });
}

/** Open the Google consent popup and resolve with an access_token. */
export async function requestAccessToken(): Promise<string> {
  await ensureClient();
  if (!tokenClient) throw new Error('google-sdk-unavailable');
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient!.requestAccessToken();
  });
}

/** Best-effort revoke of a granted token — used on sign-out. */
export function revokeAccessToken(token: string): void {
  window.google?.accounts.oauth2.revoke(token, () => {});
}

export interface DriveUser {
  email: string | null;
  name: string | null;
}

/** Resolve the account's display info via the Drive `about` endpoint. */
export async function fetchDriveUser(token: string): Promise<DriveUser> {
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('google-about-failed');
  const json = (await res.json()) as { user?: { displayName?: string; emailAddress?: string } };
  return { name: json.user?.displayName ?? null, email: json.user?.emailAddress ?? null };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 5: Drive REST helpers

**Files:**
- Create: `src/lib/google/drive.ts`

**Interfaces:**
- Consumes: `BackupPayload` type from `@/lib/data`.
- Produces: `backupFileName(d?: Date): string`, `uploadBackupToFolder(folderId, payload, token): Promise<{id,name}>`, `downloadBackupFile(fileId, token): Promise<string>`.

- [ ] **Step 1: Create `src/lib/google/drive.ts`**

```ts
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
  const body = buildMultipart({ name: backupFileName(), parents: [folderId] }, JSON.stringify(payload));
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 6: Picker wrappers

**Files:**
- Create: `src/lib/google/picker.ts`

**Interfaces:**
- Consumes: `GOOGLE_API_KEY` from `@/lib/google/env`; `loadPicker` from `@/lib/google/loadScripts`; ambient `PickerBuilder`/`PickerResponseData` from `google.d.ts`.
- Produces: `Picked` type, `pickFolder(token, title): Promise<Picked | null>`, `pickFile(token, title): Promise<Picked | null>`.

- [ ] **Step 1: Create `src/lib/google/picker.ts`**

```ts
// Google Drive Picker wrappers. Returns the picked folder/file, or null if the
// user cancels.

import { GOOGLE_API_KEY } from './env';
import { loadPicker } from './loadScripts';

export interface Picked {
  id: string;
  name: string;
}

async function show(
  token: string,
  title: string,
  configure: (builder: PickerBuilder, g: NonNullable<Window['google']>) => void,
): Promise<Picked | null> {
  await loadPicker();
  const g = window.google;
  if (!g?.picker) throw new Error('google-picker-unavailable');

  return new Promise<Picked | null>((resolve) => {
    const builder = new g.picker!.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setTitle(title)
      .setCallback((data: PickerResponseData) => {
        const action = data[g.picker!.Response.ACTION];
        if (action === g.picker!.Action.PICKED) {
          const doc = data.docs?.[0];
          resolve(doc ? { id: doc.id, name: doc.name } : null);
        } else if (action === g.picker!.Action.CANCEL) {
          resolve(null);
        }
      });
    configure(builder, g);
    builder.build().setVisible(true);
  });
}

/** Let the user pick a Drive folder (to save the backup into). */
export function pickFolder(token: string, title: string): Promise<Picked | null> {
  return show(token, title, (builder, g) => {
    const view = new g.picker!.DocsView(g.picker!.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMode(g.picker!.DocsViewMode.GRID);
    builder.addView(view);
  });
}

/** Let the user pick a Drive file (a previously-saved backup to restore). */
export function pickFile(token: string, title: string): Promise<Picked | null> {
  return show(token, title, (builder, g) => {
    const view = new g.picker!.DocsView().setIncludeFolders(true).setMimeTypes('application/json');
    builder.addView(view);
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 7: `useGoogleAuth` hook

**Files:**
- Create: `src/hooks/useGoogleAuth.ts`

**Interfaces:**
- Consumes: `isGoogleConfigured` from `@/lib/google/env`; `requestAccessToken`, `revokeAccessToken`, `fetchDriveUser` from `@/lib/google/auth`.
- Produces: `UseGoogleAuth` ({ `configured`, `status`, `email`, `busy`, `getToken`, `signOut` }).

- [ ] **Step 1: Create `src/hooks/useGoogleAuth.ts`**

```ts
import { useCallback, useRef, useState } from 'react';
import { isGoogleConfigured } from '@/lib/google/env';
import { requestAccessToken, revokeAccessToken, fetchDriveUser } from '@/lib/google/auth';

const LS_EMAIL = 'argent.google.email';

export type GoogleAuthStatus = 'signed-out' | 'signed-in';

export interface UseGoogleAuth {
  configured: boolean;
  status: GoogleAuthStatus;
  email: string | null;
  busy: boolean;
  /** Request a token (+ ensure the account email is known). Returns the token. */
  getToken: () => Promise<string>;
  signOut: () => Promise<void>;
}

export function useGoogleAuth(): UseGoogleAuth {
  const configured = isGoogleConfigured();
  const lastToken = useRef<string | null>(null);
  const [email, setEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_EMAIL);
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);

  const getToken = useCallback(async (): Promise<string> => {
    setBusy(true);
    try {
      const token = await requestAccessToken();
      lastToken.current = token;
      if (!email) {
        const user = await fetchDriveUser(token);
        if (user.email) {
          setEmail(user.email);
          try {
            localStorage.setItem(LS_EMAIL, user.email);
          } catch {
            /* ignore quota errors */
          }
        }
      }
      return token;
    } finally {
      setBusy(false);
    }
  }, [email]);

  const signOut = useCallback(async () => {
    if (lastToken.current) {
      revokeAccessToken(lastToken.current);
      lastToken.current = null;
    }
    try {
      localStorage.removeItem(LS_EMAIL);
    } catch {
      /* ignore */
    }
    setEmail(null);
  }, []);

  return {
    configured,
    status: email ? 'signed-in' : 'signed-out',
    email,
    busy,
    getToken,
    signOut,
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 8: `GoogleSync` UI component

**Files:**
- Create: `src/features/settings/GoogleSync.tsx`

**Interfaces:**
- Consumes: `useGoogleAuth` (Task 7); `pickFolder`, `pickFile` (Task 6); `uploadBackupToFolder`, `downloadBackupFile` (Task 5); `exportBackup`, `parseBackupFile`, `importBackup` from `@/lib/data`; UI primitives `Banner`, `Button`, `Sheet`, `TintedIcon` from `@/components/ui/*`; i18n keys `settings.google.*`, `settings.googleErrors.generic`, `common.cancel`.
- Produces: `GoogleSync` React component.

- [ ] **Step 1: Create `src/features/settings/GoogleSync.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Banner } from '@/components/ui/Banner';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { pickFolder, pickFile } from '@/lib/google/picker';
import { uploadBackupToFolder, downloadBackupFile } from '@/lib/google/drive';
import { exportBackup, parseBackupFile, importBackup } from '@/lib/data';

export function GoogleSync() {
  const { t } = useTranslation();
  const { configured, status, email, busy, getToken, signOut } = useGoogleAuth();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Stashed downloaded+validated backup text, awaiting destructive confirm.
  const [confirm, setConfirm] = useState<{ text: string } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setErr(t('settings.googleErrors.generic'));
      // eslint-disable-next-line no-console
      console.error('[GoogleSync]', e);
    }
  };

  const handleSignIn = () =>
    run(async () => {
      await getToken(); // establishes session + email
    });

  const handleBackup = () =>
    run(async () => {
      const token = await getToken();
      const folder = await pickFolder(token, t('settings.google.pickFolder'));
      if (!folder) return; // user cancelled the picker
      const payload = await exportBackup();
      const file = await uploadBackupToFolder(folder.id, payload, token);
      setInfo(t('settings.google.backupSuccess', { name: file.name }));
    });

  const handleRestorePick = () =>
    run(async () => {
      const token = await getToken();
      const file = await pickFile(token, t('settings.google.pickFile'));
      if (!file) return; // user cancelled
      const text = await downloadBackupFile(file.id, token);
      parseBackupFile(text); // validate before prompting — never confirm a bad file
      setConfirm({ text });
    });

  const handleRestoreConfirm = () =>
    run(async () => {
      if (!confirm) return;
      try {
        const payload = parseBackupFile(confirm.text);
        await importBackup(payload);
        location.reload();
      } finally {
        setConfirm(null);
      }
    });

  if (!configured) {
    return (
      <div className="card tight">
        <Banner tone="danger" icon="AlertCircle">
          {t('settings.google.notConfigured')}
        </Banner>
      </div>
    );
  }

  return (
    <div className="card tight">
      {err && (
        <div style={{ marginBottom: 8 }}>
          <Banner tone="danger" icon="AlertCircle">{err}</Banner>
        </div>
      )}
      {info && !err && (
        <div style={{ marginBottom: 8 }}>
          <Banner tone="success" icon="CheckCircle2">{info}</Banner>
        </div>
      )}

      {status === 'signed-out' ? (
        <div className="row">
          <TintedIcon hex="#4F46E5" icon="CloudUpload" variant="acct" />
          <span className="r-main">
            <span className="r-title">{t('settings.google.title')}</span>
            <span className="r-sub">{t('settings.google.signInHint')}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={handleSignIn} disabled={busy}>
            {t('settings.google.signIn')}
          </Button>
        </div>
      ) : (
        <>
          <div className="row">
            <TintedIcon hex="#10B981" icon="Cloud" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.title')}</span>
              <span className="r-sub">{t('settings.google.signedInAs', { email: email ?? '' })}</span>
            </span>
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <TintedIcon hex="#4F46E5" icon="Upload" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.backup')}</span>
              <span className="r-sub">{t('settings.google.backupHint')}</span>
            </span>
            <div style={{ flex: '0 0 100%', marginTop: 8 }}>
              <Button variant="secondary" full onClick={handleBackup} disabled={busy}>
                {t('settings.google.backupBtn')}
              </Button>
            </div>
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <TintedIcon hex="#10B981" icon="Download" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.restore')}</span>
              <span className="r-sub">{t('settings.google.restoreHint')}</span>
            </span>
            <div style={{ flex: '0 0 100%', marginTop: 8 }}>
              <Button variant="secondary" full onClick={handleRestorePick} disabled={busy}>
                {t('settings.google.restoreBtn')}
              </Button>
            </div>
          </div>

          <div className="row">
            <TintedIcon hex="#64748B" icon="LogOut" variant="acct" />
            <span className="r-main">
              <span className="r-title">{t('settings.google.signOut')}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => signOut()} disabled={busy}>
              {t('settings.google.signOutBtn')}
            </Button>
          </div>
        </>
      )}

      {/* Destructive restore confirm: replaces ALL local data. */}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={t('settings.google.restore')}>
        <div className="text-center" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
          <p className="body-sm" style={{ marginBottom: 16 }}>{t('settings.google.restoreConfirmHint')}</p>
          <div className="col gap-2">
            <Button variant="danger" full onClick={handleRestoreConfirm} disabled={busy}>
              {t('settings.google.restoreConfirmBtn')}
            </Button>
            <Button variant="secondary" full onClick={() => setConfirm(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (If a lucide icon name is not found by the `Icon` component — `CloudUpload`, `Cloud`, `Upload`, `Download`, `LogOut`, `AlertCircle`, `CheckCircle2` — swap to a name that exists; all listed are valid lucide-react exports.)

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 9: Integrate into Settings + i18n

**Files:**
- Modify: `src/features/settings/Settings.tsx`
- Modify: `src/locales/fr/common.json`
- Modify: `src/locales/en/common.json`

**Interfaces:**
- Consumes: `GoogleSync` (Task 8).

- [ ] **Step 1: Add the import in `src/features/settings/Settings.tsx`**

Add to the import block near the other `@/components/ui` imports (e.g. after the `Banner` import on line 12):

```ts
import { GoogleSync } from './GoogleSync';
```

- [ ] **Step 2: Render the section — insert AFTER the "Organization" section's closing `</section>` (after [Settings.tsx:271](src/features/settings/Settings.tsx#L271)) and BEFORE the "Data" section comment (line 273)**

Insert:

```tsx
        {/* Google Drive backup / restore (optional; needs VITE_GOOGLE_* creds). */}
        <section>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <span className="label">{t('settings.google.title')}</span>
          </div>
          <GoogleSync />
        </section>
```

- [ ] **Step 3: Update the now-stale "fictional cloud" comment in the Data section**

Replace the comment at [Settings.tsx:273-275](src/features/settings/Settings.tsx#L273-L275):

```tsx
        {/* Data — export / import / wipe. Local-first app, no cloud backend, so
            the mock's "Sauvegarder → Google Drive/iCloud" row is intentionally
            omitted (would be fictional). Export/Import exchange a JSON file. */}
```

with:

```tsx
        {/* Data — export / import / wipe. Local-first, no app server. Cloud
            backup/restore to the user's own Google Drive lives in its own
            section above (GoogleSync). Export/Import exchange a local JSON file. */}
```

- [ ] **Step 4: Add i18n keys — French**

In `src/locales/fr/common.json`, inside the existing `"settings": { ... }` object (add after the `"clearAll"`/`"clearError"` keys, keeping valid JSON — mind trailing commas), add these two sub-objects:

```json
    "google": {
      "title": "Sauvegarde Google",
      "signInHint": "Connectez votre compte Google pour sauvegarder sur Drive",
      "signIn": "Se connecter",
      "signedInAs": "Connecté : {{email}}",
      "backup": "Sauvegarder sur Drive",
      "backupHint": "Enregistrer une sauvegarde dans un dossier de votre choix",
      "backupBtn": "Sauvegarder",
      "restore": "Restaurer depuis Drive",
      "restoreHint": "Récupérer une sauvegarde depuis votre Drive",
      "restoreBtn": "Restaurer",
      "restoreConfirmHint": "Cela remplacera toutes les données locales par le contenu de cette sauvegarde. Action irréversible.",
      "restoreConfirmBtn": "Remplacer et restaurer",
      "signOut": "Se déconnecter",
      "signOutBtn": "Déconnexion",
      "pickFolder": "Choisir un dossier",
      "pickFile": "Choisir une sauvegarde",
      "notConfigured": "La sauvegarde Google n'est pas configurée sur cet appareil.",
      "backupSuccess": "Sauvegarde créée : {{name}}"
    },
    "googleErrors": {
      "generic": "Échec de l'opération Google — réessayez."
    }
```

- [ ] **Step 5: Add i18n keys — English (mirror)**

In `src/locales/en/common.json`, add the same structure inside its `"settings": { ... }`:

```json
    "google": {
      "title": "Google backup",
      "signInHint": "Connect your Google account to back up to Drive",
      "signIn": "Sign in",
      "signedInAs": "Signed in: {{email}}",
      "backup": "Back up to Drive",
      "backupHint": "Save a backup into a folder of your choice",
      "backupBtn": "Back up",
      "restore": "Restore from Drive",
      "restoreHint": "Pull a backup from your Drive",
      "restoreBtn": "Restore",
      "restoreConfirmHint": "This replaces all local data with the contents of this backup. This cannot be undone.",
      "restoreConfirmBtn": "Replace and restore",
      "signOut": "Sign out",
      "signOutBtn": "Sign out",
      "pickFolder": "Choose a folder",
      "pickFile": "Choose a backup",
      "notConfigured": "Google backup is not configured on this device.",
      "backupSuccess": "Backup created: {{name}}"
    },
    "googleErrors": {
      "generic": "Google operation failed — please retry."
    }
```

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: builds without errors; the new section compiles into the bundle.

- [ ] **Step 7: Checkpoint**

Commit if using git.

---

### Task 10: Google Cloud setup doc + keep spec consistent

**Files:**
- Create: `docs/google-setup.md`
- Modify: `docs/superpowers/specs/2026-07-03-google-drive-sync-design.md` (section 4 prerequisites — add the API key)

- [ ] **Step 1: Create `docs/google-setup.md`**

````markdown
# Google Cloud setup (one-time, app owner)

The Settings → "Sauvegarde Google" feature needs two public credentials from a single Google Cloud project. Both ship in the browser bundle by design — restrict them in Google Cloud.

## 1. Create the project
- https://console.cloud.google.com/ → create / select a project.

## 2. Enable APIs
- Enable **Google Drive API**.
- Enable **Google Picker API**.

## 3. OAuth consent screen
- User type **External** (or Internal if you have a Workspace).
- Add scope `https://www.googleapis.com/auth/drive.file`.
- Add yourself as a **test user** while in Testing status.

## 4. OAuth Client ID
- Credentials → Create credentials → **OAuth client ID** → **Web application**.
- **Authorized JavaScript origins**: your production origin(s) + `http://localhost:5173` for dev.
- Copy the **Client ID** → `.env` as `VITE_GOOGLE_CLIENT_ID`.

## 5. API key (for the Picker)
- Credentials → Create credentials → **API key**.
- **Application restrictions**: HTTP referrers → add your production origin(s) + `http://localhost:5173/*`.
- **API restrictions**: restrict to **Google Drive API** + **Google Picker API**.
- Copy the key → `.env` as `VITE_GOOGLE_API_KEY`.

## 6. Local `.env` (not committed)
```
VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=<your-api-key>
```

Restart `npm run dev` after creating `.env`.
````

- [ ] **Step 2: Update the spec's prerequisites to include the API key**

In `docs/superpowers/specs/2026-07-03-google-drive-sync-design.md`, find section **4. Prérequis externes**, step 5. Replace:

```markdown
5. Injecter le **Client ID** dans l'app via la variable d'environnement Vite : `VITE_GOOGLE_CLIENT_ID`.
   - Ajouter `.env` (ignoré par git) + `.env.example` (commité, avec valeur vide + commentaire).
```

with:

```markdown
5. Injecter les credentials via Vite : `VITE_GOOGLE_CLIENT_ID` (OAuth) **et** `VITE_GOOGLE_API_KEY` (clé navigateur requise par le Picker).
   - Ajouter `.env` (local) + `.env.example` (commité). Procédure détaillée dans `docs/google-setup.md`.
```

- [ ] **Step 3: Checkpoint**

Commit if using git.

---

### Task 11: End-to-end manual verification

**Files:** none (verification only — requires the Google Cloud setup from Task 10 to be done, and a real `.env`).

**Prerequisite:** `.env` contains valid `VITE_GOOGLE_CLIENT_ID` + `VITE_GOOGLE_API_KEY`, and `npm run dev` has been restarted.

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`
Open: `http://localhost:5173`

- [ ] **Step 2: Verify the section renders**

Navigate to **Settings**. A new "Sauvegarde Google" section appears between "Organisation" and "Données", showing a "Se connecter" row.

- [ ] **Step 3: Sign-in flow**

Tap "Se connecter" → Google consent popup opens (scope: "voir, modifier et créer des fichiers dans votre Google Drive qu'elle a ouverts ou créés"). Approve → row updates to show "Connecté : <votre email>" + Sauvegarder / Restaurer / Déconnexion.

- [ ] **Step 4: Backup flow**

Add/confirm a transaction (so there is data). Tap "Sauvegarder" → Google Picker opens in folder mode → pick a folder → success banner "Sauvegarde créée : argent-backup-<ts>.json". Verify the file exists in that Drive folder (drive.google.com).

- [ ] **Step 5: Restore flow**

Tap "Restaurer" → Picker opens in file mode (JSON) → pick the file just created → confirm sheet appears → "Remplacer et restaurer" → page reloads → data restored.

- [ ] **Step 6: Error paths**

- Deny the consent popup → error banner, stays signed-out.
- Pick a non-backup JSON file (if shown) → `parseBackupFile` throws → error banner (no confirm sheet).
- Sign out → returns to the signed-out row; the cached email is cleared.

- [ ] **Step 7: Final build gate**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 8: Checkpoint**

Feature complete. Commit if using git; update the memory note's status to "shipped" (`memory/google-drive-sync-plan.md`).
