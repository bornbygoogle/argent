# Install Prompt

## Purpose
Encourages the user to add "the app" to their home screen so it launches full-screen, works offline, and offers quick-add from the icon. It is a global overlay — never a tab — and it must never block data entry. Two variants: a lightweight native-style install banner (default) and a richer benefits modal (re-openable from Settings, or shown on the stronger trigger).

## Navigation
- **How user arrives here:** surfaced automatically as a global overlay per engagement heuristics (see *Trigger Logic*). Also re-openable manually from Settings (09) → "Install app" row. The banner/modal renders above whatever screen is active (any of the 4 tab roots, a pushed screen, or Add Expense). Per Nav Map §6, it is layered above the shell.
- **Where they can go:**
  - **"Install"** → consumes the captured `beforeinstallprompt` event → triggers the browser/OS install flow → on success → **Installed** confirmation toast (success variant), then this overlay closes.
  - **"Not now"** → dismisses this occurrence only; will re-show on the next heuristic trigger. Closes overlay; underlying screen regains focus.
  - **"Don't show again"** (modal variant) → sets `installPromptDismissed = permanent`; closes overlay; the Settings row remains as the only re-entry point.
  - **Close ✕ / scrim tap** → behaves like "Not now" (single dismissal).
  - **Scrim tap on a modal where a dirty form exists** → this overlay never carries a dirty form, so no confirm-discard guard is needed.
- Gestures: banner — none (tap targets only); modal sheet — swipe-down past 40% to dismiss (= "Not now"), scrim tap to dismiss, Esc to dismiss (per design system §8 Modals & Sheets).

## Layout Description

### Variant 1 — Install Banner (native-style, default)
A compact single-row card pinned above the bottom navigation (or above the FAB on screens without nav). It does NOT use a scrim — it is non-blocking and the app behind it stays fully interactive. Mobile: full-width minus `space-4` gutters each side; tablet/desktop: constrained to the `max-w-md` (448px) column, centered, sitting just above the bottom nav.

- **Container:** bg `white` (light) / `neutral-800` (dark), `radius-lg`, `shadow-md`, padding `space-3` (12px) left/right, `space-3` top/bottom, top border `neutral-200` (subtle separation when scrolled). Z-index layer `20` (sits with FAB tier; never above a sheet/modal which are `30/40`, and never above a toast `50`).
- **Left:** app icon (square, 40×40px, `radius-md`, `primary-600`→`primary-500` accent gradient, white `PiggyBank` Lucide icon 24px centered) — 🔴 final brand icon not yet defined (design system §12 Q1); placeholder used.
- **Middle:** two stacked text lines:
  - Title `body` weight 600 (`neutral-900`/`neutral-50`): "Install the app".
  - Subtitle `caption` (`neutral-500`): "Works offline · Add to home screen".
- **Right:** a primary mini-button "Install" — `primary-600` bg, white text, `button` role, `radius-md`, `space-2`×`space-3` padding, min-height 44px.
- **Far right (optional, secondary):** a ghost close ✕ (`X` Lucide 20px, `neutral-400`, 44×44px hit area) labeled "Dismiss".
- Banner animates in: translateY 16px + opacity 0→1, 200ms standard ease (design system §9). Auto-hides after 10s if untouched (= "Not now").

### Variant 2 — Install Modal (bottom sheet, richer)
A bottom sheet (default mobile pattern) with a scrim. Slides up from bottom. Triggered by: the user tapping a "Why install?" affordance on the banner, opening from Settings, OR the first time the strong heuristic fires (2nd session AND `beforeinstallprompt` was captured). Mobile: full-width sheet, `radius-lg` top corners; tablet/desktop: centered center-modal `radius-xl` `shadow-lg`, constrained `max-w-md`.

- **Scrim:** full-viewport `rgba(15,23,42,.45)`, z-index `30`; tap dismisses (see Navigation). Does **not** block the FAB underneath from being tappable once the sheet closes — but while open the FAB is covered, which is acceptable because this overlay is user-initiated and instantly dismissible.
- **Sheet container:** bg `white`/`neutral-800`, `radius-lg` top corners, `shadow-lg`, z-index `40`. Drag handle at top center: 40×4px `neutral-300`, `space-3` below top edge.
- **Close ✕:** top-right, ghost, `X` Lucide 20px, 44×44px hit area, ARIA label "Close".
- **Hero icon:** centered, 64×64px app icon, `radius-xl`, `primary-600`→`primary-500` gradient, white `PiggyBank` 32px. `space-4` below handle.
- **Title:** `h2` (`neutral-900`/`neutral-50`), centered: "Install the app". `space-2` below icon.
- **Subtitle:** `body-sm` (`neutral-500`), centered: "Faster access, works offline, stays private." `space-4` below title.
- **Benefits list:** vertical, `space-3` gap, each row = Lucide icon (20px, `primary-600`) + `body` text (`neutral-700`/`neutral-200`). Rows:
  1. `WifiOff` — "Works offline"
  2. `Smartphone` — "Add to home screen"
  3. `Plus` / `Zap` — "Quick-add from your home screen"
  4. `ShieldCheck` — "Your data stays on your device"
  - 🔴 No defined token for a "privacy/shield" brand glyph beyond Lucide `ShieldCheck`; confirm acceptable.
- **Primary button:** full-width, "Install", Primary variant (`primary-600`, white text, `radius-md`, `space-3`×`space-4`, min-height 48px). `space-4` below list.
- **Secondary row:** two ghost links side by side, `body-sm`, `neutral-500`, min-height 44px each:
  - Left: "Not now"
  - Right: "Don't show again"
- iOS fallback block (shown only when `platform === 'ios'` and `beforeinstallprompt` was never captured — see States): replaces the primary "Install" button with step text and an external-arrow link.

### Installed confirmation (success state, ephemeral)
Not a screen — a toast (bottom, above bottom nav): success variant `success-600`, `radius-md`, `shadow-toast`, `body-sm`: "Installed — find it on your home screen 🎉" (emoji optional per brand; 🔴 emoji usage not yet ratified in design system). Auto-dismiss 4s. Single ghost action "Open" if `launchMode` is available.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Banner container | Card (non-scrim) | `radius-lg`, `shadow-md`, bg `white`/`neutral-800`, z-index `20` |
| Modal scrim | Overlay | `rgba(15,23,42,.45)`, z-index `30`, tap = dismiss |
| Modal sheet | Bottom sheet | `radius-lg` top, `shadow-lg`, drag handle 40×4 `neutral-300`, z-index `40` |
| App icon (placeholder) | Icon tile | 40px (banner) / 64px (modal), `radius-md`/`radius-xl`, `primary-600`→`primary-500` gradient, `PiggyBank` white |
| Title text | `body` 600 / `h2` | Banner: `body` weight 600; Modal: `h2` |
| Subtitle text | `caption` / `body-sm` | `neutral-500` |
| Benefits list row | Icon + text | Lucide 20px `primary-600` + `body` `neutral-700`/`neutral-200` |
| Install button (banner) | Primary mini | `primary-600`, white, `radius-md`, min-height 44px |
| Install button (modal) | Primary full-width | `primary-600`, white, `radius-md`, min-height 48px |
| Not now | Ghost link | `neutral-500` / `primary-600`, `body-sm`, min-height 44px |
| Don't show again | Ghost link | `neutral-500`, `body-sm`, min-height 44px |
| Close ✕ | Ghost icon button | `X` Lucide 20px, `neutral-400`, 44×44px hit area |
| Installed toast | Toast (success) | `success-600`, `radius-md`, `shadow-toast`, 4s auto-dismiss |
| iOS instructions block | Text + link | `body-sm` steps, external link `primary-600` |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `installPromptDismissed` | enum\|null | `"session"` \| `"permanent"` \| `null` | null = never shown-yet or re-armable; "session" cleared on next heuristic; "permanent" only Settings can re-open |
| `engagement.expensesAdded` | integer | `3` | increments on each saved expense (03); triggers banner at `>= 3` |
| `engagement.sessions` | integer | `2` | increments per app launch (cold start); triggers modal at `>= 2` |
| `engagement.lastShownEpoch` | timestamp | `1719216000000` | used to enforce min 24h gap between auto-shows |
| `platform` | enum | `"ios"` \| `"android-chrome"` \| `"desktop"` | drives iOS fallback copy |
| `beforeinstallpromptCaptured` | boolean | `true` | false on iOS Safari → show manual instructions instead |
| `installed` | boolean | `false` | set true on `appinstalled` event; hides overlay permanently |
| `installEvent` | `BeforeInstallPromptEvent` \| null | — | the deferred prompt; `prompt()` called on Install tap |

## States

- **Empty state:** Not applicable — this overlay has no list. If `engagement` thresholds have not been met, the overlay simply does not appear (no empty UI).
- **Loading state:** While `installEvent.prompt()` is in-flight (Install tapped), the Install button enters a disabled state: bg `neutral-200`, text `neutral-400`, replaced by a 20px spinner (`primary-600`) for ≤2s. Other controls remain enabled so the user can cancel.
- **Error state:**
  - `installEvent.prompt()` rejected or `outcome === 'dismissed'`: show a neutral toast (default `neutral-800`), `body-sm`: "Install canceled — you can add it later from Settings.", 4s. Overlay closes; no permanent dismissal set.
  - Browser throws / not allowed (no `beforeinstallprompt`, not iOS): show iOS/desktop fallback (see below) if platform is iOS; otherwise hide the overlay and rely on the Settings row.
- **Populated state (normal/default):** Banner (Variant 1) shows when engagement heuristic fires AND `beforeinstallpromptCaptured === true`. Modal (Variant 2) shows on explicit open, strong heuristic, or as the iOS fallback surface.
- **Installed success state:** `installed === true` → overlay never auto-shows again; Settings row label changes to "App installed ✓" (ghost, non-interactive) or hidden; a one-time success toast fires.
- **iOS fallback state:** `platform === 'ios' && !beforeinstallpromptCaptured` → modal body swaps primary button for instructions: "1. Tap Share (icon) 2. Tap 'Add to Home Screen'" with an external "Open Apple docs" link (`primary-600`). No Install button. Buttons collapse to just "Not now".

## Interactions & Micro-animations
- **Banner enter:** translateY(16px)→0 + opacity 0→1, 200ms standard ease (design system §9).
- **Banner auto-hide:** 10s timeout → reverse animation → "Not now" semantics.
- **Modal enter:** sheet slides up 16px + scrim fade 0→1, 200ms standard ease; emphasized variant 280ms if launched from a FAB morph context.
- **Install button press:** `scale(.98)` + darken one step (`primary-700`), 120ms `ease-out` (design system §8 Buttons).
- **Drag-to-dismiss (modal):** drag handle follows finger; release past 40% height → close (= "Not now"); below 40% → snap back, 200ms.
- **Success toast:** slide up + fade, 200ms; auto-dismiss 4s; manual dismiss via tap.
- **Haptics:** light haptic on successful Install confirmation (where available); none on dismiss.
- **Reduced motion:** per design system §9, disable slide/scale; keep opacity-only fades ≤150ms; no icon pop.

## Accessibility Notes
- **Focus management:** when the modal opens, focus moves to the sheet title (or first heading) and is trapped within the sheet while open; on close, focus returns to the element that triggered it (banner button or Settings row).
- **Banner:** role `dialog` with `aria-label="Install the app"` is overkill for a banner; use `role="region"` with `aria-label="Install app"`. The banner must not steal focus (it is non-blocking); it is announced politely.
- **Live region:** banner appearance and the Installed toast are announced via an `aria-live="polite"` region ("Install the app prompt available." / "App installed.").
- **Scrim/sheet:** sheet has `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title id. Esc closes.
- **Buttons:** every interactive control has an `aria-label` where the icon alone conveys meaning (close ✕ → "Close", Install icon-only → "Install app"). Min 44×44px hit area enforced on all.
- **Benefits list:** marked as a `<ul>` with each item an `<li>`; icons are `aria-hidden="true"` (decorative) since text carries meaning.
- **Color contrast:** Install button white-on-`primary-600` meets AA; subtitle `neutral-500` on `white` is AA for `body-sm`; on dark, `neutral-400`/`neutral-50` per mapping.
- **iOS instructions:** steps in an `<ol>` for screen-reader sequence; external link announces "opens in a new window".

## Notes / Open Questions
- 🔴 Final app icon / brand glyph not defined (design system §12 Q1) — `PiggyBank` used as placeholder.
- 🔴 Emoji in the success toast ("🎉") — design system does not ratify emoji usage; confirm or strip.
- 🔴 Lucide `ShieldCheck` for the "data stays on device" benefit — no privacy-glyph token defined; confirm acceptable or pick alternative.
- 🔴 Engagement thresholds (3rd expense / 2nd session / 24h gap) are proposed defaults; confirm with product.
- 🔴 Center-modal vs bottom-sheet for tablet/desktop Variant 2 — design system allows both; pick one default (recommendation: bottom sheet on phone, center modal ≥640px).
- 🔴 Should the banner suppress itself while Add Expense (03) numpad is active, to avoid covering the sticky numpad? Recommendation: yes — defer banner until the modal closes.
- 🔴 "Open" action on the installed toast requires a supported `launchMode`/deep link — confirm capability per platform.
