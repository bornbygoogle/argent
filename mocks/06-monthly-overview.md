# Vue mensuelle (onglet Calendrier)

> Écran `06` — racine de la bottom-nav (`Calendrier`, slot 4). Route : `/overview?month=YYYY-MM&account=all|<id>`.
> Spécification visuelle de référence : `mocks/preview/html/06-monthly-overview.html`.

## Purpose

Donner à l'utilisateur une cartographie thermique (heat-map) des dépenses quotidiennes d'un mois choisi, un récap **total vs budget**, la moyenne par jour, un donut des top catégories, et un **badge de report** reflétant le rollover mensuel par compte — pour voir d'un coup d'œil où est passé l'argent ce mois, quels jours ont été les plus lourds, et combien a été reporté du mois précédent.

L'écran est **account-scoped** : un contrôle segmenté `.seg` en haut bascule la portée entre **Tous** (agrégat sur tous les comptes) et **un compte précis** (Courant / Épargne / Espèces / …). Toutes les agrégats (total, budget, donut, heat-map, moyenne) se recalculent selon la portée. La portée est partagée avec les écrans 07 et 08 (modèle §13.6 / nav-map §8.5).

## Navigation

- **Comment l'utilisateur arrive ici :**
  - Tap sur l'onglet **Calendrier** de la bottom-nav (slot 4, icône `CalendarDays`).
  - Empilé depuis le **Dashboard (02)** via le chip du mois / lien « Vue mensuelle ».
  - Empilé depuis **Statistiques (08)** en tapant une barre ou une période (« Voir ce mois dans le calendrier »).
- **Où il peut aller :**
  - **Contrôle segmenté de portée** (`Tous / Courant / Épargne / Espèces`) — re-rend l'écran en place selon le compte ; pas de navigation. Le segment actif se synchronise avec la portée partagée (Accueil / Stats / Calendrier).
  - **Flèches mois précédent / suivant** dans la top-bar — remplace le mois affiché en place (pas d'empilement). Les mois passés sont **immuables** (modèle §13.5) ; le futur est borné au mois courant.
  - **Tap sur une cellule de jour** → ouvre une feuille (bottom-sheet) récap du jour ; « Tout voir » dans la feuille empile la **Liste des dépenses (04)** filtrée à cette date et au compte sélectionné (`?from=YYYY-MM-DD&to=YYYY-MM-DD&account=<id>`).
  - **Tap sur un segment du donut / une ligne de légende** → empile la **Liste des dépenses (04)** filtrée par catégorie + mois + compte (`?cat=&from=&to=&account=`).
  - **Lien fantôme « Ajuster le budget → »** sous la barre de progression → empile les **Réglages budget (07)**, pré-sélectionné sur le même compte (si `Tous`, 07 s'ouvre sur le premier compte ou sur un état global vide — voir question ouverte).
  - **Lien fantôme « Voir les tendances → »** → empile **Statistiques (08)** avec le même mois et la même portée de compte.
  - **FAB (+)** centrée dans la bottom-nav → ouvre la feuille d'action rapide (Dépense / Revenu / Virement), puis le plein écran correspondant. Le compte par défaut = compte actuellement sélectionné (ou dernier utilisé si `Tous`).
  - **Tirer vers le bas** → rafraîchir / re-sync depuis le store local (spinner pendant la synchro).
- La bottom-nav et la FAB restent présentes (racine d'onglet). **Pas de chevron retour** dans la top-bar — l'emplacement du chevron accueille le sélecteur de mois.

## Layout Description

De haut en bas, de gauche à droite, format portrait mobile, gouttière `space-4` (16px) gauche/droite :

1. **Top-bar (sticky, 56px + safe-area top).** Fond `neutral-50` (light) / `neutral-900` (dark), `shadow-sm` au scroll. Gauche/centre : le **sélecteur de mois** — icône `ChevronLeft` (24px, zone tactile ≥44px), le label **« Juin 2026 »** (`h3`, `neutral-900`/`neutral-50`), et icône `ChevronRight`. La flèche « précédent » est désactivée (`neutral-300`) si on est au premier mois enregistré ; la flèche « suivant » est désactivée au-delà du mois courant (pas de prévision). Droite : icône `MoreHorizontal` (≥44px) ouvrant un petit menu (« Aller à aujourd'hui », « Comparer au mois précédent » — comparaison = question ouverte).

2. **Contrôle segmenté de portée `.seg`** (Design System §13.6). Pleine largeur (ou `max-w-md` centrée sur tablette), `radius-md`, fond `neutral-100`, padding `space-1`, min-height 36px / zone tactile ≥44px. Segments : **`Tous` · `Courant` · `Épargne` · `Espèces`** (+ `autre` si présent). Segment actif : fond `white`/`neutral-800`, texte `neutral-900`, `shadow-sm`, slide 200ms ease standard. Inactif : texte `neutral-500`. Chaque segment porte le **point coloré du type de compte** (cf. §13.1 : `courant`=`primary-600`, `épargne`=`success-500`, `espèces`=`warning-500`, `autre`=`neutral-500`) devant son libellé ; le segment `Tous` affiche une icône `LayoutGrid` ou un anneau multi-couleurs. Si l'utilisateur a un seul compte, le segment unique est sélectionné et le contrôle est désactivé (ou masqué — voir question ouverte).

3. **Heat-map (carte thermique).** Carte pleine largeur, `radius-lg`, `shadow-sm`, fond `white`/`neutral-800`, padding `space-4`.
   - **En-tête des jours :** `L M M J V S D` — rôle `label` (12px, 600, MAJUSCULES, `neutral-400`), 7 colonnes égales (la semaine commence **lundi**, convention FR).
   - **Grille des jours :** 5–6 lignes × 7 colonnes. Gouttière `space-1` (4px) — le mockup utilise 6px ; retenir `space-2` (8px) pour respecter la grille 4px si besoin. Chaque cellule :
     - Le **numéro du jour**, `caption` (12px, 600), `neutral-500` (atténué `neutral-300` pour les jours hors-mois, ex. fin mai / début juillet).
     - Le **fond teinté** indique l'intensité de dépense du jour (cf. table des bins ci-dessous). La hauteur des cellules = ~34px dans le mockup ; la zone tactile est rembourrée à ≥44px si la grille 7-colonnes descend sous 44px sur un étroit.
     - **La cellule d'aujourd'hui** reçoit un contour (`outline`) 2px `neutral-900` (dark sur light) à `outline-offset:1px` (cf. mockup `.cal.today`) — pastille d'aujourd'hui statique, pas d'animation.
   - **Légende** sous la grille, centrée, `caption` : cinq pastilles — `0` (`neutral-100`), `Faible` (`primary-50`), `Moy.` (`primary-200`), `Élevé` (`primary-500`), `Dépassé` (`danger-500`).

4. **Carte Total du mois + Rollover / Carte Moyenne par jour** (grille 2 colonnes, `space-3` de gouttière, comme dans le mockup).
   - **Colonne gauche — Total du mois :**
     - Eyebrow `label` « TOTAL DU MOIS ».
     - `amount-lg` **« 1 240 € »** (chiffres tabulaires, `neutral-900`).
     - **Barre de progression** (12px, `radius-full`, piste `neutral-200`) largeur = dépensé/budget %. Couleur de remplissage selon seuil : ≤80% `success-500`, 80–99% `warning-500`, ≥100% `danger-500`.
     - `caption` « sur 1 800 € » sous la barre.
     - **Badge de report** `.stat-pill` (cf. mockup) : fond `success-50`, texte `success-600`, icône `ArrowDownLeft` ou `RefreshCw`, **« +127 € reportés de mai »**. Apparaît **uniquement** si le mois précédent a été clôturé par l'enregistrement d'un Salaire sur le compte concerné (§13.4/§13.5). Au survol/long-press, un `caption` explique : « Solde non dépensé de mai reporté sur ce compte. »
     - `caption` « Reste 560 € » à gauche sous la barre (si budget défini).
   - **Colonne droite — Moyenne / jour :**
     - Eyebrow `label` « MOYENNE / JOUR ».
     - `amount-lg` **« 51,67 € »** (tabulaire).
     - `caption` coloré « ▼ 12% vs mai » en `success-600` (moins dépensé) ou `danger-600` (plus dépensé). Masqué si pas de mois précédent.

5. **Donut Top catégories.** Carte pleine largeur, `radius-lg`, `shadow-sm`, padding `space-4`.
   - Eyebrow `label` « TOP CATÉGORIES ».
   - Disposition flex : donut SVG à gauche (~120×120px comme le mockut), liste de légende à droite (`flex:1`, `gap:space-2`).
   - **Donut** : anneau creux, segments par catégorie utilisant les couleurs de swatch (`#10B981` Courses, `#F59E0B` Restaurant, `#0EA5E9` Transport, `#8B5CF6` Loisirs, `#64748B` Autre). Rotation de départ −90°. Le **centre** affiche le total `amount-md` **« 1 240€ »** + `caption` « juin ».
   - **Légende** : une ligne par catégorie — swatch (10×10 `radius-sm`), nom (`body-sm`, `neutral-700`), part % (`amount-md` réduit à 14px, droite). Lignes tapables (≥44px) → Liste des dépenses filtrée par catégorie + compte + mois.

6. **Lien fantôme « Voir les tendances → »** (`primary-600`, `body-sm`) → Statistiques (08).

7. **Bottom-nav + FAB centrale** persistantes. Onglet Calendrier actif (`primary-600`).

### Spécification de portée (agrégat vs compte unique)

Toutes les agrégations dépendent du segment actif :

| Segment | Donut & catégories | Total / Budget / Barre | Heat-map | Moyenne / delta | Badge de report |
|---|---|---|---|---|---|
| **Tous** | Somme des dépenses **de tous les comptes**, regroupées par catégorie (les virements exclus — §13.2). | Somme tous comptes ; budget = **somme des budgets de chaque compte** (ou état vide si aucun budget — voir QO). | Chaque cellule = somme des dépenses de tous les comptes ce jour-là. | Moyenne sur l'agrégat ; delta vs agrégat du mois précédent. | **Somme** des reports de chaque compte (ex. « +127 € reportés de mai » = somme des soldes reportés de tous les comptes clôturés). Si aucun compte n'est clôturé → badge masqué. |
| **Compte unique** (ex. Courant) | Dépenses de ce compte uniquement. | Dépenses + **budget propre au compte** (cf. écran 07). | Dépenses de ce compte uniquement. | Moyenne / delta sur ce compte. | Report **de ce compte** uniquement (« +80 € reportés de mai sur Courant »). Masqué si ce compte n'a pas été clôturé. |

Les **virements** (`transfer`, §13.2) sont toujours **exclus** du total des dépenses, du donut, des catégories et de la heat-map (interne, ni revenu ni dépense) — quelle que soit la portée.

### Bins d'intensité de la heat-map (précis)

Les bins sont calculés **par mois** à partir des totaux journaliers. `budgetDaily` = budget mensuel du scope (compte ou somme) / jours-du-mois. Si aucun budget n'est défini pour le scope, repli sur la moyenne journalière du mois (`avg`) comme base relative (question ouverte).

| Bin | Libellé | Token de fond | Couleur numéro | Déclencheur |
|---|---|---|---|---|
| 0 | Pas de dépense | `neutral-50` (light) / `neutral-800` (dark) | `neutral-300` (pas de pastille) | total du jour = 0 |
| 1 | Faible | `primary-50` (`#EEF2FF`) | `primary-700` | 0 < total ≤ 0,5 × `budgetDaily` |
| 2 | Moyen | `primary-200` (`#C7D2FE`) | `primary-700` | 0,5 × `budgetDaily` < total ≤ `budgetDaily` |
| 3 | Élevé | `primary-500` (`#6366F1`) | `white` | `budgetDaily` < total ≤ 1,5 × `budgetDaily` |
| 4 | Dépassé | `danger-500` (`#EF4444`) | `white` | total > 1,5 × `budgetDaily` |

Les cellules hors-mois sont rendues en `transparent` / numéro `neutral-300` et **non interactives**. Les jours futurs (après aujourd'hui, dans le mois courant) sont rendus en `neutral-50` / numéro `neutral-300`, non interactifs.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Top-bar | Barre sticky | 56px + safe-area top, fond `neutral-50`/`neutral-900`, `shadow-sm` au scroll. |
| Sélecteur de mois | Contrôle inline | `ChevronLeft` + « Juin 2026 » (`h3`) + `ChevronRight`. Flèches ≥44×44, `neutral-600`, désactivées `neutral-300` aux bornes de données. |
| Menu overflow | Bouton-icône | `MoreHorizontal` 24px en zone ≥44px ; ouvre un petit bottom-sheet menu. |
| Contrôle segmenté `.seg` | Segmented control (§13.6) | Segments `Tous / Courant / Épargne / Espèces` ; actif `white`+`shadow-sm` ; point coloré de type de compte devant chaque libellé ; slide 200ms. |
| Carte heat-map | Carte | `radius-lg`, `shadow-sm`, `white`/`neutral-800`, padding `space-4`. |
| En-tête des jours | Ligne de texte | 7 colonnes, rôle `label` (12px/600/MAJUSCULES/`neutral-400`). |
| Cellule de jour | Cellule tapable | Hauteur ~34px, gouttière `space-1`–`space-2`, zone tactile ≥44×44 (rembourrée), fond selon bin. |
| Marqueur d'aujourd'hui | Contour | `outline` 2px `neutral-900` (light) / `neutral-50` (dark), `outline-offset:1px`. |
| Légende de bins | Ligne de pastilles | 5 pastilles `caption` + swatch 10×10 `radius-sm`. |
| Feuille récap du jour | Bottom-sheet | `radius-lg` haut, poignée 40×4 `neutral-300`, `shadow-lg`, scrim `rgba(15,23,42,.45)`. Dismiss : swipe-down / scrim / Esc. |
| Total du jour | Montant | `amount-lg` tabulaire (« 64,20 € »). |
| Mini-lignes de dépense | Lignes de liste | Icône + catégorie + commerçant + `amount-md` tabulaire. |
| Bouton « Tout voir » | Bouton primaire | fond `primary-600`, blanc, `radius-md`, min-height 48px. Empile Liste (04). |
| Carte Total du mois | Carte | `radius-lg`, `shadow-sm`, padding `space-4`. |
| Barre de progression budget | Progress | 12px, `radius-full`, piste `neutral-200`, remplissage success/warning/danger selon seuil. |
| Badge de report `.stat-pill` | Badge | fond `success-50`, texte `success-600`, icône `ArrowDownLeft`, « +127 € reportés de mai ». Conditionnel (cf. §13.5). |
| Carte Moyenne / jour | Carte | `radius-lg`, `shadow-sm`, padding `space-4`. |
| Delta vs mois précédent | Caption coloré | « ▼ 12% vs mai » : `success-600` si moins dépensé, `danger-600` si plus. |
| Carte Donut | Carte | `radius-lg`, `shadow-sm`, padding `space-4`. |
| Donut | Graphique | Anneau ~120px, segments par couleur de catégorie, centre `amount-md` total + `caption` « juin ». |
| Ligne de légende | Ligne tapable | Swatch + nom + %, `body-sm`/`amount-md`, ≥44px. → Liste (04). |
| Lien « Ajuster le budget » | Lien fantôme | `primary-600`, `body-sm`, ≥44px. → Réglages budget (07). |
| Lien « Voir les tendances » | Lien fantôme | `primary-600`, `body-sm`, ≥44px. → Statistiques (08). |
| Bottom-nav | Barre d'onglets | 5 colonnes ; Calendrier actif (`primary-600`). |
| FAB | FAB | 56×56, fond `primary-600`, `Plus`, `shadow-fab`, `radius-full`. → Feuille d'action rapide. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `month` | `YYYY-MM` (query param) | `2026-06` | Mois valide ≥ premier mois enregistré et ≤ mois courant (pas de futur). |
| `account` | `all` \| id (query param) | `all` / `acct_courant` | `all` ou id de compte existant ; piloté par le segment actif. |
| `dayTotal` | décimal (€) | `64.20` | ≥ 0 ; 2 décimales ; chiffres tabulaires. Somme des dépenses du scope ce jour (virements exclus). |
| `daySpendBin` | enum 0–4 | `3` | Dérivé : 0 aucun, 1 faible, 2 moyen, 3 élevé, 4 dépassé (cf. table bins). |
| `monthTotalSpent` | décimal | `1240.00` | Somme des dépenses du scope sur le mois ; ≥ 0. |
| `monthlyBudget` | décimal \| null | `1800.00` | Si `Tous` = somme des budgets de chaque compte ; si compte = budget du compte (cf. 07). null/0 → état « pas de budget ». |
| `budgetUtilizationPct` | pourcent | `68.9` | dépensé/budget × 100 ; remplissage visuel borné à 100%. |
| `rolloverAmount` | décimal \| null | `127.00` | Solde reporté du mois précédent pour le scope (somme si `Tous`). null si le mois précédent n'a pas été clôturé sur ce scope. |
| `rolloverSourceMonth` | `YYYY-MM` \| null | `2026-05` | Mois d'origine du report (pour le libellé « de mai »). |
| `dailyAverage` | décimal | `51.67` | monthTotalSpent / nombre de jours écoulés dans le mois (cf. QO dénominateur). |
| `deltaPctVsPrev` | pourcent signé \| null | `-12.0` | (courant − précédent)/précédent × 100 pour le scope ; null si pas de mois précédent. |
| `heaviestDayTotal` | décimal | `164.00` | Max des totaux journaliers du mois. |
| `heaviestDayDate` | `YYYY-MM-DD` | `2026-06-18` | Date du jour le plus lourd. |
| `daysRemaining` | entier | `6` | Jours restants dans le mois à partir d'aujourd'hui (0 si mois terminé). |
| `categorySharePct` | pourcent | `40.0` | Total catégorie / total du mois × 100 (sur le scope). |
| `categoryColor` | hex | `#10B981` | Depuis la palette de swatchs de catégorie. |
| `categoryName` | chaîne | « Courses » | Depuis Gestion des catégories (05). |
| `selectedDay` | `YYYY-MM-DD` \| null | `2026-06-24` | Défini au tap sur une cellule ; pilote la feuille récap. |
| `isToday` | booléen | true | Pilote le contour `neutral-900`. |
| `isMonthClosed` | booléen | false | Vrai si le mois a été clôturé par un Salaire sur ce scope (rend les cellules en lecture seule — §13.5). |

## States

- **Empty state (aucune dépense ce mois, sur le scope) :** la heat-map rend toutes les cellules en Bin 0. Le donut est remplacé par une illustration centrée + `body` « Aucune dépense enregistrée pour Juin 2026 sur ce compte. » + bouton secondaire « Ajouter une dépense » (→ Ajout dépense 03). La carte Total montre 0 €, barre vide. La carte Moyenne montre 0,00 €. Le badge de report reste visible s'il y a un report (solde reporté mais rien dépensé). Le delta vs mois précédent est masqué.
- **Empty state (pas de budget défini pour le scope) :** la carte Total affiche le total dépensé en `amount-lg` + `body-sm` « Aucun budget défini pour Juin » + bouton secondaire « Définir un budget » (→ 07). La barre de progression est masquée ; le `caption` « sur … € » est remplacé par « — ». La carte Moyenne reste normale. NB : en scope `Tous`, si **aucun** compte n'a de budget, même comportnement.
- **Empty state (compte unique sans aucune donnée) :** heat-map vide, donut vide, et un `caption` informatif « Ce compte n'a aucune activité. » sous le segment actif.
- **Loading state :** squelettes — grille calendrier en blocs `neutral-200` shimmer ; barre budget en shimmer `neutral-100` fin ; donut en anneau shimmer `neutral-100` avec lignes de légende `neutral-200`. Nombres remplacés par barres `neutral-200` de 80px. Le contrôle segmenté reste interactif mais les données sont en shimmer. Le shimmer est désactivé sous `prefers-reduced-motion` (gris statique). Pas de count-up pendant le chargement.
- **Error state (ex. échec de lecture du store local) :** `body` centré « Impossible de charger Juin 2026. » + `caption` détail erreur (`danger-600`) + bouton primaire « Réessayer ». Heat-map et cartes masquées. Retry par tirer-vers-le-bas.
- **Populated state :** tous les éléments peuplés comme dans la Layout Description ; totaux en chiffres tabulaires ; remplissage de barre et segments du donut animés à la première peinture (cf. Interactions). Le badge de report apparaît si `rolloverAmount` ≠ null.
- **Mois clôturé (passé) :** si `isMonthClosed` est vrai (un Salaire a été enregistré clôturant ce mois sur ce scope), les cellules sont en lecture seule (tap désactivé ou ouvre la feuille en mode lecture seule sans « modifier »), un `caption` « Mois clôturé » apparaît sous le sélecteur de mois, et les flèches permettent toujours de naviguer mais aucune édition n'est possible (§13.5 immuabilité).

## Interactions & Micro-animations

- **Changement de portée (tap sur un segment `.seg`) :** le segment actif slide vers la nouvelle position (200ms ease standard) ; toutes les cartes (heat-map, total, moyenne, donut) font un cross-fade opacité 0→1 (200ms). Pas de count-up pendant un changement de scope (éviter le bruit visuel). La portée est propagée aux écrans 07/08 via l'état partagé. Haptic léger au tap si disponible.
- **Changement de mois (flèche précédent/suivant) :** la grille calendrier fait un cross-fade (opacité 0→1, 200ms) vers le nouveau mois ; les nombres ne font pas de count-up. Flèches `scale(.92)` au press. Haptic léger.
- **Tap sur cellule de jour :** cellule `scale(.96)` 120ms + contour `primary-500` 2px clignote ; la feuille récap glisse vers le haut (translateY 16px + opacité 0→1, 200ms ease standard).
- **Dismiss de la feuille :** swipe-down suit le doigt ; relâchement au-delà de 40% de la hauteur → ferme (la feuille anime vers le bas + fondu, 200ms) ; sinon revient. Tap sur scrim / Esc ferment aussi.
- **Entrée de la barre de progression :** le remplissage anime la largeur 0 → %final sur 500ms ease standard à la première peinture de l'état peuplé.
- **Entrée du donut :** les segments se dessinent dans le sens horaire (stroke-dashoffset → 0) sur 700ms ease emphasized ; le total central fait un count-up optionnel 300ms. Sous `prefers-reduced-motion` : le donut se rend à l'état final instantanément (pas de dessin), le total central affiche la valeur finale (pas de count-up) ; seul un fondu ≤150ms est conservé.
- **Tap sur une ligne de légende :** la ligne se surligne en `primary-50` 120ms puis empile la Liste (04) filtrée.
- **Badge de report :** apparition en fondu + léger slide-up (translateY 8px, 200ms) quand il devient pertinent (ex. après clôture d'un mois). Statique ensuite.
- **Tirer-pour-rafraîchir :** spinner standard en haut pendant la re-sync ; relâchement revient ; toast à la fin (`success-600`) seulement si les données ont changé.
- **Contour d'aujourd'hui :** statique, pas d'animation.
- **Réduction de mouvement :** toutes les animations d'entrée ramenées à fondu-only ≤150ms ; pas de scale pops ; pas de count-ups.

## Accessibility Notes

- **Ordre de focus :** Top-bar → sélecteur de mois (flèche précédent → label → flèche suivant) → overflow → contrôle segmenté de portée (Tous → Courant → Épargne → Espèces) → première cellule de la heat-map → … → « Ajuster le budget » → lignes de légende du donut (haut en bas) → « Voir les tendances » → bottom-nav. Anneau de focus visible : contour 2px `primary-500` à 2px de décalage.
- **Labellisation des cellules :** chaque cellule expose `aria-label="24 juin 2026, dépensé 64,20 €, élevé"` (mot du bin : aucun/faible/moyen/élevé/dépassé). Le teintage visuel ne doit **jamais** être le seul signal — l'`aria-label` et une pastille/icône le renforcent pour les daltoniens.
- **Table de données de la heat-map (alternative non-visuelle) :** un `<table>` visuellement masqué (`sr-only`) liste chaque jour : colonnes **Date | Dépensé | Intensité**, filtré sur le scope. Une ligne de résumé précède : « Juin 2026, portée Courant : 21 jours de dépense, total 1 240 €, moyenne 51,67 €/jour, jour le plus lourd 18 juin (164 €). »
- **Contrôle segmenté de portée :** `role="tablist"` avec un `role="tab"` par compte, `aria-selected` sur l'actif, `aria-label="Portée du compte"`, `aria-controls` pointant vers la région de contenu qui se met à jour. La région de contenu a `aria-live="polite"` pour annoncer le changement de scope (« Vue mensuelle du compte Courant »). Navigation clavier par flèches gauche/droite entre segments.
- **Barre de progression :** `role="progressbar"` avec `aria-valuenow="68.9"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Budget mensuel utilisé : 68,9 %, 1 240 € sur 1 800 €"`. La couleur est renforcée par le texte « Reste 560 € » pour ne pas être couleur-seule.
- **Badge de report :** `role="status"`, `aria-label="127 € reportés du mois de mai"`. Texte complet explicite (le « + » est décoratif mais lu).
- **Accessibilité du donut :**
  - Le graphique SVG a `role="img"` et un `aria-label` composé : « Top catégories pour Juin 2026, compte Courant : Courses 40% 496 €, Restaurant 25% 310 €, … ».
  - Un `<table>` visuellement masqué reflète la légende : colonnes **Catégorie | Montant | Pourcentage**.
  - Chaque ligne de légende est un vrai `<button>` avec un `aria-label` du type « Courses, 40 %, 496 €, voir les transactions ».
- **Sélecteur de mois :** les flèches sont des `<button>` avec `aria-label="Mois précédent"` / `aria-label="Mois suivant"` ; le label a `aria-live="polite"` pour qu'un changement de mois soit annoncé. Les flèches désactivées reçoivent `aria-disabled="true"`.
- **Cibles tactiles :** tous les éléments interactifs ≥ 44×44px (cellules, flèches, segments, liens, lignes de légende, FAB, nav).
- **Contraste des couleurs :** les cellules teintées utilisent des numéros `neutral-900`/`primary-700` ou `white` pour rester ≥ 4.5:1 ; le texte `caption` de la légende `neutral-500` est appairé à `neutral-700` si nécessaire ; le total central du donut est `neutral-900` sur `white`.
- **Résumé lecteur d'écran à l'entrée :** une région `aria-live="polite"` annonce « Vue mensuelle de Juin 2026 chargée, portée Tous les comptes. » et se met à jour au changement de scope.

## Notes / Open Questions

- 🔴 **Portée `Tous` → destination du lien « Ajuster le budget »** — en scope `Tous`, le budget est la somme des budgets de chaque compte. Le lien « Ajuster le budget » mène-t-il à (a) l'écran 07 sur le premier compte, (b) un état « global » vide demandant de configurer chaque compte, ou (c) un nouveau sélecteur de compte puis 07 ? Recommandation : (c) sélecteur de compte, cohérent avec la nature par-compte des budgets (cf. 07).
- 🔴 **Budget en scope `Tous`** — la somme des budgets par compte suppose que **chaque** compte a un budget. Que se passe-t-il si un compte n'en a pas ? Recommandation : traiter un compte sans budget comme « illimité » et exclure sa part de la somme (ou afficher « budget partiel »). À confirmer.
- 🔴 **Contrôle segmenté si compte unique** — si l'utilisateur n'a qu'un seul compte, masquer le `.seg` ou le rendre inactif ? Recommandation : masquer (aucune portée à choisir).
- 🔴 **Libellé du badge de report en scope `Tous`** — « +127 € reportés de mai » en agrégat, mais faut-il détailler par compte (« Courant +80, Épargne +47 ») au long-press ? Recommandation : oui, feuille de détail au long-press.
- 🔴 **Définition de la moyenne quotidienne** — `dailyAverage` doit-il diviser par (a) jours avec dépense, (b) jours écoulés ce mois, ou (c) total de jours du mois ? Le mockup affiche 51,67 € (= 1240/24 ≈ jours écoulés). Affecte le nombre vedette. Recommandation : (b) jours écoulés, avec `caption` précisant « sur 24 jours ».
- 🔴 **Base des bins de la heat-map** — les bins sont relatifs à un budget journalier dérivé (`budget / jours-du-mois`). Sans budget sur le scope, repli sur la moyenne du mois. Confirmer ce repli et le multiplicateur 1,5× « dépassé ».
- 🔴 **Tap-sur-jour : destination** — le tap ouvre une feuille récap puis perce jusqu'à la Liste, ou saute directement au Dashboard du jour ? Recommandation : feuille → liste (garder le calendrier comme surface de navigation).
- 🔴 **Comparaison au mois précédent** — le menu overflow suggère une vue de comparaison. Dans le scope v1 ou différé vers Statistiques (08) ?
- 🔴 **Bibliothèque de graphiques** — recommandation : une bibliothèque SVG légère et accessible (`recharts` ou `visx`, React + déclaratif + thématisable sur ces tokens). À confirmer : choix, support des couleurs de segments personnalisées, donut creux à centre, et injection `role="img"` + `aria-label`. Aucun code décidé ici.
- 🔴 **Mois futurs** — précédent/suivant ne doivent pas naviguer au-delà du mois courant. Confirmer le bornage dur à « mois d'aujourd'hui ».
- 🔴 **Tablette/desktop** — sur ≥640px le contenu se centre dans une colonne `max-w-md` (448px) ; la heat-map et le donut restent mono-colonne. Confirmer qu'aucune disposition large à deux colonnes n'est souhaitée.
- **Hors-scope (délibéré) :** les virements sont exclus de toutes les agrégats de dépenses (§13.2). Le total du mois n'inclut jamais les virements, quelle que soit la portée.
