/**
 * Token storage abstraction for EziTerms extension.
 * Uses chrome.storage.local as the single source. Content script syncs to page localStorage
 * when on localhost:5173 so website and extension share one session.
 */

import { getExtensionApi, isInvalidatedError } from './extensionContext';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const SESSION_KEY = 'session_id';

export async function getAccessToken(): Promise<string | null> {
  try {
    const ext = getExtensionApi();
    if (ext?.storage?.local) {
      const r = await ext.storage.local.get(ACCESS_KEY);
      return (r[ACCESS_KEY] as string) || null;
    }
  } catch (e) {
    if (isInvalidatedError(e)) { /* fall through to localStorage */ }
    else throw e;
  }
  return localStorage.getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    const ext = getExtensionApi();
    if (ext?.storage?.local) {
      const r = await ext.storage.local.get(REFRESH_KEY);
      return (r[REFRESH_KEY] as string) || null;
    }
  } catch (e) {
    if (isInvalidatedError(e)) { /* fall through */ }
    else throw e;
  }
  return localStorage.getItem(REFRESH_KEY);
}

export async function getSessionId(): Promise<string | null> {
  try {
    const ext = getExtensionApi();
    if (ext?.storage?.local) {
      const r = await ext.storage.local.get(SESSION_KEY);
      return r[SESSION_KEY] != null ? String(r[SESSION_KEY]) : null;
    }
  } catch (e) {
    if (isInvalidatedError(e)) { /* fall through */ }
    else throw e;
  }
  return localStorage.getItem(SESSION_KEY);
}

export async function setTokens(access: string, refresh: string, sessionId?: string | number | null): Promise<void> {
  try {
    const ext = getExtensionApi();
    if (ext?.storage?.local) {
      const items: Record<string, string> = { [ACCESS_KEY]: access, [REFRESH_KEY]: refresh };
      if (sessionId != null) items[SESSION_KEY] = String(sessionId);
      await ext.storage.local.set(items);
    }
  } catch (e) {
    if (isInvalidatedError(e)) { /* fall through */ }
    else throw e;
  }
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    if (sessionId != null) localStorage.setItem(SESSION_KEY, String(sessionId));
  } catch {
    /* In side panel, localStorage is extension origin; content script syncs from chrome.storage */
  }
}

const LOGGED_OUT_FLAG = 'eziterms_logged_out';

export async function clearTokens(): Promise<void> {
  try {
    const ext = getExtensionApi();
    if (ext?.storage?.local) {
      await ext.storage.local.remove([ACCESS_KEY, REFRESH_KEY, SESSION_KEY]);
      await ext.storage.local.set({ [LOGGED_OUT_FLAG]: '1' });
    }
  } catch (e) {
    if (isInvalidatedError(e)) { /* ignore */ }
    else throw e;
  }
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
