# Réglages budget

> Écran `07` — écran empilé (pas de bottom-nav). Route : `/budget?account=<id>`.
> Spécification visuelle de référence : `mocks/preview/html/07-budget-settings.html`.

## Purpose

Écran **account-aware** où l'utilisateur définit, **pour un compte précis**, son budget mensuel global, ses limites par catégorie, son seuil d'alerte et sa politique de report. Chaque compte possède sa **propre** configuration de budget indépendante. Un sélecteur de compte en haut de l'écran bascule le compte édité. C'est la source de vérité de toute la mathématique budgétaire pour ce compte à travers la Vue mensuelle (06), le Dashboard (02) et les Statistiques (08).

**Décidé produit (§13.1) : pas de budget global/agrégé — uniquement des budgets par compte.** Un budget « Tous » est la simple somme des budgets de chaque compte, calculée à la lecture, jamais éditée directement ici. Cet écran n'édite donc qu'un compte à la fois.

## Navigation

- **Comment l'utilisateur arrive ici :**
  - Depuis la **Vue mensuelle (06)** via le lien « Ajuster le budget » (empilé, route `/budget?account=<id>` — le compte = portée actuelle de 06 ; si 06 était en `Tous`, un sélecteur de compte s'ouvre d'abord, cf. QO 06).
  - Depuis les **Réglages (09)** via une ligne « Budget » dans la section Catégories & Budget (empilé, route `/budget?account=<dernier compte>`).
- **Où il peut aller :**
  - **Sélecteur de compte** en haut — change le compte édité **en place** ; si le formulaire courant est sale, déclenche la garde dirty-form (« Abandonner les modifications ? ») avant de changer.
  - **Chevron retour / swipe-bord-droit** → retour à l'**écran d'origine** (06 ou 09), pas à un parent fixe. L'origine est suivie pour que la destination de retour soit correcte depuis l'un ou l'autre point d'entrée.
  - **Bouton « Enregistrer »** (haut-droite et/ou pied collant) → persiste la config du compte courant, puis retour à l'origine.
  - **Lignes de catégorie** tapables pour éditer la limite de cette catégorie en ligne (pas d'écran séparé) — ne naviguent pas ailleurs.
  - **Lien fantôme « Gérer ce compte »** (en bas, optionnel) → empile la **Gestion des comptes (13)** sur le compte édité, pour renommer/recolorer/voir le solde.
- **Chrome :** Top-bar avec chevron retour (`ChevronLeft`) à gauche, titre « Budget » (`h1`→`h3`), bouton texte « Enregistrer » à droite. **Pas de bottom-nav** (écran empilé, nav-map §3).
- **Garde dirty-form :** si un champ a changé et que l'utilisateur tapote retour / swipe-bord / tapote le scrim d'un overlay, afficher la feuille de confirmation d'abandon (« Abandonner les modifications ? ») avant de fermer (nav-map §5). Le changement de compte déclenche la même garde.

## Layout Description

De haut en bas, de gauche à droite :

1. **Top-bar (56px + safe-area top).** Sticky, fond `neutral-50`/`neutral-900`, `shadow-sm` au scroll.
   - Gauche : icône `ChevronLeft` (24px, `neutral-700`), zone tactile ≥44×44 → retour.
   - Centre/gauche de l'espace restant : titre « Budget » (`h3`, `neutral-900`/`neutral-50`).
   - Droite : bouton texte « Enregistrer » (`button`, `primary-600`). Désactivé (`neutral-200` fond, `neutral-400` texte) tant que le formulaire n'est pas **sale ET valide**.

2. **Sélecteur de compte (account-aware, NOUVEAU).** Carte ou bande `radius-lg`, `shadow-sm`, padding `space-3`–`space-4`, directement sous la top-bar.
   - Eyebrow `label` « COMPTE ».
   - Un **chip de compte** `.acct-chip` (§13.6) : point coloré du type de compte + nom du compte (« Compte courant ») + `ChevronDown`. Zone tactile ≥44px. Tap → ouvre la **feuille de sélecteur de compte** (`Tous les comptes` désactivé ici car pas d'édition globale + liste des comptes + « Gérer »).
   - À droite du chip, un `caption` du **solde live** du compte (« Solde : 2 480 € », `neutral-500`), en lecture seule, pour contexte.
   - Sélectionner un compte recharge tout le formulaire (sections A–E) avec la config de ce compte. La feuille de sélecteur respecte la garde dirty-form avant de changer.

3. **Zone de défilement.** Gouttière `space-4` gauche/droite, rythme vertical `space-4`–`space-6` entre sections. Se termine par `space-8` de padding bas + safe-area pour que la dernière carte dégage l'indicateur d'accueil OS (pas de bottom-nav, mais safe-area honoré). Un **pied collant** (bouton « Enregistrer le budget » plein-largeur) peut être épinglé en bas comme dans le mockup (dégradé `transparent`→`white` 30%).

4. **Section A — Budget mensuel (carte, `radius-lg`, `shadow-sm`, `white`/`neutral-800`, padding `space-4`, centrée).**
   - Eyebrow `label` « BUDGET MENSUEL ».
   - Grand montant saisissable : préfixe symbole monétaire `€` en `neutral-400`/`h2 muted`, montant en `amount` (display, tabulaire, `primary-600`), souligné d'une bordure basse 2px `primary-200` (style du mockup : `display:inline-flex`). Saisie fill `neutral-100`, `radius-md`, bordure 1px `neutral-200` ; focus → bordure 2px `primary-500` + halo `primary-50`.
   - Aide sous le champ (`.caption`, `neutral-500`) : « Total que vous prévoyez de dépenser tous mois confondus sur **ce compte**. »

5. **Section B — Aperçu réparti / restant (carte, cf. mockup « allocated preview »).** Reflète toujours la saisie en temps réel.
   - Ligne `row-between` : gauche « Réparti dans les catégories » (`body-sm muted`), droite montant réparti `amount-md` (« 1 220 € »).
   - **Barre de progression** (6–8px, `radius-full`, piste `primary-100` d'après le mockup, remplissage `primary-500`) largeur = réparti/total, bornée visuellement à 100%.
   - Ligne `row-between` : gauche « Disponible non réparti » (`caption`), droite `caption` coloré (« +580 € » en `success-600` si positif ; « −120 € » en `warning-600` si sur-allocation).

6. **Section C — Limites par catégorie (groupe de cartes).**
   - Eyebrow `label` « LIMITES PAR CATÉGORIE ». Aide : « Laisser vide pour illimité. »
   - Liste verticale de lignes de catégorie (`.card.tight`, cf. mockup), chaque ligne (`radius-lg`, padding `space-3`/`space-4`, diviseur 1px `neutral-200` entre lignes) :
     - Gauche : icône de catégorie dans un swatch 32×32 `radius-full` teinté à ~15% d'opacité de la couleur de catégorie, icône tracée dans la couleur de catégorie (16px).
     - Milieu : nom de catégorie (`r-title` `body`, `neutral-900`) + dessous soit « 288 € sur 400 » (`caption`, `neutral-500`) quand une limite est définie (montant consommé ce mois tiré du spend courant), soit « Illimité » (`caption`, `neutral-400`, italique). Une mini **barre de progression** (6px) sous le nom montre utilisée/limite ; couleur : `primary-500` normal, `warning-500` si ≥ seuil d'alerte.
     - Droite : entrée de montant compacte (`amount-md`, tabulaire, droite) pré-remplie avec la limite ou « — ». Tap → focus, clavier/pavé numérique apparaît.
   - En bas de liste, une ligne fantôme « ＋ Ajouter une limite » (bouton Ghost, `primary-600`) ouvrant une feuille pick des catégories non encore listées. Si toutes les catégories sont listées, la ligne est masquée.

7. **Section D — Seuil d'alerte (carte).**
   - Ligne `row-between` : `h3` « Seuil d'alerte » + valeur courante `amount-md` `primary-600` (« 80% »).
   - **Curseur (slider)** 0–100% (comme le mockup) : piste 6px `neutral-100` `radius-full`, remplissage `primary-500` jusqu'au seuil, **poignée** (knob) 22×22 `radius-full` `white` bordure 2px `primary-600` `shadow-md`. Zone tactile de la piste ≥44px de haut. La poignée est déplaçable ; le pourcentage se met à jour en direct.
   - **Mode alternatif montant** : un contrôle segmenté ou toggle permet de basculer en mode « Montant » (prévenir quand il reste ≤ N € dans une catégorie). Question ouverte sur l'opportunité des deux modes.
   - Aide (`.caption`, `neutral-500`) : « Notification quand une catégorie atteint ce pourcentage de sa limite. »

8. **Section E — Report de solde (carte `.card.tight`).**
   - Ligne `.row` : `r-main` « Report de solde » (`r-title`) + sous-texte « Reporter le budget non utilisé au mois suivant » (`r-sub`, `caption` `neutral-500`). Droite : **toggle** `.toggle.on` (44×24 piste, 20px knob : on=`primary-600` + knob droite, off=`neutral-300` + knob gauche).
   - **Note de cohérence (IMPORTANT) :** ce report est **le même mécanisme** que le report global mensuel déclenché par l'enregistrement du Salaire (§13.5). Le toggle ici active/désactive la **participation de ce compte** au report : quand ON et qu'un Salaire est enregistré clôturant le mois, le solde (et l'éventuel budget non utilisé) est reporté vers le mois suivant ; quand OFF, le mois est clôturé mais le budget se réinitialise au total plein du mois suivant (le solde réel reste, seul le « disponible budgétaire » se reset). Cf. QO.
   - Sous-helper contextuel (`.caption`, `neutral-500`) : ON → « Le solde non dépensé sera reporté à la clôture du mois (déclenchée par votre Salaire). » OFF → « Chaque mois repart du budget complet à la clôture. »

9. **Note de pied (`.caption`, `neutral-400`, centré).** « Les changements s'appliquent à partir de ce mois pour **ce compte**. Les mois passés ne sont pas recalculés. » (Sous réserve de la QO budget abaissé.)

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Top-bar | Barre sticky | 56px + safe-area ; chevron retour gauche, titre centre, Enregistrer droite ; `shadow-sm` au scroll. |
| Chevron retour | Bouton-icône | `ChevronLeft` 24px, ≥44×44, `neutral-700` ; `aria-label="Retour".` |
| Bouton Enregistrer | Bouton texte (Ghost/Primary) | `primary-600`, `button` ; désactivé jusqu'à sale+valide. |
| Sélecteur de compte (chip) | Account selector chip `.acct-chip` (§13.6) | Point coloré type + nom + `ChevronDown`, ≥44px ; ouvre feuille de sélecteur. |
| Feuille sélecteur de compte | Bottom-sheet | `radius-lg` haut, poignée, `shadow-lg`, scrim `rgba(15,23,42,.45)` ; liste comptes + « Gérer ». `Tous` désactivé. |
| Solde live du compte | Caption lecture seule | `caption`, `neutral-500`, « Solde : 2 480 € ». |
| Entrée budget mensuel | Entrée montant devise | `display`/`amount` tabulaire ; `neutral-100` fill, `radius-md`, `neutral-200` bordure, focus `primary-500`. |
| Bandeau réparti/restant | Carte données | `amount-md` tabulaire coloré ; barre 6–8px. |
| Ligne de catégorie | Ligne de liste | Hauteur min ≥44px ; swatch icône + nom + entrée limite ; diviseurs `neutral-200`. |
| Mini-barre catégorie | Progress | 6px, `radius-full`, `primary-500` / `warning-500` si ≥ seuil. |
| Entrée limite catégorie | Entrée montant compacte | `amount-md` droite, tabulaire ; placeholder « — ». |
| Ajouter une limite | Ligne bouton Ghost | `primary-600` texte, `Plus` 16px inline. |
| Curseur de seuil | Slider | 0–100%, piste 6px `neutral-100`, knob 22px `white`/`primary-600` `shadow-md` ; zone tactile ≥44px. |
| Toggle report | Toggle (pilule) | 44×24 piste, 20px knob, on=`primary-600`, off=`neutral-300`. |
| Pied collant Enregistrer | Bouton primaire plein-largeur | fond `primary-600`, blanc, `radius-md`, min-height 48px ; dégradé `transparent`→`white` au-dessus. |
| Feuille abandon-confirm | Bottom-sheet | `radius-lg` haut, poignée, `shadow-lg`, scrim ; bouton Abandonner `danger-600`. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `accountId` | id (query/state) | `acct_courant` | Doit exister dans le store Comptes. Pilote toute la config éditée. |
| `monthlyBudget` | montant devise | `1800.00` | Requis, > 0 ; max pratique 9 999 999 ; 2 décimales ; groupage locale FR (espace). |
| `categoryLimits[].categoryId` | id (FK) | `cat_courses` | Doit exister dans le store Catégories. |
| `categoryLimits[].limit` | montant devise \| null | `400.00` / `null` | Optionnel ; null = illimité ; si défini, ≥ 0 ; 2 décimales. |
| `warningThreshold.mode` | enum | `"percent"` | Un parmi `percent`, `amount`. |
| `warningThreshold.value` | nombre | `80` (percent) ou `20` (amount) | percent : 1–100 entier ; amount : ≥ 0 devise. |
| `rollover.enabled` | booléen | `true` | true = ce compte participe au report de solde mensuel (cf. §13.5). |
| (dérivé) `allocatedTotal` | devise | `1220.00` | Somme des limites de catégorie non-null. |
| (dérivé) `remainingToAllocate` | devise | `580.00` | monthlyBudget − allocatedTotal ; peut être négatif. |
| (contexte) `accountBalance` | devise | `2480.00` | Solde live du compte (§13.1) ; lecture seule, affiché pour contexte. |
| `appliesFromMonth` | `YYYY-MM` | `2026-06` | Mois courant à l'enregistrement ; sémantique lecture seule (mois passé immutable). |

## States

- **Empty state (premier usage, aucun budget défini pour ce compte) :** l'entrée budget mensuel affiche « 0 € » en `neutral-400`. La liste de catégories est peuplée avec les catégories de l'utilisateur (de l'onboarding/05) mais chaque ligne affiche « Illimité ». L'aperçu réparti/restant affiche Réparti « 0 € » / Restant « 0 € » (ou « — »/« — » jusqu'à saisie d'un total). Aide Section A : « Définissez un total mensuel pour commencer. » Enregistrer désactivé.
- **Empty state (compte sans catégories) :** la liste de catégorie est vide avec un placeholder « Aucune catégorie. Gérez vos catégories. » + lien fantôme vers Gestion des catégories (05).
- **Loading state :** pendant le chargement de la config du compte depuis le store local : blocs squelette (`neutral-100` shimmer, désactivé sous `prefers-reduced-motion`) occupent la ligne budget, deux lignes de catégorie, et le bandeau réparti/restant. Le sélecteur de compte reste interactif. Entrées non interactives. Typiquement <200ms (store local).
- **Error state :** erreurs de validation rendues en ligne sous le champ fautif en `.caption` `danger-600`. Exemples : budget mensuel « Saisissez un montant supérieur à 0 € » ; percent « Saisissez une valeur entre 1 et 100 ». Enregistrer reste désactivé. Le bandeau progress ne passe en `warning-500` que pour la sur-allocation, pas pour les erreurs de champ.
- **Populated state (utilisateur revenant avec config existante pour ce compte) :** tous les champs pré-remplis. Budget mensuel affiche ex. « 1 800 € » ; lignes de catégorie affichent chaque limite et un caption « utilisé sur limite » tiré du spend du mois courant ; l'aperçu reflète la config enregistrée. Sur-allocation éventuelle → helper inline `warning-600` sous l'aperçu.
- **Changement de compte (sélecteur) :** garde dirty-form si formulaire sale ; sinon recharge silencieusement (cross-fade 200ms) toutes les sections A–E avec la config du nouveau compte. Le titre reste « Budget » (le nom du compte est dans le chip).

### Sous-état : Sur-allocation (somme des limites > total mensuel)
- Autorisée (pas bloquée). Le « Restant » de l'aperçu devient négatif et s'affiche en `warning-600` avec signe moins. La barre se remplit en `warning-500` et est bornée visuellement à 100% (pas de débord dessiné). Un `caption` `warning-600` explique l'excès. Enregistrer reste activé. Rationale : « alerter mais autoriser ».

### Sous-état : Budget abaissé sous le spend du mois courant
- Voir 🔴 question ouverte. Comportement proposé : le nouveau total inférieur prend effet immédiatement pour les **futurs** seuils/alertes de ce compte, mais les transactions déjà enregistrées ne sont jamais supprimées ni masquées. Si le spend courant dépasse déjà le nouveau total, l'anneau budget de 06 passe en sur-budget (`danger`) et un toast unique informe l'utilisateur. À confirmer.

## Interactions & Micro-animations

- **Saisie dans le budget mensuel ou une limite de catégorie** met à jour **instantanément** l'aperçu réparti/restant (pas de count-up sur saisie directe — Design System §9 ; le count-up est réservé aux totaux de dashboard).
- **Curseur de seuil :** déplacement de la poignée suivi du doigt ; le % se met à jour en direct (±0 si mode montant). Haptic léger à chaque cran (ex. 5% en 5%). `scale(.98)` au press.
- **Toggle / segmented :** 120ms `ease-out`, knob/segment slide, `scale(.98)` sur le contrôle.
- **Transition sur-allocation :** le nombre restant et la barre font un cross-fade vers les couleurs `warning-*` sur 150ms (opacité seule, reduced-motion safe).
- **Sélecteur de compte :** la feuille glisse vers le haut (translateY 16px + opacité 0→1, 200ms ease standard) ; sélectionner un compte referme la feuille (animation inverse) puis les sections A–E cross-fadent. Si dirty → la feuille de confirmation d'abandon s'anime d'abord vers le haut.
- **Ajout de catégorie via le picker :** la feuille glisse vers le haut ; la nouvelle ligne s'insère dans la liste avec une animation hauteur+opacité FLIP (désactivée sous `prefers-reduced-motion` → fondu ≤150ms).
- **Retrait de limite de catégorie** (en vidant l'entrée, ou swipe-gauche supprimer sur la ligne) : la ligne se replie hors-liste avec FLIP.
- **Enregistrement :** au succès, un toast succès (`success-600`, `shadow-toast`, 4s) « Budget enregistré pour {compte} » apparaît et l'écran revient à l'origine. Haptic tick léger à l'enregistrement si disponible.
- **Garde dirty-form :** retour/scrim/changement-de-compte pendant que sale → feuille abandon-confirm s'anime vers le haut ; « Abandonner » est le bouton Danger (`danger-600`), « Continuer l'édition » est Ghost.
- **Swipe-bord-droit** reflète le chevron retour (OS back), soumis à la même garde.
- **Réduction de mouvement :** tous les count-ups, animations FLIP de ligne, scale pops, et cross-fades couleur >150ms désactivés/simplifiés en fondu ≤150ms.

## Accessibility Notes

- **Ordre de focus :** chevron retour → Enregistrer → chip sélecteur de compte → entrée budget mensuel → entrées limites de catégorie (haut en bas) → « Ajouter une limite » → mode seuil (segmented si présent) → curseur/valeur seuil → toggle report → pied Enregistrer. Logique, haut en bas, correspondant à l'ordre visuel.
- **Étiquettes ARIA :**
  - Chevron retour : `aria-label="Retour à l'écran précédent"`.
  - Enregistrer : `aria-label="Enregistrer le budget"`, exposé comme bouton avec état désactivé annoncé.
  - Chip de compte : `aria-label="Sélectionner le compte, compte courant sélectionné"`, `aria-haspopup="dialog"`. La feuille de sélecteur : `role="dialog"`, `aria-label="Choisir un compte"`, options `role="option"` + `aria-selected`.
  - Solde live : `aria-label="Solde du compte : 2 480 euros"` (statique, pas dans le flux de focus).
  - Chaque entrée de catégorie : `aria-label="Limite pour {nom catégorie}, en euros"`, `aria-describedby` pointant vers son helper (« 288 € sur 400 » ou « Illimité »).
  - Toggle : `role="switch"`, `aria-label="Report de solde pour ce compte"`, `aria-checked`.
  - Curseur de seuil : `role="slider"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow="80"`, `aria-label="Seuil d'alerte, en pourcentage de la limite"`, `aria-valuetext="80 pour cent"`. Opérable au clavier (flèches gauche/droite ±1, Maj+flèches ±10).
  - Segmented mode seuil (si présent) : `role="radiogroup"` avec `aria-label="Mode de seuil"`, chaque segment `role="radio"`.
  - Barre de progression : `role="progressbar"`, `aria-valuenow` (borné 0–100), `aria-valuemin=0`, `aria-valuemax=100`, `aria-label="Part répartie du budget mensuel"`.
- **Lecteur d'écran :** l'aperçu réparti/restant s'annonce comme région live (`aria-live="polite"`) pour que les mises à jour pendant la saisie soient lues sans voler le focus. Le nom du compte édité est annoncé au changement de compte.
- **Clavier :** toutes les entrées et contrôles atteignables via Tab ; Entrée dans le budget mensuel avance le focus vers la première limite de catégorie (optionnel). Esc ferme toute feuille/scrim ouverte (avec garde dirty si applicable).
- **Cibles tactiles :** tout élément interactif ≥44×44px (icônes rembourrées ; piste du curseur ≥44px de haut de zone tactile ; entrées catégorie ≥44px de haut ; chip ≥44px).
- **Contraste :** `warning-600`/`danger-600` texte sur `white`/`neutral-800` respecte AA. En dark mode, texte warning utilise `warning-500` selon mapping Design System §2 si le contraste l'exige.
- **Réduction de mouvement :** tous les count-ups, animations FLIP de ligne, scale pops, et cross-fades couleur >150ms désactivés/simplifiés en fondu ≤150ms.

## Notes / Open Questions

- ✅ **Budget global/agrégé vs par compte — DÉCIDÉ (§13.1).** **Par compte uniquement.** Il n'existe aucun budget global/agrégé éditable. Le segment `Tous` de cet écran est **désactivé** (lecture seule = somme des budgets de chaque compte, jamais édité ici). Raisons : chaque compte a son propre rythme (Courant = dépenses courantes, Épargne = épargne, Espèces = petit quotidien) ; le rollover est par compte (§13.5) ; éviter une double source de vérité. L'écran n'édite donc qu'un compte à la fois.
- ✅ **Cohérence report (toggle ici = mécanisme global Salaire) — DÉCIDÉ, sémantique (a) (§13.5).** Le toggle ici **est** le mécanisme de report mensuel déclenché par le Salaire. **ON** = à la clôture du mois (Salaire enregistré + confirmé dans la boîte de dialogue), le solde non dépensé est reporté comme « disponible » du mois suivant (en plus du budget plein). **OFF** = le mois se clôt mais le disponible se réinitialise au budget plein (le solde réel du compte reste ; seul le complément reporté est sauté). Ce toggle est l'unique source de vérité de la participation de ce compte au report.
- 🔴 **Budget abaissé sous le spend courant :** que se passe-t-il exactement pour les alertes du mois courant et l'anneau de 06 quand l'utilisateur abaisse le total sous le spend déjà enregistré ? Proposé : les futures alertes utilisent le nouveau total ; les transactions passées sont intactes ; l'anneau passe en `danger` ; toast unique. À confirmer produit. Aussi : le changement s'applique-t-il au mois courant ou seulement au mois suivant ? (La note de pied suppose « ce mois en avant » mais non confirmé.)
- 🔴 **Budget mensuel nul/négatif :** un budget de « 0 € » est-il jamais valide (i.e. « pas de budget global, seulement des limites par catégorie ») ? La validation actuelle requiert > 0, ce qui forcerait un total même si l'utilisateur ne veut que des limites par catégorie. Si « 0 » doit signifier « pas de plafond global », la validation et la math de l'aperçu ont besoin d'un mode explicite « total illimité » — pas un token/pattern actuellement défini.
- 🔴 **Plafond de report :** les soldes reportés doivent-ils être plafonnés (ex. max 1× budget mensuel) pour éviter une accumulation sans borne ? Pas d'UI ni token défini pour un plafond ; nécessite une décision et possiblement un réglage.
- 🔴 **Sur-allocation par catégorie vs total :** quand les limites par catégorie dépassent le total, on « alerter mais autoriser ». Confirmer si les alertes de catégorie sur-budget se déclenchent quand même contre leurs limites individuelles (supposé oui) et si le seuil global s'applique au total (borné) ou au réparti — actuellement supposé s'appliquer à la limite propre de chaque catégorie.
- 🔴 **Curseur de seuil + mode montant :** le curseur 0–100% est un nouveau pattern d'entrée. Le mode « Montant » alternatif est-il nécessaire en v1, ou le mode percent seul suffit ? Si les deux : confirmer l'UX du contrôle segmented de mode.
- **Suivi d'origine :** la destination de retour doit refléter le point d'entrée (06 vs 09). Implémenter via un paramètre de route ou une origine de pile nav plutôt qu'un parent codé en dur.
- **Hors-ligne :** le budget est lu/écrit entièrement depuis le store local ; aucun réseau requis. Enregistrer fonctionne hors-ligne ; le badge de synchro-en-attente de la FAB n'est pas lié.
- **Symbole monétaire :** € préfixe/suffixe selon locale FR. L'étendue locales/devises au lancement est elle-même une QO (Design System §12.4) ; le placement du symbole et les règles décimales/séparateurs de milliers doivent suivre la locale choisie dans Réglages → Préférences.
