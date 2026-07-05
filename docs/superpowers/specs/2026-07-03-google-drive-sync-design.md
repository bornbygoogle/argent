# Sauvegarde Google Drive — Design Spec

**Date :** 2026-07-03
**Statut :** Brouillon — en attente de validation utilisateur
**Feature :** Dans l'écran Settings, ajouter une section « Sauvegarde Google » : l'utilisateur se connecte à son compte Google, puis sauvegarde ses données dans **un dossier qu'il choisit** de son Drive, et restaure depuis **un fichier qu'il choisit**.

---

## 1. Contexte

L'app **argent** (`gestionmoney`) est une **PWA offline-first** : React 18 + Vite + VitePWA, données en **IndexedDB via Dexie** (`src/db/db.ts`), i18n fr/en. **Aucun backend, aucune dépendance Google actuellement.**

La sérialisation des données existe déjà dans [src/lib/data.ts](src/lib/data.ts) :
- `exportBackup()` → produit un `BackupPayload` JSON (`{ app: 'argent', version: 1, exportedAt, tables }`) couvrant toutes les tables métier.
- `parseBackupFile(text)` + `importBackup(payload)` → restaure en **remplaçant** toutes les tables (`clear()` + `bulkPut()`).

Le design original ([mocks/09-settings.md](mocks/09-settings.md)) prévoyait une sauvegarde via **Web Share API** (le JSON est confié à l'OS, l'utilisateur choisit Drive/iCloud) — explicitement **sans login Google, sans API Google**. Le code actuel ([Settings.tsx:273](src/features/settings/Settings.tsx#L273)) a même omis cette ligne, la jugeant « fictive ».

**Décision utilisateur (2026-07-03) :** on part sur une **vraie intégration Google** — login OAuth + Drive API — où l'utilisateur choisit lui-même le dossier (sauvegarde) et le fichier (restauration). Le Web Share des mocks est abandonné au profit de cette approche.

## 2. Objectif & périmètre

**Ce qui est inclus :**
- Connexion à un compte Google (OAuth, Google Identity Services).
- **Sauvegarder** : sérialiser les données (réutiliser `exportBackup()`) → l'utilisateur choisit un dossier Drive → upload du JSON horodaté dans ce dossier.
- **Restaurer** : l'utilisateur choisit un fichier de sauvegarde Drive → download → `parseBackupFile()` → `importBackup()` (remplacement complet, avec confirmation).
- Déconnexion (révoquer l'accès côté app).
- Chaînes i18n fr + en.

**Hors périmètre (assumptions à confirmer) :**
- Sync automatique / en arrière-plan, merge multi-appareils, résolution de conflits → **futur**. V1 = actions manuelles, **dernière écriture gagne**.
- Restore en mode « fusion » (merge) → V1 fait du **remplacement complet** (comme `importBackup` actuel), avec dialogue de confirmation.
- iCloud → non couvert (Google uniquement).
- Mémorisation du dernier dossier/fichier utilisé (raccourci) → bonus optionnel, pas en V1.

## 3. Approche technique (décidée)

- **Auth : Google Identity Services (GIS) token client** — flux implicite côté client, `access_token` court. **Aucun backend requis.**
- **Scope : `drive.file`** — l'app n'accède qu'aux fichiers **qu'elle a créés** ou que **l'utilisateur sélectionne explicitement** via le Picker. Respect total de la vie privée (l'app ne voit jamais le reste du Drive). C'est le scope standard et le moins intrusif.
- **Sélection dossier/fichier : Google Drive Picker API.**
  - Sauvegarde : Picker en mode `setSelectFolderEnabled(true)` → renvoie un `folderId` → création du fichier avec `parents: [folderId]`.
  - Restauration : Picker fichier → renvoie un `fileId` → `files.get(fileId, {alt:'media'})` pour télécharger le contenu.
- **Appels Drive : `fetch`** vers la Drive REST API v3 avec en-tête `Authorization: Bearer <token>`. **Pas de lib `gapi` client** (plus léger) — seul le **Picker** nécessite le script `google.picker`.
- **Scripts Google chargés dynamiquement** (`accounts.google.com/gsi/client`, `apis.google.com/js/picker.js`) injectés à la demande lors du 1er usage. **Zéro nouvelle dépendance npm.**
- **Réutilisation maximale** : `exportBackup()` / `parseBackupFile()` / `importBackup()` de `data.ts` restent la source de vérité. La couche Google ne fait que transporter le JSON.

## 4. Prérequis externes (HARD — à faire par le propriétaire de l'app)

Le feature **ne peut pas fonctionner** sans cette configuration Google Cloud (one-time) :

1. Créer un **projet Google Cloud**.
2. Activer **Google Drive API** + **Google Picker API**.
3. Créer un **identifiant client OAuth 2.0** (type « Application Web »). **Origines JavaScript autorisées** = origines de l'app déployée + `http://localhost:5173` pour le dev.
4. Configurer l'**écran de consentement OAuth** (Externe ; scope `drive.file`).
5. Injecter les credentials via Vite : `VITE_GOOGLE_CLIENT_ID` (OAuth) **et** `VITE_GOOGLE_API_KEY` (clé navigateur requise par le Picker).
   - Ajouter `.env` (local) + `.env.example` (commité). Procédure détaillée dans `docs/google-setup.md`.
6. Mettre à jour `src/vite-env.d.ts` (ou `src/types/`) pour typer `import.meta.env.VITE_GOOGLE_CLIENT_ID`.

> À documenter dans un `docs/google-setup.md` (ou section README) pour que ce soit reproductible.

## 5. Architecture du code

Nouveaux modules (tous fins et isolés, testables indépendamment) :

| Fichier | Rôle |
|---|---|
| `src/lib/google/loadScripts.ts` | Injection paresseuse des scripts GIS + Picker (dé-dup, retourne une Promise). |
| `src/lib/google/auth.ts` | Wrapper GIS : `signIn()` (demande token `drive.file`), `signOut()`, état minimal (email du compte). |
| `src/lib/google/drive.ts` | Helpers Drive via `fetch` : `uploadBackupToFolder(folderId, payload)`, `downloadBackupFile(fileId)`. |
| `src/lib/google/picker.ts` | Loader Picker : `pickFolder(token)` → `folderId`, `pickFile(token)` → `fileId`. |
| `src/hooks/useGoogleAuth.ts` | Hook React : état de connexion (signed-in + email), `signIn`/`signOut`, exposé à l'UI. Email persisté en `localStorage` pour l'affichage (le token, lui, est court et demandé à chaque action). |
| `src/features/settings/GoogleSync.tsx` | Section UI « Sauvegarde Google » : login, statut (email), boutons Sauvegarder / Restaurer, feuille de confirmation de restauration. |

Modifications de l'existant :
- [src/features/settings/Settings.tsx](src/features/settings/Settings.tsx) : ajouter `<GoogleSync />` dans une nouvelle section (entre « Organization » et « Data », ou dans « Data »). Conserver le bloc Export/Import/Clear local existant.
- [src/locales/fr/common.json](src/locales/fr/common.json) + [src/locales/en/common.json](src/locales/en/common.json) : nouvelles clés (`settings.google.*`, `settings.googleErrors.*`).
- `.env.example` + types Vite.

### Flux de données

**Sauvegarder :**
```
[click Sauvegarder] → useGoogleAuth.signIn() (token drive.file)
  → picker.pickFolder(token) → folderId
  → payload = exportBackup()
  → drive.uploadBackupToFolder(folderId, payload)   // POST upload, parents=[folderId], name=argent-backup-<ts>.json
  → toast succès (avec nom du fichier)
```

**Restaurer :**
```
[click Restaurer] → signIn() (token)
  → picker.pickFile(token) → fileId
  → drive.downloadBackupFile(fileId) → text
  → payload = parseBackupFile(text)
  → [feuille de confirmation "Remplacer toutes les données locales ?"]
  → importBackup(payload) → location.reload()
  → toast succès
```

**Fichier sauvegardé :** nouveau fichier horodaté à chaque sauvegarde (`argent-backup-YYYY-MM-DDTHH-MM.json`) — cohérent avec `downloadBackup` existant. (Écraser le précédent = amélioration future.)

## 6. UX / UI

- Réutiliser les composants existants : `NavRow`, `Button`, `Sheet`, `Banner`, `TintedIcon`, `Icon` (icône `CloudUpload` / `Cloud`).
- Nouvelle section **« Sauvegarde Google »** dans Settings :
  - Si **non connecté** : un `NavRow`/bouton « Se connecter à Google » → déclenche `signIn()`.
  - Si **connecté** : ligne de statut affichant l'email (`Icon` coche, `success-600`), + deux actions : **Sauvegarder** (pick dossier → upload) et **Restaurer** (pick fichier → confirm → restore). + un lien discret « Se déconnecter ».
- **Restauration = action destructive** (remplace tout) → feuille de confirmation type celle du « Tout effacer » existant ([Settings.tsx:349](src/features/settings/Settings.tsx#L349)), avec mot de confirmation ou bouton danger.
- **Erreurs** : `Banner` `danger` en haut de la section (token refusé, quota Drive, Picker bloqué, fichier invalide), la section reste utilisable pour réessayer. Réutiliser les patterns existants (`err` state).
- **Succès** : toast/caption `success-600`.
- Chaînes i18n **fr + en obligatoires**.

## 7. Sécurité & vie privée

- Scope `drive.file` : l'app ne voit **que** les fichiers qu'elle crée ou que l'utilisateur sélectionne via le Picker. Aucune lecture du reste du Drive. Point de communication fort, cohérent avec le positioning « offline-first, pas de serveur ».
- Token court, en mémoire ; **jamais** persisté. Seul l'email est conservé pour l'affichage du statut.
- Aucune donnée ne transite par un serveur tiers — uniquement Google Drive, compte de l'utilisateur.

## 8. Gestion d'erreurs (cas à couvrir)

| Cas | Comportement |
|---|---|
| Token refusé / utilisateur annule le consentement | Banner danger, reste non connecté |
| `VITE_GOOGLE_CLIENT_ID` absent | Banner danger « non configuré » dès l'ouverture de la section (graceful) |
| Échec upload/download (réseau, quota) | Banner danger, retry possible |
| Picker indisponible (script bloqué) | Banner danger |
| Fichier sélectionné invalide (pas un backup argent) | `parseBackupFile` lève → Banner danger « format non reconnu » |
| Restore partiel | reste sur le pattern existant (import atomique via transaction Dexie) |

## 9. Stratégie de test

- **Logique pure déjà couverte** : `exportBackup`/`parseBackupFile`/`importBackup` (la couche Google ne fait que transporter du JSON).
- **Couche Google (auth/drive/picker)** : fine et isolée. Tests unitaires sur les helpers de (dé)sérialisation de réponses ; les appels réseau réels nécessitent des identifiants → **checklist de test manuel** documentée (login, pick dossier, upload, vérifier le fichier dans Drive, pick fichier, restore, déconnexion, cas d'erreur).
- `npm run typecheck` + `npm run build` doivent passer.

## 10. Phasage d'implémentation (succinct)

1. **Config & prérequis** : `.env.example`, types Vite, doc `docs/google-setup.md`.
2. **Script loader** (`loadScripts.ts`).
3. **Auth** (`auth.ts` + `useGoogleAuth.ts`) — login/logout/email.
4. **Drive helpers** (`drive.ts`) — upload/download réutilisant `exportBackup`/`importBackup`.
5. **Picker** (`picker.ts`) — pickFolder/pickFile.
6. **UI** (`GoogleSync.tsx` + intégration dans `Settings.tsx`) — section complète + feuille de confirmation de restauration.
7. **i18n** fr/en.
8. **Vérification** : typecheck, build, checklist test manuel.

## 11. Questions ouvertes / assumptions à valider par l'utilisateur

- [ ] Scope `drive.file` (privacy-friendly) — OK ?
- [ ] Restore = remplacement complet (pas de merge) avec confirmation — OK ?
- [ ] Pas de sync auto / multi-appareil en V1 — OK ?
- [ ] Fichier horodaté à chaque sauvegarde (pas d'écrasement) — OK ?
- [ ] Prérequis Google Cloud (Client ID) à fournir par le propriétaire de l'app — OK / qui s'en charge ?

> Statut : **plan prêt, en attente de validation.** Une fois validé, passage au skill `writing-plans` pour le plan d'implémentation détaillé, puis codage.
