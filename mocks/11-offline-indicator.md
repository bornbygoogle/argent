# Offline Indicator

## Purpose
Communicates network status and pending-sync state to the user without ever blocking data entry. Reassures the user that everything they do while offline is saved locally and will sync. It is global UI — a banner/snackbar plus a persistent badge — not a full screen, and it renders above any tab root.

## Navigation
- **How user arrives here:** this is not navigated to; it appears automatically in response to browser network events (`navigator.onLine`, `online`/`offline` events) and the local sync queue depth. It layers above whatever screen is active (Dashboard 02, Statistics 08, Monthly Overview 06, Settings 09, or any pushed screen/modal). Per Nav Map §6, Add Expense and all navigation remain fully functional offline.
- **Where they can go:**
  - **Banner (offline):** no navigation; dismissible via ✕ (single dismiss — banner will not re-show until the next offline transition). Tapping "Learn more" (optional ghost action) opens a small sheet explaining offline behavior — 🔴 "Learn more" sheet content not yet specified.
  - **Banner (synced confirmation):** auto-reverts after 3s; no actions.
  - **Banner (sync failed):** exposes a "Retry" action → re-attempts queue drain; on success transitions to the synced confirmation.
  - **Pending-sync badge:** tap on the FAB badge or status chip opens a transient tooltip/sheet listing queued transactions — 🔴 queue-detail sheet is out of scope for this spec; confirm whether needed at launch.
  - **Toast (ephemeral offline ping):** no actions; auto-dismisses.
- **Non-blocking guarantee:** the offline banner never uses a scrim and never traps focus; the FAB, bottom nav, and all forms remain operable while it is visible. The banner sits at z-index `20` (with sticky bars/FAB tier), strictly below sheets/modals (`30/40`) and toasts (`50`).

## Layout Description

### Variant A — Offline Banner (persistent, primary)
A slim snackbar pinned to the top, just below the Top Bar (56px + safe-area inset), OR bottom-anchored above the bottom nav (bottom preferred per design system §8 Toasts). Mobile: full-width minus `space-4` gutters; tablet/desktop: constrained to `max-w-md` (448px), centered.

- **Container:** bg `warning-50` (light) / `neutral-800` (dark with `warning-700` text mapping), `radius-md`, `shadow-md`, padding `space-3` left/right, `space-2` top/bottom, 1px left accent border `warning-500` (3px) to signal caution without alarm (design system §1 "never alarming"). Z-index `20`. Min-height 44px.
- **Left icon:** `WifiOff` Lucide 20px, `warning-600` (light) / `warning-500` (dark), in a 44×44px hit area (decorative, `aria-hidden`).
- **Text:** `body-sm`, `neutral-800` (light) / `warning-700` (dark): "You're offline — changes are saved and will sync."
- **Right (optional):** ghost ✕ close (`X` Lucide 20px, `neutral-500`, 44×44px hit area), ARIA label "Dismiss".
- **Enter animation:** slide down 16px + fade, 200ms standard ease; sits below the Top Bar, pushing content down by its height (reflow), OR floats over content (overlay) — recommendation: overlay to avoid layout shift on the Dashboard hero.

### Variant B — Synced Confirmation Banner (ephemeral, success)
Replaces Variant A the moment `online` fires AND the queue has fully drained.

- **Container:** bg `success-50` (light) / `neutral-800` (dark, `success-700` text), `radius-md`, `shadow-md`, same sizing as Variant A. Z-index `20`. Left accent border `success-500` (3px).
- **Left icon:** `CheckCircle2` Lucide 20px, `success-600` / `success-500`.
- **Text:** `body-sm`, `neutral-800` / `success-700`: "Synced — all changes up to date."
- **No close button** — auto-dismiss 3s.
- **Exit animation:** fade out + slide up 16px, 200ms.

### Variant C — Sync Failed Banner (persistent, danger)
Shown if a queue drain attempt errors (e.g. server 5xx, auth expired).

- **Container:** bg `danger-50` (light) / `neutral-800` (dark, `danger-700` text), `radius-md`, `shadow-md`, same sizing. Z-index `20`. Left accent border `danger-500` (3px).
- **Left icon:** `AlertTriangle` Lucide 20px, `danger-600` / `danger-500`.
- **Text:** `body-sm`, `neutral-800` / `danger-700`: "Sync failed — we'll retry. Your changes are saved."
- **Action:** ghost "Retry" button — `primary-600` text (or `danger-600`), `body-sm`, min-height 44px, ARIA label "Retry sync".
- Persists until retry succeeds or user dismisses (✕).

### Variant D — Pending-Sync Badge (persistent, on FAB / status chip)
A small count badge indicating queued transactions, shown whenever `queueDepth > 0`, online or offline.

- **Location (primary):** on the FAB — a pill badge anchored top-right of the 56px FAB circle, `radius-full`, bg `warning-500` (light/dark), white text `caption` weight 600, min 18px tall, padded `space-1`×`space-2`. Shows the integer count (e.g. "3"). Hidden when `queueDepth === 0`. Sits at the FAB's z-index `20`.
- **Location (secondary, optional):** a status chip in the Top Bar right slot — pill, bg `warning-50`, text `warning-700`, `caption`, icon `RefreshCw` Lucide 16px + count. 🔴 Confirm whether Top Bar chip is needed in addition to the FAB badge (risk of redundancy).
- **Count change animation:** badge scale pop `scale(1.12)` 120ms when count increments; shrink-fade when it reaches 0.
- **Queue-draining animation:** while a sync is actively uploading, the badge icon swaps to a spinning `RefreshCw` (or a `primary-600` mini-spinner 16px) and the count decrements as each transaction confirms; if `prefers-reduced-motion`, spinner is replaced by a static count and no scale pop.

### Variant E — Offline Toast (ephemeral ping)
An optional short toast fired the instant the network drops, for situations where the persistent banner might be suppressed (e.g. user previously dismissed it this session).

- Toast (bottom, above bottom nav), default variant is `warning-600`, `radius-md`, `shadow-toast`, `body-sm`: "You're offline. Changes save locally.", auto-dismiss 4s (design system §8). z-index `50`. Single optional ghost action "Undo" is NOT applicable here; no actions.
- Enter: slide up + fade, 200ms.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Offline banner (A) | Snackbar | `warning-50`/`neutral-800`, `radius-md`, `shadow-md`, left accent `warning-500`, z-index `20` |
| Synced banner (B) | Snackbar | `success-50`/`neutral-800`, left accent `success-500`, auto-dismiss 3s |
| Failed banner (C) | Snackbar | `danger-50`/`neutral-800`, left accent `danger-500`, persistent |
| Status icon | Lucide 20px | `WifiOff` / `CheckCircle2` / `AlertTriangle`, decorative `aria-hidden` |
| Banner text | `body-sm` | `neutral-800` (light) / theme-mapped (dark) |
| Close ✕ | Ghost icon button | `X` Lucide 20px, 44×44px hit area, "Dismiss" |
| Retry action | Ghost button | `primary-600`/`danger-600` text, `body-sm`, min-height 44px |
| Pending badge (FAB) | Count pill | `radius-full`, bg `warning-500`, white `caption`, anchored on FAB |
| Status chip (Top Bar) | Chip (optional) | `warning-50` bg, `warning-700` text, `caption`, `RefreshCw` 16px |
| Spinner | Inline | `primary-600` 16px, swapped in during active drain |
| Offline toast (E) | Toast | `warning-600`, `radius-md`, `shadow-toast`, 4s, z-index `50` |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `isOnline` | boolean | `false` | derived from `navigator.onLine` + `online`/`offline` events; debounced 500ms to avoid flicker |
| `queueDepth` | integer | `3` | count of transactions in local outbox not yet confirmed by server; `>= 0` |
| `syncStatus` | enum | `"idle"` \| `"draining"` \| `"failed"` \| `"synced"` | drives which banner variant is shown |
| `lastSyncedAt` | timestamp | `1719216000000` | shown optionally in the Settings sync row; not in the banner |
| `bannerDismissedThisSession` | boolean | `true` | set when user taps ✕ on offline banner; suppresses re-show until next offline transition |
| `retryCount` | integer | `2` | exponential backoff cap at e.g. 5; after cap, stays in `failed` awaiting manual retry |
| `reducedMotion` | boolean | `false` | from `prefers-reduced-motion`; disables spinner/scale pop |

## States

- **Empty state:** `isOnline === true && queueDepth === 0` → no banner, no badge, no toast. The app shows zero offline UI (clean, calm — design system §1).
- **Loading state:** `syncStatus === "draining"` → badge shows spinner + decrementing count; no banner (offline banner is replaced the moment `isOnline` becomes true and draining starts). If draining started while still offline (local reprocessing), badge spinner shows without a banner change.
- **Error state:** `syncStatus === "failed"` → Variant C banner (danger) with Retry; badge count remains (items still queued). Retry button re-arms a drain; on repeated failure, banner persists and `retryCount` backs off.
- **Populated state (offline):** `isOnline === false` → Variant A banner (or Variant E toast if banner suppressed) + pending badge if `queueDepth > 0`. Adding an expense increments the badge with a scale pop; the banner text does not change per-add (stays generic).
- **Populated state (synced):** `isOnline === true && queueDepth === 0 && previousSyncStatus !== idle` → Variant B banner for 3s, then clears to empty.

## Interactions & Micro-animations
- **Banner enter/exit:** translateY 16px + opacity, 200ms standard ease (design system §9).
- **Badge increment:** scale pop `scale(1.12)` 120ms, color stays `warning-500`; light haptic on the increment where available.
- **Badge decrement during drain:** no per-item animation jitter beyond the spinner; count ticks down at most once per 200ms to avoid flicker.
- **Badge → zero:** shrink + fade out, 150ms.
- **Retry press:** `scale(.98)` 120ms; banner stays mounted, icon swaps to spinner; on success →Variant B transition; on failure → banner shakes horizontally 4px ×2 (disabled under reduced-motion) and `retryCount++`.
- **Toast (E):** slide up + fade in 200ms; auto-dismiss 4s; slide down + fade out 200ms.
- **Reflow choice:** banner overlays content (absolute/fixed) rather than pushing the Dashboard hero, to keep the big amount visible; the Top Bar remains at top.
- **Reduced motion:** disable scale pops, badge shake, and spinner rotation; show a static `RefreshCw` icon and numeric count; keep opacity-only fades ≤150ms.

## Accessibility Notes
- **Live regions (critical):**
  - Offline banner (A), synced banner (B), and failed banner (C) are wrapped in a single status region with `aria-live="polite"` and `aria-atomic="true"` so screen readers announce transitions ("You're offline — changes are saved and will sync." → "Synced — all changes up to date.").
  - The failed banner (C) uses `aria-live="assertive"` because it conveys an actionable error requiring attention.
  - The offline toast (E) is announced via the toast's own `aria-live="polite"` region.
- **Badge:** the pending-sync badge has `role="status"` and an `aria-label` such as "3 transactions waiting to sync" (full text, not just the number), updated as the count changes; it is NOT focusable itself (status only), but the FAB it sits on retains its normal label.
- **Icons:** all status icons are `aria-hidden="true"` (decorative); meaning is carried by the text and the live-region announcement.
- **Color alone:** status is never conveyed by color alone — every colored banner also has an icon and text label (offline/synced/failed), satisfying WCAG 1.4.1.
- **Contrast:** `warning-700`/`neutral-800` on `warning-50` meets AA for `body-sm`; `danger-700` on `danger-50` and `success-700` on `success-50` likewise; dark-mode mappings per design system §2.
- **Tap targets:** ✕ close, Retry, and any chip are ≥44×44px with ARIA labels.
- **Focus:** the banner does NOT take focus on appearance (it is non-blocking); focus stays on the user's current task (e.g. the Add Expense amount field). Retry, when present, is focusable in DOM order after the banner text.
- **Keyboard:** Retry is activatable via Enter/Space; ✕ via Enter/Space; no Esc-to-dismiss on the persistent offline banner (Esc is reserved for sheets/modals).

## Notes / Open Questions
- 🔴 Top Bar status chip (Variant D secondary) may duplicate the FAB badge — confirm whether one is enough (recommendation: FAB badge only).
- 🔴 "Learn more" sheet content (offline behavior explainer) is not specified here — out of scope; confirm if needed at launch.
- 🔴 Queue-detail sheet (tap badge → list of queued transactions) is not specified — confirm launch scope.
- 🔴 Banner placement: top vs bottom — design system §8 prefers bottom for toasts, but a persistent status banner is often top-anchored. Recommendation: bottom (above bottom nav) to match the toast pattern and avoid covering the Top Bar title; confirm.
- 🔴 Debounce window (500ms) for `online`/`offline` to prevent flapping — confirm acceptable; too short causes banner flicker, too long delays the "Synced" reassurance.
- 🔴 Exponential-backoff cap and `retryCount` ceiling (proposed 5) — confirm with backend sync design.
- 🔴 Whether to surface `lastSyncedAt` anywhere in the banner (currently omitted for calm) — recommend Settings-only.
