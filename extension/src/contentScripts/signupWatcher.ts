/**
 * Sign-up watcher — lives in the content script and runs on every non-Distil
 * page. When the user is about to submit a signup form that includes a
 * "terms / agree / accept" checkbox, we capture the linked T&C URL and surface
 * a tiny glass toast asking if they want to save it to the Distil watchlist.
 * On confirm, we forward a message to the extension background, which calls
 * the backend via the side-panel's stored auth.
 */

const TOAST_ID = 'distil-signup-toast';
const SAFE_HOST_BLOCKLIST = [
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
];

const TC_LINK_PATTERN = /(terms|tos|t&c|privacy|legal|eula|user.?agreement|conditions)/i;
const AGREE_HINT = /(agree|accept|consent|terms|conditions|policy|privacy)/i;

function isSafeHost(): boolean {
  try {
    return !SAFE_HOST_BLOCKLIST.includes(window.location.hostname);
  } catch {
    return false;
  }
}

function isDistilHost(): boolean {
  try {
    const h = window.location.hostname;
    return (
      h === 'haptix.in' ||
      h.endsWith('.haptix.in') ||
      h.endsWith('.preview.emergentagent.com') ||
      h === 'localhost' ||
      h === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

function findTcLinkNear(form: HTMLFormElement): { url: string; title: string } | null {
  // Look inside the form first, then within the document.
  const scopes: HTMLElement[] = [form, document.body];
  for (const scope of scopes) {
    const anchors = Array.from(scope.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      const text = (a.textContent || '').trim();
      if (!TC_LINK_PATTERN.test(text) && !TC_LINK_PATTERN.test(href)) continue;
      try {
        const u = new URL(href, window.location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        return { url: u.toString(), title: text.slice(0, 120) || u.hostname };
      } catch {
        continue;
      }
    }
  }
  return null;
}

function looksLikeSignupForm(form: HTMLFormElement): boolean {
  // Heuristics: at least one password input, at least one email/text input,
  // and either a checkbox whose label mentions agree/terms or a T&C link
  // somewhere inside the form.
  const pwd = form.querySelector('input[type="password"]');
  if (!pwd) return false;
  const email = form.querySelector('input[type="email"], input[name*="email" i], input[autocomplete*="email" i]');
  if (!email) return false;

  // Signup hint: either the submit button text or any visible heading says "sign up / create / register"
  const action = ((form.getAttribute('action') || '') + ' ' + (form.getAttribute('id') || '') + ' ' + (form.getAttribute('class') || '')).toLowerCase();
  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  const submitText = ((submitBtn?.textContent || submitBtn?.getAttribute('value') || '')).toLowerCase();
  const signupHintFromForm = /sign.?up|register|create.?account|join/i.test(action + ' ' + submitText);

  // Agreement hint: checkbox whose label mentions agree/terms OR T&C link anywhere
  const checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
  let agreementHint = false;
  for (const cb of checkboxes) {
    const id = cb.id ? `label[for="${cb.id}"]` : '';
    const lbl = (id && (document.querySelector(id) as HTMLElement | null))
      || cb.closest('label') as HTMLElement | null;
    const txt = (lbl?.textContent || cb.getAttribute('aria-label') || '').trim();
    if (AGREE_HINT.test(txt)) { agreementHint = true; break; }
  }
  if (!agreementHint && findTcLinkNear(form)) agreementHint = true;

  return signupHintFromForm || agreementHint;
}

function dismissToast(): void {
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();
}

function showToast(opts: {
  hostname: string;
  url: string;
  title: string;
  onSave: () => void | Promise<void>;
  onAnalyze?: () => void;
}): void {
  dismissToast();
  const wrapper = document.createElement('div');
  wrapper.id = TOAST_ID;
  wrapper.setAttribute('data-testid', 'distil-signup-toast');
  wrapper.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'right:18px',
    'bottom:18px',
    'width:340px',
    'max-width:calc(100vw - 36px)',
    'color:#f6f6f7',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'font-size:13.5px',
    'line-height:1.45',
    'background:rgba(14,14,16,0.72)',
    '-webkit-backdrop-filter:saturate(200%) blur(22px)',
    'backdrop-filter:saturate(200%) blur(22px)',
    'border:1px solid rgba(255,255,255,0.14)',
    'border-radius:14px',
    'padding:14px 14px 12px',
    'box-shadow:0 20px 50px rgba(0,0,0,0.45)',
    'animation:eziToastIn .25s ease-out',
  ].join(';');

  if (!document.getElementById('distil-signup-toast-style')) {
    const style = document.createElement('style');
    style.id = 'distil-signup-toast-style';
    style.textContent = '@keyframes eziToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
  }

  const safeHost = opts.hostname.replace(/[<>]/g, '');
  const analyzeBtnHtml = opts.onAnalyze
    ? `<button id="distil-toast-analyze" data-testid="distil-toast-analyze" style="background:#06B6D4;color:#061214;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit;font-weight:600">Analyze</button>`
    : '';
  wrapper.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start">
      <div style="flex-shrink:0;width:28px;height:28px;border-radius:8px;background:rgba(6,182,212,0.18);border:1px solid rgba(6,182,212,0.35);display:flex;align-items:center;justify-content:center;color:#06B6D4;font-weight:700;font-size:13px">D</div>
      <div style="flex:1;min-width:0">
        <div id="distil-toast-title" style="font-weight:600;color:#fff;margin-bottom:2px">${opts.onAnalyze ? `Analyze ${safeHost}&apos;s terms?` : `Agreeing to terms at ${safeHost}?`}</div>
        <div id="distil-toast-body" style="color:rgba(255,255,255,0.72);margin-bottom:10px">
          ${opts.onAnalyze
            ? `We found the Terms &amp; Privacy links for this consent screen. Analyze the risks or save it to your watchlist.`
            : `We found the T&amp;C for this page. Save it to your Distil watchlist and we&apos;ll email you if it ever changes.`}
        </div>
        <div id="distil-toast-actions" style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
          <button id="distil-toast-dismiss" style="background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit">Not now</button>
          <button id="distil-toast-save" data-testid="distil-toast-save" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit;font-weight:600">Save &amp; watch</button>
          ${analyzeBtnHtml}
        </div>
        <div id="distil-toast-status" style="margin-top:8px;font-size:11.5px;color:rgba(255,255,255,0.45);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${opts.url}">${opts.url}</div>
      </div>
      <button id="distil-toast-close" aria-label="Close" style="background:transparent;color:rgba(255,255,255,0.45);border:none;cursor:pointer;font-size:18px;line-height:1;padding:0 2px">×</button>
    </div>`;

  document.body.appendChild(wrapper);
  const close = () => dismissToast();
  const saveBtn = wrapper.querySelector<HTMLButtonElement>('#distil-toast-save');
  const statusEl = wrapper.querySelector<HTMLDivElement>('#distil-toast-status');
  const actionsEl = wrapper.querySelector<HTMLDivElement>('#distil-toast-actions');
  const bodyEl = wrapper.querySelector<HTMLDivElement>('#distil-toast-body');
  wrapper.querySelector('#distil-toast-dismiss')?.addEventListener('click', close);
  wrapper.querySelector('#distil-toast-close')?.addEventListener('click', close);
  saveBtn?.addEventListener('click', () => {
    // Fire save handler; do NOT close immediately. The handler (onSave)
    // may call back via updateToastState() with success/error.
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      saveBtn.style.opacity = '0.7';
      saveBtn.style.cursor = 'default';
    }
    try { opts.onSave(); } catch { /* ignore */ }
  });
  if (opts.onAnalyze) {
    wrapper.querySelector('#distil-toast-analyze')?.addEventListener('click', () => {
      opts.onAnalyze!();
      close();
    });
  }
  // Expose updater so the save callback can flip the toast into success/error states.
  (wrapper as any).__distilUpdate = (
    state: 'success' | 'error' | 'login_required',
    message?: string,
  ) => {
    if (state === 'success') {
      if (bodyEl) bodyEl.innerHTML = `Added to your Distil watchlist — we&apos;ll email if anything changes.`;
      if (statusEl) { statusEl.textContent = '✓ Saved'; statusEl.style.color = '#4ade80'; }
      if (actionsEl) actionsEl.style.display = 'none';
      setTimeout(close, 2200);
    } else if (state === 'login_required') {
      if (bodyEl) bodyEl.innerHTML = `Sign in to Distil first — we just opened the side panel for you.`;
      if (statusEl) { statusEl.textContent = 'Sign-in needed'; statusEl.style.color = '#fbbf24'; }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Try again'; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer'; }
      setTimeout(close, 4500);
    } else {
      if (statusEl) { statusEl.textContent = message || 'Could not save'; statusEl.style.color = '#f87171'; }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Retry'; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer'; }
    }
  };
  // auto-dismiss safety net (30s)
  setTimeout(() => { if (document.getElementById(TOAST_ID) === wrapper) close(); }, 30000);
}

function updateToastState(state: 'success' | 'error' | 'login_required', message?: string): void {
  const w = document.getElementById(TOAST_ID) as any;
  if (w && typeof w.__distilUpdate === 'function') w.__distilUpdate(state, message);
}

function sendSaveRequest(
  detail: { url: string; title: string; pageUrl: string },
  cb?: (result: { ok: boolean; error?: string; data?: unknown }) => void,
) {
  try {
    const ext: any = typeof chrome !== 'undefined' ? chrome : null;
    if (!ext?.runtime?.sendMessage) { cb?.({ ok: false, error: 'no_runtime' }); return; }
    ext.runtime.sendMessage({ action: 'DISTIL_ACCEPT_TERMS', payload: detail }, (resp: any) => {
      // chrome.runtime.lastError is set when the background worker went away.
      const err = ext.runtime.lastError?.message;
      if (err) { cb?.({ ok: false, error: err }); return; }
      cb?.(resp || { ok: false, error: 'no_response' });
    });
  } catch (e) {
    cb?.({ ok: false, error: String(e) });
  }
}

function handleSaveWithFeedback(detail: { url: string; title: string; pageUrl: string }): void {
  sendSaveRequest(detail, (result) => {
    if (result.ok) {
      updateToastState('success');
    } else if (result.error === 'not_logged_in') {
      updateToastState('login_required');
    } else {
      updateToastState('error', 'Could not save — try again');
    }
  });
}

function onFormSubmitted(ev: SubmitEvent | Event): void {
  const form = (ev.target as HTMLFormElement) || null;
  if (!form || form.tagName !== 'FORM') return;
  try {
    if (!looksLikeSignupForm(form)) return;
    const link = findTcLinkNear(form);
    if (!link) return;
    showToast({
      hostname: window.location.hostname,
      url: link.url,
      title: link.title,
      onSave: () => handleSaveWithFeedback({
        url: link.url,
        title: link.title,
        pageUrl: window.location.href,
      }),
    });
  } catch {
    // swallow — never break the user's signup
  }
}

export function installSignupWatcher(): void {
  if (isDistilHost()) return;
  // OAuth consent watcher runs on IDP hosts (Google/Apple/MSFT/Facebook).
  // It handles the case where the target app is a third party whose T&C
  // links are visible on the consent screen — we surface them before the
  // user clicks Continue.
  installOAuthConsentWatcher();
  if (!isSafeHost()) return;
  try {
    // Capture phase so we run even if the site's handler calls stopPropagation later.
    document.addEventListener('submit', onFormSubmitted, true);
    installCookieBannerWatcher();
  } catch {
    // ignore
  }
}

// ────────────────────── OAuth consent-screen watcher ──────────────────────

const OAUTH_CONSENT_URL_RE = /(\/o\/oauth2\/|\/signin\/oauth|\/oauth2\/v2\/auth|\/auth\/authorize|\/oauth\/authorize|\/dialog\/oauth|\/common\/oauth2)/i;
const CONSENT_HEADING_RE = /sign\s*in\s*to\s+([a-z0-9.-]+\.[a-z]{2,})/i;
const TOS_TEXT_RE = /terms\s*of\s*service|terms\s*of\s*use|terms\s*&?\s*conditions|\bterms\b/i;
const PRIVACY_TEXT_RE = /privacy\s*policy|privacy\s*notice|\bprivacy\b/i;

function hostOfUrl(u: string): string | null {
  try { return new URL(u, window.location.href).hostname.toLowerCase(); } catch { return null; }
}

function isThirdPartyHost(host: string | null): boolean {
  if (!host) return false;
  const self = window.location.hostname.toLowerCase();
  if (host === self) return false;
  // Strip cross-subdomain variants (google.com vs accounts.google.com).
  const rootSelf = self.split('.').slice(-2).join('.');
  const rootOther = host.split('.').slice(-2).join('.');
  return rootOther !== rootSelf;
}

function findConsentLinks(): { tosUrl?: string; privacyUrl?: string; targetHost?: string } {
  const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  let tosUrl: string | undefined;
  let privacyUrl: string | undefined;
  const hostSeen = new Map<string, number>();

  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const text = (a.textContent || '').trim();
    if (!text) continue;
    const host = hostOfUrl(href);
    if (!isThirdPartyHost(host)) continue;
    if (!tosUrl && TOS_TEXT_RE.test(text) && !PRIVACY_TEXT_RE.test(text)) tosUrl = new URL(href, window.location.href).toString();
    if (!privacyUrl && PRIVACY_TEXT_RE.test(text) && !TOS_TEXT_RE.test(text)) privacyUrl = new URL(href, window.location.href).toString();
    if (host) hostSeen.set(host, (hostSeen.get(host) || 0) + 1);
  }

  // Most-linked third-party host is almost certainly the target app.
  let targetHost: string | undefined;
  if (hostSeen.size) {
    targetHost = [...hostSeen.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Heading fallback: "Sign in to groq.com" / "Sign in to continue to Groq"
  if (!targetHost) {
    const text = (document.body.innerText || '').slice(0, 4000);
    const m = text.match(CONSENT_HEADING_RE);
    if (m) targetHost = m[1].toLowerCase();
  }

  return { tosUrl, privacyUrl, targetHost };
}

function maybeShowConsentToast(): void {
  if (document.getElementById(TOAST_ID)) return;
  const { tosUrl, privacyUrl, targetHost } = findConsentLinks();
  const url = tosUrl || privacyUrl;
  if (!url || !targetHost) return;

  showToast({
    hostname: targetHost,
    url,
    title: `${targetHost} — Terms & Privacy`,
    onSave: () => handleSaveWithFeedback({
      url,
      title: `${targetHost} — ${tosUrl ? 'Terms of Service' : 'Privacy Policy'}`,
      pageUrl: window.location.href,
    }),
    onAnalyze: () => {
      // Open the side panel in URL-fetch mode: it will fetch the target
      // site's T&C from `url` and analyse it, instead of trying to parse
      // the identity provider's consent UI (which always rejects as non-T&C).
      try {
        const ext: any = typeof chrome !== 'undefined' ? chrome : null;
        if (!ext?.runtime?.sendMessage) return;
        const pending = { text: '', url, mode: 'url' as const };
        const doOpen = () => ext.runtime.sendMessage({ type: 'DISTIL_OPEN_AND_ANALYZE' }).catch(() => {});
        if (ext.storage?.session?.set) {
          ext.storage.session.set({ distil_pending_analyze: pending }, doOpen);
        } else {
          doOpen();
        }
      } catch { /* ignore */ }
    },
  });
}

function installOAuthConsentWatcher(): void {
  try {
    if (!OAUTH_CONSENT_URL_RE.test(window.location.pathname + window.location.search)) return;

    const tryOnce = () => { try { maybeShowConsentToast(); } catch { /* ignore */ } };

    // Retry a few times — consent screens often render content after an RPC.
    setTimeout(tryOnce, 400);
    setTimeout(tryOnce, 1200);
    setTimeout(tryOnce, 2400);

    // Also observe in case the DOM changes (e.g. after the profile picker).
    const obs = new MutationObserver(() => {
      if (document.getElementById(TOAST_ID)) return;
      tryOnce();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Safety: stop observing after 30 s.
    setTimeout(() => obs.disconnect(), 30_000);
  } catch {
    // never break OAuth flow
  }
}

// ────────────────────── Cookie-consent banner watcher ──────────────────────

const COOKIE_ACCEPT_PATTERN = /\b(accept\s*all|allow\s*all|accept\s*cookies|accept\s*&?\s*continue|agree\s*to\s*all|i\s*accept|got\s*it|ok|allow)\b/i;
const COOKIE_BANNER_HINT = /\b(cookie|consent|privacy|gdpr|tracking)\b/i;
const PRIVACY_LINK_PATTERN = /(privacy|cookie.?policy|data.?protection|privacy.?policy)/i;

function isInsideCookieBanner(el: Element | null): boolean {
  let cur = el;
  for (let i = 0; i < 8 && cur; i += 1) {
    const id = (cur as HTMLElement).id || '';
    const cls = (cur as HTMLElement).className || '';
    const role = (cur as HTMLElement).getAttribute?.('role') || '';
    const aria = (cur as HTMLElement).getAttribute?.('aria-label') || '';
    const haystack = `${id} ${typeof cls === 'string' ? cls : ''} ${role} ${aria}`;
    if (COOKIE_BANNER_HINT.test(haystack)) return true;
    cur = cur.parentElement;
  }
  return false;
}

function findPrivacyLink(scope: Element | Document): { url: string; title: string } | null {
  const anchors = Array.from(scope.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    const text = (a.textContent || '').trim();
    if (!PRIVACY_LINK_PATTERN.test(text) && !PRIVACY_LINK_PATTERN.test(href)) continue;
    try {
      const u = new URL(href, window.location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      return { url: u.toString(), title: text.slice(0, 120) || u.hostname };
    } catch { continue; }
  }
  return null;
}

function onCookieAcceptClick(ev: MouseEvent): void {
  try {
    const target = ev.target as Element | null;
    if (!target) return;
    // Find the nearest clickable button/link
    const btn = (target.closest('button, a, [role="button"]') as Element | null) || target;
    const text = ((btn as HTMLElement).innerText || btn.textContent || '').trim();
    if (!text || !COOKIE_ACCEPT_PATTERN.test(text)) return;
    if (!isInsideCookieBanner(btn)) return;
    // Look for a privacy-policy link in the banner, falling back to the whole doc.
    const banner = btn.closest('[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [role="dialog"]') || document;
    const link = findPrivacyLink(banner) || findPrivacyLink(document);
    if (!link) return;
    showToast({
      hostname: window.location.hostname,
      url: link.url,
      title: link.title,
      onSave: () => handleSaveWithFeedback({
        url: link.url,
        title: link.title,
        pageUrl: window.location.href,
      }),
    });
  } catch {
    // never break the host page's consent flow
  }
}

function installCookieBannerWatcher(): void {
  try {
    // Capture phase so we run before the site's own handler hides the banner.
    document.addEventListener('click', onCookieAcceptClick, true);
  } catch {
    // ignore
  }
}
