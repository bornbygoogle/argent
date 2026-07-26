# Argent

> Gérez vos dépenses, hors-ligne.

**Argent** est une **Progressive Web App (PWA) offline-first** de gestion de finances personnelles. Vos données restent **entièrement sur votre appareil** (IndexedDB via Dexie) — aucun serveur, aucun tracking, aucun compte requis. Sauvegarde optionnelle vers **votre propre Google Drive**.

- 📴 **100 % hors-ligne** — saisissez des dépenses sans connexion, les données restent disponibles.
- 🔒 **100 % privé** — aucune donnée n'est envoyée à un serveur tiers (hors Drive optionnel, sur votre compte).
- 📱 **Installable** — ajoutez Argent à votre écran d'accueil, plein écran, comme une vraie appli.
- 🌍 **Bilingue FR / EN** + multi-devises (ISO 4217).
- ☁️ **Sauvegarde Google Drive optionnelle** (OAuth, scope `drive.file` — l'app ne voit que les fichiers qu'elle crée ou que vous sélectionnez).

---

## Aperçu des écrans

| Écran | Route | Rôle |
|------|-------|-----|
| Onboarding | `/onboarding` | Création du premier compte |
| Accueil | `/` | Solde, revenus/dépenses du mois, mouvements récents |
| Statistiques | `/stats` | Tendance, top catégories & commerçants |
| Vue mensuelle | `/overview` | Intensité des dépenses, moyenne/jour, top catégories |
| Réglages | `/settings` | Préférences, organisation, sauvegarde Google, données |
| Nouvelle dépense | `/add` | Saisie rapide via pavé numérique |
| Nouvelle rentrée | `/income` | Saisie d'un revenu |
| Virement | `/transfer` | Transfert entre comptes |
| Mouvements | `/expenses` | Liste filtrable (tous / dépenses / revenus) |
| Modifier | `/expenses/:id` | Édition d'un mouvement |
| Comptes | `/accounts` | Comptes actifs & archivés |
| Récurrents | `/recurring` | Charges/rentrées régulières à confirmer chaque mois |
| Budget | `/budget` | Budget mensuel + limites par catégorie + report de solde |
| Catégories | `/categories` | Catégories par défaut + personnalisées |
| Types de revenu | `/income-types` | Sources de revenus réutilisables |

---

## Stack technique

- **React 18** + **TypeScript 5** + **Vite 5**
- **Dexie 4** (IndexedDB) — stockage local, transactions atomiques
- **react-router-dom 6** — routing SPA
- **i18next** — internationalisation FR/EN
- **Tailwind CSS 3** + CSS utilitaires
- **vite-plugin-pwa** (Workbox) — service worker, installable, auto-update
- **Google OAuth 2.0 (authorization code + PKCE) + Drive REST API** — sauvegarde optionnelle, via
  4 fonctions serverless Vercel (`api/auth/`) qui détiennent le refresh token (zéro dépendance npm ajoutée)
- **Vitest** + happy-dom — tests unitaires (`npm test`)

---

## Démarrage

### Prérequis
- Node.js 18+ et npm

### Installation
```bash
npm install
```

### Développement
```bash
npm run dev      # http://localhost:5173
```

### Build & prévisualisation
```bash
npm run build    # tsc -b && vite build → dist/
npm run preview  # prévisualise le build de production
npm run typecheck
```

---

## Configuration (optionnel) — Sauvegarde Google Drive

La section **Réglages → Sauvegarde Google** est **désactivée** tant que les credentials Google ne sont pas fournis (affichage graceful d'un banner « non configuré »).

### 1. Config Google Cloud (one-time)
Suit la procédure complète dans [`docs/google-setup.md`](docs/google-setup.md) :
1. Créer un projet Google Cloud → activer **Drive API** + **Picker API**.
2. Écran de consentement OAuth (Externe) → ajouter le scope `drive.file`.
3. Créer un **OAuth Client ID** (Web) → `VITE_GOOGLE_CLIENT_ID`.
4. Créer une **API key** (HTTP referrer-restricted) → `VITE_GOOGLE_API_KEY`.

### 2. Variables d'environnement
Copie `.env.example` en `.env` et renseigne tes credentials :

```bash
cp .env.example .env
```

```env
# Publics — finissent dans le bundle navigateur, par design.
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza...

# Serveur uniquement — JAMAIS de préfixe VITE_ (Vite inline tout VITE_* dans le bundle).
GOOGLE_CLIENT_SECRET=GOCSPX-...
SESSION_SECRET=<32 octets base64>
APP_ORIGIN=http://localhost:5173
```

Génère `SESSION_SECRET` :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

> ℹ️ Les deux `VITE_*` sont **publics par design** — leur sécurité repose sur les origines et
> referrers autorisés dans Google Cloud Console. Les trois autres sont des **secrets serveur** :
> ils ne quittent jamais les fonctions `api/auth/`.

### 3. Origines et redirections autorisées (dev + prod)
Dans Google Cloud Console :
- **OAuth Client → Authorized redirect URIs** : `http://localhost:5173/api/auth/callback` + `https://<prod>/api/auth/callback`.
- **OAuth Client → Authorized JavaScript origins** : `http://localhost:5173` + ton URL de production.
- **API key → HTTP referrers** : `http://localhost:5173/*` + ton URL de production `/*`.
- **OAuth consent screen → Publish app** (*Testing* → *In production*), sinon le refresh token
  expire tous les 7 jours. Voir [`docs/google-setup.md`](docs/google-setup.md).

Redémarre `npm run dev` après avoir créé `.env`.

---

## Déploiement sur Vercel

Le dépôt contient un [`vercel.json`](vercel.json) préconfiguré (routing SPA + build Vite).

1. Pousse le repo sur GitHub.
2. Sur [vercel.com/new](https://vercel.com/new) → importe le repo. Framework Preset : **Vite** (auto-détecté).
3. Build Command : `npm run build` · Output : `dist` (auto).
4. **Environment Variables** (avant de cliquer Deploy) — Production **et** Preview :
   - `VITE_GOOGLE_CLIENT_ID` = ta valeur
   - `VITE_GOOGLE_API_KEY` = ta valeur
   - `GOOGLE_CLIENT_SECRET` = ta valeur *(serveur — jamais préfixé `VITE_`)*
   - `SESSION_SECRET` = 32 octets base64 *(serveur)*
   - `APP_ORIGIN` = l'URL exacte de cet environnement, ex. `https://argent.vercel.app` *(serveur)*
5. **Deploy.** Les fonctions `api/auth/*` sont détectées automatiquement (runtime Node.js).
6. ⚠️ Dans Google Cloud Console : ajoute `https://<ton-domaine>/api/auth/callback` aux **redirect
   URIs**, l'origine aux **JavaScript origins** et aux **referrers**, et **publie l'app**
   (sinon OAuth casse en prod, ou redemande une reconnexion chaque semaine).

---

## Données & confidentialité

| Aspect | Détail |
|-------|--------|
| Stockage | Local, IndexedDB (Dexie). Aucune donnée n'est envoyée à un serveur applicatif. |
| Sauvegarde Google | Optionnelle, OAuth `drive.file` — l'app n'accède qu'aux fichiers qu'elle crée ou que vous sélectionnez via le Picker. |
| Jetons Google | Le **refresh token** est chiffré (AES-256-GCM) dans un cookie `httpOnly` : il n'est jamais lisible par le JavaScript de la page. Les **access tokens** sont éphémères et vivent uniquement en mémoire — rien n'est écrit dans `localStorage`. Les fonctions serverless ne voient que des jetons : **aucune donnée financière ne transite par un serveur.** |
| Export/Import | Fichier JSON local (Réglages → Données). |
| Effacement | « Tout effacer » wipe toutes les tables locales (confirmation par mot tapé). |

---

## Organisation du code

```
src/
├── App.tsx                  # Routing SPA
├── main.tsx                 # Entrypoint + i18n
├── db/                      # Dexie (schéma, seed)
├── features/                # Écrans (dashboard, settings, transactions…)
│   └── settings/GoogleSync.tsx   # UI sauvegarde Google Drive
├── hooks/                   # useGoogleAuth, selectors, useOnlineStatus
├── lib/
│   ├── google/              # auth, drive, picker, env (zéro dep npm)
│   ├── data.ts              # export/import/wipe backup
│   └── …                    # currency, budget, stats, format, etc.
├── store/                   # SettingsContext, AccountScopeContext
├── components/ui/           # Design system (Button, Sheet, Banner…)
├── locales/{fr,en}/         # i18n
└── types/models.ts          # Types domaine
```

---

## Licence

Projet privé. Aucune licence accordée sans autorisation explicite.
