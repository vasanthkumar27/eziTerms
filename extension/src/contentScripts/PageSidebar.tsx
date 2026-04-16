/**
 * Content script: T&C detection popup. Only when logged in; one-time popup; "Analyze" opens side panel.
 * Popup emanates from the bubble on the right edge.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAccessToken } from '../utils/tokenStore';
import { classifyPageLocal } from '../classifier/tcClassifier';
import { EZITERMS_OPEN_AND_ANALYZE } from '../types/messages';
import { isEziTermsShowTcBubble } from '../types/messages';
import { fusion } from '../theme/fusionTheme';
import { getAutoAnalyseEnabled } from '../utils/autoAnalyseStorage';
import { getExtensionEnabled } from '../utils/extensionEnabledStorage';
import { getExtensionApi } from '../utils/extensionContext';
import { BUBBLE_POPUP_GAP } from '../utils/bubbleConstants';

function getPageText(): string {
  if (typeof document === 'undefined') return '';
  const candidates: string[] = [document.body?.innerText ?? ''];
  for (const s of ['main', 'article', '[role="main"]', '#content', '.content']) {
    try {
      const el = document.querySelector(s);
      if (el?.innerText) candidates.push(el.innerText.trim());
    } catch { /* ignore */ }
  }
  return candidates.reduce((a, b) => (b?.length > a?.length ? b : a), '') || '';
}

const PageSidebar: React.FC = () => {
  const [showTcPopup, setShowTcPopup] = useState(false);
  const [pendingAnalyze, setPendingAnalyze] = useState<{ text: string; url: string } | null>(null);
  const [showClickIconHint, setShowClickIconHint] = useState(false);
  /** User dismissed with "Not now" for this URL this page load; do not show again. */
  const dismissedForUrlRef = useRef<string | null>(null);

  // Listen for side panel asking to show T&C popup (e.g. when navigating in panel)
  useEffect(() => {
    const ext = getExtensionApi();
    if (!ext?.runtime?.onMessage) return;
    const handler = (message: unknown) => {
      try {
        if (isEziTermsShowTcBubble(message)) {
          const { text, url } = message.payload;
          if (dismissedForUrlRef.current === url) return;
          setPendingAnalyze({ text, url });
          setShowTcPopup(true);
        }
      } catch { /* Extension context invalidated */ }
    };
    ext.runtime.onMessage.addListener(handler);
    return () => {
      try { ext.runtime.onMessage.removeListener(handler); } catch { /* invalidated */ }
    };
  }, []);

  // Run T&C detection only when user is logged in. Retry at 2s, 5s, 10s, 15s, 20s for SPAs/slow content.
  useEffect(() => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const delays = [2000, 5000, 10000, 15000, 20000];

    const runDetection = async (): Promise<boolean> => {
      try {
        const extEnabled = await getExtensionEnabled();
        if (!extEnabled) return false; // Extension is off
        const autoEnabled = await getAutoAnalyseEnabled();
        if (!autoEnabled) return false; // Auto Analyse is off
        const token = await getAccessToken();
        if (!token) return false; // Not logged in: do not run detection, do not show popup
        if (dismissedForUrlRef.current === url) return false;
        const text = getPageText();
        if (text.length < 100) return false;
        const result = await classifyPageLocal(text);
        if (result?.is_tc_page) {
          setPendingAnalyze({ text: text.slice(0, 5000), url });
          setShowTcPopup(true);
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    delays.forEach((delay) => {
      const t = setTimeout(async () => {
        const done = await runDetection();
        if (done) timers.forEach(clearTimeout);
      }, delay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  const handleAnalyzeInExtension = useCallback(async () => {
    const pending = pendingAnalyze;
    setShowTcPopup(false);
    setPendingAnalyze(null);
    if (!pending) return;
    try {
      const ext = getExtensionApi();
      if (!ext?.storage?.session || !ext?.runtime) return;
      await ext.storage.session.set({ eziterms_pending_analyze: pending });
      ext.runtime.sendMessage({ type: EZITERMS_OPEN_AND_ANALYZE }).catch(() => {});
      setShowClickIconHint(true);
    } catch { /* Extension context invalidated */ }
  }, [pendingAnalyze]);

  const handleNotNow = useCallback(() => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    dismissedForUrlRef.current = url;
    setShowTcPopup(false);
    setPendingAnalyze(null);
  }, []);

  /* T&C popup — fixed to viewport right (floating bubble removed) */
  const popupWidth = 280;

  const tcPopupStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    right: BUBBLE_POPUP_GAP,
    transform: 'translateY(-50%)',
    width: 'max-content',
    maxWidth: popupWidth,
    padding: '16px 18px',
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    zIndex: 2147483647,
    fontFamily: fusion.font,
    animation: 'eziterms-tc-cloud-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    pointerEvents: 'auto',
  };

  const hintStyle: React.CSSProperties = { ...tcPopupStyle };

  return (
    <div style={{ fontFamily: fusion.font, color: fusion.text, pointerEvents: 'none' }}>
      {showClickIconHint && (
        <div style={hintStyle} role="status" aria-live="polite">
          <p style={{ margin: 0, fontSize: 13, color: fusion.text, fontWeight: 500 }}>
            Click the <strong>EziTerms</strong> icon in your browser toolbar to open and analyze.
          </p>
          <button
            type="button"
            onClick={() => setShowClickIconHint(false)}
            style={{
              marginTop: 12,
              padding: '8px 14px',
              background: fusion.bgInput,
              border: `1px solid ${fusion.border}`,
              borderRadius: 8,
              color: fusion.text,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            Got it
          </button>
        </div>
      )}
      {showTcPopup && pendingAnalyze && (
        <div style={tcPopupStyle} role="dialog" aria-label="T&C detected" aria-live="polite">
          <p style={{ margin: 0, fontSize: 14, color: fusion.text, fontWeight: 600, letterSpacing: '-0.01em' }}>
            T&amp;C detected on this page
          </p>
          <p style={{ margin: '4px 0 14px', fontSize: 12, color: fusion.textMuted, lineHeight: 1.4 }}>
            Would you like to analyze?
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              data-eziterms-btn="primary"
              onClick={handleAnalyzeInExtension}
              style={{
                padding: '10px 18px',
                background: '#fff',
                border: 'none',
                borderRadius: 10,
                color: '#000',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: 'none',
              }}
            >
              Analyze
            </button>
            <button
              type="button"
              data-eziterms-btn="secondary"
              onClick={handleNotNow}
              style={{
                padding: '10px 16px',
                background: fusion.bgInput,
                border: `1px solid ${fusion.border}`,
                borderRadius: 10,
                color: fusion.textMuted,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              aria-label="Not now"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PageSidebar;
