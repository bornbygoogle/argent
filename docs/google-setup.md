# Google Cloud setup (one-time, app owner)

The Settings → "Sauvegarde Google" feature needs two public credentials from a single Google Cloud project. Both ship in the browser bundle by design — restrict them in Google Cloud.

## 1. Create the project
- https://console.cloud.google.com/ → create / select a project.

## 2. Enable APIs
- Enable **Google Drive API**.
- Enable **Google Picker API**.

## 3. OAuth consent screen
- User type **External** (or Internal if you have a Workspace).
- Add scope `https://www.googleapis.com/auth/drive.file`.
- Add yourself as a **test user** while in Testing status.

## 4. OAuth Client ID
- Credentials → Create credentials → **OAuth client ID** → **Web application**.
- **Authorized JavaScript origins**: your production origin(s) + `http://localhost:5173` for dev.
- Copy the **Client ID** → `.env` as `VITE_GOOGLE_CLIENT_ID`.

## 5. API key (for the Picker)
- Credentials → Create credentials → **API key**.
- **Application restrictions**: HTTP referrers → add your production origin(s) + `http://localhost:5173/*`.
- **API restrictions**: restrict to **Google Drive API** + **Google Picker API**.
- Copy the key → `.env` as `VITE_GOOGLE_API_KEY`.

## 6. Local `.env` (not committed)
```
VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=<your-api-key>
```

Restart `npm run dev` after creating `.env`.
