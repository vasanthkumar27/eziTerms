// Injected at build time by Vite (see vite.config.ts); fallback for prod when not set
const API_BASE_URL = typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'https://api.haptix.in/api';

if (typeof chrome !== 'undefined' && chrome.storage?.session?.setAccessLevel) {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
}

let lastActiveTabId = null;
let lastActiveWindowId = null;
const panelOpenWindowIds = new Set();

if (chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    lastActiveTabId = activeInfo.tabId;
    lastActiveWindowId = activeInfo.windowId;
  });
}

if (chrome.sidePanel?.onOpened?.addListener) {
  chrome.sidePanel.onOpened.addListener((info) => {
    if (info?.windowId != null) panelOpenWindowIds.add(info.windowId);
  });
}
if (chrome.sidePanel?.onClosed?.addListener) {
  chrome.sidePanel.onClosed.addListener((info) => {
    if (info?.windowId != null) panelOpenWindowIds.delete(info.windowId);
  });
}

function setToolbarIcon(isDark) {
  const path = isDark
    ? 'assets/eziterms-Logo-icon-dark-theme.png'
    : 'assets/eziterms-Logo-icon-light-theme.png';
  try {
    chrome.action.setIcon({ path: { 16: path, 32: path, 48: path } }).catch(() => {});
  } catch (e) {
    // ignore if action API unavailable
  }
}

function ensureOpenSidePanelOnToolbarClick() {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setToolbarIcon(false);
  ensureOpenSidePanelOnToolbarClick();
  if (chrome.storage?.session?.setAccessLevel) {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
  }
});

ensureOpenSidePanelOnToolbarClick();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EZITERMS_SET_THEME_ICON') {
    setToolbarIcon(message.isDark ?? false);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'EZITERMS_OPEN_AND_ANALYZE') {
    const tabId = sender.tab?.id ?? lastActiveTabId;
    const windowId = sender.tab?.windowId ?? lastActiveWindowId;
    const opts = tabId != null ? { tabId } : (windowId != null ? { windowId } : null);
    if (!opts) {
      sendResponse({ ok: false });
      return true;
    }
    try {
      chrome.sidePanel.open(opts).then(() => {
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'EZITERMS_READ_PENDING_ANALYZE' }).catch(() => {});
        }, 250);
        sendResponse({ ok: true });
      }).catch(() => sendResponse({ ok: false }));
    } catch {
      sendResponse({ ok: false });
    }
    return true;
  }
  if (message.action === 'OPEN_SIDE_PANEL' || message.action === 'TOGGLE_SIDE_PANEL') {
    const ext = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
    const sidePanel = ext?.sidePanel;
    // Use sender.tab when message is from content script - preserves user gesture chain.
    const tabId = message.tabId ?? sender.tab?.id;
    const windowId = message.windowId ?? sender.tab?.windowId;
    const wid = windowId ?? lastActiveWindowId;
    if (!wid && !tabId) {
      if (ext?.tabs?.query) {
        ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const t = tabs?.[0];
          doToggle(t?.windowId, t?.id);
        });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
    doToggle(wid, tabId);
    function doToggle(wid, tid) {
      if (!wid && !tid) {
        sendResponse({ ok: false });
        return;
      }
      const isOpen = wid != null && panelOpenWindowIds.has(wid);
      if (isOpen && sidePanel?.close && wid != null) {
        sidePanel.close({ windowId: wid })
          .then(() => sendResponse({ ok: true, closed: true }))
          .catch(() => { sendResponse({ ok: false }); openFallback(); });
      } else if (sidePanel?.open) {
        const opts = (tid != null ? { tabId: tid } : null) ?? (wid != null ? { windowId: wid } : null);
        if (opts) {
          sidePanel.open(opts)
            .then(() => sendResponse({ ok: true, closed: false }))
            .catch(() => { sendResponse({ ok: false }); openFallback(); });
        } else {
          openFallback();
        }
      } else {
        openFallback();
      }
    }
    function openFallback() {
      const url = ext?.runtime?.getURL?.('index.html') || ext?.runtime?.getURL?.('/index.html');
      if (url && ext?.tabs?.create) {
        ext.tabs.create({ url });
        sendResponse({ ok: true, fallback: true });
      } else {
        sendResponse({ ok: false });
      }
    }
    return true;
  }
  if (message.action === 'HAS_FEATURE') {
    const featureKey = message.featureKey || '';
    const doCheck = async () => {
      try {
        const r = await chrome.storage.local.get(['access_token']);
        const token = r.access_token;
        if (!token) {
          sendResponse({ hasFeature: false });
          return;
        }
        const base = API_BASE_URL;
        const resp = await fetch(`${base}/v1/me/entitlements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          sendResponse({ hasFeature: false });
          return;
        }
        const data = await resp.json();
        const features = data?.features || [];
        const key = (s) => (s || '').toLowerCase().replace(/\s+/g, '_').trim();
        const target = key(featureKey);
        const has = features.some((f) => {
          const fk = key(f.feature_key);
          const fn = key(f.feature_name);
          return fk === target || fn === target || fn === target.replace(/_/g, ' ');
        });
        sendResponse({ hasFeature: has });
      } catch {
        sendResponse({ hasFeature: false });
      }
    };
    doCheck();
    return true;
  }
  if (message.action === 'EZITERMS_ACCEPT_TERMS') {
    const payload = message.payload || {};
    const url = payload.url;
    if (!url) { sendResponse({ ok: false, error: 'url required' }); return true; }
    const run = async () => {
      try {
        const r = await chrome.storage.local.get(['access_token', 'refresh_token']);
        let token = r.access_token;
        if (!token) {
          // Not logged in — open the side panel so the user can sign in.
          try {
            const tab = sender.tab;
            if (tab?.id != null && chrome.sidePanel?.open) {
              await chrome.sidePanel.open({ tabId: tab.id });
            }
          } catch {}
          sendResponse({ ok: false, error: 'not_logged_in' });
          return;
        }
        const doFetch = async (tk) => fetch(`${API_BASE_URL}/accepted-terms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
          body: JSON.stringify({ url, title: payload.title || '' }),
        });
        let resp = await doFetch(token);
        if (resp.status === 401 && r.refresh_token) {
          const rr = await fetch(`${API_BASE_URL}/token/refresh`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: r.refresh_token }),
          });
          if (rr.ok) {
            const rd = await rr.json();
            if (rd.access) {
              token = rd.access;
              await chrome.storage.local.set({ access_token: rd.access, refresh_token: rd.refresh || r.refresh_token });
              resp = await doFetch(token);
            }
          }
        }
        const data = await resp.json().catch(() => ({}));
        sendResponse({ ok: resp.ok, data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    };
    run();
    return true;
  }
  if (message.action === 'GOOGLE_SIGNIN_REQUEST') {
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2?.client_id || '';
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org`;
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token',
        scope: 'email profile',
      }).toString();
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'No redirect URL' });
        return;
      }
      const hash = redirectUrl.split('#')[1];
      if (!hash) {
        sendResponse({ ok: false, error: 'No token in response' });
        return;
      }
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      if (!token) {
        const err = params.get('error_description') || params.get('error') || 'Unknown error';
        sendResponse({ ok: false, error: err });
        return;
      }
      sendResponse({ ok: true, token });
    });
    return true;
  }
});