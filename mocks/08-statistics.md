# Statistiques (onglet Stats)

> Écran `08` — racine de la bottom-nav (`Stats`, slot 2). Route : `/stats?period=week|month|year&account=all|<id>`.
> Spécification visuelle de référence : `mocks/preview/html/08-statistics.html`.

## Purpose

Afficher les **tendances** et **comparaisons** de dépenses pour une période sélectionnable (Semaine / Mois / Année), avec un graphique de tendance, une comparaison **revenus vs dépenses** désormais significative (les revenus sont suivis — §13.3), les top catégories, les top commerçants, et des cartes d'insight — pour que l'utilisateur comprenne comment ses dépenses évoluent dans le temps et où elles se concentrent.

L'écran est **account-scoped** : un contrôle segmenté `.seg` bascule la portée entre **Tous** (agrégat sur tous les comptes) et **un compte précis** (Courant / Épargne / Espèces / …). Toutes les séries, comparaisons, tops et patterns respectent la portée. La portée est partagée avec les écrans 06 et 07 (modèle §13.6 / nav-map §8.5). Les **virements** sont exclus de toutes les agrégats (§13.2).

## Navigation

- **Comment l'utilisateur arrive ici :**
  - Tap sur l'onglet **Stats** de la bottom-nav (slot 2, icône `BarChart3`).
  - Empilé depuis la **Vue mensuelle (06)** via « Voir les tendances → ».
  - Empilé depuis une carte d'insight du Dashboard (« Vous avez dépensé 18% de moins… ») liée aux stats.
- **Où il peut aller :**
  - **Contrôle segmenté de portée** (`Tous / Courant / Épargne / Espèces`) — re-rend l'écran en place selon le compte ; pas de navigation. Le segment actif se synchronise avec la portée partagée (Accueil / Stats / Calendrier).
  - **Toggle de période (Semaine / Mois / Année)** — re-rend tous les graphiques en place ; pas d'empilement.
  - **Flèches période précédente / suivante** — décalent la fenêtre affichée (ex. semaine précédente). En place, pas d'empilement.
  - **Tap sur une barre/point du graphique de tendance** → ouvre une feuille détail de période ; « Voir les dépenses » → empile la **Liste des dépenses (04)** filtrée à cette tranche de période + compte.
  - **Tap sur une ligne de top-catégorie** → empile la **Liste des dépenses (04)** filtrée par catégorie + période + compte (`?cat=&from=&to=&account=`).
  - **Tap sur une ligne de top-commerçant** → empile la **Liste des dépenses (04)** filtrée par commerçant + période + compte.
  - **Tap sur le CTA d'une carte d'insight** (ex. « Voir les dépenses Restaurant ») → empile la **Liste des dépenses (04)** avec le filtre pertinent.
  - **Tap sur une barre « semaine vs week-end »** → empile la **Liste des dépenses (04)** filtrée à ces jours + période + compte.
  - **Tap sur la comparaison revenus vs dépenses** → feuille de détail (sources de revenus par type, cf. §13.3).
  - **FAB (+)** centrée dans la bottom-nav → ouvre la feuille d'action rapide (Dépense / Revenu / Virement), puis le plein écran correspondant. Compte par défaut = portée actuelle (ou dernier utilisé si `Tous`).
  - **Tirer vers le bas** → rafraîchir / re-sync depuis le store local.
- La bottom-nav et la FAB restent présentes (racine d'onglet). **Pas de chevron retour** — l'emplacement accueille le toggle de période.

## Layout Description

De haut en bas, de gauche à droite, portrait mobile, gouttière `space-4` :

1. **Top-bar (sticky, 56px + safe-area top).** Fond `neutral-50`/`neutral-900`, `shadow-sm` au scroll. Gauche : titre **« Statistiques »** (`h1`→`h3`). Droite : icône **`Share`/`Download`** (export, ≥44px) → ouvre une feuille pour exporter la vue courante (PNG/CSV) — question ouverte.

2. **Contrôle segmenté de portée `.seg`** (Design System §13.6). Pleine largeur (`max-w-md` centrée sur tablette), `radius-md`, fond `neutral-100`, padding `space-1`, min-height 36px / zone tactile ≥44px. Segments : **`Tous` · `Courant` · `Épargne` · `Espèces`** (+ `autre`). Segment actif : fond `white`/`neutral-800`, texte `neutral-900`, `shadow-sm`, slide 200ms. Chaque segment porte le **point coloré du type de compte** (§13.1) devant son libellé ; `Tous` = icône `LayoutGrid` ou anneau multi-couleurs. Si un seul compte, le segment unique est sélectionné et le contrôle désactivé/masqué (cf. QO 06).

3. **Toggle de période.** Ligne pleine largeur, fond `neutral-100`, `radius-md`, padding `space-1` (comme le mockup). Trois boutons `Semaine` / `Mois` / `Année` (`flex:1`). Actif : fond `white`, `radius` interne, `shadow-sm`, `font-weight:600`, `neutral-900`. Inactif : `neutral-500`. Min-height 36px / zone tactile ≥44px.

4. **Graphique de tendance (carte).** Pleine largeur, `radius-lg`, `shadow-sm`, `white`/`neutral-800`, padding `space-4`.
   - Ligne `row-between` : gauche eyebrow `label` « TENDANCE » + `amount-lg` total **« 1 240 € »** (tabulaire). Droite : **pill de delta** `▲ 18%` ou `▼ 12%`, `radius-full`, fond `success-50`/`danger-50`, texte `success-600`/`danger-600`, `font-weight:700`, icône flèche. Pour les **dépenses** : delta négatif = `success` (moins dépensé), positif = `danger` (plus dépensé).
   - **Graphique (SVG, `preserveAspectRatio="none"`, h~110px comme le mockup) :**
     - **Semaine** → 7 barres (Lun–Dim), axe-x `L M M J V S D` (`caption` `neutral-400`).
     - **Mois** → ~30 barres (une par jour) ; axe-x label tous les 5 jours (`caption`). Recommandation : barres pour ≤31 points.
     - **Année** → 12 barres (Jan–Déc), axe-x `Jan … Déc` (`caption`).
   - Barres : largeur remplit le slot avec gouttière `space-1` ; remplissage `primary-200` (`#C7D2FE`) pour les barres passées ; la **barre de la période courante** mise en évidence en `primary-500`/`primary-600` ; la dernière barre (période en cours) en `primary-600`. Référence : une ligne de base horizontale `neutral-200` (`#E2E8F0`) à y=95.
   - **Série période précédente** superposée en pointillé/fantôme : barres fines `neutral-300` derrière, OU ligne tiretée `neutral-400` — pour comparaison visuelle. La dernière barre `neutral-200` représente la période précédente à la même position (cf. mockup).
   - Tap sur une barre → tooltip `caption` (« 15 juin : 164 € »).
   - Ligne `row-between` sous le graphique : `caption` « vs 1 512 € en mai » à gauche, `caption` « 272 € économisés » à droite.

5. **Comparaison Revenus vs Dépenses (carte, NOUVEAU — significative car les revenus sont suivis).** `radius-lg`, `shadow-sm`, padding `space-4`.
   - Eyebrow `label` « REVENU VS DÉPENSES ».
   - Deux barres horizontales empilées ou côte à côte : **Revenus** (`success-500` fill, label montant `amount-md` « +2 100 € ») et **Dépenses** (`danger-500` fill, label « −1 240 € »). Les largeurs relatives au max(revenus, dépenses).
   - **Solde net** centré dessous : `amount-lg` **« +860 € »** en `success-600` si positif (évitement/épargne), `danger-600` si négatif (déficit).
   - **Deltas sémantiques :** à côté de chaque montant, un `caption` delta vs période précédente — revenus `▲ 5%` (`success-600` : plus de revenus = bien), dépenses `▼ 18%` (`success-600` : moins de dépenses = bien). Un delta revenus négatif = `danger-600` (moins de revenus = mal), un delta dépenses positif = `danger-600` (plus de dépenses = mal).
   - Tap → feuille de détail listant les revenus par type (Salaire / Remboursement / Cadeau / Freelance / Vente / Autre — §13.3).

6. **Carte d'insight (cf. mockup « insight »).** `radius-lg`, bordure 1px `primary-100`, fond `primary-50`, padding `space-4`.
   - Icône `Lightbulb` `primary-600` à gauche, texte à droite : titre `body` `primary-700` `font-weight:600` (« Bon mois ! ») + `body-sm` `primary-700` (« Vos sorties restaurant ont baissé de 32%. Vous êtes en dessous de votre moyenne habituelle. »).
   - Peut être une rangée scrollable horizontalement de plusieurs cartes d'insight (cf. Layout original) ou une carte unique mise en avant. Chaque carte : bordure gauche accent 4px (success/warning/primary), `body-sm` + lien fantôme « Voir → » (`primary-600`, ≥44px).

7. **Top catégories (carte).** `radius-lg`, `shadow-sm`, padding `space-4`.
   - Eyebrow `label` « TOP CATÉGORIES ».
   - **Liste de barres** (pas un donut ici) : une ligne par catégorie, max 6. Chaque ligne :
     - Gauche : nom de catégorie (`r-title`, `body`, `neutral-700`, `flex:1`).
     - Centre : **barre de part** horizontale (8px, `radius-full`, piste `neutral-100`, remplissage = couleur catégorie, largeur = part %), `flex:1.4`.
     - Droite : montant `amount-md` réduit (13px, droite, 60px de large).
   - Lignes tapables (≥44px).

8. **Top commerçants (carte).** `radius-lg`, `shadow-sm`, padding `space-4`.
   - Eyebrow `label` « TOP COMMERÇANTS ».
   - **Liste classée** (max 8) : numéro de rang (`cat sm`, fond `neutral-100`, texte `neutral-700` `font-weight:700`, ex. « 1 »), nom (`r-title` `body`, `neutral-700`), compte de transactions (`r-sub` `caption`, « 12 visites »), montant droite `amount-md` (14px, « −248 € »). Lignes séparées par diviseurs 1px `neutral-200`. Tapables (≥44px).

9. **Patterns de dépense (carte, optionnelle — cf. Layout original).** `radius-lg`, `shadow-sm`, padding `space-4`, `gap:space-3`.
   - Eyebrow `label` « PATTERNS ».
   - **Semaine vs Week-end :** deux barres — jours ouvrés total + moy/jour, week-end total + moy/jour, chacune avec barre de part (remplissage `primary-500` ouvrés / `#EC4899` week-end). Tapables → Liste filtrée.
   - **Plus grosse dépense :** ligne — icône + commerçant + date (`caption`) + `amount-md`. Tap → Édition dépense (12) ou Liste.
   - **Jour le plus actif :** « Vous dépensez le plus le **vendredi** (X € moy). »

10. **Bottom-nav + FAB centrale** persistantes ; onglet Stats actif.

### Spécification de portée (agrégat vs compte unique)

| Segment | Tendance & tops | Revenus vs Dépenses | Comparaison période précédente |
|---|---|---|---|
| **Tous** | Somme des dépenses de **tous les comptes**, par catégorie/commerçant (virements exclus). | Somme revenus tous comptes vs somme dépenses tous comptes. Solde net = somme. | Agrégat courant vs agrégat période précédente. |
| **Compte unique** | Dépenses de ce compte uniquement. | Revenus de ce compte vs dépenses de ce compte. Solde net de ce compte. | Ce compte, période courante vs précédente. |

Les **virements** sont toujours exclus des agrégats de dépenses ET de revenus (interne — §13.2), quelle que soit la portée.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Top-bar | Barre sticky | 56px + safe-area top, `neutral-50`/`neutral-900`, `shadow-sm` au scroll. |
| Titre | Texte | « Statistiques » (`h3`). |
| Bouton export | Bouton-icône | `Share`/`Download` 24px en ≥44px ; ouvre feuille export. |
| Contrôle segmenté `.seg` | Segmented control (§13.6) | `Tous / Courant / Épargne / Espèces` ; actif `white`+`shadow-sm` ; point coloré type ; slide 200ms. |
| Toggle de période | Segmented control | 3 pills Semaine/Mois/Année, actif `white`/`shadow-sm` `neutral-900`, inactif `neutral-500`, `radius-md`, min 36px / ≥44px hit. |
| Sélecteur de période | Contrôle inline | `ChevronLeft` + « 1 juin – 30 juin 2026 » (`h3`) + `ChevronRight` ; flèches ≥44px ; désactivées `neutral-300` aux bornes. |
| Carte tendance | Carte | `radius-lg`, `shadow-sm`, padding `space-4`. |
| Pill de delta | Badge | `▲/▼ N%`, `radius-full`, `caption` ; dépenses : négatif=`success-600`/`success-50`, positif=`danger-600`/`danger-50`. |
| Graphique de tendance | Graphique | Barres (Semaine/Mois/Année) ; barre courante `primary-600`, autres `primary-200`/`primary-500`, période précédente superposée `neutral-200`/`neutral-300` ; ligne base `neutral-200`. |
| Tooltip de barre | Popover | `caption`, `neutral-700` sur `white`/`neutral-800`, `shadow-md`, `radius-md`. |
| Carte Revenus vs Dépenses | Carte | `radius-lg`, `shadow-sm`, padding `space-4`. Deux barres (revenus `success-500`, dépenses `danger-500`) + solde net `amount-lg`. |
| Carte d'insight | Carte | `radius-lg`, bordure `primary-100`, fond `primary-50`, icône `Lightbulb` + texte `primary-700`. |
| Carte Top catégories | Carte | `radius-lg`, `shadow-sm`, padding `space-4`. |
| Ligne barre catégorie | Ligne tapable | Nom + barre de part (8px `radius-full`, piste `neutral-100`, fill couleur catégorie) + `amount-md`. ≥44px. |
| Carte Top commerçants | Carte | `radius-lg`, `shadow-sm`, padding `space-4`. |
| Ligne commerçant | Ligne classée | Rang `cat sm` + nom `body` + compte `caption` + `amount-md` ; diviseurs `neutral-200`. ≥44px. |
| Carte patterns | Carte | `radius-lg`, `shadow-sm`, padding `space-4`, `gap:space-3`. |
| Barres semaine/week-end | Mini graphique | 2 barres de part, fill `primary-500` (ouvrés) / `#EC4899` (week-end), labels + `amount-md`. Tapables. |
| Bottom-nav | Barre d'onglets | 5 colonnes ; Stats actif (`primary-600`). |
| FAB | FAB | 56×56, fond `primary-600`, `Plus`, `shadow-fab`, `radius-full`. → Feuille d'action rapide. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `period` | enum `week`\|`month`\|`year` | `month` | Depuis le toggle ; pilote toutes les requêtes. |
| `account` | `all` \| id (query/state) | `all` / `acct_courant` | `all` ou id de compte existant ; piloté par le segment actif. |
| `periodStart` | `YYYY-MM-DD` | `2026-06-01` | Inclusif. |
| `periodEnd` | `YYYY-MM-DD` | `2026-06-30` | Inclusif ; ≥ periodStart. |
| `periodTotal` | décimal | `1240.00` | Somme des dépenses du scope dans [start,end] ; ≥ 0 (virements exclus). |
| `prevPeriodTotal` | décimal | `1512.00` | Somme pour la fenêtre précédente égale du scope. |
| `deltaPct` | pourcent signé \| null | `-18.0` | (courant − précédent)/précédent × 100 ; pour dépenses : négatif=`success`, positif=`danger`. |
| `seriesPoint` | `{ label, total, date }` | `{ "15 juin", 164.00, "2026-06-15" }` | Un par barre ; total ≥ 0. |
| `prevSeriesPoint` | `{ label, total }` | `{ "15 mai", 120.00 }` | Superposition ; nullable. |
| `incomeTotal` | décimal | `2100.00` | Somme des revenus du scope dans la période (§13.3). |
| `prevIncomeTotal` | décimal | `2000.00` | Somme des revenus de la période précédente. |
| `incomeDeltaPct` | pourcent signé \| null | `+5.0` | (courant−précédent)/précédent × 100 ; pour revenus : positif=`success`, négatif=`danger`. |
| `expenseDeltaPct` | pourcent signé \| null | `-18.0` | Cf. `deltaPct` (dépenses). |
| `netBalance` | décimal signé | `+860.00` | incomeTotal − periodTotal. |
| `categoryShare` | `{ name, color, total, pct }` | `{ "Courses", "#10B981", 496.00, 40.0 }` | Trié desc ; pct somme ~100 sur les listés (scope). |
| `merchantRank` | `{ name, total, count }` | `{ "Carrefour", 248.00, 12 }` | Trié desc ; count ≥ 1 (scope). |
| `weekdayTotal` | décimal | `860.00` | Somme des dépenses Lun–Ven du scope. |
| `weekendTotal` | décimal | `380.00` | Somme des dépenses Sam–Dim du scope. |
| `weekdayAvgPerDay` | décimal | `172.00` | weekdayTotal / nombre de jours ouvrés. |
| `weekendAvgPerDay` | décimal | `190.00` | weekendTotal / nombre de jours week-end. |
| `biggestExpense` | `{ id, merchant, amount, date, category }` | `{ 42, "Carrefour", 89.00, "2026-06-15", "Courses" }` | Max dépense unique de la période (scope). |
| `mostActiveWeekday` | chaîne | « Vendredi » | Jour avec avg spend le plus élevé. |
| `insightCard` | `{ type, text, accent, ctaFilter }` | `{ "decrease", "Vos sorties restaurant ont baissé de 32%…", "primary", ?cat=restaurant&from=&to=&account= }` | Pilote les cartes d'insight dynamiques. |

## States

- **Empty state (aucune dépense dans la période, sur le scope) :** le graphique de tendance rend une ligne de base vide (barres `neutral-100` plates / pas de ligne) ; un `body` centré « Aucune dépense du 1er au 30 juin 2026. » + bouton secondaire « Ajouter une dépense ». Les cartes insight/catégorie/commerçant/pattern affichent des placeholders `body-sm` « Rien à afficher pour l'instant ». La carte Revenus vs Dépenses : si des revenus existent mais pas de dépenses, affiche revenus + solde net = revenus (positif) ; si ni l'un ni l'autre, placeholder.
- **Empty state (compte unique sans aucune donnée) :** graphique vide, tops vides, et un `caption` informatif « Ce compte n'a aucune activité sur cette période. » sous le segment actif.
- **Loading state :** shimmer squelette — graphique de tendance une rangée de barres `neutral-200` de hauteurs aléatoires ; lignes catégorie/commerçant en barres `neutral-100` ; cartes d'insight en blocs `neutral-100` ; carte revenus/dépenses en barres shimmer. Le contrôle segmenté et le toggle période restent interactifs. Pas de count-up. Shimmer désactivé sous `prefers-reduced-motion` (gris statique).
- **Error state :** `body` centré « Impossible de charger les statistiques. » + `caption` détail erreur (`danger-600`) + bouton primaire « Réessayer ». Cartes masquées. Retry par tirer-vers-le-bas.
- **Sparse state (1–2 jours de données seulement) :** le graphique montre les barres disponibles ; pills de delta masquées (pas assez pour comparer) ; cartes d'insight réduites aux non-comparatives (« Plus grosse dépense : … »).
- **Single-period state (pas de données antérieures) :** les pills de delta remplacées par `caption` `neutral-500` « Pas de période précédente à comparer » ; la superposition de période précédente omise.
- **Populated state :** toutes les cartes peuplées ; pills de delta colorées par signe ; barres/lignes animées à la première peinture (cf. Interactions).

## Interactions & Micro-animations

- **Changement de portée (tap sur un segment `.seg`) :** le segment actif slide vers la nouvelle position (200ms ease standard) ; toutes les cartes font un cross-fade opacité 0→1 (200ms). Pas de count-up pendant un changement de scope. La portée est propagée aux écrans 06/07 via l'état partagé. Haptic léger.
- **Toggle de période tap :** le pill sélectionné cross-remplit `primary-600`/`white` 150ms ; tous les graphiques se re-rendent avec un cross-fade opacité 200ms. Pas de count-up sur les totaux pendant un toggle (éviter le bruit de mouvement).
- **Tap période précédente/suivante :** flèches `scale(.92)` au press ; graphiques cross-fadent (opacité 0→1, 200ms ease standard). Haptic léger.
- **Entrée du graphique de tendance :** les barres grandissent depuis la ligne de base (scaleY 0→1, transform-origin bas) échelonnées 30ms chacune, total ≤600ms ease emphasized. Variante ligne : dessin via stroke-dashoffset. Sous `prefers-reduced-motion` : barres/ligne se rendent à l'état final instantanément ; seul un fondu ≤150ms conservé.
- **Entrée des barres de revenus/dépenses :** largeurs animées 0 → part% sur 500ms ease standard, échelonnées (revenus d'abord, puis dépenses). Le solde net fait un count-up optionnel 300ms.
- **Tap sur barre :** barre tapée `scale(1.04)` 120ms + tooltip fondu (`neutral-700` sur `white`, `shadow-md`, 150ms). Second tap ou scrim tap dismiss le tooltip. « Voir les dépenses » dans la feuille détail empile la Liste (04).
- **Entrée des barres de part (catégories) :** largeurs animées 0 → part% sur 500ms ease standard, échelonnées 40ms.
- **Entrée des cartes d'insight :** les cartes glissent vers le haut + fondu (translateY 12px + opacité 0→1, 200ms), échelonnées 80ms.
- **Tap sur ligne (catégorie/commerçant/barre) :** ligne surlignée `primary-50` 120ms puis empile la Liste (04).
- **Tirer-pour-rafraîchir :** spinner en haut pendant la re-sync ; toast à la fin seulement si les données ont changé.
- **Réduction de mouvement :** toutes les animations d'entrée ramenées à fondu-only ≤150ms ; pas de scale pops ; pas de count-ups.

## Accessibility Notes

- **Ordre de focus :** Top-bar → titre → export → contrôle segmenté de portée (Tous → Courant → Épargne → Espèces) → toggle période (Semaine → Mois → Année) → flèches sélecteur période → graphique de tendance (barres focusables) → carte revenus/dépenses (barres focusables + tap détail) → cartes d'insight → lignes catégorie → lignes commerçant → barres patterns → ligne plus-grosse-dépense → bottom-nav. Anneau de focus visible 2px `primary-500`.
- **Contrôle segmenté de portée :** `role="tablist"` avec un `role="tab"` par compte, `aria-selected` sur l'actif, `aria-label="Portée du compte"`, `aria-controls` pointant vers la région de contenu mise à jour. La région a `aria-live="polite"` pour annoncer le changement de scope (« Statistiques du compte Courant »). Navigation clavier par flèches.
- **Toggle de période :** `role="tablist"` avec trois `role="tab"`, `aria-selected` sur l'actif, `aria-label="Période statistique"`. Flèches clavier entre tabs.
- **Accessibilité du graphique de tendance :**
  - Le conteneur du graphique a `role="img"` et un `aria-label` composé : « Tendance des dépenses pour Juin 2026, compte Courant. Total 1 240 €, en baisse de 18% versus Mai (1 512 €). Jour le plus élevé le 15 juin à 164 €. »
  - Un `<table>` visuellement masqué reflète chaque barre : colonnes **Libellé | Date | Dépensé | Période précédente**. C'est l'équivalent lecteur d'écran du graphique.
  - Chaque barre est focusable au clavier (`tabindex="0"`) avec `aria-label="15 juin, 164 €"` et montre le tooltip au focus, pas seulement au tap.
  - Le texte du pill de delta épelle le mot flèche pour SR : `aria-label="En baisse de 18% versus le mois dernier"` (le glyphe `▼` est décoratif).
- **Accessibilité de la carte Revenus vs Dépenses :**
  - Le conteneur a `role="group"` et un `aria-label` : « Revenus 2 100 € versus dépenses 1 240 €, solde net positif de 860 €. Revenus en hausse de 5%, dépenses en baisse de 18%. »
  - Chaque barre est `role="img"` avec `aria-label` (« Revenus : 2 100 euros, 100% du maximum » / « Dépenses : 1 240 euros »).
  - Un `<table>` visuellement masqué : colonnes **Type | Montant | Delta vs période précédente**.
  - Le tap de détail ouvre un `role="dialog"` listant les revenus par type.
- **Lignes barre catégorie :** chaque ligne un `<button>` avec `aria-label="Courses, 40%, 496 €, voir les transactions"` ; la barre de part est `role="img"` avec `aria-label="40% des dépenses du mois"`. La couleur n'est jamais le seul signal (texte % toujours présent).
- **Lignes commerçant :** `<button>` avec `aria-label="Carrefour, 248 € sur 12 visites, voir"`.
- **Barres semaine/week-end :** chaque barre un `<button>` avec `aria-label="Jours ouvrés, 860 €, moyenne 172 € par jour, voir"` ; un `<table>` masqué répète les données.
- **Cartes d'insight :** `role="group"` avec un `aria-label` résumant l'insight ; le CTA est un vrai `<button>`/lien avec un label descriptif (« Voir les dépenses Restaurant pour Juin 2026 »).
- **Contraste des couleurs :** remplissages de barre `primary-500`/`primary-600` sur fonds `white`/`neutral-800` respectent le contraste pour le non-texte ; tout texte numérique est `neutral-900`/`neutral-700`. Le texte de delta utilise les sémantiques `-600` sur `-50` pour ≥ 4.5:1.
- **Cibles tactiles :** tout élément interactif ≥ 44×44px (pills toggle, segments, flèches, export, barres, lignes, liens, FAB, nav).
- **Résumé lecteur d'écran à l'entrée :** une région `aria-live="polite"` annonce « Statistiques de Juin 2026 chargées, portée Tous les comptes. Total des dépenses 1 240 €, en baisse de 18% versus le mois dernier. » et se met à jour au changement de scope/période.

## Notes / Open Questions

- 🔴 **Sémantique « moins c'est mieux » pour revenus vs dépenses :** le pill de delta traite un delta de **dépenses** négatif comme `success` (moins dépensé) et positif comme `danger` (plus dépensé) — correct pour les dépenses. Mais pour les **revenus**, c'est l'inverse : un delta positif = `success` (plus de revenus), négatif = `danger` (moins de revenus). Les deux sémantiques sont spécifiées ci-dessus ; confirmer que le périmètre est bien « dépenses pour le delta de tendance, revenus pour le delta revenus » et jamais croisé.
- 🔴 **Bibliothèque de graphiques :** recommandation `recharts` ou `visx` (React, déclaratif, thématisable sur ces tokens exacts, supporte couleurs de barres personnalisées, séries superposées, tooltips personnalisés, et `role="img"` + `aria-label`). Ouvert : confirmer le choix et l'histoire d'accessibilité (barres focusables, tables SR). Aucun code décidé ici.
- 🔴 **Tendance mois : barres vs ligne :** 30 barres journalières peuvent être à l'étroit sur téléphones étroits. Confirmer : barres avec labels tous les 5 jours, ou ligne lisse avec scrubber ? Recommandation : barres pour ≤31 points.
- 🔴 **Superposition période précédente :** pour la vue Année, « période précédente » = année précédente ; les utilisateurs avec < 1 an de données ne voient pas de superposition. Confirmer la gestion de superposition vide.
- 🔴 **Export :** l'export in-app (PNG/CSV de la vue courante) est-il dans le scope v1 ? Si oui, quels formats et où va le fichier sur mobile (feuille de partage vs téléchargement) ?
- 🔴 **Génération des cartes d'insight :** les insights sont-ils basés sur des règles (modèles, calculables hors-ligne) ou veut-on des suggestions ML ? Recommandation v1 : basé sur règles uniquement.
- 🔴 **Couleur week-end :** la carte patterns utilise `#EC4899` rose pour le week-end afin de distinguer du `primary-500` des jours ouvrés. Confirmer que le rose est acceptable, ou utiliser une seconde nuance de primary.
- 🔴 **Définition du jour le plus actif :** « plus actif » = moyenne de dépense la plus élevée, ou compte de transactions le plus élevé ? Confirmer la métrique.
- 🔴 **Comparaison revenus vs dépenses en scope `Tous` :** le solde net agrégé inclut-il les virements entre comptes ? Non — les virements sont internes et exclus (§13.2), donc en scope `Tous` un virement Compte A → Compte B s'annule (sort de A, entre dans B) et n'affecte ni revenus ni dépenses. Confirmer que c'est bien neutre à l'agrégat.
- 🔴 **Contrôle segmenté si compte unique :** masquer ou désactiver le `.seg` si l'utilisateur n'a qu'un seul compte ? Cohérent avec 06 : masquer (recommandation).
- **Hors-scope (délibéré) :** les virements sont exclus de toutes les agrégats (tendances, tops, revenus/dépenses, patterns), quelle que soit la portée.
