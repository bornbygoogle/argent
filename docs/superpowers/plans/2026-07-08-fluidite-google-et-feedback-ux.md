# Fluidité Google + Fiabilité & feedback UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google sign-in reconnect automatically on return, make backup/restore state always visible and never fail silently, and fix the reliability + feedback gaps found across the app.

**Architecture:** Extend the existing React 18 + Dexie PWA without rewriting it. Add four small isolated modules (toast store, toast UI, sync pill, silent-reconnect hook), extend the Google auth context with a `needsReconnect` state, and apply surgical fixes to existing screens. The background `GoogleAutoBackup` component is extended, not replaced — its `location.reload()` after a cross-device pull is removed in favour of Dexie's `useLiveQuery` auto-refresh.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Dexie 4 + dexie-react-hooks, react-router-dom 6, i18next, Google Identity Services + Drive REST (zero added npm deps), Tailwind (utilities only) + tokenised CSS design system.

## Global Constraints

- **No test runner exists.** `package.json` scripts are `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck` (`tsc -b --noEmit`). Every task's verification is `npm run typecheck` (must pass) plus a **targeted manual check** described in the task. Do NOT add a test framework — the spec (§9) mandates typecheck + build + manual verification.
- **Zero new npm dependencies.** Use only what is already installed.
- **Bilingual FR/EN.** Every user-facing string MUST have keys in BOTH `src/locales/fr/common.json` and `src/locales/en/common.json`. Never hardcode user-facing copy.
- **Design system is fixed.** Reuse existing CSS classes (`.banner`, `.card`, `.row`, `.topbar`, tokens like `var(--primary-600)`). Do not introduce a new visual language.
- **Path alias:** `@/` maps to `src/`. Use it in imports.
- **Touch targets ≥ 44px** for any interactive element touched by this plan.
- **Sign-in auto trigger condition (verbatim from spec §2):** email remembered in localStorage AND `db.accounts.count() > 0`. Otherwise nothing auto-triggers, ever.
- **Backup toast anti-spam (verbatim from spec §5.2):** the ~5s auto-push stays silent (no success toast). Only a manual backup, the first backup after a reconnect, and ALL errors emit a toast.
- **Commit after every task** with a conventional-commit message.

---

## Phase 1 — Toast system (foundation for all feedback)

### Task 1: Toast store (`ToastContext`)

**Files:**
- Create: `src/store/ToastContext.tsx`
- Modify: `src/App.tsx` (wrap tree in `ToastProvider`)

**Interfaces:**
- Produces:
  - `type ToastTone = 'success' | 'error' | 'info'`
  - `interface Toast { id: string; message: string; tone: ToastTone; duration: number }`
  - `interface ToastApi { success(msg: string, duration?: number): void; error(msg: string, duration?: number): void; info(msg: string, duration?: number): void; dismiss(id: string): void }`
  - `function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `function useToast(): ToastApi`
  - `function useToastList(): Toast[]` — read-only list for the container (Task 2 consumes it)

- [ ] **Step 1: Create the context + provider**

Create `src/store/ToastContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  duration: number;
}

export interface ToastApi {
  success: (msg: string, duration?: number) => void;
  error: (msg: string, duration?: number) => void;
  info: (msg: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION = 2500;
const MAX_TOASTS = 3;

const ToastListContext = createContext<Toast[] | null>(null);
const ToastApiContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, duration = DEFAULT_DURATION) => {
      // Counter-based id: Date.now()/Math.random() are fine at runtime, but a
      // monotonic counter guarantees uniqueness even for same-tick bursts.
      seq.current += 1;
      const id = `t${seq.current}`;
      setToasts((list) => [...list, { id, message, tone, duration }].slice(-MAX_TOASTS));
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, d) => push('success', m, d),
      error: (m, d) => push('error', m, d),
      info: (m, d) => push('info', m, d),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastApiContext.Provider value={api}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastApiContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastApiContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function useToastList(): Toast[] {
  const ctx = useContext(ToastListContext);
  if (!ctx) throw new Error('useToastList must be used within ToastProvider');
  return ctx;
}
```

- [ ] **Step 2: Mount the provider in `App.tsx`**

In `src/App.tsx`, add the import and wrap the tree. The provider goes just inside `BrowserRouter` so routed screens and the auto-backup component can both call `useToast()`.

Add import near the other store imports:

```tsx
import { ToastProvider } from '@/store/ToastContext';
```

Change the `App` render tree so it reads:

```tsx
export default function App() {
  return (
    <SettingsProvider>
      <GoogleAuthProvider>
        <BrowserRouter>
          <ToastProvider>
            <AccountScopeProvider>
              <GoogleAutoBackup />
              <div className="stage">
                <div className="screen">
                  <AppRoutes />
                </div>
              </div>
            </AccountScopeProvider>
          </ToastProvider>
        </BrowserRouter>
      </GoogleAuthProvider>
    </SettingsProvider>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). The provider is mounted but not yet consumed anywhere — that's fine.

- [ ] **Step 4: Commit**

```bash
git add src/store/ToastContext.tsx src/App.tsx
git commit -m "feat(toast): add global toast store + provider"
```

---

### Task 2: Toast UI (`ToastContainer`)

**Files:**
- Create: `src/components/ui/Toast.tsx`
- Modify: `src/index.css` (append `.toast-*` styles)
- Modify: `src/App.tsx` (render `<ToastContainer />` inside `.screen`)

**Interfaces:**
- Consumes: `useToastList()`, `useToast().dismiss` (Task 1); `Icon` from `@/components/ui/Icon`.
- Produces: `function ToastContainer(): JSX.Element`

- [ ] **Step 1: Create the container component**

Create `src/components/ui/Toast.tsx`:

```tsx
import { Icon } from '@/components/ui/Icon';
import { useToast, useToastList, type ToastTone } from '@/store/ToastContext';

const ICON: Record<ToastTone, string> = {
  success: 'CheckCircle2',
  error: 'AlertCircle',
  info: 'Info',
};

/** Fixed stack of ephemeral toasts, above the bottom nav, safe-area aware. */
export function ToastContainer() {
  const toasts = useToastList();
  const { dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast-${t.tone}`}
          onClick={() => dismiss(t.id)}
        >
          <Icon name={ICON[t.tone]} size={18} strokeWidth={2} />
          <span className="toast-msg">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Append the styles**

Append to `src/index.css` (end of file). It reuses the semantic tokens so dark mode flips automatically:

```css
/* ---------- Toasts ---------- */
.toast-stack{
  position:absolute; left:0; right:0;
  bottom:calc(96px + env(safe-area-inset-bottom));
  display:flex; flex-direction:column; align-items:center; gap:8px;
  padding:0 16px; z-index:60; pointer-events:none;
}
.toast{
  pointer-events:auto; display:flex; align-items:center; gap:10px;
  max-width:340px; width:auto; min-height:44px; padding:10px 14px;
  border-radius:var(--radius-md); box-shadow:var(--shadow-lg);
  background:var(--white); border:1px solid var(--neutral-200);
  color:var(--neutral-900); font-family:inherit; font-size:14px; font-weight:500;
  cursor:pointer; text-align:left;
}
.toast-msg{flex:1}
.toast-success{border-color:var(--success-500); color:var(--success-600)}
.toast-error{border-color:var(--danger-500); color:var(--danger-600)}
.toast-info{border-color:var(--primary-500); color:var(--primary-700)}
```

- [ ] **Step 3: Render the container in `App.tsx`**

In `src/App.tsx` add the import:

```tsx
import { ToastContainer } from '@/components/ui/Toast';
```

Place `<ToastContainer />` inside `.screen`, after `<AppRoutes />`:

```tsx
              <div className="screen">
                <AppRoutes />
                <ToastContainer />
              </div>
```

- [ ] **Step 4: Temporary smoke check**

Temporarily add a debug call to confirm rendering: in `src/features/dashboard/Dashboard.tsx`, import `useToast` and call `toast.success('test')` inside a `useEffect(() => { toast.success('test'); }, [])`. Run `npm run dev`, open the app — a green "test" toast should appear bottom-center and auto-dismiss after ~2.5s. **Then remove the debug code.**

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Toast.tsx src/index.css src/App.tsx
git commit -m "feat(toast): add ToastContainer UI + styles"
```

---

## Phase 2 — Google sign-in automatic reconnect

### Task 3: Extend `GoogleAuthContext` with `needsReconnect`

**Files:**
- Modify: `src/store/GoogleAuthContext.tsx`

**Interfaces:**
- Produces (added to `UseGoogleAuth`):
  - `needsReconnect: boolean`
  - `setNeedsReconnect: (v: boolean) => void`

- [ ] **Step 1: Add state + expose it**

In `src/store/GoogleAuthContext.tsx`:

Add to the `UseGoogleAuth` interface (after `clearRestoredJustNow`):

```tsx
  /** True when silent + auto-popup reconnect both failed; drives the reconnect banner/pill. */
  needsReconnect: boolean;
  /** Set/clear the reconnect-required flag (used by useSilentReconnect + signIn success). */
  setNeedsReconnect: (v: boolean) => void;
```

Inside `GoogleAuthProvider`, add the state (near the other `useState` calls):

```tsx
  const [needsReconnect, setNeedsReconnect] = useState(false);
```

In `signIn`, after `setActive(true);` (the success path), also clear the flag:

```tsx
      setActive(true);
      setNeedsReconnect(false);
```

In `signOut`, after `setActive(false);` add:

```tsx
      setNeedsReconnect(false);
```

Add `needsReconnect` and `setNeedsReconnect` to the `value` object and to the `useMemo` dependency array:

```tsx
      restoredJustNow,
      clearRestoredJustNow,
      needsReconnect,
      setNeedsReconnect,
    }),
    [
      configured, active, email, busy, signIn, signOut, syncStatus,
      reportBackupDone, reportBackupError, restoredJustNow, clearRestoredJustNow,
      needsReconnect,
    ],
```

(`setNeedsReconnect` is a stable setter — it does not need to be in the deps array.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/store/GoogleAuthContext.tsx
git commit -m "feat(google): expose needsReconnect state on auth context"
```

---

### Task 4: `useSilentReconnect` hook

**Files:**
- Create: `src/hooks/useSilentReconnect.ts`
- Modify: `src/App.tsx` (call the hook once)

**Interfaces:**
- Consumes: `useGoogleAuth()` → `{ configured, status, email, signIn, setNeedsReconnect }` (Task 3); `getCachedAccessToken`, `requestAccessToken` from `@/lib/google/auth`; `db` from `@/db/db`.
- Produces: `function useSilentReconnect(): void`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useSilentReconnect.ts`:

```ts
import { useEffect, useRef } from 'react';
import { db } from '@/db/db';
import { useGoogleAuth } from '@/store/GoogleAuthContext';
import { getCachedAccessToken, requestAccessToken } from '@/lib/google/auth';

/**
 * Boot-time reconnect orchestration (runs once per mount). State machine:
 *  [0] not configured / no remembered email / 0 accounts  → do nothing, ever.
 *  [1] valid cached token still on disk                    → context already flips active.
 *  [2] silent token (prompt:'')                            → invisible reconnect.
 *  [3] consent popup (prompt:'consent')                    → auto popup (often blocked).
 *  [4] both fail                                           → setNeedsReconnect(true) → banner/pill.
 *
 * The GoogleAuthProvider already flips `active` for case [1] via getCachedAccessToken.
 * This hook only needs to handle [2]→[4] when the session is NOT already active.
 */
export function useSilentReconnect(): void {
  const { configured, status, email, signIn, setNeedsReconnect } = useGoogleAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    // Case [0]: never auto-trigger without a remembered account hint.
    if (!configured || !email) return;
    // Already reconnected by the provider (case [1]) — nothing to do.
    if (status === 'signed-in') return;

    ran.current = true;

    void (async () => {
      // Strict trigger condition (spec §2): at least one configured account.
      const accountCount = await db.accounts.count();
      if (accountCount === 0) return;

      // [1] A live token may still exist on disk (belt-and-braces).
      if (getCachedAccessToken()) {
        // signIn() takes the silent-first path and flips active without a popup.
        try {
          await signIn();
          return;
        } catch {
          /* fall through to explicit attempts */
        }
      }

      // [2] Silent token via GIS cookie.
      try {
        await requestAccessToken({ prompt: '' });
        await signIn(); // now getCachedAccessToken() hits → active, no popup
        return;
      } catch {
        /* silent failed — try the popup */
      }

      // [3] Auto consent popup (frequently blocked on mobile).
      try {
        await requestAccessToken({ prompt: 'consent' });
        await signIn();
        return;
      } catch {
        // [4] Everything failed → surface the reconnect banner/pill.
        setNeedsReconnect(true);
      }
    })();
  }, [configured, email, status, signIn, setNeedsReconnect]);
}
```

> **Note on `signIn()` reuse:** `signIn` (context) already does silent-then-consent internally and sets `active` + clears `needsReconnect` on success. After a successful `requestAccessToken`, the token is cached, so the nested `signIn()` resolves via its silent path without a second popup.

- [ ] **Step 2: Call the hook in `App.tsx`**

The hook needs `GoogleAuthProvider` above it and can run anywhere in the tree. Add a tiny component so we can place the hook without cluttering `App`. In `src/App.tsx`, add:

```tsx
import { useSilentReconnect } from '@/hooks/useSilentReconnect';
```

Add a component near `AppRoutes`:

```tsx
function SilentReconnect() {
  useSilentReconnect();
  return null;
}
```

Render `<SilentReconnect />` next to `<GoogleAutoBackup />`:

```tsx
            <GoogleAutoBackup />
            <SilentReconnect />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. With Google configured and previously signed in (email in localStorage, ≥1 account):
1. Reload the page within the token TTL → you stay signed-in silently (check Settings → Google shows connected).
2. Simulate expiry: in devtools, `localStorage.removeItem('argent.google.token')` then reload → a silent/popup attempt runs; if blocked, no crash and `needsReconnect` becomes true (verified via the pill/banner in later tasks). No infinite loop, hook runs once.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSilentReconnect.ts src/App.tsx
git commit -m "feat(google): auto silent+popup reconnect on load via useSilentReconnect"
```

---

### Task 5: Reconnect banner on the Dashboard

**Files:**
- Modify: `src/features/dashboard/Dashboard.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: `useGoogleAuth()` → `{ needsReconnect, signIn, busy }`; existing `Banner` component.

- [ ] **Step 1: Add i18n keys**

In `src/locales/fr/common.json`, inside the existing `settings.google` object, add:

```json
      "reconnectBanner": "Sauvegarde en pause — reconnectez Google.",
      "reconnectBtn": "Reconnecter"
```

In `src/locales/en/common.json`, inside `settings.google`, add the same keys:

```json
      "reconnectBanner": "Backup paused — reconnect Google.",
      "reconnectBtn": "Reconnect"
```

- [ ] **Step 2: Render the banner on the Dashboard**

In `src/features/dashboard/Dashboard.tsx`:

Add to the `useGoogleAuth` destructure (add the import if not present: `import { useGoogleAuth } from '@/hooks/useGoogleAuth';`):

```tsx
  const { needsReconnect, signIn, busy: googleBusy } = useGoogleAuth();
  const [reconnectDismissed, setReconnectDismissed] = useState(false);
```

Inside the `.content` div, just after the existing offline banner block, add:

```tsx
        {needsReconnect && !reconnectDismissed && (
          <Banner
            tone="warn"
            icon="CloudOff"
            onDismiss={() => setReconnectDismissed(true)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {t('settings.google.reconnectBanner')}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void signIn()}
                disabled={googleBusy}
              >
                {t('settings.google.reconnectBtn')}
              </button>
            </span>
          </Banner>
        )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Force `needsReconnect` (e.g. temporarily default it to `true` in the context, or simulate a blocked reconnect). The warn banner appears on the Dashboard with a "Reconnecter" button; clicking it opens the Google popup (user gesture → reliable). The × dismisses it for the session. Revert any temporary forcing.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/Dashboard.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "feat(google): reconnect banner on dashboard when reconnect required"
```

---

## Phase 3 — Sync pill + backup fluidity

### Task 6: `SyncPill` in the Dashboard TopBar

**Files:**
- Create: `src/components/ui/SyncPill.tsx`
- Modify: `src/features/dashboard/Dashboard.tsx` (replace the dead `Bell` button)
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: `useGoogleAuth()` → `{ configured, status, syncStatus, needsReconnect, signIn }`; `useNavigate`; `Icon`.
- Produces: `function SyncPill(): JSX.Element | null`

- [ ] **Step 1: Add i18n keys**

In both locale files, inside `settings.google`, add an `pill` object.

FR (`src/locales/fr/common.json`):

```json
      "pill": {
        "synced": "Synchronisé",
        "syncing": "Synchronisation…",
        "paused": "Reconnexion requise",
        "error": "Erreur de sauvegarde"
      }
```

EN (`src/locales/en/common.json`):

```json
      "pill": {
        "synced": "Synced",
        "syncing": "Syncing…",
        "paused": "Reconnect required",
        "error": "Backup error"
      }
```

- [ ] **Step 2: Create the component**

Create `src/components/ui/SyncPill.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';

type PillState = 'synced' | 'syncing' | 'paused' | 'error';

const VISUAL: Record<PillState, { icon: string; color: string; spin?: boolean }> = {
  synced: { icon: 'CloudCheck', color: 'var(--success-600)' },
  syncing: { icon: 'RefreshCw', color: 'var(--primary-600)', spin: true },
  paused: { icon: 'CloudOff', color: 'var(--warning-600)' },
  error: { icon: 'CloudAlert', color: 'var(--danger-600)' },
};

/** Discrete Google-sync status pill for the Dashboard TopBar (replaces the dead bell). */
export function SyncPill() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { configured, status, syncStatus, needsReconnect, signIn } = useGoogleAuth();

  // Hidden when Google is not configured or the user is not signed in / not reconnecting.
  if (!configured) return null;
  if (status !== 'signed-in' && !needsReconnect) return null;

  let state: PillState;
  if (needsReconnect) state = 'paused';
  else if (syncStatus.backingUp) state = 'syncing';
  else if (syncStatus.lastError) state = 'error';
  else state = 'synced';

  const v = VISUAL[state];
  const onClick = () => {
    if (state === 'paused') void signIn();
    else navigate('/settings');
  };

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onClick}
      aria-label={t(`settings.google.pill.${state}`)}
      title={t(`settings.google.pill.${state}`)}
    >
      <Icon name={v.icon} size={22} color={v.color} className={v.spin ? 'spin' : undefined} />
    </button>
  );
}
```

> **Icon `className`/`color` support:** verify `src/components/ui/Icon.tsx` forwards `className` and `color` to the underlying lucide icon. If `Icon` does not accept `className`, wrap the icon in a `<span className={v.spin ? 'spin' : undefined}>` instead. Adjust in this step based on what `Icon.tsx` actually accepts.

- [ ] **Step 3: Add the spin animation to CSS**

Append to `src/index.css`:

```css
/* Spin utility for the syncing pill icon */
@keyframes spin{to{transform:rotate(360deg)}}
.spin{animation:spin 1s linear infinite}
```

- [ ] **Step 4: Wire it into the Dashboard TopBar**

In `src/features/dashboard/Dashboard.tsx`, add the import:

```tsx
import { SyncPill } from '@/components/ui/SyncPill';
```

Replace the dead bell button in the `TopBar right={...}` prop:

```tsx
        right={<SyncPill />}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run `npm run dev`:
- Google configured + signed in, idle → green `CloudCheck` pill; tap → navigates to Settings.
- Trigger a backup (edit a transaction, wait ~5s) → pill shows spinning `RefreshCw` briefly.
- Simulate `needsReconnect` → amber `CloudOff`; tap → opens Google popup.
- Not configured → no pill.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/SyncPill.tsx src/index.css src/features/dashboard/Dashboard.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "feat(google): sync status pill in dashboard topbar"
```

---

### Task 7: Backup toasts + remove brutal reload in `GoogleAutoBackup`

**Files:**
- Modify: `src/components/GoogleAutoBackup.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: `useToast()` (Task 1).

- [ ] **Step 1: Add i18n keys**

In both locale files, inside `settings.google`, add:

FR:

```json
      "toastBackedUp": "Sauvegardé sur Drive",
      "toastPulled": "Données synchronisées depuis Drive",
      "toastBackupFailed": "Échec de la sauvegarde Google",
      "toastPullFailed": "Échec de la synchronisation depuis Drive"
```

EN:

```json
      "toastBackedUp": "Backed up to Drive",
      "toastPulled": "Synced from Drive",
      "toastBackupFailed": "Google backup failed",
      "toastPullFailed": "Sync from Drive failed"
```

- [ ] **Step 2: Consume `useToast` + i18n in the component**

In `src/components/GoogleAutoBackup.tsx`, add imports:

```tsx
import { useTranslation } from 'react-i18next';
import { useToast } from '@/store/ToastContext';
```

Inside `GoogleAutoBackup()`, add near the top:

```tsx
  const { t } = useTranslation();
  const toast = useToast();
```

`pushOnce` needs to know whether it's a manual/first-post-reconnect push (toast) or a silent auto-push (no success toast). Change the manual-trigger plumbing so `pushOnce` accepts a `manual` flag:

Change the handler ref type and registration:

```tsx
  // Register the manual-trigger handler so requestBackupNow() runs immediately.
  useEffect(() => {
    backupNowHandler = () => pushOnce(true);
    return () => {
      backupNowHandler = null;
    };
  }, [pushOnce]);
```

Change `pushOnce` signature to `const pushOnce = useCallback(async (manual = false): Promise<void> => {` and:
- On success, only toast when `manual` is true:

```tsx
      reportBackupDone(at);
      if (manual) toast.success(t('settings.google.toastBackedUp'));
```

- In the `catch`, ALWAYS toast the error (this replaces the silent failure):

```tsx
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      reportBackupError(message);
      toast.error(t('settings.google.toastBackupFailed'));
      // eslint-disable-next-line no-console
      console.error('[google] backup failed:', message);
      if (e instanceof TypeError) lastSeen.current = null;
      throw e;
    }
```

Update the debounced auto-push call site (in the PUSH effect) to pass `false`:

```tsx
    timer.current = setTimeout(() => {
      void pushOnce(false);
    }, PUSH_DEBOUNCE_MS);
```

Add `toast` and `t` to the `pushOnce` `useCallback` dependency array:

```tsx
  }, [getValidAccessToken, reportBackupDone, reportBackupError, toast, t]);
```

- [ ] **Step 3: Remove the brutal reload in `pullOnce`, toast instead**

In `pullOnce`, replace the success tail. Change:

```tsx
      markRestoredJustNow();
      location.reload();
```

to:

```tsx
      markRestoredJustNow();
      // Dexie's useLiveQuery re-emits after importBackup rewrites the tables, so
      // the UI refreshes without a full page reload (spec §5.3). No location.reload().
      toast.info(t('settings.google.toastPulled'));
```

And in the `pullOnce` `catch`, replace the silent warn-only with a toast:

```tsx
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[google] auto-pull skipped:', e);
      toast.error(t('settings.google.toastPullFailed'));
    } finally {
```

Add `toast` and `t` to the `pullOnce` `useCallback` deps:

```tsx
  }, [getValidAccessToken, toast, t]);
```

> **Restore banner note:** the `restoredJustNow` sessionStorage flag + Settings banner still work; `markRestoredJustNow()` is retained so the Settings success banner shows on next visit. The reload removal means it now shows without a reload — that's fine (the banner is dismissable).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run `npm run dev` (two browsers / profiles signed into the same Google account for cross-device):
1. Edit data on device A → wait 5s → NO success toast (silent auto-push), pill spins then greens.
2. Settings → "Sauvegarder maintenant" → success toast "Sauvegardé sur Drive".
3. On device B, sign in → pull runs → data updates **without a full reload** + info toast "Données synchronisées depuis Drive".
4. Force a push failure (offline mid-backup) → error toast appears (no longer silent).

- [ ] **Step 6: Commit**

```bash
git add src/components/GoogleAutoBackup.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "feat(google): backup/restore toasts + drop brutal reload after pull"
```

---

## Phase 4 — Reliability fixes (the 3 blockers)

### Task 8: Fix Budget hydration + scope reset

**Files:**
- Modify: `src/features/budget/Budget.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Reset hydration when the account scope changes, and guard against premature hydration**

In `src/features/budget/Budget.tsx`:

The bug: `hydrated` never resets when `accountId` changes, and hydration runs even before the async `budget` for the new account has loaded (writing zeros). Fix both.

Replace the hydration effect and add a scope-reset effect. Change the existing effect (lines ~46-59) to key hydration on the account and only run once the budget query for THIS account has settled:

```tsx
  // Reset hydration whenever the scoped account changes, so the form re-hydrates
  // from the newly-loaded budget instead of keeping the previous account's values.
  useEffect(() => {
    setHydrated(false);
  }, [accountId]);

  useEffect(() => {
    if (hydrated || !accountId) return;
    // `budget` is `undefined` while the Dexie query is still loading for this
    // account, and `null` once it resolves to "no budget yet". Only hydrate once
    // it has resolved — otherwise we'd seed zeros and overwrite a real budget.
    if (budget === undefined) return;
    const b = budget ?? undefined;
    setMonthlyStr(b ? String(b.monthlyBudget) : '0');
    const lm: Record<string, string> = {};
    for (const c of categories) {
      const found = b?.categoryLimits.find((x) => x.categoryId === c.id);
      lm[c.id] = found?.limit != null ? String(found.limit) : '';
    }
    setLimits(lm);
    setThreshold(b?.warningThreshold.value ?? 80);
    setRollover(b?.rolloverEnabled ?? true);
    setHydrated(true);
  }, [budget, categories, accountId, hydrated]);
```

> **Verify `useBudget` return contract:** confirm in `src/hooks/selectors.ts` that `useBudget(accountId)` returns `undefined` while loading and `null`/the row once resolved (standard `useLiveQuery` behaviour: `undefined` until first emit). If it returns `null` while loading instead, adjust the guard to match. This guard is the crux of the fix — do not skip verifying it.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Create budgets on two accounts with different monthly amounts:
1. Open Budget on account A (e.g. 500) → shows 500.
2. Switch scope to account B (e.g. 1200) via the AccountChip → shows 1200 (NOT 500, NOT 0).
3. Switch back to A without editing → still 500, and saving does not zero it out.

- [ ] **Step 4: Commit**

```bash
git add src/features/budget/Budget.tsx
git commit -m "fix(budget): re-hydrate on scope change + guard against zero-overwrite"
```

---

### Task 9: Save error handling + anti-double-tap (TransactionForm & Transfer)

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`
- Modify: `src/features/transactions/Transfer.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: `useToast()` (Task 1).

- [ ] **Step 1: Add i18n keys**

In both locale files, inside the existing `form` object, add:

FR:

```json
    "saved": "Enregistré",
    "saveError": "L'enregistrement a échoué"
```

EN:

```json
    "saved": "Saved",
    "saveError": "Could not save"
```

- [ ] **Step 2: Guard `handleSave` in `TransactionForm`**

In `src/features/transactions/TransactionForm.tsx`:

Add imports:

```tsx
import { useToast } from '@/store/ToastContext';
```

Add near the top of the component:

```tsx
  const toast = useToast();
  const [saving, setSaving] = useState(false);
```

Replace `handleSave` with a guarded version:

```tsx
  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const payload = {
      amount,
      accountId,
      categoryId: isExpense ? categoryId || 'cat-autre' : undefined,
      incomeType: !isExpense ? incomeType : undefined,
      note,
      date,
    };
    try {
      if (transaction) {
        await updateTransaction(transaction.id, payload);
      } else {
        await addTransaction(kind, payload);
        update({ lastUsedAccountId: accountId });
      }
      toast.success(t('form.saved'));
      navigate(-1);
    } catch {
      setSaving(false);
      toast.error(t('form.saveError'));
    }
  };
```

Disable the OK button while saving. Change the OK button's `disabled` prop:

```tsx
              disabled={!canSave || saving}
```

- [ ] **Step 3: Guard `handleSave` in `Transfer` the same way**

In `src/features/transactions/Transfer.tsx`:

Add import:

```tsx
import { useToast } from '@/store/ToastContext';
```

Add near the top of the component (after the other hooks):

```tsx
  const toast = useToast();
  const [saving, setSaving] = useState(false);
```

Replace `handleSave`:

```tsx
  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const payload = { fromAccountId: fromId, toAccountId: toId, amount, date, note };
    try {
      if (groupId) {
        await updateTransfer(groupId, payload);
      } else {
        await addTransfer(payload);
        update({ lastUsedAccountId: fromId });
      }
      toast.success(t('form.saved'));
      navigate(-1);
    } catch {
      setSaving(false);
      toast.error(t('form.saveError'));
    }
  };
```

Update the OK button `disabled`:

```tsx
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={!canSave || saving}>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run `npm run dev`:
1. Add a expense → success toast "Enregistré", navigates back.
2. Double-tap OK fast → only ONE transaction created (button disables after first tap).
3. Same for Transfer.
   (Error path is hard to trigger manually; the try/catch + toast is verified by code review.)

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/TransactionForm.tsx src/features/transactions/Transfer.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(transactions): guard save against errors + double-tap, add toasts"
```

---

### Task 10: Explain-why on blocked account deletion (Accounts)

**Files:**
- Modify: `src/features/accounts/Accounts.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json` (key `accounts.needTwo` already exists — reuse it)

**Interfaces:** none new.

- [ ] **Step 1: Read the current deletion UI**

Open `src/features/accounts/Accounts.tsx` and locate the reassignment sheet where the "Supprimer" button is disabled when `others.length === 0` (no other account to reassign to). The existing key `accounts.needTwo` ("Ajoutez au moins deux comptes.") is the message to surface.

- [ ] **Step 2: Show the message when deletion is blocked**

In the delete/reassign sheet, when `others.length === 0`, render an explanatory line ABOVE the disabled button instead of leaving it silently greyed. Add, just before the delete `Button` inside that sheet:

```tsx
          {others.length === 0 && (
            <p className="body-sm" style={{ color: 'var(--warning-600)', marginBottom: 12, textAlign: 'center' }}>
              {t('accounts.needTwo')}
            </p>
          )}
```

> Match the exact variable name used in the file for the "other accounts" array (it may be `others`, `reassignTargets`, etc.) — read the file and use the real identifier. Place the message where the user sees it before the disabled button.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. With only ONE account, open it → delete → the reassign step shows "Ajoutez au moins deux comptes." above a disabled delete button (no more silent grey button). With two accounts, deletion works as before.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/Accounts.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(accounts): explain why last-account deletion is blocked"
```

---

## Phase 5 — Transaction guardrails

### Task 11: Numpad clear + limit feedback + i18n aria-labels

**Files:**
- Modify: `src/components/ui/Numpad.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Produces (unchanged public API): `Numpad`, `applyKey`, `parseAmount`, `displayAmount`. `applyKey` gains a way to signal "blocked" — see below.

- [ ] **Step 1: Add i18n keys**

In both locale files, add a `numpad` top-level object (sibling of `common`).

FR:

```json
  "numpad": {
    "backspace": "Effacer",
    "clear": "Tout effacer",
    "decimal": "Virgule"
  },
```

EN:

```json
  "numpad": {
    "backspace": "Backspace",
    "clear": "Clear all",
    "decimal": "Decimal point"
  },
```

- [ ] **Step 2: Add limit-hit feedback + long-press clear**

Rewrite `src/components/ui/Numpad.tsx`'s component (keep `applyKey`, `parseAmount`, `displayAmount` exports unchanged). The component now:
- Detects when `applyKey` returns the unchanged value (limit hit) and fires a short `navigator.vibrate(15)` if available.
- Long-press on backspace clears the whole value.
- Uses translated `aria-label`s.

Replace the `Numpad` function with:

```tsx
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocale } from '@/lib/format';
import type { Locale } from '@/types/models';
import { Icon } from './Icon';

// (keep applyKey / parseAmount / displayAmount above, unchanged)

interface NumpadProps {
  value: string;
  onChange: (next: string) => void;
  locale?: Locale;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

export function Numpad({ value, onChange, locale = getLocale() }: NumpadProps) {
  const { t } = useTranslation();
  const decLabel = locale === 'fr' ? ',' : '.';
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleared = useRef(false);

  const press = (k: string) => {
    const next = applyKey(value, k);
    if (next === value && k !== 'back') {
      // Limit hit (max decimals / width / duplicate point) — signal it.
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
      return;
    }
    onChange(next);
  };

  const startHold = () => {
    cleared.current = false;
    holdTimer.current = setTimeout(() => {
      cleared.current = true;
      onChange(''); // long-press backspace = clear all
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(25);
    }, 450);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <div className="numpad">
      {KEYS.map((k) => {
        const isBack = k === 'back';
        const isGhost = k === '.' || isBack;
        const label = isBack ? t('numpad.backspace') : k === '.' ? t('numpad.decimal') : k;
        if (isBack) {
          return (
            <button
              key={k}
              type="button"
              className="key ghost"
              aria-label={label}
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onClick={() => {
                // Suppress the click that follows a long-press clear.
                if (cleared.current) { cleared.current = false; return; }
                press('back');
              }}
            >
              <Icon name="Delete" size={26} strokeWidth={2} />
            </button>
          );
        }
        return (
          <button
            key={k}
            type="button"
            className={['key', isGhost ? 'ghost' : ''].join(' ').trim()}
            aria-label={label}
            onClick={() => press(k)}
          >
            {k === '.' ? decLabel : k}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run `npm run dev` → Add expense:
1. Type `12.34` then press more digits → no change (limit), a short vibration on a device that supports it.
2. Long-press backspace → the amount clears entirely.
3. Short-tap backspace → deletes one char.
4. Inspect the backspace/decimal buttons → `aria-label` is translated.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Numpad.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "feat(numpad): long-press clear + limit-hit haptics + i18n labels"
```

---

### Task 12: Confirm recurring toggle (it moves real balances)

**Files:**
- Modify: `src/features/recurring/Recurring.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: existing `Sheet`, `Button`, `useToast()`.

- [ ] **Step 1: Read the current confirm flow**

Open `src/features/recurring/Recurring.tsx`. Locate where `confirmRecurring(r, month)` is called from the confirm button and where the un-confirm (toggle off) path is. Note the exact function names used (`confirmRecurring`, and whatever removes a confirmation).

- [ ] **Step 2: Add i18n keys**

In both locale files, inside the existing `recurring` object, add:

FR:

```json
    "confirmTitle": "Confirmer ce récurrent ?",
    "confirmBody": "Une opération de {{amount}} sera enregistrée sur {{account}}.",
    "unconfirmTitle": "Annuler cette confirmation ?",
    "unconfirmBody": "L'opération correspondante sera supprimée.",
    "confirmedToast": "Opération enregistrée",
    "unconfirmedToast": "Confirmation annulée"
```

EN:

```json
    "confirmTitle": "Confirm this recurring?",
    "confirmBody": "A {{amount}} transaction will be recorded on {{account}}.",
    "unconfirmTitle": "Undo this confirmation?",
    "unconfirmBody": "The matching transaction will be removed.",
    "confirmedToast": "Transaction recorded",
    "unconfirmedToast": "Confirmation undone"
```

- [ ] **Step 3: Route the confirm/un-confirm action through a confirmation Sheet**

Add a `pendingConfirm` state holding the recurring row + intended direction, and a `Sheet` that runs the real action on approval. Add near the component's other state:

```tsx
  const toast = useToast();
  const [pendingConfirm, setPendingConfirm] = useState<{ r: Recurring; on: boolean } | null>(null);
```

(Import `useToast` from `@/store/ToastContext`, `Sheet`/`Button` if not already imported, and the `Recurring` type from `@/types/models`. Use the actual row type name from the file.)

Change the confirm button's `onClick` so that instead of calling `confirmRecurring(r, month)` directly, it opens the sheet:

```tsx
                    onClick={() => setPendingConfirm({ r, on: !isConfirmedIn(r, month) })}
```

Add the confirmation sheet before the component's closing fragment (reuse `formatSignedCurrency` + account lookup already present in the file):

```tsx
      <Sheet open={!!pendingConfirm} onClose={() => setPendingConfirm(null)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <h2 className="h3" style={{ marginBottom: 4 }}>
            {pendingConfirm?.on
              ? t('recurring.confirmTitle')
              : t('recurring.unconfirmTitle')}
          </h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>
            {pendingConfirm?.on
              ? t('recurring.confirmBody', {
                  amount: formatSignedCurrency(
                    pendingConfirm.r.direction === 'income'
                      ? pendingConfirm.r.amount
                      : -pendingConfirm.r.amount,
                  ),
                  account: accountMap.get(pendingConfirm.r.accountId)?.name ?? '',
                })
              : t('recurring.unconfirmBody')}
          </p>
          <div className="col gap-2">
            <Button
              full
              onClick={async () => {
                if (!pendingConfirm) return;
                const { r, on } = pendingConfirm;
                setPendingConfirm(null);
                await confirmRecurring(r, month); // existing toggle: creates or removes
                toast.success(on ? t('recurring.confirmedToast') : t('recurring.unconfirmedToast'));
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button variant="secondary" full onClick={() => setPendingConfirm(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
```

> **Match the real toggle semantics:** if the file uses one function that toggles, keep the single `confirmRecurring(r, month)` call as above. If confirm and un-confirm are two different functions, call the right one based on `on`. Read the file first and wire the actual functions + `accountMap`/`formatSignedCurrency` identifiers it exposes.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run `npm run dev` → Recurring:
1. Tap the confirm button → a sheet asks to confirm, showing the amount + account.
2. Approve → a real transaction is created (balance changes on Dashboard) + success toast.
3. Toggle off → sheet warns it will remove the transaction; approve → it's removed.
4. Cancel → nothing changes.

- [ ] **Step 6: Commit**

```bash
git add src/features/recurring/Recurring.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(recurring): confirm before toggling (creates/removes a real transaction)"
```

---

### Task 13: Show amount/description in delete confirmations

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`
- Modify: `src/features/transactions/Transfer.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: `formatCurrency`/`formatSignedCurrency` from `@/lib/format`.

- [ ] **Step 1: Add i18n keys**

In both locale files, inside `confirm`, add:

FR:

```json
    "deleteAmount": "Montant : {{amount}}"
```

EN:

```json
    "deleteAmount": "Amount: {{amount}}"
```

- [ ] **Step 2: Enrich the TransactionForm delete sheet**

In `src/features/transactions/TransactionForm.tsx`, add the import if missing:

```tsx
import { formatSignedCurrency } from '@/lib/format';
```

In the delete-confirm `Sheet`, add the amount line under the hint (`transaction` is in scope in edit mode):

```tsx
          <p className="body-sm" style={{ marginBottom: 20 }}>
            {t('confirm.deleteHint')}
          </p>
          {transaction && (
            <p className="body-sm" style={{ fontWeight: 600, marginBottom: 20 }}>
              {t('confirm.deleteAmount', {
                amount: formatSignedCurrency(isExpense ? -transaction.amount : transaction.amount),
              })}
            </p>
          )}
```

- [ ] **Step 3: Enrich the Transfer delete sheet**

In `src/features/transactions/Transfer.tsx`, add the import:

```tsx
import { formatCurrency } from '@/lib/format';
```

In the delete-confirm `Sheet`, add under the hint (use `outLeg` amount + from/to names):

```tsx
          <p className="body-sm" style={{ marginBottom: 20 }}>
            {t('confirm.deleteHint')}
          </p>
          {outLeg && (
            <p className="body-sm" style={{ fontWeight: 600, marginBottom: 20 }}>
              {t('confirm.deleteAmount', { amount: formatCurrency(outLeg.amount) })}
              {fromAccount && toAccount ? ` · ${fromAccount.name} → ${toAccount.name}` : ''}
            </p>
          )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Edit an existing expense → tap delete → the confirm sheet now shows the amount. Same for an existing transfer (amount + from → to).

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/TransactionForm.tsx src/features/transactions/Transfer.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(transactions): show amount in delete confirmations"
```

---

## Phase 6 — Lists, stats & install polish

### Task 14: MovementsList distinct empty states + transfer filter

**Files:**
- Modify: `src/features/transactions/MovementsList.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:** none new.

- [ ] **Step 1: Read the current filter + empty-state logic**

Open `src/features/transactions/MovementsList.tsx`. Note: the filter `Segmented` options (All / Expenses / Income), the hook that returns transactions (e.g. `useScopedTransactions`), and where the single `movements.empty` empty state renders.

- [ ] **Step 2: Add i18n keys**

In both locale files, inside `movements`, add:

FR:

```json
    "filterTransfers": "Virements",
    "emptyFilter": "Aucun résultat pour ce filtre",
    "emptyFilterHint": "Changez de filtre pour voir d'autres mouvements."
```

EN:

```json
    "filterTransfers": "Transfers",
    "emptyFilter": "No results for this filter",
    "emptyFilterHint": "Switch filter to see other movements."
```

- [ ] **Step 3: Add the Transfers filter option**

Add `'transfer'` to the filter type union and the `Segmented` options. Where the options array is built, add:

```tsx
              { value: 'transfer', label: t('movements.filterTransfers') },
```

And in the filtering predicate, handle `'transfer'` by keeping only transfer legs (use the existing `isTransfer(tx)` helper from `@/lib/calc`):

```tsx
      filter === 'transfer' ? isTransfer(tx) :
```

(Wire it into the existing filter chain — read the file for the exact predicate shape and the filter state variable name.)

- [ ] **Step 4: Distinguish the empty states**

Replace the single empty-state render. The list has three cases: (a) the source (unfiltered) list is empty → "no data yet"; (b) the source has data but the current filter yields none → "no results for this filter"; (c) data present. Compute a boolean for "unfiltered list has any rows" (e.g. the length of the pre-filter array) and branch:

```tsx
  const hasAnyMovements = allRows.length > 0;      // pre-filter length — use the real variable
  const filteredRows = /* existing filtered array */;

  // ...in the render, where the empty state is:
  {filteredRows.length === 0 ? (
    hasAnyMovements ? (
      <div className="card">
        <EmptyState icon="Filter" title={t('movements.emptyFilter')} hint={t('movements.emptyFilterHint')} />
      </div>
    ) : (
      <div className="card">
        <EmptyState icon="Receipt" title={t('movements.empty')} hint={t('movements.emptyHint')} />
      </div>
    )
  ) : (
    /* existing list render */
  )}
```

> Use the real variable names present in the file for the pre-filter and post-filter arrays. The distinction (has data but filter empty vs. truly empty) is the required behaviour; the exact identifiers come from the file.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run `npm run dev` → Movements:
1. With some expenses but no transfers, pick the "Virements" filter → "Aucun résultat pour ce filtre" (NOT "Aucun mouvement").
2. With no data at all → "Rien à afficher / Aucun mouvement" empty state.
3. Transfers filter shows only transfer legs when they exist.

- [ ] **Step 7: Commit**

```bash
git add src/features/transactions/MovementsList.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(movements): distinct empty states + transfers filter"
```

---

### Task 15: Stats/Overview — trend arrow semantics + month bound + i18n arrows

**Files:**
- Modify: `src/features/statistics/Statistics.tsx`
- Modify: `src/features/overview/MonthlyOverview.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:** none new.

- [ ] **Step 1: Add i18n keys for month navigation aria-labels**

In both locale files, inside `overview`, add:

FR:

```json
    "prevMonth": "Mois précédent",
    "nextMonth": "Mois suivant"
```

EN:

```json
    "prevMonth": "Previous month",
    "nextMonth": "Next month"
```

- [ ] **Step 2: Fix trend-arrow semantics in Statistics**

Open `src/features/statistics/Statistics.tsx`. Find where the trend uses `ArrowUp`/`ArrowDownRight`. The correct mapping for a spending tracker: **spending went DOWN = good = a down arrow; spending went UP = bad = an up arrow.** Set the icon by the sign of the change (more spent → `ArrowUpRight`; less spent → `ArrowDownRight`), independent of the good/bad color. Adjust the icon selection so the arrow direction matches the direction of the spending change (read the existing `pct`/comparison variable and pick `ArrowUpRight` when current > previous, `ArrowDownRight` otherwise).

- [ ] **Step 3: Bound the month navigation in MonthlyOverview**

Open `src/features/overview/MonthlyOverview.tsx`. Find `nextMonth`. Disable advancing past the current month. Compute:

```tsx
  const atCurrentMonth = month >= currentMonth(); // month is a 'YYYY-MM' string — string compare works
```

Disable the next button when `atCurrentMonth`:

```tsx
        disabled={atCurrentMonth}
```

(Add `disabled` to whatever button/`icon-btn` advances the month; if it's a plain button add the attribute and a disabled style, e.g. `opacity: atCurrentMonth ? 0.4 : 1`.)

- [ ] **Step 4: Translate the month-nav aria-labels**

In `MonthlyOverview.tsx`, replace the `common.back`/`common.continue` aria-labels on the month arrows with:

```tsx
        aria-label={t('overview.prevMonth')}
```

and

```tsx
        aria-label={t('overview.nextMonth')}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run `npm run dev`:
1. Statistics: with a period where you spent MORE than the previous period, the arrow points up; where you spent LESS, it points down.
2. MonthlyOverview: the "next month" arrow is disabled on the current month (can't navigate into empty future months); "previous" still works. Screen-reader labels read "Mois précédent/suivant".

- [ ] **Step 7: Commit**

```bash
git add src/features/statistics/Statistics.tsx src/features/overview/MonthlyOverview.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(stats): correct trend arrow direction, bound month nav, i18n arrows"
```

---

### Task 16: InstallPrompt — don't interrupt, differentiate "Never", confirm

**Files:**
- Modify: `src/features/install/InstallPrompt.tsx`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:** none new.

- [ ] **Step 1: Read the current trigger + buttons**

Open `src/features/install/InstallPrompt.tsx`. Note: the auto-open condition (opens on the 3rd expense), and the two ghost buttons "Plus tard" (`install.later`) and "Ne plus afficher" (`install.never`), and the dismissal that sets `installPromptDismissed: 'permanent'`.

- [ ] **Step 2: Don't open while on a data-entry route**

Gate the auto-open so it never fires while the user is on `/add`, `/income`, or `/transfer`. Read the current route via `useLocation` (from react-router-dom) and add it to the open condition:

```tsx
  const location = useLocation();
  const onEntryRoute = ['/add', '/income', '/transfer'].some((p) => location.pathname.startsWith(p));
```

Include `!onEntryRoute` in the effect/condition that decides to open the sheet.

- [ ] **Step 3: Add i18n key for the "Never" confirmation**

In both locale files, inside `install`, add:

FR:

```json
    "neverConfirm": "Ne plus jamais proposer l'installation ?"
```

EN:

```json
    "neverConfirm": "Never suggest installing again?"
```

- [ ] **Step 4: Differentiate + confirm "Never"**

Give "Ne plus afficher" a distinct, quieter/destructive style and a confirm step. Add a `confirmNever` state:

```tsx
  const [confirmNever, setConfirmNever] = useState(false);
```

Change the "Never" button so the first tap asks for confirmation (inline), the second performs the permanent dismiss. Replace the never button with:

```tsx
        {confirmNever ? (
          <button
            type="button"
            className="btn btn-block"
            style={{ height: 44, color: 'var(--danger-600)', background: 'var(--danger-50)' }}
            onClick={handleNever /* the existing permanent-dismiss handler */}
          >
            {t('install.neverConfirm')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ height: 44, color: 'var(--neutral-400)' }}
            onClick={() => setConfirmNever(true)}
          >
            {t('install.never')}
          </button>
        )}
```

And bump the "Plus tard" ghost button to `height: 44` (from 40) to meet the touch-target minimum.

> Use the real permanent-dismiss handler name from the file (it sets `installPromptDismissed: 'permanent'`). Keep "Plus tard" as the low-stakes primary dismiss.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run `npm run dev`:
1. While adding an expense (on `/add`), the install sheet does NOT pop up mid-entry.
2. Open the install sheet elsewhere → "Ne plus afficher" now needs a second confirming tap, visually distinct (danger tinted). "Plus tard" dismisses without confirmation.
3. Buttons are ≥44px tall.

- [ ] **Step 7: Commit**

```bash
git add src/features/install/InstallPrompt.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(install): don't interrupt entry, confirm+differentiate Never, 44px targets"
```

---

## Phase 7 — Accessibility polish

### Task 17: Touch targets ≥44px + i18n the last hardcoded aria-labels

**Files:**
- Modify: `src/features/transactions/Transfer.tsx` (swap button 36→44, i18n label)
- Modify: `src/features/transactions/TransactionForm.tsx` (acct-chip min height)
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:** none new.

- [ ] **Step 1: Add i18n key for swap**

In both locale files, inside `transfer`, add:

FR:

```json
    "swap": "Inverser les comptes"
```

EN:

```json
    "swap": "Swap accounts"
```

- [ ] **Step 2: Fix the swap button (Transfer)**

In `src/features/transactions/Transfer.tsx`, change the swap button: `aria-label="swap"` → `aria-label={t('transfer.swap')}`, and `width: 36, height: 36` → `width: 44, height: 44` (keep it circular; adjust the `border` if needed so it still overlaps cleanly).

- [ ] **Step 3: Fix the account chip target (TransactionForm)**

In `src/features/transactions/TransactionForm.tsx`, the account `acct-chip` button uses `height: 32`. Raise its tap area to 44 without visually enlarging the pill by adding vertical padding/min-height: change `style={{ height: 32 }}` to `style={{ minHeight: 44 }}` (or wrap tap area). Keep the visual pill compact via inner content; the button itself must be ≥44px tall.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. On Transfer, the swap circle is comfortably tappable (44px) and its screen-reader label reads "Inverser les comptes". On Add expense, the account chip is easy to hit. Visually nothing looks broken.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/Transfer.tsx src/features/transactions/TransactionForm.tsx src/locales/fr/common.json src/locales/en/common.json
git commit -m "fix(a11y): 44px swap + account-chip targets, i18n swap label"
```

---

## Phase 8 — Final verification

### Task 18: Full build + end-to-end smoke

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole project**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `tsc -b` passes and `vite build` completes, producing `dist/` with no errors.

- [ ] **Step 3: Preview + smoke the key journeys**

Run: `npm run preview`, open the served URL, and walk through:
1. Add an expense → success toast, no double-entry on double-tap.
2. Budget: switch account scope → correct budget shows, saving doesn't zero it.
3. Google (if configured): reload with a live token → stays signed in; sync pill shows state; manual backup → toast; simulate blocked reconnect → banner appears with working Reconnect button.
4. Movements: transfers filter + distinct empty states.
5. Recurring: confirm asks first, then records; balance updates.
6. Numpad: long-press clears; limits give feedback.

- [ ] **Step 4: Final commit (if any lockfiles/build artifacts changed) or none**

If nothing changed, no commit. Otherwise:

```bash
git add -A
git commit -m "chore: final verification pass"
```

---

## Self-Review (completed during planning)

**Spec coverage** — every spec section maps to tasks:
- §4 sign-in auto → Tasks 3, 4, 5.
- §5.1 sync pill → Task 6. §5.2 toasts → Tasks 1, 2, 7 (+ emitters in 9, 12). §5.3 fluidity/no-reload → Task 7.
- §6 reliability: #1 Budget → Task 8; #2 save guard → Task 9; #3 Accounts → Task 10; #4 Numpad → Task 11; #5 Recurring → Task 12; #6 MovementsList → Task 14; #7 delete detail → Task 13; #8 Stats/Overview → Task 15; #9 InstallPrompt → Task 16; #10 a11y → Tasks 11 (labels) + 17 (targets).
- §8 error handling → Tasks 7, 9. §9 verification → each task + Task 18.
- §10 out-of-scope respected (no redesign, no per-account detail screen, no swipe actions, no chart tooltips).

**Placeholder scan** — no "TBD/TODO/handle edge cases". Where a task must read the real code for an identifier, the required behaviour + exact keys/code are given, with a note to bind the real variable name (unavoidable in an existing codebase; the engineer has the concrete code to write).

**Type consistency** — `needsReconnect`/`setNeedsReconnect` defined in Task 3 and consumed in 4/5/6 with matching names. `ToastApi` (`success`/`error`/`info`/`dismiss`) defined in Task 1 and consumed identically in 2/7/9/12. `Toast`/`ToastTone` shared. `pushOnce(manual)` signature consistent across its call sites in Task 7.

**Verification-cycle adaptation** — this codebase has no test runner (spec §9), so each task ends with `npm run typecheck` + a targeted manual check instead of a failing-then-passing unit test. This is intentional and spec-mandated; do not add a test framework.
