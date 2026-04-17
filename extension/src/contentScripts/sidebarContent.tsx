/**
 * Content script entry: injects Distil in-page sidebar and mounts React PageSidebar.
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

const envApi = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
  ? String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/api\/?$/, '').replace(/\/$/, '')
  : '';

const DISTIL_WEBSITE_ORIGINS: string[] = [
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
  'https://distil.haptix.in',
  ...(envWebsite ? [envWebsite] : []),
  // The preview frontend and the preview backend are served from the same
  // host (api is under /api), so the API origin is also a valid website origin.
  ...(envApi ? [envApi] : []),
];

// Hostname suffixes that count as Distil-trusted (covers all *.preview.emergentagent.com
// pods so users signed in on any preview sync tokens to the extension automatically).
const DISTIL_ORIGIN_SUFFIXES: string[] = [
  '.preview.emergentagent.com',
  '.haptix.in',
];

function isJwtFormat(s: unknown): boolean {
  if (typeof s !== 'string' || !s.trim()) return false;
  const parts = s.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function isDistilWebsite(): boolean {
  try {
    const origin = window.location.origin;
    if (DISTIL_WEBSITE_ORIGINS.some((o) => origin === o)) return true;
    const host = window.location.hostname;
    if (DISTIL_ORIGIN_SUFFIXES.some((suf) => host === suf.slice(1) || host.endsWith(suf))) return true;
    return false;
  } catch {
    return false;
  }
}

function syncChromeToLocalStorage(): void {
  if (!isDistilWebsite()) return;
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
            window.dispatchEvent(new CustomEvent('distil-tokens-synced'));
          } else {
            window.dispatchEvent(new CustomEvent('distil-logout'));
          }
        }
      } catch { /* Extension context invalidated */ }
    });
  } catch { /* Extension context invalidated */ }
}

const LOGGED_OUT_FLAG = 'distil_logged_out';

function syncLocalStorageToChromeOnLoad(): void {
  if (!isDistilWebsite()) return;
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
      window.dispatchEvent(new CustomEvent('distil-logout'));
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
    const onTrustedOrigin = requireOrigin ? isDistilWebsite() : true;
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
        ext.storage.local.remove(['distil_logged_out']);
      }
    }
  } catch { /* Extension context invalidated */ }
}

try {
  const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
  if (ext?.storage?.local) {
    if (isDistilWebsite()) {
      syncChromeToLocalStorage();
      syncLocalStorageToChromeOnLoad();

      // Poll localStorage for token changes from SPA login/logout flows that
      // don't dispatch the distil-tokens-updated custom event.
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
      }, 400);

      // Cross-tab: `storage` event fires when *another* same-origin tab mutates
      // localStorage. Covers multi-tab login scenarios.
      window.addEventListener('storage', (ev: StorageEvent) => {
        if (!ev) return;
        if (ev.key !== ACCESS_KEY && ev.key !== REFRESH_KEY && ev.key !== SESSION_KEY && ev.key !== 'distil_auth_tick') return;
        try {
          syncLocalStorageToChrome(
            localStorage.getItem(ACCESS_KEY),
            localStorage.getItem(REFRESH_KEY),
            localStorage.getItem(SESSION_KEY),
          );
        } catch { /* Extension context invalidated */ }
      });

      // Direct postMessage from the web app (crosses isolated/main world
      // boundary cleanly, unlike CustomEvent.detail).
      window.addEventListener('message', (ev: MessageEvent) => {
        if (ev.source !== window) return;
        if (ev.data?.type !== 'DISTIL_AUTH_UPDATE') return;
        const access = (ev.data.access as string | null) ?? null;
        const refresh = (ev.data.refresh as string | null) ?? null;
        const hasValidTokens = (access && isJwtFormat(access)) || (refresh && isJwtFormat(refresh));
        syncLocalStorageToChrome(access, refresh, localStorage.getItem(SESSION_KEY), !hasValidTokens);
      });
    }
    ext.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, namespace: string) => {
      try {
        if (namespace === 'local' && (changes[ACCESS_KEY] || changes[REFRESH_KEY] || changes[SESSION_KEY])) {
          if (isDistilWebsite()) syncChromeToLocalStorage();
          const accessChange = changes[ACCESS_KEY];
          if (accessChange) {
            if (accessChange.newValue === undefined) {
              window.dispatchEvent(new CustomEvent('distil-logout'));
            } else if (accessChange.newValue && typeof accessChange.newValue === 'string') {
              window.dispatchEvent(new CustomEvent('distil-tokens-synced'));
            }
          }
        }
      } catch { /* Extension context invalidated */ }
    });
  }
} catch (e) {
  console.warn('[Distil] Storage listener setup failed:', e);
}

if (typeof window !== 'undefined') {
  window.addEventListener('distil-tokens-updated', ((ev: CustomEvent<{ access?: string | null; refresh?: string | null; sessionId?: string | null }>) => {
    const d = ev?.detail;
    if (!d) return;
    const access = d.access ?? null;
    const refresh = d.refresh ?? null;
    const sessionId = d.sessionId ?? null;
    const hasValidTokens = (access && isJwtFormat(access)) || (refresh && isJwtFormat(refresh));
    syncLocalStorageToChrome(access, refresh, sessionId, !hasValidTokens);
  }) as EventListener);

  window.addEventListener('distil-request-auth', () => {
    if (isDistilWebsite()) syncChromeToLocalStorage();
  });

  window.addEventListener('distil-logout', () => {
    try {
      const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
      if (!ext?.storage) return;
      const keysToRemove: string[] = [ACCESS_KEY, REFRESH_KEY, SESSION_KEY, 'distil_scan_tabs'];
      if (isDistilWebsite()) keysToRemove.push(LOGGED_OUT_FLAG);
      ext.storage.local.remove(keysToRemove);
      ext.storage.session?.remove(['distil_scan_tabs', 'distil_pending_analyze']);
    } catch { /* Extension context invalidated */ }
    if (isDistilWebsite()) {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  });

  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.data?.type !== 'DISTIL_GOOGLE_SIGNIN_REQUEST') return;
    const evOrigin = ev.origin || '';
    const suffixOk = (() => {
      try {
        const host = new URL(evOrigin).hostname;
        return DISTIL_ORIGIN_SUFFIXES.some((suf) => host === suf.slice(1) || host.endsWith(suf));
      } catch { return false; }
    })();
    if (!DISTIL_WEBSITE_ORIGINS.includes(evOrigin) && !suffixOk) return;
    const requestId = ev.data.requestId ?? 'default';
    try {
      const ext = safeChrome(() => (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null)), null);
      if (!ext?.runtime) return;
      ext.runtime.sendMessage({ action: 'GOOGLE_SIGNIN_REQUEST' }, (res: { ok?: boolean; token?: string; error?: string } | undefined) => {
        try {
          const lastErr = (ext as { runtime?: { lastError?: { message?: string } } }).runtime?.lastError?.message;
          const payload = res?.ok && res.token
            ? { type: 'DISTIL_GOOGLE_SIGNIN_RESPONSE', requestId, token: res.token, error: res.error }
            : { type: 'DISTIL_GOOGLE_SIGNIN_RESPONSE', requestId, error: res?.error ?? lastErr ?? 'Extension not responding' };
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

const ROOT_ID = 'distil-sidebar-root';
const SHADOW_HOST_ID = 'distil-shadow-host';
const BUBBLE_HOST_ID = 'distil-bubble-host';

function injectBubbleOnly(target: HTMLElement): void {
  if (document.getElementById(BUBBLE_HOST_ID)) return;
  if (!document.getElementById('distil-bubble-styles')) {
    const bubbleStyle = document.createElement('style');
    bubbleStyle.id = 'distil-bubble-styles';
    bubbleStyle.textContent = `
      @keyframes distil-bubble-pop { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: 0.85; } 100% { transform: scale(0.15); opacity: 0; } }
      @keyframes distil-bubble-appear { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    `;
    (document.head || document.documentElement).appendChild(bubbleStyle);
  }
  const bubbleHost = document.createElement('div');
  bubbleHost.id = BUBBLE_HOST_ID;
  bubbleHost.setAttribute('data-distil', 'bubble');
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
  host.setAttribute('data-distil', 'host');
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
    @keyframes distil-tc-fade {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes distil-tc-cloud-in {
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
    console.warn('[Distil] injectSidebar failed:', e);
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
    console.warn('[Distil] Content script inject failed:', e);
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
  console.warn('[Distil] MutationObserver setup failed:', e);
}

// Retry injection after a short delay (for SPAs that replace body after load)
setTimeout(ensureInjected, 1000);
setTimeout(ensureInjected, 3000);
