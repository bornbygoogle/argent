# Démarrage / Onboarding (01)

## Purpose
First-launch experience that (a) gives a brief, calm brand moment, then (b) walks the user through a 3-step intro carousel (Saisie rapide / Catégories / Aperçus), then (c) **creates the user's first account** — because the app is multi-account and **unusable without at least one account** (no expense/income/transfer can be recorded without an account to attribute it to). It is a one-time guard: while the local `hasOnboarded` flag is `false`, the `/` route redirects here and the bottom nav + FAB are hidden.

The screen is now single-currency (€) and French. The brand splash and the 3 intro steps are preserved; the first-account creation is added as the **final mandatory step** before landing on the Dashboard.

## Navigation
- **How user arrives here:** Automatic on first launch (or any launch where the local `hasOnboarded` flag is `false`). Route is `/onboarding` per the Deep Link table. No bottom nav, no back chevron — the flow advances forward only (nav map §3: Splash/Onboarding chrome = "none", back behavior = "N/A"). A back control appears **only inside the account-creation step** to return to step 3.
- **Where they can go from here:**
  - **Passer** (top-right, steps 1–3) → jumps directly to the **account-creation step** (it cannot skip account creation, since the app is unusable without an account — see 🔴 open question 1). On the account step, "Passer" is replaced by "Créer le compte" (the step is mandatory).
  - **Continuer** (primary button, steps 1–2) → advances to the next carousel step.
  - **Continuer** (primary button, step 3) → advances to the **account-creation step**.
  - **← Retour** (account step, top-left) → returns to step 3 of the carousel.
  - **Créer le compte & démarrer** (primary button, account step) → creates the first account (persisted), sets `hasOnboarded = true`, routes to `/` (Dashboard).
  - Step indicator dots cover the **3 intro steps only** (account creation is a distinct mandatory gate, not a 4th dot). Navigation is via the buttons; swipe left/right works on the carousel body (steps 1–3) but not on the account form.
  - Optional inline link **"Définir la devise & un budget"** (step 3) → 🔴 open question 2 (deferred by default).

## Layout Description

The screen has three phases: **Splash** (≈1.5s), **Carousel** (3 intro steps), and **Account creation** (mandatory). Below, top-to-bottom, left-to-right.

### Phase A — Splash (brand moment, ≈1.5s, auto-advances)
- Full-bleed background `neutral-50` (light) / `neutral-900` (dark).
- Vertically centered, horizontally centered stack:
  1. **App mark** — a rounded-square tile, 96×96px, `radius-xl`, `shadow-md`, bg gradient `primary-600` → `primary-500`, containing a white `Wallet` (or `PiggyBank`) Lucide icon at 48px, stroke 2px. (🔴 Final icon/brand pending — design system §12 #1.)
  2. **App wordmark** — `h1` (24px/700), text `neutral-900` (light) / `neutral-50` (dark), centered. Placeholder text: "the app".
  3. **Tagline** — `body-sm`, text `neutral-500`, centered, `space-2` below the wordmark. Placeholder: "Gérez votre argent, sereinement."
- No buttons, no status chrome during splash. A subtle 12px indeterminate progress dot may sit `space-12` below the tagline if data init is slow (>800ms); otherwise the splash is purely timed.
- Splash auto-dismisses to the carousel via a 200ms opacity fade (`prefers-reduced-motion`: fade ≤150ms, no slide).

### Phase B — Carousel (3 intro steps, identical scaffold)

Scaffold (constant across all steps):
- Top bar zone (height 56px + safe-area top): transparent background, no title. **Right-aligned:** a **Passer** ghost button (`body-sm`, text `neutral-500`, tap target 44×44, ARIA label "Passer l'introduction"). Left side intentionally empty.
- Body: vertically split into an **illustration zone** (upper ~55% of viewport) and a **text zone** (lower ~45%). Both horizontally centered with `space-4` left/right gutter.
- Footer zone (pinned above bottom safe area, `space-4` padding): contains the **step dots** row and the **primary action button** (full-width). Min `space-8` gap between body and footer.

#### Step 1 — Saisie rapide (Quick Add)
- Illustration zone: concentric `primary-50`/`primary-100` soft circles framing a `primary-600` `radius-xl` `shadow-fab` tile with a white `Plus` (44px), plus two floating mini-cards (`radius-md`, `shadow-md`, white) each showing a colored category icon and a small `−X,XX €` amount — evoking instant capture. Decorative.
- Text zone:
  - Eyebrow `label` ("ÉTAPE 1 SUR 3"), text `primary-600`, centered.
  - Heading `h1` "Ajoutez en 2 secondes", text `neutral-900`, centered, `space-2` below eyebrow.
  - Body `body` "Saisissez une dépense en un geste, même hors-ligne. Le gros pavé numérique fait tout le travail.", text `neutral-500`, centered, `space-3` below heading.

#### Step 2 — Catégories
- Illustration zone: a panel showing a 3×2 grid of **category chips** — each `radius-full`, bg `neutral-100`, with a colored category icon (Lucide `ShoppingCart`, `Utensils`, `Car`, `Film`, `Home`, `Receipt`) at 20px in its preset swatch color + a `body-sm` label.
- Text zone:
  - Eyebrow `label` ("ÉTAPE 2 SUR 3"), `primary-600`.
  - Heading `h1` "Classez vos dépenses", `neutral-900`.
  - Body `body` "Étiquetez chaque opération d'une catégorie et d'une icône. Personnalisez-les à tout moment dans les Réglages.", `neutral-500`.

#### Step 3 — Aperçus (Insights)
- Illustration zone: a stylized **budget progress bar + bar chart** mock — a hero number "420 €" (`amount-lg`, tabular) above a `radius-full` progress track at ~70% fill colored `success-500`, and below it a row of 5–7 mini vertical bars (`neutral-200` fills, one bar `primary-600`). Decorative.
- Text zone:
  - Eyebrow `label` ("ÉTAPE 3 SUR 3"), `primary-600`.
  - Heading `h1` "Voyez où passe votre argent", `neutral-900`.
  - Body `body` "Un tableau de bord serein affiche vos dépenses du jour et votre budget mensuel d'un coup d'œil.", `neutral-500`.
- **(Optional)** a ghost link directly under the Continuer button: "Définir la devise & un budget" — `body-sm`, text `primary-600`, centered. Present only if the currency+budget sub-step is approved (🔴 open question 2). Otherwise omitted.

#### Footer (steps 1–3)
- **Step dots** — centered row of 3 dots: active dot is a 24×8px pill (`radius-full`, bg `primary-600`); inactive dots are 8×8px circles (bg `neutral-300`). Gap `space-2`. Display-only (`aria-hidden`).
- **Primary button** — full-width, min-height 48px, `radius-md`, bg `primary-600`, white text, `button` role. Label: "Continuer" (steps 1–3). Always enabled. Tap target ≥44px.

### Phase C — Account creation (mandatory gate)

This step cannot be skipped — the multi-account app requires at least one account before the Dashboard can render. It renders as a full-screen card form (not a dot-tracked step).

- **Top bar zone** (56px + safe-area top), transparent bg. **Left:** a **← Retour** ghost button (`body-sm`, `neutral-500`, 44×44, `aria-label="Retour à l'introduction"`) → returns to step 3. **Right:** empty ("Passer" is intentionally absent — creation is mandatory).
- **Body** (`space-4` gutter, `space-8` top):
  - Eyebrow `label` "DERNIÈRE ÉTAPE", `primary-600`, centered.
  - Heading `h1` "Créez votre premier compte", `neutral-900`, centered.
  - Body `body` "Tout commence par un compte. Vous pourrez en ajouter d'autres (épargne, espèces…) plus tard.", `neutral-500`, centered, max-width ~320px.
  - **Live preview tile** (centered, `space-6` below): a 56×56 `radius-full` tile showing the chosen type color at ~15% tint with the chosen icon at 28px, plus the account name in `body` `neutral-700` below it — updates live as the user fills the form.
  - **Form card** (`radius-lg`, `shadow-sm`, `white`/`neutral-800`, `space-4` inner padding, `space-4` gaps):
    1. **Nom du compte** field: `.label` "NOM DU COMPTE"; text input (`neutral-100`, `radius-md`, `space-3`×`space-4`), placeholder "ex. Compte courant". Helper `caption` `neutral-500` "Affiché sur chaque opération". Error `caption` `danger-600` if empty/duplicate. Autofocus.
    2. **Type de compte**: `.label` "TYPE"; a **segmented control / chip group** of 4 options: **Courant** (`Wallet`, `primary-600`), **Épargne** (`PiggyBank`, `success-500`), **Espèces** (`Banknote`/`Coins`, `warning-500`), **Autre** (`CircleDashed`, `neutral-500`). Default selection = **Courant**. Selecting updates the preview tile's color + icon. Each option ≥44px, single-select.
    3. **Solde d'ouverture (optionnel)** field: `.label` "SOLDE D'OUVERTURE (OPTIONNEL)"; a numeric input with leading "€" and tabular figures, placeholder "0,00". Helper `caption` "Le solde de départ de ce compte". ≥ 0, 2 decimals. Default 0.
- **Footer** (pinned above bottom safe area, `space-4` padding): full-width **Primary button** "Créer le compte & démarrer" (`primary-600`, 48px, white text). **Disabled** (bg `neutral-200`, text `neutral-400`) until the name field is non-empty and valid; enabled once valid. Tap target ≥44px.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| App mark (splash) | Decorative tile | 96×96px, `radius-xl`, `shadow-md`, gradient `primary-600`→`primary-500`, white Lucide icon 48px |
| App wordmark | Text (`h1`) | 24px/700, `neutral-900`/`neutral-50`, centered |
| Tagline | Text (`body-sm`) | `neutral-500`, centered |
| Passer button | Ghost button | `body-sm`, `neutral-500`, tap target 44×44, top-right (steps 1–3 only), ARIA "Passer l'introduction" |
| ← Retour button | Ghost button | `body-sm`, `neutral-500`, 44×44, top-left (account step only), ARIA "Retour à l'introduction" |
| Step eyebrow | Text (`label`) | UPPERCASE, `primary-600`, e.g. "ÉTAPE 1 SUR 3" / "DERNIÈRE ÉTAPE" |
| Step heading | Text (`h1`) | 24px/700, `neutral-900`, centered |
| Step body | Text (`body`) | `neutral-500`, centered |
| Illustration panel | Decorative card | `neutral-100`/`neutral-800`, `radius-xl`, `shadow-sm`, non-interactive |
| Category chip (decorative) | Chip | `radius-full`, bg `neutral-100`, icon (preset swatch) + `body-sm` label |
| Step dots | Indicator | 3 dots; active = 24×8 pill `primary-600`; inactive = 8×8 circle `neutral-300`; `aria-hidden` |
| Primary button (intro) | Primary button | Full-width, min 48px, `radius-md`, bg `primary-600`, white text; "Continuer" |
| Account preview tile | Avatar + text | 56×56 `radius-full`, type-color tint, 28px icon; name `body` below; live-updating |
| Nom du compte input | Text field | `neutral-100`, `radius-md`, leading focus `primary-500`; placeholder "ex. Compte courant"; autofocus |
| Type segmented control | Segmented / chip group | 4 options (Courant/Épargne/Espèces/Autre), each icon + label, ≥44px, single-select; default Courant |
| Solde d'ouverture input | Numeric field | "€" prefix, tabular, optional, placeholder "0,00" |
| Primary button (account) | Primary button | "Créer le compte & démarrer"; Disabled until name valid |
| Currency/budget link (optional) | Ghost link | `body-sm`, `primary-600`, step 3 only (🔴 pending decision) |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `hasOnboarded` | boolean (local flag) | `true` | Set to `true` only after the first account is created; gates the `/onboarding` redirect |
| `currentStep` | integer (1–3) | `1` | Bound 1..3; drives eyebrow + dots + button label (intro phase) |
| `account.name` | string | `"Compte courant"` | 1–32 chars; unique (case-insensitive); not empty |
| `account.type` | enum | `courant` | One of `courant`, `épargne`, `espèces`, `autre` (Design System §13.1); default `courant` |
| `account.openingBalance` | number | `0` | ≥ 0, 2 decimals; default 0 |
| `account.color` | derived hex | `#4F46E5` | Derived from type (courant=`primary-600`, épargne=`success-500`, espèces=`warning-500`, autre=`neutral-500`) — not user-editable here |
| `account.icon` | derived string (Lucide) | `"Wallet"` | Derived from type; not user-editable here |
| `account.createdAt` | ISO datetime | `2026-06-24T…` | set on create |
| (optional) `currency` | string (ISO 4217) | `EUR` | Single-currency V1; locked to `EUR`; only collected if sub-step approved |
| (optional) `monthlyBudget` | number | `1500` | ≥ 0, numeric; only if approved; deferred otherwise |

## States
- **Empty state:** N/A — onboarding has no data dependencies; it is the first-run empty state itself. The account form starts with sensible defaults (type Courant, balance 0, name empty + autofocus).
- **Loading state:** Splash holds for ≈1.5s while local DB/flags initialize. If init exceeds ~800ms, a single 12px indeterminate spinner (`primary-500`) appears `space-12` under the tagline. Creating the account is a synchronous local write; the Primary button briefly shows a 16px spinner (`primary-500`, on white) for ~150ms before routing.
- **Error state:** Onboarding has no network calls (offline-native). Failure paths: (a) **local-storage write error** (e.g. private mode quota) when persisting `hasOnboarded`/the account → toast (bottom, `danger-600`, `shadow-toast`, 6s + manual dismiss): "Impossible d'enregistrer. Vérifiez les autorisations de stockage."; (b) **duplicate account name** → inline `caption` `danger-600` "Un compte avec ce nom existe déjà" on the name field, button stays disabled. (c) If the account write fails, the Dashboard guard still requires an account, so the user remains on this step with the toast.
- **Populated state:** N/A for the intro phase (illustrations are static). For the account step, the preview tile + form reflect live input.
- **Disabled-button state:** "Créer le compte & démarrer" is disabled (bg `neutral-200`, text `neutral-400`, `aria-disabled="true"`) until `account.name` is non-empty and unique.

## Interactions & Micro-animations
- **Splash → carousel:** 200ms opacity fade (splash out, carousel in). `prefers-reduced-motion`: ≤150ms, opacity only, no translate.
- **Continuer press:** button `scale(.98)` + darken to `primary-700`, 120ms `ease-out`; then slide carousel body in via translateY 16px + opacity 0→1 (standard ease, 200ms).
- **Swipe left/right** on carousel body (steps 1–3): advances/regresses step with the same slide transition; respects `prefers-reduced-motion` (fade only). Does **not** apply on the account form (a deliberate dead-end for swipe, since creation is mandatory).
- **Passer press (steps 1–3):** ghost button → `primary-50` fill on press (120ms); jumps to the **account-creation step** (not to the Dashboard — the app needs an account).
- **← Retour press (account step):** returns to step 3 with the reverse slide.
- **Type chip selection:** preview tile updates instantly (color + icon) with a `scale(.96)` pop 120ms.
- **Name input:** live-enables the Primary button as soon as the name is valid; duplicate check on blur.
- **Créer le compte & démarrer press:** `scale(.98)` + `primary-700`, 120ms; brief spinner; then emphasized page transition (280ms) to the Dashboard. The new account is persisted; `hasOnboarded = true`.
- **Step dot transition:** the active pill animates width 8→24px and color `neutral-300`→`primary-600` over 150ms. Disabled under reduced-motion (instant swap).
- **Haptics:** optional light haptic (selection tick) on step advance and on type selection where available; suppressed under reduced-motion.
- All motion respects `prefers-reduced-motion`: disable slide/translate, dot width animation, scale pops; cap all fades at ≤150ms.

## Accessibility Notes
- **Focus order (carousel):** Passer button → Primary button (Continuer). Illustration panels are decorative (`aria-hidden`). Step dots are `aria-hidden`.
- **Focus order (account step):** ← Retour → Nom du compte input (autofocus) → Type segmented → Solde d'ouverture → Primary button.
- **Screen reader:** Each intro step's eyebrow + heading + body is grouped in a single `aria-live="polite"` region so advancing announces the new content. The illustration panel has an empty `alt`/`aria-hidden` (decorative). On the account step, the preview tile is `aria-hidden` (the form fields already convey name/type), and field labels are programmatically associated (`<label for>`).
- **Passer / Retour:** `aria-label="Passer l'introduction"` / `"Retour à l'introduction"`, `role="button"`.
- **Type segmented:** `role="radiogroup"` `aria-label="Type de compte"`, options `role="radio"` `aria-checked`; default Courant checked.
- **Primary button:** descriptive label via its text; the disabled state carries `aria-disabled="true"` and a `tooltip`/`aria-describedby` "Saisissez un nom de compte".
- **Numeric input:** `inputmode="decimal"`, `aria-label="Solde d'ouverture en euros"`.
- **Reduced motion (`prefers-reduced-motion: reduce`):** disable slide/translate and dot width animation; cap all fades at ≤150ms.
- **Contrast:** all text meets WCAG AA — `neutral-900` on `neutral-50` (light), `neutral-50` on `neutral-900` (dark); `primary-600` on white for buttons; `neutral-500` body text verified ≥4.5:1 on both backgrounds.
- **Tap targets:** Passer/Retour (44×44), primary buttons (48px min, full-width), type options (≥44px), optional currency link (44×44 padded hit area).
- **Keyboard:** all controls operable via Tab/Enter/Space; swipe gestures have button equivalents; type group navigable with arrow keys.

## Notes / Open Questions
- 🔴 **1. "Passer" cannot skip account creation.** Because the multi-account app is unusable without at least one account, "Passer" (steps 1–3) jumps to the account step rather than the Dashboard, and the account step has no skip. Confirm this is acceptable — the trade-off is that "Passer" no longer means "go straight in". Recommendation: keep it; rename to "Passer l'intro" to set expectations, and make the account step clearly mandatory ("DERNIÈRE ÉTAPE").
- 🔴 **2. Currency + first budget during onboarding?** Should the user set a currency (locked to `EUR` in V1 anyway) and a monthly budget as part of the account step or a 4th step, or defer entirely to Budget Settings (07) / Settings (09)? Recommendation: **defer** — currency is fixed to € in V1 (no choice to offer), and a budget prompt would add friction to an already-mandatory account step. Surface a soft prompt ("Définir un budget mensuel ?") from the Dashboard on first session instead. The optional currency/budget link in step 3 and the corresponding data fields are contingent on this decision.
- 🔴 **3. Brand name & app icon** — "the app" and the `Wallet`/`PiggyBank` mark are placeholders (design system §12 #1). Final wordmark + maskable 512²/192² PWA icon needed before build polish.
- 🔴 **4. Illustration assets** — the panels are described as composed UI mockups (chips, floating cards, bar chart). Confirm this lightweight approach is preferred over commissioning custom illustration art; if art is wanted, a `radius-xl` `shadow-sm` framed illustration token should be added to the design system.
- 🔴 **5. Splash duration** — 1.5s timed; if local init is consistently <400ms, consider shortening to 1.0s to avoid feeling slow. Confirm.
- 🔴 **6. Account type icons & colors.** Type color is derived from type (§13.1) and not user-editable during onboarding. Confirm Courant=`primary-600`/`Wallet`, Épargne=`success-500`/`PiggyBank`, Espèces=`warning-500`/`Banknote`, Autre=`neutral-500`/`CircleDashed` are the desired defaults (Accounts management 13 may later let the user override color/icon).
- 🔴 **7. Single-account minimum enforcement.** Confirm the app hard-blocks the Dashboard until ≥1 account exists (the onboarding guard + a runtime guard if a user later deletes their last account from screen 13). Design System §13.8.6 recommends soft-delete/archive rather than cascade; deleting the last account should be blocked or re-trigger this step.
- **Re-triggering onboarding** — no in-flow path to revisit; a "Rejouer l'intro" entry in Settings (09) could deep-link to `/onboarding` without setting `hasOnboarded=false`. Flagged for the Settings spec.
