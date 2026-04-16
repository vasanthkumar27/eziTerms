import React, { useState, useEffect } from 'react';
import LoginRedirectPage from './LoginRedirectPage';
import { ExtensionMainContent } from './ExtensionMainContent';
import AutoAnalyseToggle from '../shared/AutoAnalyseToggle';
import { getAccessToken, clearTokens } from '../utils/tokenStore';
import { fetchConfig, getWebsiteBaseUrl } from '../masterconstans/MasterConstants';
import {
  logoutBackend,
  hasUnsavedResults,
  saveScanTabsToBackend,
  clearEntitlementCache,
} from '../api/sessionApi';
import { DISTIL_READ_PENDING_ANALYZE } from '../types/messages';
import { fusion } from '../theme/fusionTheme';
import logoutIcon from '../assets/logout-button.png';
import distilIconDark from '../assets/Distil-Logo-icon-dark theme.png';

const WEBSITE_ORIGINS = [
  'https://haptix.in',
  'https://www.haptix.in',
  'https://distil.haptix.in',
  'https://2a64ea27-33c2-473c-a9a2-fbd58963d474.preview.emergentagent.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

/**
 * Actively recover tokens from open haptix.in tabs when chrome.storage.local
 * has none. Handles the case where the user is logged in on the website but
 * the content script sync hasn't pushed tokens to extension storage yet.
 */
async function tryRecoverTokensFromWebsite(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.scripting?.executeScript) return false;
  try {
    const websiteBase = getWebsiteBaseUrl().replace(/\/$/, '');
    const origins = [...WEBSITE_ORIGINS];
    if (websiteBase && !origins.includes(websiteBase)) origins.push(websiteBase);

    const tabs = await chrome.tabs.query({});
    const matchingTabs = tabs.filter(
      (t) => t.url && t.id != null && origins.some((o) => t.url!.startsWith(o))
    );
    for (const tab of matchingTabs) {
      if (tab.id == null) continue;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            access_token: localStorage.getItem('access_token'),
            refresh_token: localStorage.getItem('refresh_token'),
            session_id: localStorage.getItem('session_id'),
          }),
        });
        const data = results?.[0]?.result as { access_token?: string; refresh_token?: string; session_id?: string } | undefined;
        if (data?.access_token && data.access_token.split('.').length === 3) {
          const items: Record<string, string> = { access_token: data.access_token };
          if (data.refresh_token) items.refresh_token = data.refresh_token;
          if (data.session_id) items.session_id = data.session_id;
          await chrome.storage.local.set(items);
          await chrome.storage.local.remove(['distil_logged_out']);
          return true;
        }
      } catch {
        // Tab may be restricted (chrome://, etc.) - skip
      }
    }
  } catch {
    // Permissions or API unavailable
  }
  return false;
}

function notifyContentScriptOfAnalysis(
  url: string,
  analysisResult: unknown,
  termsText: string
): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId != null && analysisResult != null && Array.isArray(analysisResult)) {
      chrome.tabs.sendMessage(tabId, {
        type: 'DISTIL_ANALYSIS_RESULT',
        payload: { pageUrl: url, analysisResult, termsText },
      }).catch(() => {});
    }
  });
}

const ExtensionPopup: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    setIsDarkMode(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'DISTIL_SET_THEME_ICON', isDark: isDarkMode }).catch(() => {});
    }
  }, [isDarkMode]);

  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
        await fetchConfig();
        const token = await getAccessToken();
        if (token) {
          if (mounted) setIsAuthenticated(true);
          return;
        }
        // No token in extension storage - try to recover from open website tabs
        const recovered = await tryRecoverTokensFromWebsite();
        if (recovered) {
          const recoveredToken = await getAccessToken();
          if (mounted) setIsAuthenticated(!!recoveredToken);
        }
      } finally {
        if (mounted) setIsAuthChecking(false);
      }
    };
    checkAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const readPendingAnalyze = React.useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
    chrome.storage.session.get(['distil_pending_analyze'], (result) => {
      const pending = result?.distil_pending_analyze;
      if (pending && typeof pending.text === 'string' && typeof pending.url === 'string') {
        setPendingScanRequest({ text: pending.text, url: pending.url });
        chrome.storage.session.remove(['distil_pending_analyze']);
      }
    });
  }, []);

  useEffect(() => {
    readPendingAnalyze();
  }, [readPendingAnalyze]);

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message.type === DISTIL_READ_PENDING_ANALYZE) readPendingAnalyze();
    };
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, [readPendingAnalyze]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') readPendingAnalyze();
    };
    const onFocus = () => readPendingAnalyze();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [readPendingAnalyze]);

  const [pendingScanRequest, setPendingScanRequest] = useState<{ text: string; url: string } | null>(null);

  useEffect(() => {
    const listener = (
      changes: { [key: string]: { newValue?: unknown } },
      namespace: string
    ) => {
      if (namespace === 'local' && changes?.access_token) {
        const newVal = changes.access_token.newValue;
        setIsAuthenticated(newVal !== undefined && newVal !== null && typeof newVal === 'string' && newVal.length > 0);
      }
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(listener);
    }
    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(listener);
      }
    };
  }, []);


  const handleLogoutClick = async () => {
    const unsaved = await hasUnsavedResults(false);
    setHasUnsaved(unsaved);
    setShowLogoutConfirm(true);
  };

  const performLogout = async () => {
    await logoutBackend();
    clearEntitlementCache();
    await clearTokens();
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove(['distil_scan_tabs']);
      if (chrome.storage.session) {
        await chrome.storage.session.remove(['distil_scan_tabs', 'distil_pending_analyze']);
      }
    }
    setIsAuthenticated(false);
    setIsAuthChecking(false);
    setShowLogoutConfirm(false);
  };

  const handleSaveAndLogout = async () => {
    setIsSaving(true);
    await saveScanTabsToBackend(false);
    setIsSaving(false);
    await performLogout();
  };

  const handleDontSaveAndLogout = async () => {
    await performLogout();
  };

  return (
    <div style={popupWrapperStyle}>
      <header style={popupHeaderStyle}>
        <div style={{ ...popupTitleWrap, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <img src={distilIconDark} alt="" width={24} height={24} style={{ flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span style={popupTitle}>Distil</span>
            <span style={popupSubtitle}>Terms & risk</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isAuthenticated && (
            <button type="button" data-distil-btn="icon" onClick={handleLogoutClick} style={iconButtonStyle} title="Logout">
              <img src={logoutIcon} alt="Logout" width={16} height={16} style={{ pointerEvents: 'none' }} />
            </button>
          )}
        </div>
      </header>

      {isAuthChecking ? (
        <div style={authCheckingWrapperStyle}>
          <div style={authCheckingCardStyle}>
            <div style={skeletonPulseBar} />
            <div style={skeletonPulseLine} />
            <div style={{ ...skeletonPulseLine, width: '82%' }} />
            <div style={skeletonButtonsWrap}>
              <div style={skeletonButton} />
              <div style={skeletonButton} />
            </div>
            <p style={authCheckingText}>Checking your session...</p>
          </div>
        </div>
      ) : !isAuthenticated ? (
        <div style={{ ...authWrapperStyle, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <LoginRedirectPage />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0 14px 14px', background: 'linear-gradient(180deg, rgba(50, 145, 255, 0.03) 0%, transparent 100%)' }}>
          <AutoAnalyseToggle />
          <ExtensionMainContent
            onNotifyContentScript={notifyContentScriptOfAnalysis}
            initialScanRequest={pendingScanRequest}
            onConsumeInitialScanRequest={() => setPendingScanRequest(null)}
          />
        </div>
      )}

      {/* Logout Confirmation Popup */}
      {showLogoutConfirm && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            {hasUnsaved ? (
              <>
                <p style={{ marginBottom: 12, fontWeight: 700, fontSize: 16, color: fusion.text }}>
                  Do you want to save your results and chats before logging out?
                </p>
                <p style={{ marginBottom: 20, fontSize: 13, color: fusion.textMuted }}>
                  Saved analyses will appear in your dashboard.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button type="button" data-distil-btn="primary" onClick={handleSaveAndLogout} disabled={isSaving} style={{ ...confirmButtonStyle, background: fusion.successBg, color: fusion.successText, border: `1px solid rgba(34, 197, 94, 0.4)` }}>
                    {isSaving ? 'Saving...' : 'Save & Logout'}
                  </button>
                  <button type="button" data-distil-btn="secondary" onClick={handleDontSaveAndLogout} style={confirmButtonStyle}>
                    Don't save, Logout
                  </button>
                  <button type="button" data-distil-btn="secondary" onClick={() => setShowLogoutConfirm(false)} style={cancelButtonStyle}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ marginBottom: 20, fontWeight: 700, fontSize: 16, color: fusion.text }}>
                  Are you sure you want to logout?
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                  <button type="button" data-distil-btn="primary" onClick={handleDontSaveAndLogout} style={confirmButtonStyle}>
                    Logout
                  </button>
                  <button type="button" data-distil-btn="secondary" onClick={() => setShowLogoutConfirm(false)} style={cancelButtonStyle}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* Popup wrapper: responsive, fills viewport, adapts to any screen */
const popupWrapperStyle: React.CSSProperties = {
  fontFamily: fusion.font,
  width: '100%',
  minWidth: 280,
  height: '100%',
  minHeight: 0,
  boxSizing: 'border-box',
  backgroundColor: fusion.bg,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  color: fusion.text,
  overflow: 'hidden',
};

/* Header: compact, aligned - title + logout */
const popupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
  minWidth: 0,
  padding: '10px 14px',
  borderBottom: `1px solid ${fusion.border}`,
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(20px)',
};

const popupTitleWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const popupTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: fusion.text,
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
};

const popupSubtitle: React.CSSProperties = {
  fontSize: 9,
  color: fusion.textMuted,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  lineHeight: 1.2,
};

const iconButtonStyle: React.CSSProperties = {
  background: fusion.bgInput,
  border: `1px solid ${fusion.border}`,
  borderRadius: 6,
  cursor: 'pointer',
  color: fusion.textMuted,
  padding: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: fusion.transition,
};

/* Auth area: centered dialogue box */
const authWrapperStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '12px 14px',
  overflow: 'auto',
  flex: 1,
  minHeight: 0,
};

const authCheckingWrapperStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '12px 14px',
  overflow: 'hidden',
  flex: 1,
  minHeight: 0,
};

const authCheckingCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 360,
  border: `1px solid ${fusion.border}`,
  borderRadius: fusion.radiusLg,
  background: 'rgba(255, 255, 255, 0.04)',
  padding: '18px 16px',
  boxShadow: fusion.shadowCard,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const skeletonPulseBar: React.CSSProperties = {
  height: 18,
  width: '55%',
  borderRadius: 8,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.16), rgba(255,255,255,0.08))',
  backgroundSize: '200% 100%',
  animation: 'distil-session-shimmer 1.15s linear infinite',
};

const skeletonPulseLine: React.CSSProperties = {
  height: 12,
  width: '96%',
  borderRadius: 6,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.14), rgba(255,255,255,0.08))',
  backgroundSize: '200% 100%',
  animation: 'distil-session-shimmer 1.15s linear infinite',
};

const skeletonButtonsWrap: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 4,
};

const skeletonButton: React.CSSProperties = {
  height: 38,
  flex: 1,
  borderRadius: 10,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
  backgroundSize: '200% 100%',
  animation: 'distil-session-shimmer 1.15s linear infinite',
};

const authCheckingText: React.CSSProperties = {
  margin: '2px 0 0',
  fontSize: fusion.fontSizeSm,
  color: fusion.textMuted,
  textAlign: 'center',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 100002,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#0a0a0a',
  border: `1px solid ${fusion.border}`,
  borderRadius: 10,
  padding: 20,
  maxWidth: 300,
  width: 'calc(100% - 28px)',
  textAlign: 'center',
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
};

const confirmButtonStyle: React.CSSProperties = {
  padding: '12px 20px',
  background: 'rgba(239, 68, 68, 0.25)',
  color: '#f87171',
  border: '1px solid rgba(239, 68, 68, 0.5)',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  transition: fusion.transition,
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '12px 20px',
  background: fusion.bgInput,
  color: fusion.text,
  border: `1px solid ${fusion.border}`,
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  transition: fusion.transition,
};

export default ExtensionPopup;