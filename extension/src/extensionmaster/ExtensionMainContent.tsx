/**
 * Shared main content: tab list (URL-based scan sessions) + Risk Analysis + Anee.
 * Used by ExtensionPopup and PageSidebar.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Header from '../shared/Header';
import ExtensionEnabledSwitch from '../shared/ExtensionEnabledSwitch';
import TermsAnalyse from '../extensionterms/TermsAnalyse';
import ExtensionChatBot from '../extensionchat/ExtensionChatBot';
import {
  type ScanTab,
  urlToDisplay,
  urlToId,
} from '../types/scanSession';
import type { RiskEntry } from '../types/messages';
import { deleteDocumentAnalysis, fetchDocumentAnalyses } from '../api/sessionApi';
import { fusion } from '../theme/fusionTheme';
import { isDistilAnalysisResult } from '../types/messages';

const STORAGE_KEY = 'distil_scan_tabs';
const buildChatContextFromResults = (items: RiskEntry[] | null): string | null => {
  if (!items || !items.length) return null;
  const lines = items.slice(0, 20).map((x, i) => {
    const risk = (x.risktype === 'none' ? 'low' : x.risktype).toUpperCase();
    return `${i + 1}. [${risk}] ${x.lineSummary} - ${x.riskReason}`;
  });
  return `Scan summary:\n${lines.join('\n')}`;
};

type ExtensionMainContentProps = {
  currentPageUrl?: string | null;
  onNotifyContentScript?: (url: string, analysisResult: RiskEntry[], termsText: string) => void;
  /** When true, use chrome.storage.session (cleared when browser closes). New session = empty tabs. */
  useSessionStorage?: boolean;
  /** When set (e.g. after "Yes, analyse" on T&C bubble), run analysis with this text/url once and then clear. */
  initialScanRequest?: { text: string; url: string } | null;
  onConsumeInitialScanRequest?: () => void;
};

export const ExtensionMainContent: React.FC<ExtensionMainContentProps> = ({
  currentPageUrl,
  onNotifyContentScript,
  useSessionStorage = false,
  initialScanRequest = null,
  onConsumeInitialScanRequest,
}) => {
  const [scanTabs, setScanTabs] = useState<ScanTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'risk' | 'anee'>('risk');

  const activeTab = activeTabId
    ? scanTabs.find((t) => t.id === activeTabId)
    : scanTabs[0] ?? null;

  const analysisError = activeTab ? null : null;
  const setAnalysisError = () => {};
  const [loading, setLoading] = useState(false);
  const [analysisErrorLocal, setAnalysisErrorLocal] = useState<string | null>(null);

  const loadTabsFromStorage = useCallback(async () => {
    try {
      const s = useSessionStorage ? chrome.storage.session : chrome.storage.local;
      const stored = await s.get([STORAGE_KEY]);
      const tabs: ScanTab[] = stored[STORAGE_KEY] ?? [];
      if (tabs.length > 0) {
        setScanTabs(tabs);
        if (!activeTabId && tabs[0]) setActiveTabId(tabs[0].id);
      }
    } catch {
      // ignore
    }
  }, [activeTabId, useSessionStorage]);

  const loadTabsFromApi = useCallback(async () => {
    const items = await fetchDocumentAnalyses();
    if (items.length === 0) return;
    const tabs: ScanTab[] = items.map((x) => {
      const rawUrl = x.document_url || `upload:${x.document_name || `analysis-${x.analysis_id}`}`;
      return {
      id: `analysis-${x.analysis_id}`,
      url: rawUrl,
      urlDisplay: urlToDisplay(rawUrl),
      termsText: null,
      analysisResult: (() => {
        if (!x.summary) return null;
        try {
          return JSON.parse(x.summary) as RiskEntry[];
        } catch {
          return null;
        }
      })(),
      chatMessages: [],
      analysisId: x.analysis_id,
      createdAt: new Date(x.created_at).getTime(),
    };});
    setScanTabs((prev) => {
      const merged = new Map<string, ScanTab>();
      tabs.forEach((t) => merged.set(t.id, t));
      prev.forEach((t) => {
        if (!merged.has(t.id)) merged.set(t.id, t);
        else {
          const existing = merged.get(t.id)!;
          if (t.termsText) existing.termsText = t.termsText;
          if (t.chatMessages.length) existing.chatMessages = t.chatMessages;
        }
      });
      return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
    });
    if (!activeTabId && tabs[0]) setActiveTabId(tabs[0].id);
  }, [activeTabId]);

  useEffect(() => {
    loadTabsFromStorage();
    if (!useSessionStorage) loadTabsFromApi();
  }, [loadTabsFromStorage, useSessionStorage]);

  useEffect(() => {
    const s = useSessionStorage ? chrome.storage.session : chrome.storage.local;
    s.set({ [STORAGE_KEY]: scanTabs });
  }, [scanTabs, useSessionStorage]);

  const updateTab = useCallback(
    (id: string, updates: Partial<ScanTab>) => {
      setScanTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      );
    },
    []
  );

  const [justScannedTabId, setJustScannedTabId] = useState<string | null>(null);

  const addOrUpdateTab = useCallback(
    (url: string, data: { termsText: string; analysisResult: RiskEntry[] }) => {
      // Guarantee a non-empty URL so a tab is always created - avoids silent
      // "results vanish" when chrome.scripting cannot read window.location
      // (e.g. chrome://, PDF viewer, etc.).
      const safeUrl = url && url.trim().length > 0 ? url : `scan:${Date.now()}`;
      const isUpload = safeUrl.startsWith('upload:');
      const isEphemeral = safeUrl.startsWith('scan:');
      const tabId = (isUpload || isEphemeral)
        ? `${urlToId(safeUrl)}_${Date.now()}`
        : urlToId(safeUrl);
      setScanTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        const tab: ScanTab = existing
          ? { ...existing, ...data }
          : {
              id: tabId,
              url: safeUrl,
              urlDisplay: urlToDisplay(safeUrl),
              termsText: data.termsText,
              analysisResult: data.analysisResult,
              chatMessages: [],
              createdAt: Date.now(),
            };
        const filtered = prev.filter((t) => t.id !== tabId);
        return [tab, ...filtered];
      });
      setActiveTabId(tabId);
      setJustScannedTabId(tabId);
      onNotifyContentScript?.(safeUrl, data.analysisResult, data.termsText);
    },
    [onNotifyContentScript]
  );

  // Auto-fade the "just scanned" pulse after a moment.
  useEffect(() => {
    if (!justScannedTabId) return;
    const handle = setTimeout(() => setJustScannedTabId(null), 3200);
    return () => clearTimeout(handle);
  }, [justScannedTabId]);

  // When the user navigates to a different page, prefer showing that page's
  // existing scan tab (if any) so the result doesn't feel like it "vanished
  // into history". If there's no tab for the current URL, leave the active
  // tab alone so ongoing reading isn't interrupted.
  useEffect(() => {
    if (!currentPageUrl) return;
    const id = urlToId(currentPageUrl);
    const match = scanTabs.find((t) => t.id === id);
    if (match && match.id !== activeTabId) {
      setActiveTabId(match.id);
    }
  }, [currentPageUrl, scanTabs, activeTabId]);

  const removeTab = useCallback(async (id: string) => {
    const target = scanTabs.find((t) => t.id === id);
    if (target?.analysisId) {
      await deleteDocumentAnalysis(target.analysisId);
    }
    setScanTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [activeTabId, scanTabs]);

  useEffect(() => {
    const handler = (message: unknown) => {
      if (isDistilAnalysisResult(message)) {
        const { pageUrl, analysisResult, termsText } = message.payload;
        addOrUpdateTab(pageUrl, { termsText, analysisResult });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [addOrUpdateTab]);

  const displayError = analysisErrorLocal ?? analysisError;

  const aneeEmptyMessage = 'Please analyse or upload a document to chat and understand about the terms and conditions.';

  return (
    <div style={mainShell}>
      <style>{`
        @keyframes eziJustScanned {
          0%   { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.85), 0 6px 18px rgba(52, 211, 153, 0.0); }
          30%  { box-shadow: 0 0 0 8px rgba(52, 211, 153, 0.0), 0 6px 22px rgba(52, 211, 153, 0.45); }
          100% { box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.65), 0 6px 18px rgba(52, 211, 153, 0.25); }
        }
      `}</style>
      <div style={utilityBar}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={eyebrowLabel}>Anee workspace</span>
          <span style={utilityTitle}>Review and ask with context</span>
        </div>
        <ExtensionEnabledSwitch />
      </div>

      {scanTabs.length > 0 ? (
        <div style={sessionRail}>
          {scanTabs.map((t) => (
            <div key={t.id} style={sessionChipWrap}>
              <button
                type="button"
                onClick={() => setActiveTabId(t.id)}
                style={{
                  ...sessionChipBtn,
                  maxWidth: 132,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  background: activeTabId === t.id ? '#fff' : fusion.bgInput,
                  color: activeTabId === t.id ? '#000' : fusion.text,
                  border: activeTabId === t.id ? 'none' : `1px solid ${fusion.border}`,
                  boxShadow: justScannedTabId === t.id
                    ? '0 0 0 2px rgba(52, 211, 153, 0.65), 0 6px 18px rgba(52, 211, 153, 0.25)'
                    : (activeTabId === t.id ? fusion.shadowSm : 'none'),
                  animation: justScannedTabId === t.id ? 'eziJustScanned 1.8s ease-out' : undefined,
                  transition: 'box-shadow 0.25s ease',
                }}
              >
                {t.urlDisplay}
              </button>
              <button
                type="button"
                data-distil-btn="icon"
                onClick={() => removeTab(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: fusion.textMuted,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '2px 6px',
                  lineHeight: 1,
                  transition: fusion.transitionFast,
                  borderRadius: fusion.radiusSm,
                }}
                aria-label="Close tab"
                title="Close session"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={sessionHint}>
          <span style={{ color: fusion.textMuted, fontSize: fusion.fontSizeSm }}>No sessions yet - run a scan or upload a document.</span>
        </div>
      )}

      <div style={headerRail}>
        <Header activeTab={viewTab} setActiveTab={setViewTab} />
      </div>

      {viewTab === 'risk' ? (
        activeTab ? (
          <div style={contentPane}>
            <TermsAnalyse
              termsText={activeTab.termsText}
              setTermsText={(text) => updateTab(activeTab.id, { termsText: text })}
              analysisResult={activeTab.analysisResult}
              setAnalysisResult={(r) => updateTab(activeTab.id, { analysisResult: r })}
              analysisError={displayError}
              setAnalysisError={setAnalysisErrorLocal}
              loading={loading}
              setLoading={setLoading}
              pageUrl={currentPageUrl ?? activeTab.url}
              onAnalysisComplete={(url, result, termsText) => addOrUpdateTab(url, { termsText, analysisResult: result })}
              initialScanRequest={initialScanRequest}
              onConsumeInitialScanRequest={onConsumeInitialScanRequest}
            />
          </div>
        ) : (
          <div style={emptyPane}>
            {!loading && !displayError && (
              <>
                <p style={{ color: fusion.textMuted, fontSize: fusion.fontSizeBase, margin: 0, lineHeight: fusion.lineHeightNormal }}>
                  No scan yet. Use <strong style={{ color: fusion.text }}>Scan page</strong> or <strong style={{ color: fusion.text }}>Upload document</strong> below.
                </p>
                {useSessionStorage && (
                  <p style={{ color: fusion.textSubtle, fontSize: fusion.fontSizeXs, margin: 0, lineHeight: fusion.lineHeightNormal }}>
                    Session ends when you close the browser or log out.
                  </p>
                )}
              </>
            )}
            <TermsAnalyse
              termsText={null}
              setTermsText={() => {}}
              analysisResult={null}
              /* Real setter: promote scan result to a tab even if the URL is empty. */
              setAnalysisResult={(r) => {
                if (Array.isArray(r) && r.length > 0) {
                  addOrUpdateTab(currentPageUrl ?? '', { termsText: '', analysisResult: r });
                }
              }}
              analysisError={displayError}
              setAnalysisError={setAnalysisErrorLocal}
              loading={loading}
              setLoading={setLoading}
              pageUrl={currentPageUrl}
              onAnalysisComplete={(url, result, termsText) => addOrUpdateTab(url, { termsText, analysisResult: result })}
              initialScanRequest={initialScanRequest}
              onConsumeInitialScanRequest={onConsumeInitialScanRequest}
            />
          </div>
        )
      ) : (
        <div style={contentPane}>
          {(activeTab?.termsText || activeTab?.analysisResult) ? (
            <ExtensionChatBot
              termsText={activeTab.termsText || buildChatContextFromResults(activeTab.analysisResult)}
              messages={activeTab.chatMessages}
              setMessages={(updater) =>
                setScanTabs((prev) =>
                  prev.map((t) =>
                    t.id === activeTab.id
                      ? { ...t, chatMessages: typeof updater === 'function' ? updater(t.chatMessages) : updater }
                      : t
                  )
                )
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, padding: 16, justifyContent: 'center' }}>
              <div
                style={{
                  padding: 14,
                  textAlign: 'center',
                  color: fusion.textMuted,
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontWeight: 500,
                  background: fusion.bgCard,
                  border: `1px solid ${fusion.border}`,
                  borderRadius: 8,
                }}
              >
                {aneeEmptyMessage}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const mainShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  border: `1px solid ${fusion.glassBorder}`,
  borderRadius: fusion.radiusLg,
  background: fusion.gradientSoft,
  boxShadow: fusion.shadowGlass,
  padding: 10,
};

const utilityBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
  flexShrink: 0,
};

const eyebrowLabel: React.CSSProperties = {
  fontSize: 10,
  color: fusion.textSubtle,
  fontWeight: fusion.fontWeightSemibold,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const utilityTitle: React.CSSProperties = {
  fontSize: fusion.fontSizeSm,
  color: fusion.text,
  fontWeight: fusion.fontWeightSemibold,
};

const sessionRail: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginBottom: 10,
  paddingBottom: 10,
  borderBottom: `1px solid ${fusion.border}`,
  flexShrink: 0,
};

const sessionChipWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
};

const sessionChipBtn: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: fusion.fontSizeSm,
  borderRadius: fusion.radiusSm,
  cursor: 'pointer',
  transition: fusion.transition,
  minHeight: 30,
};

const sessionHint: React.CSSProperties = {
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: fusion.radiusSm,
  border: `1px solid ${fusion.border}`,
  background: fusion.glassBg,
  flexShrink: 0,
};

const headerRail: React.CSSProperties = {
  flexShrink: 0,
  padding: 6,
  borderRadius: fusion.radius,
  border: `1px solid ${fusion.border}`,
  background: fusion.glassBgStrong,
};

const contentPane: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  marginTop: 8,
  borderRadius: fusion.radius,
  border: `1px solid ${fusion.border}`,
  background: 'rgba(255, 255, 255, 0.02)',
};

const emptyPane: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: fusion.space5,
  padding: fusion.space6,
  textAlign: 'center',
  marginTop: 8,
  borderRadius: fusion.radius,
  border: `1px solid ${fusion.border}`,
  background: 'rgba(255, 255, 255, 0.02)',
};
