# Argent — Fluidité Google + Fiabilité & feedback UX

**Date :** 2026-07-08
**Statut :** Design validé, prêt pour plan d'implémentation
**Périmètre :** deux chantiers unifiés, un seul spec

---

## 1. Contexte & objectif

**Argent** est une PWA offline-first de gestion de finances (React 18 + TypeScript + Dexie/IndexedDB), avec sauvegarde optionnelle vers le Google Drive de l'utilisateur. L'app est visuellement soignée et cohérente (design system tokenisé). Les frictions ne sont donc **pas esthétiques** : ce sont des **angles morts de feedback et de fiabilité**.

Deux douleurs concrètes remontées par le propriétaire :

1. **Sign-in Google pas automatique** au retour sur le site. Aujourd'hui, la session ne se réactive au chargement que si un token GIS non-expiré (< 1 h) subsiste en `localStorage`. Passé ce délai, il faut recliquer « Se connecter » dans les Réglages.
2. **Backup/restore Google pas fluide** : pas de retour visuel clair (l'état n'est visible que dans Réglages), et des échecs silencieux (`console.warn`) qui laissent croire à tort que la synchronisation fonctionne.

Un **audit UX** de tous les écrans a par ailleurs révélé des bugs de fiabilité (perte de données silencieuse) et une absence généralisée de feedback d'écriture.

**Fil rouge unique du spec :** *rendre visible et fiable ce qui est aujourd'hui silencieux.*

---

## 2. Décisions produit (validées)

| Sujet | Décision |
|---|---|
| Priorité | Les deux chantiers dans **un seul spec**. |
| Sign-in au retour (token expiré) | Reconnexion **silencieuse** d'abord, **popup auto** en secours si le silencieux échoue. |
| Popup auto bloqué par le navigateur | **Bandeau discret** « Reconnecter Google » sur l'accueil (le clic = geste utilisateur = popup fiable). |
| Condition de déclenchement du sign-in auto | **Email mémorisé ET au moins un compte configuré**. Sinon : rien ne se déclenche jamais. |
| Douleurs backup à traiter en priorité | **Pas de retour visuel clair** + **échecs silencieux**. |
| Approche UX | **Audit d'abord**, puis sélection des correctifs (ci-dessous). |
| Périmètre UX retenu | **Tout** : 3 bloquants + feedback écritures + garde-fous transactions + accessibilité. |
| Mécanisme de feedback central | **Toasts éphémères** (écritures) + **puce de sync** discrète dans la TopBar (remplace la cloche morte). |
| Fréquence des toasts de backup réussi | **Discrète** : seulement backup manuel + 1er backup après reconnexion + toutes les erreurs. Pas de toast sur chaque auto-push (~5 s). |

---

## 3. Architecture

On **étend** l'existant sans le réécrire : le design system, les tokens CSS, le routing et le composant `GoogleAutoBackup` sont conservés. Les corrections de bugs sont **chirurgicales**.

### Nouveaux modules (isolés, à responsabilité unique)

| Module | Rôle | Dépend de |
|---|---|---|
| `src/store/ToastContext.tsx` | File de toasts globale + hook `useToast()` | — |
| `src/components/ui/Toast.tsx` | Rendu d'un toast + `ToastContainer` | ToastContext, tokens Banner |
| `src/components/ui/SyncPill.tsx` | Puce d'état de sync (TopBar) | GoogleAuthContext |
| `src/hooks/useSilentReconnect.ts` | Orchestration de la reconnexion au démarrage | GoogleAuthContext, Dexie (count comptes) |

### Modifications de modules existants

- `src/store/GoogleAuthContext.tsx` — exposer `needsReconnect: boolean` et `clearNeedsReconnect()`.
- `src/components/GoogleAutoBackup.tsx` — toasts anti-spam + suppression du `location.reload()` brutal.
- `src/App.tsx` — monter `ToastProvider` (dans `BrowserRouter`) et brancher `useSilentReconnect`.
- Écrans concernés par les correctifs de fiabilité (§6).

---

## 4. Chantier A — Sign-in automatique

### Machine à états (au démarrage, une seule fois par montage)

```
Au démarrage
  ├─ Google non configuré ─────────────────────────────► rien
  ├─ Pas d'email mémorisé OU 0 compte configuré ───────► rien (jamais de déclenchement)
  └─ email mémorisé + ≥1 compte + pas de session active
        ▼
   [1] Token localStorage encore valide ? ─ oui ─► session active, invisible ✓
        │ non
        ▼
   [2] requestAccessToken({ prompt: '' }) (silencieux, cookie GIS) ─ succès ─► actif ✓
        │ échec
        ▼
   [3] requestAccessToken({ prompt: 'consent' }) (popup auto) ─ succès ─► actif ✓
        │ bloqué / échec / timeout
        ▼
   [4] needsReconnect = true ─► bandeau discret sur l'accueil (clic ➜ popup fiable)
```

### Détails de conception

- **Condition de déclenchement stricte** : `email` mémorisé (localStorage) **ET** `db.accounts.count() > 0`. Lecture du compteur au démarrage via Dexie.
- **`useSilentReconnect`** isole l'orchestration au boot (le `GoogleAuthProvider` reste responsable de l'état, pas du boot). S'exécute **une seule fois** par montage (garde par `ref`).
- Les étapes [2]→[3] réutilisent la logique déjà présente dans `signIn()` ; ici on la câble aussi au démarrage automatique.
- **`needsReconnect`** (nouvel état du contexte) passe à `true` uniquement à l'étape [4]. Il pilote le bandeau et l'état « en pause » de la puce de sync.
- **Bandeau « Reconnecter Google »** : réutilise `Banner` (tone `warn`), monté sur le Dashboard, non-bloquant, bouton appelant `signIn()`, dismissable pour la session (n'efface pas `needsReconnect`, masque juste le bandeau).

### Gestion d'erreur

Le popup auto [3] peut lever `google-auth-timeout` ou être avalé par le navigateur. Dans tous les cas → transition propre vers [4], jamais d'écran figé. En pratique, [4] sera fréquent sur mobile (Brave/Safari bloquent souvent les popups non déclenchés par un clic) — c'est un comportement attendu et correctement géré par le bandeau.

---

## 5. Chantier B — Sync visible & fluide

### 5.1 Puce de sync (TopBar) — remplace la cloche morte du Dashboard

Cinq états dérivés de `GoogleSyncStatus` (existant) + `needsReconnect` :

| État | Icône | Couleur | Action au tap |
|---|---|---|---|
| Synchronisé | `CloudCheck` | vert discret | ouvre Réglages → Google |
| En cours | `RefreshCw` (spin) | indigo | — |
| En pause (reconnexion requise) | `CloudOff` | ambre | déclenche `signIn()` |
| Erreur | `CloudAlert` | rouge | ouvre le détail de l'erreur (Réglages → Google) |
| Non connecté / non configuré | *(masquée)* | — | — |

Discrète (icône seule, pas de texte). Visible **uniquement** si Google est configuré. Emplacement : dans la TopBar du **Dashboard**, à la place exacte de la cloche `Bell` morte (les autres écrans gardent leur TopBar inchangée).

### 5.2 Système de toasts

- **`ToastContext`** : file de **max 3** toasts, chacun `{ id, message, tone: 'success' | 'error' | 'info', duration }`. Auto-dismiss par défaut **2,5 s**, dismiss au tap.
- **`ToastContainer`** : rendu en bas de l'écran, **au-dessus de la bottom nav**, respecte `env(safe-area-inset-bottom)`. Réutilise les tokens visuels de `Banner`.
- **`useToast()`** : `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`.
- Provider monté dans `App.tsx`, à l'intérieur de `BrowserRouter`.

**Émetteurs de toasts :**

| Événement | Toast |
|---|---|
| Ajout / édition / suppression transaction & virement | `success` |
| Échec d'une écriture | `error` |
| Backup Drive réussi (manuel, ou 1er après reconnexion) | `success` discret « Sauvegardé sur Drive » |
| Backup / pull Drive échoué | `error` **actionnable** (remplace les `console.warn` silencieux) |
| Restore / pull cross-device terminé | `info` « Données synchronisées depuis Drive » |

> **Anti-spam :** l'auto-push toutes les ~5 s reste **silencieux** (pas de toast succès). Seuls backup manuel, 1er backup post-reconnexion, et **toutes** les erreurs émettent un toast.

### 5.3 Fluidité du backup/restore

Deux corrections ciblées dans `GoogleAutoBackup` :

1. **Reload doux** : remplacer `location.reload()` après un pull cross-device. `importBackup` réécrit les tables Dexie → les hooks `dexie-react-hooks` (`useLiveQuery`) se rafraîchissent automatiquement. On conserve `markRestoredJustNow()` pour le toast `info`. Objectif : **zéro reload** en cas normal. Un reload de dernier recours, explicitement gardé, reste toléré uniquement si un état dérivé (ex. Settings) ne se propage pas — à confirmer à l'implémentation.
2. **Toasts de sync anti-spam** conformes à §5.2.

---

## 6. Chantier C — Corrections de fiabilité (chirurgicales)

| # | Écran | Correctif | Sévérité |
|---|---|---|---|
| 1 | **Budget** | Réinitialiser le flag `hydrated` au changement de scope de compte ; ne pas hydrater tant que le budget async n'est pas arrivé → jamais d'écrasement par des zéros. | 🔴 bloquant |
| 2 | **TransactionForm / Transfer** | `try/catch` autour du save + état `saving` désactivant OK pendant l'écriture (anti-double-tap) ; `toast.error` sur échec. | 🔴 bloquant |
| 3 | **Accounts** | Si suppression impossible faute d'autre compte de réassignation : message explicite au lieu d'un bouton grisé muet. | 🔴 bloquant |
| 4 | **Numpad** | Bouton « back » avec **appui long = clear** ; retour visuel/haptique léger (`navigator.vibrate` si dispo) quand une limite bloque la saisie. Traduire `aria-label` « Backspace »/« Decimal ». | 🟠 gênant |
| 5 | **Recurring** | Confirmation avant de confirmer/dé-confirmer un récurrent (crée/annule une vraie transaction qui modifie les soldes). | 🟠 gênant |
| 6 | **MovementsList** | Distinguer 3 états vides : hydratation, filtre sans résultat (« aucun résultat pour ce filtre »), aucune donnée. Ajouter un filtre « virements ». | 🟠 gênant |
| 7 | **Confirmations de suppression** | Afficher le montant / la description de l'élément supprimé (transaction, virement). | 🟠 gênant |
| 8 | **Statistics / Overview** | Corriger la sémantique inversée des flèches de tendance ; borner la navigation mois au mois courant ; traduire les `aria-label` des flèches de mois. | 🟠 gênant |
| 9 | **InstallPrompt** | Ne pas s'ouvrir pendant une saisie ; différencier visuellement « Jamais » (destructif, définitif) de « Plus tard » + confirmation. | 🟠 gênant |
| 10 | **Accessibilité transverse** | Cibles tactiles **≥ 44 px** (acct-chip 32 px, swap 36 px, boutons ghost 40 px) ; `aria-label` codés en dur passés en i18n (« swap », « Backspace », « Decimal »). | 🟡 cosmétique |

---

## 7. Flux de données

- **Sign-in auto** : `useSilentReconnect` (boot) → lit compteur comptes (Dexie) + email (localStorage) → tente [1]→[3] via `auth.ts` → met à jour `active` / `needsReconnect` dans `GoogleAuthContext`.
- **Puce de sync** : lit `syncStatus` + `needsReconnect` depuis `GoogleAuthContext` (déjà observable).
- **Toasts** : n'importe quel écran appelle `useToast()` ; `GoogleAutoBackup` émet les toasts de sync ; la file vit dans `ToastContext`.
- **Restore** : `GoogleAutoBackup.pullOnce()` → `importBackup` (Dexie) → `useLiveQuery` propage → `toast.info` (plus de `location.reload()`).

---

## 8. Gestion d'erreur (principe transverse)

- **Aucune écriture ne doit échouer silencieusement.** Toute opération Dexie ou Drive susceptible d'échouer est enveloppée d'un `try/catch` qui émet un `toast.error` lisible.
- Les `console.warn` de `GoogleAutoBackup` (pull/push best-effort) sont **doublés** d'un `toast.error` actionnable.
- Les boutons d'écriture (save transaction, save budget, save compte) exposent un état `saving`/`busy` qui les désactive pendant l'opération → anti-double-tap.

---

## 9. Tests & vérification

L'app n'a **pas** de suite de tests automatisés. La vérification repose sur :

- `npm run typecheck` — doit passer sans erreur.
- `npm run build` (`tsc -b && vite build`) — doit produire un build propre.
- **Vérification manuelle ciblée** des parcours clés :
  - Ajout d'une dépense → toast succès, pas de double-enregistrement au double-tap.
  - Budget : changer de compte puis enregistrer → pas d'écrasement par des zéros.
  - Reconnexion Google : simuler un token expiré → silencieux → popup → bandeau selon le cas.
  - Restore cross-device → données mises à jour sans reload brutal + toast info.

Les fonctions pures nouvellement introduites (ex. logique d'états de la puce de sync, si extraite) peuvent recevoir des tests unitaires légers si un runner est ajouté ; non requis pour ce spec.

---

## 10. Hors périmètre (YAGNI)

- Refonte esthétique / redesign visuel (l'identité actuelle est conservée).
- Vue « détail/transactions par compte » (le chevron trompeur sur Accounts est traité en clarifiant l'action, pas en ajoutant un écran).
- Actions par swipe/appui long sur les lignes de mouvements.
- Interactivité avancée des graphes (tooltips au tap sur barres/heatmap) — on corrige la sémantique et l'accessibilité, pas l'ajout d'un mode interactif complet.
- Suite de tests automatisés complète.
