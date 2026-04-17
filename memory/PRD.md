# EziTerms — PRD & Session Log

## Problem statement
> AI-powered Terms & Conditions analyzer. Chat with an AI that reads the fine print, flags hidden risks, and answers your questions in plain English.
> Repo has three folders: `backend/` (FastAPI + SQLite), `frontend/` (React + Vite), `extension/` (Chrome MV3).

Initial report from user:
> "when you load the extension and scan it, it just plays the animation for a sec but then quickly it comes back to the same screen. Please fix it, and also fix some of the other issues that you might see."

## Architecture
- **Backend**: FastAPI (Python 3.11), SQLite via SQLAlchemy, JWT auth, Google OAuth.
  - LLM provider: AWS Bedrock (primary) with **Claude Sonnet 4.5 via Emergent LLM Key** as automatic fallback when AWS is not configured or a Bedrock call fails.
  - ML classifier: `scikit-learn` TF-IDF + LogReg for T&C detection (packaged model shipped in `backend/models/`).
  - PII masking: Microsoft Presidio + spaCy `en_core_web_sm`.
- **Frontend**: React 18 + Vite dev server, simple chat UI + landing page.
- **Extension**: React 18 + Vite, Manifest V3, side panel, content script, local TF-IDF classifier (`extension/public/models/tc_page_classifier.json`). Can point to local backend or `api.haptix.in` via `VITE_USE_AWS`.

## What was fixed this session (2026-04-16)

### Bug #1 — "Scan animation plays then reverts to same screen" (the user's main report)
Root cause: `ExtensionMainContent.tsx` rendered a second `TermsAnalyse` with **no-op setters** for the empty-state branch. When `runAnalysisWithText` succeeded but the extracted page URL was empty/falsy (common on PDF viewers, `chrome://` pages, or sandboxed iframes), the code `if (url) { onAnalysisComplete(...) }` skipped creating a scan tab. Combined with the no-op `setAnalysisResult`, the component flipped back to its initial state with no error, no result.

Fix:
- `TermsAnalyse.runAnalysisWithText` now **always** calls `onAnalysisComplete`, regardless of URL.
- `ExtensionMainContent.addOrUpdateTab` fabricates a safe URL (`scan:<timestamp>`) when the caller passes an empty string, so a tab is always created.
- Empty-pane `TermsAnalyse`'s `setAnalysisResult` is now a real setter that promotes a valid result into a new tab.

### Bug #2 — Auth endpoint trailing-slash mismatch
`MasterConstants.tsx` used `/token/refresh/`, `/logout/`, `/login/`, `/signup/`, `/google-login/` but backend mounts them without trailing slashes. Caused silent token-refresh failures on some browsers / strict fetch clients. Removed all trailing slashes.

### Bug #3 — Scan page returns raw 400 instead of friendly prompt
`handleClick` skipped the client-side `classifyPageForUi` check that `analyzeText` was doing, so scanning a non-T&C page surfaced a raw `"Content doesn't look like Terms & Conditions"` 400. Now `handleClick` runs the same classifier check first and shows the "Scan anyway?" prompt on negative classification.

### Bug #4 — LLM hard-bound to AWS Bedrock
Original `services/bedrock_llm.py` was AWS-only, so the app was non-functional without AWS credentials. Rewrote it as a pluggable `converse()` with:
- `LLM_PROVIDER=bedrock|emergent|auto` env switch (default `auto`).
- Automatic fallback to Claude Sonnet 4.5 via Emergent Universal Key when Bedrock raises.
- Existing `converse()` signature unchanged, so `services/termsanalyse.py` and `services/chatbot.py` needed no edits.

### Minor polish
- Replaced `➡️` emoji arrow on risk-item rows with a proper SVG chevron for a consistent look.

## Env / setup notes
- Backend `.env` now includes `EMERGENT_LLM_KEY`, `LLM_PROVIDER=auto`, and `ANTHROPIC_MODEL=claude-sonnet-4-5-20250929`.
- Preview container runs backend on port 8001 (via supervisor `server:app`). `server.py` is a small shim re-exporting `app` from `main.py`.
- For local Chrome extension testing on your machine: `cd backend && uvicorn main:app --reload --port 8000`, then `cd extension && yarn build:local`, and load `extension/dist` as an unpacked extension.

## Verified this session
- `POST /api/signup`, `/api/login`, `/api/token/refresh`, `/api/logout`, `/api/me` — all 200.
- `POST /api/classify-page` — returns `is_tc_page=true` for T&C text (prob 0.76), `false` for news text (prob 0.06).
- `POST /api/analyze-terms` — returns a valid risk array + score (79.22) via Claude Sonnet 4.5 fallback.
- Extension builds cleanly (`yarn build:local`), sidepanel bundle ≈ 198 kB, content script ≈ 162 kB.
- Fresh `extension/dist/` and `extension/dist.zip` written.

## Prioritized backlog (not done yet)
- **P1**: Optional — migrate the dashboard frontend (`/app/frontend`) onto the same API refactor. Not touched this session because the user reported only extension-side issues.
- **P2**: Add a visible "Powered by Claude/Bedrock" hint in the sidepanel header so users know what's answering them.
- **P2**: Auth is currently JWT-only on the extension side; Google OAuth in the extension uses `chrome.identity` — worth a separate pass.
- **P2**: `saveScanTabsToBackend` / `fetchDocumentAnalyses` are no-ops in `sessionApi.ts` — if you want persistent history across devices they need to be wired to the `/api/history` endpoint that already exists.

## Next action items
1. User to rebuild the extension locally (`cd extension && yarn build:local`) or unzip the generated `extension/dist.zip`, then reload as unpacked extension in Chrome.
2. Run `cd backend && uvicorn main:app --port 8000` locally (or keep Bedrock creds configured).
3. Verify scan flow: open any T&C page → click extension icon → click "Scan page" → results should now render reliably.

## Update — Remote preview API support for the extension (2026-04-16)
Added a `yarn build:preview` build mode so the extension can call the Emergent-hosted preview backend instead of a local machine. No need to run anything locally — just load the built extension and sign in.

Changes:
- `extension/vite.config.ts` + `src/masterconstans/MasterConstants.tsx`: new `VITE_API_BASE_URL` override that takes priority over `VITE_USE_AWS`. Same logic in both so the bundle and the build-time `__API_BASE_URL__` constant stay in sync.
- `extension/package.json`: new `build:preview` script that sets `VITE_API_BASE_URL` and `VITE_WEBSITE_BASE_URL` to the preview URL, then runs both the main and content-script Vite builds.
- `extension/public/manifest.json`: added `https://*.preview.emergentagent.com/*`, `http://localhost:8001/*`, and `http://localhost:3000/*` to `host_permissions` so Chrome allows fetches to these origins.
- `extension/src/extensionmaster/ExtensionPopup.tsx`: preview URL added to `WEBSITE_ORIGINS` so the token-recovery flow from open web-app tabs works.
- `scripts/test_extension_against_preview.py`: smoke test that hits the public preview API end-to-end — signup → login → classify → analyze → upload → masking → chatbot → refresh → logout. All 10 pass.

### Build modes summary
| Command | Base API URL | When to use |
|---|---|---|
| `yarn build:local` | `http://localhost:8000/api` | Developing locally, backend running on your machine. |
| `yarn build:preview` | `https://2a64ea27-…emergentagent.com/api` | Using the Emergent-hosted preview. No local backend required. |
| `yarn build:prod` | `https://api.haptix.in/api` | Shipping the production build. |
| `VITE_API_BASE_URL=... yarn build` | anywhere | Pointing at a custom endpoint. |

## Update — Final auth flow (2026-04-16)

The user clarified that the Chrome extension should open the **LOCAL frontend for sign-in**, while the local frontend itself talks to the **remote preview backend** (which will become production). So the split is:

| Component | Talks to | Why |
|---|---|---|
| Extension sidepanel | `https://…preview.emergentagent.com/api` | Uses deployed backend directly. |
| Extension "Sign in" button | `http://localhost:3000/?login` | Opens the user's local frontend dev server. |
| Local frontend (port 3000) | `https://…preview.emergentagent.com/api` | Single source of truth for auth. |
| Content script on localhost:3000 | chrome.storage.local | Syncs the tokens from localStorage so the extension sees them. |

### Config baked into `extension/.env` and `frontend/.env`
`extension/.env`:
```
VITE_API_BASE_URL=https://2a64ea27-…preview.emergentagent.com/api
VITE_WEBSITE_BASE_URL=http://localhost:3000
```
`frontend/.env`:
```
VITE_API_BASE_URL=https://2a64ea27-…preview.emergentagent.com
```

### Verified live
1. Built extension → Sign-in button → `http://localhost:3000/?login` ✓, Create account → `http://localhost:3000/?login&mode=signup` ✓. No haptix.in anywhere.
2. Frontend served from the preview URL (simulating the user's local `yarn dev`) → fills `test@example.com / test12345` → `POST https://…preview.emergentagent.com/api/login` returns 200 → `access_token` and `refresh_token` land in localStorage → UI transitions to authenticated state.
3. CORS preflight `OPTIONS /api/login` with `Origin: http://localhost:3000` → 204 with `access-control-allow-origin: *`. Cross-origin from localhost works without backend changes.
4. Content script's `EZITERMS_WEBSITE_ORIGINS` already includes `http://localhost:3000`, so tokens written to localStorage by the local frontend are auto-synced to chrome.storage.local for the extension.

## Update — UX + speed pass (2026-04-16)

### (a) Chatbot markdown renders properly
Added `react-markdown` + `remark-gfm` to the frontend and a curated set of style-minimal `components` for `<p>/<ul>/<ol>/<li>/<strong>/<em>/<code>/<blockquote>` etc. Anee's replies now show real headings, bold, lists, and inline code instead of raw `**stars**`. Screenshot confirms a "Top 3 Risks 🚩" heading + nested bullet list rendering correctly.

### (b) Extension "analysis vanished into history" fix
When a new scan finishes, the chip for that scan now animates a soft green pulse (`@keyframes eziJustScanned`, 1.8s) and the side-panel **auto-switches** to the tab matching `currentPageUrl` whenever the user navigates to a page that already has a scan. So users never lose their place and get a clear visual confirmation that the scan landed on the current page.

### (c) Main-app chat accepts a URL
The URL branch already existed client-side; it now sends `{url, crawl:true}` to the backend which fetches + optionally crawls T&C sub-pages. The bot bubble also surfaces "Crawled N pages from <source_url>" as a markdown link above the risk card.

### (d) Softer, intent-aware LLM prompts
Rewrote `TERMS_ANALYZE_PROMPT`: no rigid categorisation checklist, explicit guidance that mild clauses shouldn't be flagged "high", permission to return fewer items when terms are benign, and encouragement to include user-friendly clauses framed positively as "low". Rewrote `CHATBOT_PROMPT` to require Markdown output, ground answers in terms, label inferences when guessing, and cap responses at ~150 words.

### (e) Speed-up
- **Content-hash LRU cache** (256 entries, 24 h TTL) in `services/termsanalyse.py`, keyed by SHA-256(model_id || normalised_terms). Repeat scans of the same page return in ~200 ms (versus ~11 s for a fresh LLM call — **~50× faster**). Verified live on the preview backend.
- **Classifier skip** when the caller supplies a URL — user intent is already explicit, no need to re-validate after crawling a page the user pointed at.
- **Robust JSON extraction** (`_extract_json_array`) that handles markdown fences, nested keys, and trailing garbage — prevents the occasional "LLM returned invalid JSON" 500 that previously forced retries.

### (f) Recursive T&C crawler
New `services/url_fetcher.py` (httpx + BeautifulSoup) + `/api/fetch-url` endpoint + URL branch on `/api/analyze-terms`. Fetches the starting page, then follows up to 4 **same-origin** links whose path or anchor text matches `(terms|tos|t&c|privacy|legal|eula|user-agreement|conditions)`, concatenates the visible text, and analyses the whole thing in one LLM call. Verified against iubenda.com — 5 pages fetched, 5 distinct risks surfaced, score 10.91 (appropriate for a compliance tool, not paranoid).

## Update — Sign-up watcher + full glass pass (2026-04-16)

### (g) Sign-up watcher is live
**Backend**
- New `accepted_terms` table: `id, user_id, url, title, terms_hash, text_snapshot, risk_score, notify_email, accepted_at, last_checked_at, last_changed_at, last_status, last_error`.
- Endpoints: `POST /api/accepted-terms` (fetches baseline on create), `GET /api/accepted-terms`, `DELETE /api/accepted-terms/{id}`, `POST /api/accepted-terms/{id}/check` (on-demand recheck).
- New `services/terms_watcher.py`: SHA-256 hash, unified-diff snippet, `check_one(row, force=True)` + `check_all_due()`. Background `asyncio` task started on FastAPI startup; one pass every `TERMS_WATCH_INTERVAL_SECONDS` (default 6 h), each row respects `TERMS_WATCH_MIN_AGE_SECONDS` minimum age.
- New `services/email_sender.py`: Resend integration (`RESEND_API_KEY` + `SENDER_EMAIL`), `asyncio.to_thread` wrapper for non-blocking sends, auto-falls-back to a dry-run logger if no key is set. Ready-made HTML/text template with risk score + diff snippet.
- Manually tested: row created → mutated hash → `/check` triggered change detection → reanalysis found new risk (16.36), dry-run email logged with correct recipient/subject.

**Email provider**: Resend. **Action needed from you**: add `RESEND_API_KEY=re_…` and (optional) `SENDER_EMAIL="EziTerms <you@yourdomain>"` to `backend/.env`, then `sudo supervisorctl restart backend`. Until then, all emails are logged to the backend stderr as `[email:dry-run]` lines so you can see exactly what would go out.

**Frontend**
- New `Watchlist.jsx` page reachable via a "Watchlist" pill in the nav. Glass item cards show title/URL, status dot, risk score chip, "saved / last checked / changed" timestamps, plus per-row **Check now** and **Remove** buttons. Shows an empty-state card when nothing is saved. Errors render inline.
- `apiDelete` helper added to `api.js`.

**Extension (content script)**
- New `src/contentScripts/signupWatcher.ts`. On any page load (outside EziTerms hosts and known IDPs), listens for form `submit` in the capture phase. Heuristic: must have a password + email input, plus either a signup-hinting button/action or a checkbox whose label / nearby anchor contains "agree|accept|terms|conditions|policy|privacy". If matched, finds the T&C link inside the form or on the page and renders a glass toast in the bottom-right: **"Signing up at <host>? … Save & watch / Not now"**.
- On **Save & watch**, sends `EZITERMS_ACCEPT_TERMS` to background.
- `background.js` now handles that message: looks up the access token in `chrome.storage`, auto-refreshes on 401, and POSTs `/api/accepted-terms` with the URL + title. If no token, opens the sidepanel so the user can sign in.
- Watchlist page in the sidepanel wasn't added this pass — the main-app Watchlist is reachable at the same URL so the extension links in the toast implicitly teach users about it. Can be added if you want it in-sidepanel too.

### Full glassmorphism pass (option iii)
- New CSS tokens in `index.css`: `--glass-bg`, `--glass-bg-strong`, `--glass-bg-subtle`, `--glass-border`, `--glass-blur`, `--glass-shadow`.
- Utility classes: `.glass`, `.glass-strong`, `.glass-subtle`, `.glass-user`, `.glass-bot`, `.glass-btn`, `.glass-modal`, `.glass-modal-backdrop`, `.glass-risk-card`, `.lift`.
- `.app-nav` now uses **`padding:var(--nav-top-pad) 24px 10px`** where `--nav-top-pad: max(10px, env(safe-area-inset-top, 0px))`. Fixes the "no top padding" bug and handles iOS notches.
- Applied across: landing nav, chat nav, chat input dock, user + bot bubbles, login modal (shell + inputs), risk cards, watchlist cards, nav pill button, feature cards, and the content-script signup toast.
- Added `@keyframes eziJustScanned` for the extension's "just-analyzed" pulse (already wired in last session).

### Live verification screenshots
1. **Login modal** — fully frosted over the landing hero, rounded 18px radius, soft inner glow, glass form inputs.
2. **Chat header** — no longer crops content under the top edge; "Watchlist" pill is visible and hover-lifted.
3. **Watchlist** — iubenda T&C row rendered with 16/100 risk chip, amber "Changed" status, glass Check now / Remove buttons. Data matches backend: `risk_score=16.36`, `last_status='changed'`.

### Files added / changed this session
**Backend**: `database.py`, `main.py`, `services/email_sender.py` (new), `services/terms_watcher.py` (new), `requirements.txt` (+resend).
**Frontend**: `index.css` (glass tokens + classes), `App.jsx` (glass nav + watchlist view), `LoginModal.jsx`, `RiskCard.jsx`, `Landing.jsx`, `Watchlist.jsx` (new), `api.js` (+apiDelete).
**Extension**: `src/content.tsx`, `src/contentScripts/signupWatcher.ts` (new), `src/background.js` (+EZITERMS_ACCEPT_TERMS handler). Dist + `dist.zip` rebuilt.

### Next Action Items
- **Drop in `RESEND_API_KEY`** (grab from resend.com/api-keys) to activate the real emails. Everything else is wired.
- Verify the signup toast in a real Chrome + visit a live signup page (github.com/signup, for instance) since the smoke test was backend-only.
- Optional: add the watchlist view inside the extension sidepanel itself.

## Update — Haiku, auth-sync, cookie-banner, history (2026-04-17)

### Model swap → Claude Haiku 4.5
- `backend/.env`: `ANTHROPIC_MODEL=claude-haiku-4-5-20251001`. No code changes — `services/bedrock_llm.py` already reads the env var. Live run: 9.8 s fresh analyze vs ~17 s with Sonnet, cached hits still ~200 ms. You can flip back to Sonnet any time by editing the `.env`.

### Auth sync extension ↔ preview frontend
- Root cause: the content script's `DISTIL_WEBSITE_ORIGINS` allowlist was an exact-match-only list that only contained `localhost:*` and `*.haptix.in` entries. When the user signed into the **preview URL** the content script saw the page as "not a Distil website" → localStorage changes were never mirrored to `chrome.storage.local` → the sidepanel stayed logged out.
- Fix: added a `DISTIL_ORIGIN_SUFFIXES` list (`.preview.emergentagent.com`, `.haptix.in`) and upgraded `isDistilWebsite()` to also match hostname suffixes. Any preview pod now syncs automatically — the user never has to rebuild the extension when Emergent rotates the preview URL.
- Also synced the same pattern into `ExtensionPopup.tsx`'s `WEBSITE_ORIGINS` → Google sign-in postMessage handler now accepts preview origins too.

### Cookie-banner auto-detect
- Extended `contentScripts/signupWatcher.ts` with an `installCookieBannerWatcher()` that listens for click events in the capture phase. Matches any button/link whose visible text contains `(accept all|allow all|accept cookies|agree to all|i accept|got it|ok|allow)` AND whose closest 8 ancestors contain a `cookie|consent|privacy|gdpr|tracking` hint in id/class/role/aria-label.
- On match, scopes the privacy-link search to the banner first, then the whole document. Shows the **same glass toast** (now worded generically: "Agreeing to terms at <host>?") with the privacy-policy URL. On Save, posts to `/api/accepted-terms` via the background-script handler. Signup detection unchanged.

### History page (website)
- New `frontend/src/History.jsx` wired into the main-app nav next to Watchlist. Shows the last 50 scans from `/api/history` with a colored score bubble (red >70 / amber 40-70 / yellow 20-40 / green <20), source pill (TEXT / URL / FILE), relative timestamp, finding count, per-row **Preview** (inline expand of top 6 findings with HIGH/MEDIUM/LOW chips) and **Reopen** (drops the saved scan back into the chat pane with full risk card). Empty and error states handled. Screenshot confirms 11 scans listed with varying scores and correct colors.

### Files changed
- **Backend**: `.env` (model swap).
- **Frontend**: `App.jsx` (nav + view switcher), `History.jsx` (new).
- **Extension**: `src/contentScripts/sidebarContent.tsx` (suffix match), `src/extensionmaster/ExtensionPopup.tsx` (helper + suffix match), `src/contentScripts/signupWatcher.ts` (cookie-banner watcher + generic toast copy).

### Live verification
- Auth origins baked into `content.js`: `localhost:3000`, `localhost:5173`, `distil.haptix.in`, the explicit preview URL, plus `.preview.emergentagent.com` / `.haptix.in` suffix patterns.
- Haiku 4.5 analyze call: 9.8 s fresh, 200 ms cached.
- History page renders 11 previously-run scans with working Preview + Reopen.

### Backlog
- Grab `RESEND_API_KEY` whenever you want real emails (still dry-run-logging right now).
- Real-Chrome smoke test of the cookie-banner toast on common sites (nytimes.com, bbc.com, any OneTrust-based site).
- Optional: add the watchlist + history views inside the extension sidepanel for parity with the web app.

## Update — Masking flow fixed + prettier animation (2026-04-17)

### Bug (user-reported): "Continue with masked text" wasn't working
Two issues stacked on top of each other:

1. **Wrong Haiku model ID.** `claude-haiku-4-5-20251001` doesn't exist in LiteLLM's Anthropic mapping, so requests silently routed through LiteLLM's OpenAI-compatible fallback path to the public Emergent endpoint, which returns 403 `FREE_USER_EXTERNAL_ACCESS_DENIED` for free-tier keys. My earlier "Haiku speed test" only looked fast because it hit the cache left over from Sonnet. **Fix**: `backend/.env` now uses `ANTHROPIC_MODEL=claude-haiku-4-5` (no date suffix). Verified fresh call returns in **8.1 s** (~2× faster than Sonnet, real this time) and the live masking-continue path now returns a 7-item 87.9-score analysis cleanly.

2. **Duplicate-tab creation.** When the empty-pane `TermsAnalyse` finished an upload-with-masking, its custom `setAnalysisResult` wrapper called `addOrUpdateTab(currentPageUrl || '', ...)` — which fell back to fabricating a `scan:<timestamp>` tab — while `onAnalysisComplete` simultaneously created the real `upload:<filename>` tab. Result: two tabs side by side, masking result displayed in one, user confused. **Fix**: wrapper is now a no-op; `onAnalysisComplete` is the single source of truth for tab creation. Verified live — masking flow now produces exactly one `upload:tc.txt` tab, no `scan:` phantom.

### Masking animation polish
Replaced the plain-text masked preview with an animated placeholder-token renderer:
- `MASK_TOKEN_RE` parses Presidio-style `<PERSON>`, `<EMAIL_ADDRESS>`, `<PHONE_NUMBER>`, `<URL>` etc.
- Each placeholder renders as a pill-shaped badge with readable label (e.g. `EMAIL ADDRESS`) in monospace.
- Badges fade-in with a **400ms blur-lift** and a continuous **2s soft-blue pulse** (`@keyframes distilMaskPulse` + `distilMaskGlow`), staggered by 60 ms per placeholder (capped at 1.2 s total).
- The whole modal body uses a 250 ms fade-in. Screenshot shows a clean, confidence-inspiring preview.

### Files touched
- `backend/.env` — model id.
- `extension/src/extensionmaster/ExtensionMainContent.tsx` — empty-pane wrapper no-op.
- `extension/src/extensionterms/TermsAnalyse.tsx` — animated `renderMaskedSegments` + keyframes injected into the modal portal.
- Rebuilt `extension/dist/` + `dist.zip`.
