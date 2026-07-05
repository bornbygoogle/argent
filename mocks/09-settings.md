# Réglages (09)

## Purpose
The bottom-nav root for all app configuration. A grouped list of **Préférences** (devise, thème, formats), **Organisation** (Catégories, **Types de revenus**, **Comptes**, Budget, **Récurrents**), **Données** (export / **sauvegarde cloud** / import / réinitialisation), **Notifications**, and **À propos**. Every row follows the standard list-row pattern. The app is single-currency (€) and offline-first: **backup is an active V1 feature** — a manual JSON export saved into the user's **own cloud account (Google Drive / iCloud)** via the Web Share / File System Access API, with **no app server** (§13.9). Real push notifications remain **v2** (flagged 🔴).

## Navigation
- **Arrives from:** Bottom nav slot #5 (`Settings` icon, `primary-600` when active). Active tab; selecting it again scrolls to top (Nav Map §3, §7.4).
- **Goes to:**
  - **Catégories** row → pushes Category Management (05), route `/categories`. Back chevron returns here.
  - **Comptes** row → pushes Accounts management (13), route `/accounts`. Back chevron returns here.
  - **Budget** row → pushes Budget Settings (07), route `/budget`. Back chevron returns here.
  - **Récurrents** row → pushes Recurring management (15), route `/recurring`. Back chevron returns here.
  - **Devise** row → opens a currency picker **bottom sheet** (overlay, no navigation). In V1 the app is single-currency (€); the picker is informational/locked — **see 🔴 open question 1**.
  - **Format nombre / Format date** rows → open picker sheets.
  - **Exporter / Importer / Sauvegarde / Tout effacer** → trigger sheets or confirm modals (overlays).
  - Theme and notifications are in-screen toggles (no navigation).
- **Chrome:** Top bar with screen title "Réglages" (`h3`) left-aligned, no back chevron (tab root). **Bottom nav present** and fixed; Settings tab is active (`primary-600`).
- **No dirty-form guard** on this screen itself (it has no unsaved form state); guards apply only inside the pushed screens (05, 07, 13, 15) and confirm modals it opens.

## Layout Description
Top-to-bottom, left-to-right. The whole screen is a single scrollable list of grouped cards.

1. **Top bar (56px + safe-area top).** Sticky, bg `neutral-50`/`neutral-900`, gains `shadow-sm` on scroll. Left/center: title "Réglages" (`h3`). Right: empty (no contextual action).
2. **Scrollable content.** `space-4` gutter; `space-6` between section groups; `space-8` bottom + safe-area inset so content clears the bottom nav.
3. **Section 1 — Préférences (group).** A section eyebrow "PRÉFÉRENCES" (`.label`, `neutral-500`) above a card (`radius-lg`, `shadow-sm`, `white`/`neutral-800`, `space-0` padding so rows own their padding). Rows separated by 1px `neutral-200` dividers:
   - **Devise** row: left = `Euro`/`DollarSign` icon (24px, `neutral-500`) in a 32×32 `neutral-100` `radius-md` tile; middle = "Devise" (`body`, `neutral-900`); right = current value "Euro (€)" (`body-sm`, `neutral-500`) + `ChevronRight` (20px, `neutral-400`). Tapping opens the currency picker sheet.
   - **Thème** row: left = `SunMoon` icon + tile; middle = "Thème" label and below it a **segmented control** (Clair / Sombre / Système) inline on the right or below. Selected segment: `white` bg, `neutral-900` text, `shadow-sm`; unselected: `neutral-500` text. Inline; tapping a segment applies instantly (Design System §11 — applied before first paint via persisted class).
   - **Format nombre** row: icon `Hash`; "Format nombre"; value "1 234,56"; chevron → opens format picker sheet.
   - **Format date** row: icon `Calendar`; "Format date"; value "24 juin 2026"; chevron → opens format picker sheet.
4. **Section 2 — Organisation (group).** Eyebrow "ORGANISATION". Card with rows:
   - **Catégories** row: icon `Tags` on `primary-50`/`primary-600` tile; "Catégories"; helper `caption` "Dépenses globales" (clarifies categories are global — see Category Management 05); value "8 catégories" (`body-sm`, `neutral-500`); chevron → pushes Category Management (05).
   - **Types de revenus** row: icon `Banknote`/`ArrowDownLeft` on `success-50`/`success-600` tile; "Types de revenus"; helper `caption` "Classent vos rentrées" (`neutral-500`); value "Salaire, Remboursement…" (`body-sm`, `neutral-500`, truncated) or "{n} types"; chevron → opens the **Income Types sheet**. **New (DECIDED — §13.3 / Category Management 05 #8): income types are managed HERE in Settings, separately from expense categories.** The list is a fixed enum in V1 (`Salaire` / `Remboursement` / `Cadeau` / `Freelance` / `Vente` / `Autre`); the sheet is **read-only** (rename/reorder allowed, add/delete out of scope for V1).
   - **Comptes** row: icon `Wallet`/`Landmark` on `primary-50`/`primary-600` tile; "Comptes"; helper `caption` "{n} comptes" or "Gérez vos comptes" (`neutral-500`); value "{n} comptes" (`body-sm`); chevron → pushes Accounts management (13). **New per multi-account model (§13.7).**
   - **Budget** row: icon `PiggyBank` on `success-50`/`success-600` tile; "Budget"; value "1 800 € / mois" (`body-sm`); chevron → pushes Budget Settings (07).
   - **Récurrents** row: icon `Repeat`/`RefreshCw` on `warning-50`/`warning-600` tile; "Récurrents"; helper `caption` "{k} à confirmer" (when there are pending `expected` occurrences, shown in `warning-600`) or "Aucun récurrent" (`neutral-500`); chevron → pushes Recurring (15). **New per multi-account model (§13.7).**
5. **Section 3 — Données (group).** Eyebrow "DONNÉES". Card with rows:
   - **Exporter les données** row: icon `Download`; "Exporter les données"; helper "CSV ou JSON" (`caption`); chevron → opens the **Export bottom sheet**.
   - **Importer / Restaurer** row: icon `Upload`; "Importer"; helper "Restaurer depuis une sauvegarde de l'application" (`caption`); chevron → opens **Import sheet / file picker**. **V1 accepts only the app's own export formats** (the JSON backup, or the app's own CSV layout) — no arbitrary bank-CSV column mapping (DECIDED, §13.9). A `.json` restores the full dataset; a `.csv` restores transactions only.
   - **Sauvegarder (Google Drive / iCloud)** row: icon `CloudUpload`; "Sauvegarder"; helper `caption` "Sauvegarde JSON vers votre compte cloud" (`neutral-500`); chevron → opens the **Backup sheet**. **Active in V1 (DECIDED, §13.9):** serializes the full dataset to a single `.json` file and hands it to the OS (Web Share API `navigator.share({ files })` → Google Drive / iCloud Files, or a download fallback). No toggle — this is a one-shot action with a success toast. Offline-first is preserved: the user's own cloud account is the storage, not an app server.
   - **Tout effacer** row: icon `Trash2` in a `danger-50` tile with `danger-600` icon; "Tout effacer" (`body`, `danger-600` text); helper "Supprimer tout sur cet appareil" (`caption`, `neutral-500`); right chevron `neutral-400`. Tapping opens a destructive **center confirm modal**.
6. **Section 4 — Notifications (group).** Eyebrow "NOTIFICATIONS". Card with rows:
   - **Alertes budget** toggle row: icon `Bell`; "Alertes budget"; helper "Notifier à 80 % d'une limite" (`caption`); right = toggle (44×24 pill, on `primary-600`). Inline switch, applies instantly. Delivered via **local** scheduled notifications (service-worker-based, no server).
   - **Rappels récurrents** toggle row: icon `CalendarClock`; "Rappels récurrents"; helper "Rappeler de confirmer les récurrents à l'échéance" (`caption`); toggle. Local reminder only.
   - *(Reserved)* **Résumé hebdomadaire** toggle row (ships **disabled/hidden at launch**): icon `Mail`; "Résumé hebdomadaire"; helper `caption` `neutral-400` "Bientôt disponible" 🔴 **v2** — real push requires Push API + server (offline-first has none). Recommendation: remove for v1 or keep as a local scheduled digest only.
7. **Section 5 — À propos (group).** Eyebrow "À PROPOS". Card with rows:
   - **Version** row (non-interactive): icon `Info`; "Version"; value "1.0.0 (build 42)" (`body-sm`, `neutral-500`). No chevron.
   - **Confidentialité** row (non-interactive or info sheet): icon `ShieldCheck`; "Confidentialité"; helper "Vos données restent sur cet appareil" (`caption`). Optional tap opens a small info sheet with the full privacy note.
   - **Licences open-source** row: icon `Scroll`; "Licences open-source"; chevron → opens a licenses sheet/list.
   - **Installer l'application** row (conditional — shown only when `beforeinstallprompt` is available): icon `Download`/`MonitorSmartphone`; "Installer l'application"; chevron → triggers install prompt (10).
8. **Footer.** Centered `caption` `neutral-400`: "the app · Conçu pour le hors-ligne."

### Overlays opened from this screen
- **Currency picker (bottom sheet):** drag handle, title "Devise", a searchable list of currencies with symbol + code. **V1**: the app is single-currency (€); only EUR is selectable, others greyed with `caption` "Multidevise — bientôt disponible" (🔴 v2 / Design System §13.8.2). Selected row shows a `Check` icon in `primary-600`. `radius-lg` top, `shadow-lg`, scrim `rgba(15,23,42,.45)`. Dismiss: swipe-down / scrim tap / Esc.
- **Export sheet (bottom sheet):** title "Exporter les données", two big choice rows: **CSV** (`FileSpreadsheet` icon, helper "Pour tableurs") and **JSON** (`Braces` icon, helper "Sauvegarde complète (catégories, comptes, budget, récurrents)"). Each is a full-width Secondary button (`primary-50`/`primary-700`). Tapping generates the file locally and opens the OS **share/save sheet** (Web Share API `navigator.share` with `files`, or a download fallback). A date-range toggle (Ce mois / Cette année / Tout) sits above the buttons. A caption notes: "Les exports sont générés sur votre appareil."
- **Backup sheet (bottom sheet):** title "Sauvegarder". Explains the model in plain terms: "Une sauvegarde `.json` de toutes vos données sera enregistrée dans **votre** Google Drive / iCloud Files (ou téléchargée)." A full-width Primary button "Créer la sauvegarde" serializes the dataset and invokes the OS save target. A caption: "Aucune donnée ne quitte vos comptes — l'application n'a pas de serveur." On success → toast "Sauvegarde créée" (`success-600`); the file is timestamped `gestionmoney-YYYY-MM-JJ.json`.
- **Import sheet (bottom sheet):** title "Importer", a dropzone/"Choisir un fichier" button (Ghost/Secondary) that opens the OS file picker. **V1 accepts only the app's own formats** (§13.9): a `.json` backup (full restore) or an app-layout `.csv` (transactions only). A non-app file is rejected inline: `danger-600` caption "Format non reconnu — importez une sauvegarde/export de cette application." On a valid file: a conflict-handling note + mode chooser **Fusionner** (add new, skip duplicates by id+date+amount) / **Tout remplacer** (wipe then import) / **Annuler**. Confirm runs the import; progress bar (`radius-full`, `primary-600` fill) then a success/failure toast.
- **Income Types sheet (bottom sheet):** title "Types de revenus". Read-only list of the enum (`Salaire` / `Remboursement` / `Cadeau` / `Freelance` / `Vente` / `Autre`), each row = icon + name + `caption` count of income transactions using it. Reorder (drag) and rename allowed; **add/delete are out of scope for V1** (the list is a fixed enum — §13.3). A caption notes "Liste fixe pour le moment".
- **Reset confirm (center modal):** small, `radius-xl`, `shadow-lg`. Title "Tout effacer ?" (`h3`), body "Cela supprime définitivement toutes les opérations, catégories, comptes, récurrents et budgets sur cet appareil. Action irréversible." (`body`, `neutral-600`). A typed-confirm input "Saisissez EFFACER pour confirmer" (optional hard gate). Buttons: "Annuler" (Ghost) and "Tout effacer" (Danger, `danger-600` bg, white text). Scrim blocks.

## Components & Elements
| Element | Type | Details |
|---|---|---|
| Top bar | Top Bar | 56px + safe-area; title "Réglages" only; `shadow-sm` on scroll |
| Section eyebrow | Text | `.label` uppercase, `neutral-500`, `space-2` above card |
| Section card | Card | `radius-lg`, `shadow-sm`, `white`/`neutral-800`; rows separated by 1px `neutral-200` dividers |
| List row (link) | List row | min 48px tall; left icon tile 32×32 `radius-md` (type-tinted per section); middle label `body` + optional `caption` helper; right value `body-sm` + `ChevronRight` 20px `neutral-400` |
| List row (toggle) | List row + Toggle | same shell; right = toggle pill 44×24, knob 20px, on `primary-600` / off `neutral-300` |
| Segmented control (theme) | Segmented | 3 segments (Clair/Sombre/Système); selected `white`/`neutral-900`/`shadow-sm`; min 44px tall |
| Currency picker | Bottom sheet | `radius-lg` top, drag handle, search input, currency list (EUR selectable, others locked), `Check` on selected |
| Export sheet | Bottom sheet | date-range toggle + CSV/JSON Secondary buttons → OS share/save sheet |
| Backup sheet | Bottom sheet | "Créer la sauvegarde" Primary → serializes full dataset to `.json` → OS save to Drive/iCloud (Web Share / download fallback). Timestamped filename. |
| Income Types sheet | Bottom sheet | Read-only enum list (Salaire/Remboursement/Cadeau/Freelance/Vente/Autre) + per-type counts; reorder/rename only in V1. |
| Import sheet | Bottom sheet | file picker (app `.json`/`.csv` only) + non-app-file reject + conflict mode (Fusionner/Remplacer) + progress bar |
| Reset modal | Center modal | `radius-xl`, `shadow-lg`, typed-confirm input, Danger button |
| Toast | Snackbar | `radius-md`, `shadow-toast`, 4s (6s error), `body-sm` |

## Data Fields
| Field | Type | Example Value | Validation |
|---|---|---|---|
| `preferences.currency` | currency code | `EUR` | Single-currency V1; locked to `EUR` (others reserved) |
| `preferences.theme` | enum | `system` | One of `light`, `dark`, `system` |
| `preferences.numberFormat` | enum/string | `1 234,56` | Locale-derived (fr-FR) pattern; persisted |
| `preferences.dateFormat` | enum/string | `d MMM yyyy` | From preset list (fr-FR) |
| `notifications.budgetAlerts` | boolean | `true` | toggle; local scheduled |
| `notifications.recurringReminders` | boolean | `true` | toggle; local scheduled |
| `notifications.weeklySummary` | boolean | `false` | toggle (reserved / 🔴 v2) |
| `export.range` | enum | `all_time` | `this_month`, `this_year`, `all_time` |
| `export.format` | enum | `json` | `csv`, `json` |
| `import.mode` | enum | `merge` | `merge`, `replace_all` |
| `import.confirmText` | string (reset gate) | `EFFACER` | must === "EFFACER" to enable Delete |
| (read-only) `categoriesCount` | integer | `8` | derived from Category store |
| (read-only) `accountsCount` | integer | `3` | derived from Account store |
| (read-only) `recurringPendingCount` | integer | `2` | derived: count of `expected` occurrences this period |
| (read-only) `appVersion` | string | `1.0.0 (42)` | from build manifest |

## States
- **Empty state:** Settings itself is never empty (it is configuration, not content). However, derived values show placeholders: Budget value "Non défini" (`neutral-400`) when no budget exists; Catégories count "0"; Comptes count "0" (should not happen post-onboarding — onboarding forces ≥1 account); Récurrents helper "Aucun récurrent" (`neutral-500`). Export still works (header-only file); we surface a caption "Aucune opération à exporter."
- **Loading state:** Initial load from local store: skeleton rows (`neutral-100`, shimmer off under reduced-motion) for each section while preferences/counts hydrate. Toggles render in their persisted (off) state until hydrated, then settle. Typically <200ms.
- **Error state:** Inline — a failed export/import shows a danger toast (`danger-600`, 6s, manual dismiss) "Échec de l'export — réessayez". The sheet stays open so the user can retry. Reset modal: if deletion partially fails, a danger toast "Impossible de tout effacer — réessayez" and the modal remains. Theme/currency never error (local).
- **Populated state:** (Normal.) All values pre-filled from local store. Counts are correct; toggles reflect saved state. Récurrents row shows "N à confirmer" in `warning-600` when there are pending occurrences. This is the default view.

### Sub-state: Offline
Settings is fully functional offline. No banner is shown *inside* Settings (the global Offline Indicator (11) handles that). **Backup is fully local at generation time** (the JSON is built on-device); saving it into Google Drive / iCloud is delegated to the OS save target — if no cloud app / share target is available, the download fallback writes the file locally so the backup still succeeds. Export/import are local files only.

### Sub-state: Installable / not installable
- If the PWA `beforeinstallprompt` event has fired, the **Installer l'application** row is visible and tappable.
- If not installable (already installed, or unsupported browser e.g. iOS Safari), the row is hidden. The user can still "Ajouter à l'écran d'accueil" via the browser; the À propos section may carry a helper caption to that effect.

## Interactions & Micro-animations
- Row tap (link rows): 120ms `ease-out`, `scale(.98)`, slight `neutral-100` fill on press; navigates on release.
- Toggle: 120ms knob slide + `scale(.98)`; applies instantly with a faint success tick haptic where available.
- Segmented control (theme): segment slides/underlines between options 120ms; theme applies instantly. No flash (Design System §11 — applied before first paint via persisted class). A brief cross-fade of surfaces is acceptable (≤150ms, reduced-motion safe).
- Opening any bottom sheet: translateY 16px + opacity 0→1, 200ms standard ease; scrim fades in. Closing: reverse; swipe-down dismiss (drag handle follows finger, release past 40% → close).
- Reset modal: center scale+fade in 200ms; on confirm the Danger button does `scale(.98)` and the modal closes after the (synchronous local) deletion completes, replaced by a success toast "Données effacées".
- Toasts: slide up from bottom (above bottom nav), `shadow-toast`, auto-dismiss 4s (6s + manual ✕ for errors).
- Pull-to-refresh: not the primary action here, but a pull-down re-hydrates values (consistent with other list screens).
- Under `prefers-reduced-motion`: disable scale pops, sheet slide distance (use opacity-only ≤150ms), and any cross-fade >150ms.

## Accessibility Notes
- **Focus order:** top to bottom through each section's rows, then within any open sheet/modal. Tab moves through interactive elements only (rows, toggles, segmented segments); non-interactive value text is not a tab stop.
- **ARIA labels / roles:**
  - Each link row: `role="button"` (or `role="link"` with `href`), `aria-label` including the destination, e.g. `aria-label="Comptes, {n} comptes, ouvrir la gestion des comptes"`.
  - Toggles: `role="switch"`, `aria-label="Alertes budget"`, `aria-checked`.
  - Theme segmented: `role="radiogroup"` `aria-label="Thème"`, segments `role="radio"` `aria-checked`.
  - Disabled cloud-backup toggle: `aria-disabled="true"` + `aria-label` noting "Bientôt disponible".
  - Icon tiles are decorative (`aria-hidden="true"`); the row label carries the meaning.
  - Reset modal: `role="alertdialog"`, `aria-labelledby` (title), `aria-describedby` (body). Focus moves to the modal's Annuler button on open; focus trapped inside; Esc = Annuler.
  - Bottom sheets: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the sheet title; Esc/swipe-down dismiss; focus returns to the triggering row on close.
  - Toast: `role="status"` (success/info) or `role="alert"` (error); `aria-live` accordingly.
- **Tap targets:** every row ≥48px tall; toggles 44px tall; icon hit areas padded to ≥44×44; segmented segments ≥44px.
- **Contrast:** `danger-600` text on card bg meets AA; in dark mode danger text uses `danger-500` where needed. `neutral-400` helper text is used only for non-essential metadata.
- **Keyboard:** Tab/Shift+Tab cycles interactive elements; Enter/Space activates a row/toggle; Esc closes the topmost sheet/modal.
- **Screen reader:** Group labels (the eyebrows) should be associated with their card via `aria-labelledby` or a group heading so a screen reader announces "Organisation, 4 éléments" etc. Value text is read as part of the row.
- **Reduced motion:** all entrance/exit and press animations simplified per Design System §9.

## Notes / Open Questions
- 🔴 **1. Multi-currency / currency picker.** The app is single-currency (€) in V1 (Design System §13.8.2). The Devise row opens a picker where only EUR is selectable. Confirm whether the picker should be hidden entirely (locked silently to €) or shown locked to signal the roadmap. Recommendation: keep the row (transparency) but lock the picker.
- ✅ **2. Backup — DECIDED & active in V1 (§13.9).** Backup is a **manual JSON export saved into the user's own cloud account (Google Drive / iCloud)** via the Web Share / File System Access API (or download fallback). **No app server, no auth, no live sync** — the user's own cloud is the storage, so offline-first holds. The row is **active** ("Sauvegarder", `CloudUpload` icon), not disabled. (Live automatic sync stays a possible future enhancement but is not V1.)
- 🔴 **3. Push notifications are v2.** The Push API requires a service worker + server. At pure offline-first, real push is out of scope. V1 notifications (alertes budget, rappels récurrents) are **local scheduled** reminders only. The "Résumé hebdomadaire" toggle is reserved/disabled. Confirm whether to remove it for v1 or keep it hidden.
- 🔴 **4. Share/save fallback.** Export relies on Web Share API with `files` support. iOS Safari < 15 and desktop Firefox historically lack file-sharing; need a confirmed download-fallback path (Blob → `<a download>`). The spec assumes a fallback exists but it must be validated per target browser matrix.
- ✅ **5. CSV import scope — DECIDED (§13.9).** V1 import accepts **only the app's own export formats** (a `.json` backup = full restore, or the app's own `.csv` layout = transactions only). **No arbitrary bank-CSV column mapping** in V1 — a non-app file is rejected inline. (A future bank-import flow with a column-mapping sheet is deferred.)
- 🔴 **6. Conflict handling UX detail.** Fusionner mode "skip duplicates by id+date+amount" is a heuristic; duplicates with slightly different amounts would both import. Need a confirmed dedup key and a "X ignorés, Y importés" summary toast (assumed yes).
- 🔴 **7. Typed-confirm for reset.** "Saisissez EFFACER" is a hard gate; confirm whether this is desired or whether the Danger button + modal body warning is sufficient friction. On small screens typing may be heavier than a long-press confirmation.
- 🔴 **8. Comptes count edge case.** Comptes count should never be 0 after onboarding (onboarding forces ≥1 account). If it ever reads 0 (data corruption / partial import), the Comptes row should surface a `warning-600` helper "Aucun compte — créez-en un" and the link should be emphasized.
- 🔴 **9. App/brand name.** Footer says "the app" per the working name (Design System §12.1). Final brand name + logo still TBD.
- ✅ **10. Income types location — DECIDED (§13.3 / Category Management 05 #8).** Income types are managed **here in Settings** (Organisation group → "Types de revenus"), **separately** from expense categories (which live on screen 05). The list is a fixed V1 enum; the sheet is read-only (rename/reorder only). This keeps screen 05 focused on expense categories.
- **Offline guarantee:** Export, backup-generation, import, and reset are 100% local and work offline. The **Backup** row delegates only the *save target* to the OS (Drive/iCloud/download); the dataset itself never leaves the device through an app server. Only the conditional install row touches a platform capability.
