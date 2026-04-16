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
