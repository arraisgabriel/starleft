# Google Drive cloud save-sync — one-time setup

STARLEFT can sync a player's **solo-campaign + H.U.B.** save slots across devices using each player's own Google Drive (the hidden, per-app `appDataFolder`). It is **free, serverless, and ships no secret** — only a public OAuth *Client ID*. The whole feature is **inert until you paste a Client ID** into `GDRIVE_CLIENT_ID` in [`js/config.js`](../js/config.js): with it empty, no Google script loads, no Sync UI appears, and zero network calls are made (same pattern as `TELE_ENDPOINT` in `js/telemetry.js`).

This is a **one-time, owner-only** step (you need a Google account; players do not need anything but their own Google login).

## Steps (Google Cloud Console)

1. **Create a project** at <https://console.cloud.google.com> — e.g. *"STARLEFT Cloud Save"*.
2. **Enable the Drive API** — APIs & Services → **Library** → *Google Drive API* → **Enable**. (Required even though we only touch `appDataFolder`.)
3. **OAuth consent screen** — APIs & Services → *OAuth consent screen*:
   - **User type: External.**
   - App name, **user-support email**, developer contact email.
   - **Scopes:** add `.../auth/drive.appdata`, `openid`, `email`. All three are **non-sensitive**, so there is **no Google verification / security review** and no unverified-app warning.
   - **⚠ PUBLISH the app to Production.** This is the easy-to-miss step. Left in **Testing**, you are capped at ≤100 added test users and their consent expires every 7 days. Because every scope is non-sensitive, the Testing → Production flip is instant and needs no review. Confirm the screen reads **"Publishing status: In production"**.
4. **Create the OAuth client** — APIs & Services → **Credentials** → *Create credentials* → **OAuth client ID**:
   - **Application type: Web application.**
   - **Authorized JavaScript origins** (origins only — no path, no trailing slash). Add **every** origin that serves `rts.html`, plus localhost for dev:
     - your production origin — confirm which one you actually deploy to (the repo references both `https://starleft.vercel.app` in the OG tags and a GitHub Pages origin like `https://arraisgabriel.github.io`); list each one that serves the game
     - `http://localhost:8000` (and any other local dev port you use)
   - **Authorized redirect URIs:** none needed for the GIS token model.
   - Copy the **Client ID** (`…apps.googleusercontent.com`).
5. **Enable the feature** — paste the Client ID into `js/config.js`:
   ```js
   const GDRIVE_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';
   ```
   Commit + deploy. The Load Game menu now shows **☁ Connect cloud saves**, and **New Campaign** shows the cross-device explainer.

## Why this is safe to ship publicly

- **No client secret exists** for the GIS token flow — the Client ID is **public by design**, so nothing confidential lives in the repo or the served HTML.
- The **non-sensitive `drive.appdata` scope structurally confines** all reads/writes to the signed-in user's own hidden, per-account folder. STARLEFT can never see a user's other Drive files; no other app or user can see STARLEFT's. So the Authorized-Origins list is a *soft* barrier, not the security boundary — the scope is.
- Because the folder is private per-account, **no at-rest encryption is needed**.

## What players experience

- **Connect once** per device (Google consent). After that, saves auto-upload (debounced) and the Load menu auto-merges cloud saves on open / tab focus.
- **Identity is the Google account** — "same Google login on both devices = same saves." There is no arbitrary-email option.
- **~1-hour access token, no refresh token** (a structural limit of secret-free static OAuth — see the plan / `docs/save-sync-options.md`). Re-auth is tied to gestures and is usually silent (`prompt:''` + the saved account hint); a player who never clicks Sync sees no Google UI and never gets an unexpected popup.

## Scope / limits

- **Solo campaign + H.U.B. only.** Co-op sessions are never written to `localStorage` (`save.js` gates on `netRole==='solo'`), so there is nothing co-op to sync.
- **Conflict policy:** last-write-wins per slot keyed on `savedAt`; a *newer cloud* copy never silently overwrites local — it prompts.
- **Cap:** 12 manual + 1 autosave materialize per device; extra cloud saves stay backed up and show as "in cloud only" rows you can restore on demand.
- Storage is the player's own 15 GB (a save is ~0.1 MB); Drive API standard use is free within generous quotas.
