# Google Sign-In Setup (Chrome Extension)

The extension uses **`chrome.identity.launchWebAuthFlow`** with a **Web application** OAuth client. This avoids the error: *"Error 400: invalid_request - Custom URI scheme is not supported on Chrome apps."*

## Fixed extension ID (no more redirect_uri mismatch)

The manifest includes a **`key`** so the extension ID is **the same on every install** (your machine, your friend’s machine, etc.). That way Google OAuth only needs one redirect URI.

- **This extension’s ID:** `bdlojhenbkjfdffncihpdpokbiipokpg`
- **Redirect URI to use in Google:** `https://bdlojhenbkjfdffncihpdpokbiipokpg.chromiumapp.org` (no trailing slash)

If you ever need a new key/ID (e.g. new project), run `node scripts/generate-extension-key.js` and update `manifest.json` and Google Console.

## 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → your project → **APIs & Services** → **Credentials**.
2. Create or use an **OAuth 2.0 Client ID** of type **Web application** (not "Chrome app").
3. Under **Authorized redirect URIs**, add **exactly** (no trailing slash, no path):
   ```text
   https://bdlojhenbkjfdffncihpdpokbiipokpg.chromiumapp.org
   http://localhost:5173
   ```
   (First: extension. Second: website OAuth popup at localhost:5173.)
4. Copy the **Client ID** and set it in:
   - **Extension:** `public/manifest.json` → `oauth2.client_id`
   - **Backend:** `.env` → `GOOGLE_CLIENT_ID=<same client id>`

## 2. Reset / “Token” issues

- There is **no Chrome token cache** used for this flow (we use `launchWebAuthFlow`, not `getAuthToken`). Each click on “Sign in with Google” opens a fresh Google sign-in window.
- If you still see old or wrong behavior:
  - **Reload the extension:** `chrome://extensions` → click the reload icon on your extension.
  - **Re-check redirect URI:** In Google Cloud, the redirect URI must be exactly `https://<EXTENSION_ID>.chromiumapp.org` (no trailing slash). If you had created a “Chrome app” client before, use a **Web application** client and add this redirect URI.
- If you had previously used a different OAuth client (e.g. Chrome app), create a new **Web application** client, add the redirect URI above, and put that new client’s Client ID in both the manifest and the backend `GOOGLE_CLIENT_ID`.

## 4. Website sign-in (two options)

### Option A: With Distil extension installed

The website sends a message to the extension, which runs `launchWebAuthFlow` and returns the token.

### Option B: Without extension (OAuth popup)

The website opens a popup to Google OAuth and redirects to `http://localhost:5173`. Add that URI to **Authorized redirect URIs** (no path, no trailing slash). The website uses the same Client ID; set `VITE_GOOGLE_CLIENT_ID` in its `.env`.

## 5. Summary

| Item | Value |
|------|--------|
| OAuth client type | **Web application** |
| Extension ID (fixed via `key` in manifest) | `bdlojhenbkjfdffncihpdpokbiipokpg` |
| Redirect URIs | `https://bdlojhenbkjfdffncihpdpokbiipokpg.chromiumapp.org` (extension), `http://localhost:5173` (website) |
| Where to set Client ID | `manifest.json` → `oauth2.client_id`, backend `.env` → `GOOGLE_CLIENT_ID`, website `.env` → `VITE_GOOGLE_CLIENT_ID` |

After changing the client or redirect URI, reload the extension and try “Sign in with Google” again.
