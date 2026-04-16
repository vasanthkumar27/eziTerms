/**
 * Content script entry: injects EziTerms in-page sidebar and mounts React PageSidebar.
 * Runs on all pages (matches: <all_urls>). Uses shadow DOM to isolate styles from host page.
 *
 * Token sync: Keeps localStorage (website) and chrome.storage.local (extension) in sync
 * so one login works for both. Chrome.storage.local is the central token store for the extension.
 *
 * Guards against "Extension context invalidated" when extension is reloaded while pages are open.
 */

function safeChrome<T>(fn: () => T, fallback: T): T {
  try {
    if (typeof chrome === 'undefined' && typeof browser === 'undefined') return fallback;
    const ext = typeof chrome !== 'undefined' ? chrome : browser;
    if (!ext?.runtime?.id) return fallback;
    return fn();
  } catch {
    return fallback;
  }
}

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const SESSION_KEY = 'session_id';

const envWebsite = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEBSITE_BASE_URL)
  ? String(import.meta.env.VITE_WEBSITE_BASE_URL).trim().replace(/\/$/, '')
  : '';

const EZITERMS_WEBSITE_ORIGINS: string[] = [
  'http://localhost:5173',
  'https://localhost:5173',
  'http://localhost:3000',
  'https://localhost:3000',
  'http://localhost:4173',
  'https://localhost:4173',
  'http://127.0.0.1:5173',
  'https://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://127.0.0.1:3000',
  'https://haptix.in',
  'https://www.haptix.in',
  'https://eziterms.haptix.in',
  ...(envWebsite ? [envWebsite] : []),
];

function isJwtFormat(s: unknown): boolean {
  if (typeof s !== 'string' || !s.trim()) return false;
  const parts = s.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function isEziTermsWebsite(): boolean {
  try {
    return EZITERMS_WEBSITE_ORIGINS.some((o) => window.location.origin === o);
  } catch {
    return false;
  }
}

function syncChromeToLocalStorage(): void {
  if (!isEziTermsWebsite()) return;
  try {
    const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
    if (!ext?.storage?.local) return;
    ext.storage.local.get([ACCESS_KEY, REFRESH_KEY, SESSION_KEY], (r: Record<string, unknown>) => {
      try {
        const hasValidTokens = (r[ACCESS_KEY] && isJwtFormat(r[ACCESS_KEY])) || (r[REFRESH_KEY] && isJwtFormat(r[REFRESH_KEY]));
        const currAccess = localStorage.getItem(ACCESS_KEY);
        const currRefresh = localStorage.getItem(REFRESH_KEY);
        const currSession = localStorage.getItem(SESSION_KEY);
        const accessChanged = (r[ACCESS_KEY] as string) !== currAccess;
        const refreshChanged = (r[REFRESH_KEY] as string) !== currRefresh;
        const sessionChanged = String(r[SESSION_KEY] ?? '') !== (currSession ?? '');
        const hadTokens = (currAccess && isJwtFormat(currAccess)) || (currRefresh && isJwtFormat(currRefresh));
        const tokensRemoved = hadTokens && !hasValidTokens;

        if (hasValidTokens) {
          if (r[ACCESS_KEY] && isJwtFormat(r[ACCESS_KEY])) localStorage.setItem(ACCESS_KEY, r[ACCESS_KEY] as string);
          if (r[REFRESH_KEY] && isJwtFormat(r[REFRESH_KEY])) localStorage.setItem(REFRESH_KEY, r[REFRESH_KEY] as string);
          if (r[SESSION_KEY] != null) localStorage.setItem(SESSION_KEY, String(r[SESSION_KEY]));
        } else {
          localStorage.removeItem(ACCESS_KEY);
          localStorage.removeItem(REFRESH_KEY);
          localStorage.removeItem(SESSION_KEY);
        }

        const actuallyChanged = accessChanged || refreshChanged || sessionChanged || tokensRemoved;
        if (actuallyChanged) {
          if (hasValidTokens) {
            window.dispatchEvent(new CustomEvent('eziterms-tokens-synced'));
          } else {
            window.dispatchEvent(new CustomEvent('eziterms-logout'));
          }
        }
      } catch { /* Extension context invalidated */ }
    });
  } catch { /* Extension context invalidated */ }
}

const LOGGED_OUT_FLAG = 'eziterms_logged_out';

function syncLocalStorageToChromeOnLoad(): void {
  if (!isEziTermsWebsite()) return;
  try {
    const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
    if (!ext?.storage?.local) return;
    ext.storage.local.get([ACCESS_KEY, REFRESH_KEY, LOGGED_OUT_FLAG], (r: Record<string, unknown>) => {
      try {
    const loggedOut = r[LOGGED_OUT_FLAG] === '1';
    if (loggedOut) {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(SESSION_KEY);
      try { ext.storage.local.remove([LOGGED_OUT_FLAG]); } catch { /* context invalidated */ }
      window.dispatchEvent(new CustomEvent('eziterms-logout'));
      return;
    }
    const chromeHasTokens = (r[ACCESS_KEY] && isJwtFormat(r[ACCESS_KEY])) || (r[REFRESH_KEY] && isJwtFormat(r[REFRESH_KEY]));
    if (chromeHasTokens) return;
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    const sessionId = localStorage.getItem(SESSION_KEY);
    const hasValidTokens = (access && isJwtFormat(access)) || (refresh && isJwtFormat(refresh));
    if (hasValidTokens) {
      const items: Record<string, string> = {};
      if (access && isJwtFormat(access)) items[ACCESS_KEY] = access;
      if (refresh && isJwtFormat(refresh)) items[REFRESH_KEY] = refresh;
      if (sessionId) items[SESSION_KEY] = sessionId;
      if (Object.keys(items).length) {
        try {
          ext.storage.local.set(items);
          ext.storage.local.remove([LOGGED_OUT_FLAG]);
        } catch { /* context invalidated */ }
      }
    }
      } catch { /* Extension context invalidated */ }
    });
  } catch { /* Extension context invalidated */ }
}

function syncLocalStorageToChrome(
  access: string | null,
  refresh: string | null,
  sessionId: string | null,
  requireOrigin = false
): void {
  try {
    const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
    if (!ext?.storage?.local) return;
    const onTrustedOrigin = requireOrigin ? isEziTermsWebsite() : true;
    if (!onTrustedOrigin) return;
    if (access === null && refresh === null) {
      ext.storage.local.remove([ACCESS_KEY, REFRESH_KEY, SESSION_KEY]);
    } else {
      const items: Record<string, string> = {};
      if (access != null && isJwtFormat(access)) items[ACCESS_KEY] = access;
      if (refresh != null && isJwtFormat(refresh)) items[REFRESH_KEY] = refresh;
      if (sessionId != null) items[SESSION_KEY] = String(sessionId);
      if (Object.keys(items).length) {
        ext.storage.local.set(items);
        ext.storage.local.remove(['eziterms_logged_out']);
      }
    }
  } catch { /* Extension context invalidated */ }
}

try {
  const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
  if (ext?.storage?.local) {
    if (isEziTermsWebsite()) {
      syncChromeToLocalStorage();
      syncLocalStorageToChromeOnLoad();

      // Poll localStorage for token changes from SPA login/logout flows that
      // don't dispatch the eziterms-tokens-updated custom event.
      let lastSeenAccess = localStorage.getItem(ACCESS_KEY);
      setInterval(() => {
        try {
          const currentAccess = localStorage.getItem(ACCESS_KEY);
          if (currentAccess !== lastSeenAccess) {
            lastSeenAccess = currentAccess;
            syncLocalStorageToChrome(
              localStorage.getItem(ACCESS_KEY),
              localStorage.getItem(REFRESH_KEY),
              localStorage.getItem(SESSION_KEY),
            );
          }
        } catch { /* Extension context invalidated */ }
      }, 2000);
    }
    ext.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, namespace: string) => {
      try {
        if (namespace === 'local' && (changes[ACCESS_KEY] || changes[REFRESH_KEY] || changes[SESSION_KEY])) {
          if (isEziTermsWebsite()) syncChromeToLocalStorage();
          const accessChange = changes[ACCESS_KEY];
          if (accessChange) {
            if (accessChange.newValue === undefined) {
              window.dispatchEvent(new CustomEvent('eziterms-logout'));
            } else if (accessChange.newValue && typeof accessChange.newValue === 'string') {
              window.dispatchEvent(new CustomEvent('eziterms-tokens-synced'));
            }
          }
        }
      } catch { /* Extension context invalidated */ }
    });
  }
} catch (e) {
  console.warn('[EziTerms] Storage listener setup failed:', e);
}

if (typeof window !== 'undefined') {
  window.addEventListener('eziterms-tokens-updated', ((ev: CustomEvent<{ access?: string | null; refresh?: string | null; sessionId?: string | null }>) => {
    const d = ev?.detail;
    if (!d) return;
    const access = d.access ?? null;
    const refresh = d.refresh ?? null;
    const sessionId = d.sessionId ?? null;
    const hasValidTokens = (access && isJwtFormat(access)) || (refresh && isJwtFormat(refresh));
    syncLocalStorageToChrome(access, refresh, sessionId, !hasValidTokens);
  }) as EventListener);

  window.addEventListener('eziterms-request-auth', () => {
    if (isEziTermsWebsite()) syncChromeToLocalStorage();
  });

  window.addEventListener('eziterms-logout', () => {
    try {
      const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
      if (!ext?.storage) return;
      const keysToRemove: string[] = [ACCESS_KEY, REFRESH_KEY, SESSION_KEY, 'eziterms_scan_tabs'];
      if (isEziTermsWebsite()) keysToRemove.push(LOGGED_OUT_FLAG);
      ext.storage.local.remove(keysToRemove);
      ext.storage.session?.remove(['eziterms_scan_tabs', 'eziterms_pending_analyze']);
    } catch { /* Extension context invalidated */ }
    if (isEziTermsWebsite()) {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  });

  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.data?.type !== 'EZITERMS_GOOGLE_SIGNIN_REQUEST' || !EZITERMS_WEBSITE_ORIGINS.includes(ev.origin)) return;
    const requestId = ev.data.requestId ?? 'default';
    try {
      const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
      if (!ext?.runtime) return;
      ext.runtime.sendMessage({ action: 'GOOGLE_SIGNIN_REQUEST' }, (res: { ok?: boolean; token?: string; error?: string } | undefined) => {
        try {
          const lastErr = (ext as { runtime?: { lastError?: { message?: string } } }).runtime?.lastError?.message;
          const payload = res?.ok && res.token
            ? { type: 'EZITERMS_GOOGLE_SIGNIN_RESPONSE', requestId, token: res.token, error: res.error }
            : { type: 'EZITERMS_GOOGLE_SIGNIN_RESPONSE', requestId, error: res?.error ?? lastErr ?? 'Extension not responding' };
          window.postMessage(payload, ev.origin);
        } catch { /* Extension context invalidated */ }
      });
    } catch { /* Extension context invalidated */ }
  });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import PageSidebar from './PageSidebar';
import FloatingBubble from './FloatingBubble';

const ROOT_ID = 'eziterms-sidebar-root';
const SHADOW_HOST_ID = 'eziterms-shadow-host';
const BUBBLE_HOST_ID = 'eziterms-bubble-host';

function injectBubbleOnly(target: HTMLElement): void {
  if (document.getElementById(BUBBLE_HOST_ID)) return;
  if (!document.getElementById('eziterms-bubble-styles')) {
    const bubbleStyle = document.createElement('style');
    bubbleStyle.id = 'eziterms-bubble-styles';
    bubbleStyle.textContent = `
      @keyframes eziterms-bubble-pop { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: 0.85; } 100% { transform: scale(0.15); opacity: 0; } }
      @keyframes eziterms-bubble-appear { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    `;
    (document.head || document.documentElement).appendChild(bubbleStyle);
  }
  const bubbleHost = document.createElement('div');
  bubbleHost.id = BUBBLE_HOST_ID;
  bubbleHost.setAttribute('data-eziterms', 'bubble');
  bubbleHost.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;';
  target.appendChild(bubbleHost);
  ReactDOM.createRoot(bubbleHost).render(
    <React.StrictMode>
      <FloatingBubble />
    </React.StrictMode>
  );
}

function injectSidebar(): void {
  const target = document.body ?? document.documentElement;
  if (!target) return;
  try {

  if (document.getElementById(SHADOW_HOST_ID)) {
    injectBubbleOnly(target);
    return;
  }

  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID;
  host.setAttribute('data-eziterms', 'host');
  host.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;';
  target.appendChild(host);

  injectBubbleOnly(target);

  const shadow = host.attachShadow({ mode: 'closed' });
  const container = document.createElement('div');
  container.id = ROOT_ID;
  container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:2147483647;overflow:visible;';
  shadow.appendChild(container);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes typing-dot-bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
    @keyframes eziterms-tc-fade {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes eziterms-tc-cloud-in {
      from { opacity: 0; transform: translateX(12px) scale(0.92); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    *, *::before, *::after { box-sizing: border-box; }
    input::placeholder { color: rgba(156, 163, 175, 0.7); }
    * { scrollbar-width: none; -ms-overflow-style: none; }
    *::-webkit-scrollbar { display: none; }
  `;
  shadow.insertBefore(style, container);

  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <PageSidebar />
    </React.StrictMode>
  );
  } catch (e) {
    console.warn('[EziTerms] injectSidebar failed:', e);
  }
}

function ensureInjected(): void {
  try {
    const target = document.body ?? document.documentElement;
    if (!target) return;
    // Shadow host may exist without the edge bubble (e.g. partial inject or SPA); always heal bubble.
    if (document.getElementById(SHADOW_HOST_ID)) {
      injectBubbleOnly(target);
      return;
    }
    injectSidebar();
  } catch (e) {
    console.warn('[EziTerms] Content script inject failed:', e);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureInjected);
  } else {
    ensureInjected();
  }
}

// Re-inject if host was removed (e.g. SPA replaced body)
try {
  const observeTarget = document.documentElement ?? document.body;
  if (observeTarget) {
    const observer = new MutationObserver(() => {
      const hasBody = !!(document.body ?? document.documentElement);
      const hasShadow = !!document.getElementById(SHADOW_HOST_ID);
      const hasBubble = !!document.getElementById(BUBBLE_HOST_ID);
      if (hasBody && (!hasShadow || !hasBubble)) ensureInjected();
    });
    observer.observe(observeTarget, { childList: true, subtree: true });
  }
} catch (e) {
  console.warn('[EziTerms] MutationObserver setup failed:', e);
}

// Retry injection after a short delay (for SPAs that replace body after load)
setTimeout(ensureInjected, 1000);
setTimeout(ensureInjected, 3000);
