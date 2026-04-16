// TermsAnalyse.tsx - Fusion theme
import API_ENDPOINTS from '../masterconstans/MasterConstants';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '../utils/tokenStore';
import { logExtensionActivity, classifyPageForUi } from '../api/sessionApi';
import { computeRiskScore, getRiskScoreLabel, getRiskScoreColor } from '../types/messages';
import { fusion } from '../theme/fusionTheme';
import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

type RiskEntry = {
  risktype: 'high' | 'medium' | 'low' | 'none';
  lineSummary: string;
  riskReason: string;
};

type TermsAnalyseProps = {
  termsText: string | null;
  setTermsText: (text: string) => void;
  analysisResult: RiskEntry[] | null;
  setAnalysisResult: (results: RiskEntry[] | null) => void;
  analysisError: string | null;
  setAnalysisError: (err: string | null) => void;
  loading: boolean;
  setLoading: (val: boolean) => void;
  pageUrl?: string | null;
  onAnalysisComplete?: (pageUrl: string, result: RiskEntry[], termsText: string) => void;
  /** When set, run analysis with this text/url once (e.g. after "Yes, analyse" on T&C detection). */
  initialScanRequest?: { text: string; url: string } | null;
  onConsumeInitialScanRequest?: () => void;
};

const getBadgeColor = (risk: string) => {
  switch (risk) {
    case 'high': return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low':
    case 'none':
      return '#22c55e';
    default: return '#6b7280';
  }
};

const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2, none: 2 };

const ACCEPTED_TYPES = ['.pdf', '.doc', '.docx', '.txt'];
const MASKING_WORD_LINES = [
  ['Customer', 'agrees', 'to', 'share', 'email', 'and', 'phone', 'for', 'support'],
  ['Billing', 'address', 'and', 'identity', 'details', 'will', 'be', 'processed'],
  ['Personal', 'identifiers', 'are', 'detected', 'and', 'automatically', 'masked'],
  ['Account', 'number', 'payment', 'method', 'and', 'contact', 'metadata', 'secured'],
  ['Private', 'fields', 'are', 'replaced', 'before', 'analysis', 'continues', 'safely'],
];

const TermsAnalyse: React.FC<TermsAnalyseProps> = ({
  setTermsText,
  analysisResult,
  setAnalysisResult,
  analysisError,
  setAnalysisError,
  loading,
  setLoading,
  pageUrl,
  onAnalysisComplete,
  initialScanRequest = null,
  onConsumeInitialScanRequest,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [maskingEnabled, setMaskingEnabled] = useState(false);
  const [maskingPending, setMaskingPending] = useState<{
    maskedText: string;
    fileName: string;
  } | null>(null);
  const [maskingAnimating, setMaskingAnimating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);
  const [noTcPrompt, setNoTcPrompt] = useState<{ text: string; pageUrl: string } | null>(null);
  const isAnalyzingRef = useRef(false);

  useEffect(() => {
    const handleMessage = (request: { action?: string; terms?: string; pageUrl?: string }) => {
      if (request.action === "termsExtracted" && !isAnalyzingRef.current) {
        const terms = request.terms || '';
        const url = request.pageUrl || '';
        setTermsText(terms);
        analyzeText(terms, url || undefined);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
    }
    return () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleMessage);
      }
    };
  }, [setTermsText]);

  useEffect(() => {
    if (!initialScanRequest?.text?.trim() || initialScanRequest.text.length < 100 || isAnalyzingRef.current) return;
    const req = { text: initialScanRequest.text, url: initialScanRequest.url };
    onConsumeInitialScanRequest?.();
    analyzeText(req.text, req.url);
  }, [initialScanRequest?.url, initialScanRequest?.text]);

  const runAnalysisWithText = async (text: string, url: string) => {
    let accessToken = await getAccessToken();
    let refreshToken = await getRefreshToken();
    if (!accessToken && !refreshToken) {
      setAnalysisError('Please log in to analyze terms.');
      return;
    }
    const body: { terms: string; document_url?: string } = { terms: text };
    if (url) body.document_url = url;

    let resp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.ANALYSE_TERMS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 401 && refreshToken) {
      const refreshResp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.REFRESH_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!refreshResp.ok) throw new Error('Session expired, please login again.');
      const refreshData = await refreshResp.json();
      await setTokens(refreshData.access, refreshToken);
      accessToken = refreshData.access;
      resp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.ANALYSE_TERMS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
    }
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const msg = errData?.detail || `Server error: ${resp.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    const data = await resp.json();
    if (!Array.isArray(data.result)) throw new Error('Invalid format');
    const sortedResults = [...data.result].sort(
      (a: RiskEntry, b: RiskEntry) => riskOrder[a.risktype] - riskOrder[b.risktype]
    );
    setAnalysisResult(sortedResults);
    if (url) {
      logExtensionActivity(url, 'terms_analyzed', true).catch(() => {});
      onAnalysisComplete?.(url, sortedResults, text);
    }
  };

  const analyzeText = async (text: string, pageUrlOverride?: string) => {
    isAnalyzingRef.current = true;
    setLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    setExpandedSummary(null);
    setNoTcPrompt(null);

    try {
      let accessToken = await getAccessToken();
      let refreshToken = await getRefreshToken();

      if (!accessToken && !refreshToken) {
        setAnalysisError('Please log in to analyze terms.');
        setLoading(false);
        return;
      }

      const url = pageUrlOverride || pageUrl || (typeof window !== 'undefined' ? window.location.href : '') || '';

      if (!text || text.trim().length < 100) {
        setNoTcPrompt({ text: text || '', pageUrl: url });
        setLoading(false);
        return;
      }

      const classifyResult = await classifyPageForUi(text);
      if (!classifyResult?.is_tc_page) {
        setNoTcPrompt({ text, pageUrl: url });
        setLoading(false);
        return;
      }

      await runAnalysisWithText(text, url);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      setAnalysisError(errMsg);
    } finally {
      isAnalyzingRef.current = false;
      setLoading(false);
    }
  };

  const handleClick = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      setAnalysisError('Chrome API is not available.');
      return;
    }
    const access = await getAccessToken();
    const refresh = await getRefreshToken();
    if (!access && !refresh) {
      setAnalysisError('Please log in to analyze terms.');
      return;
    }

    isAnalyzingRef.current = true;
    setLoading(true);
    setAnalysisResult(null);
    setAnalysisError(null);
    setNoTcPrompt(null);
    setExpandedSummary(null);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (!tab?.id) {
        setAnalysisError('Could not find active tab.');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ terms: document.body.innerText, pageUrl: window.location.href }),
      });

      const data = results?.[0]?.result as { terms: string; pageUrl: string } | undefined;
      if (!data?.terms || data.terms.trim().length < 100) {
        setAnalysisError('Not enough text on this page to analyse.');
        return;
      }

      setTermsText(data.terms);
      const url = data.pageUrl || '';
      await runAnalysisWithText(data.terms, url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not scan this page.';
      setAnalysisError(msg);
    } finally {
      isAnalyzingRef.current = false;
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setSelectedFile(file);
    setMaskingAnimating(maskingEnabled);

    isAnalyzingRef.current = true;
    setLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    setExpandedSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('masking_mode', maskingEnabled ? 'true' : 'false');

      let accessToken = await getAccessToken();
      const refreshToken = await getRefreshToken();

      let resp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.UPLOAD_TERMS, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (resp.status === 401 && refreshToken) {
        const refreshResp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.REFRESH_TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken }),
        });

        if (!refreshResp.ok) {
          throw new Error('Session expired, please login again.');
        }

        const refreshData = await refreshResp.json();
        await setTokens(refreshData.access, refreshToken);
        accessToken = refreshData.access;

        resp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.UPLOAD_TERMS, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${refreshData.access}`,
          },
          body: formData,
        });

        if (!resp.ok) {
          throw new Error(`Server error: ${resp.status}`);
        }
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const msg = errData?.detail || `Server error: ${resp.status}`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }

      const data = await resp.json();

      if (data.masking_preview === true || data.requires_user_confirmation === true) {
        setMaskingPending({
          maskedText: typeof data.terms_text === 'string' ? data.terms_text : '',
          fileName: file.name,
        });
        setMaskingAnimating(false);
        return;
      }

      if (!Array.isArray(data.result)) throw new Error('Invalid format');

      const sortedResults = [...data.result].sort(
        (a: RiskEntry, b: RiskEntry) => riskOrder[a.risktype] - riskOrder[b.risktype]
      );

      setAnalysisResult(sortedResults);

      const uploadUrl = `upload:${file.name}`;
      const termsTextFromUpload = data.terms_text ?? '';
      logExtensionActivity(uploadUrl, 'upload_terms', true).catch(() => {});
      onAnalysisComplete?.(uploadUrl, sortedResults, termsTextFromUpload);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      setAnalysisError(errMsg);
      if (errMsg.toLowerCase().includes('login')) {
        await clearTokens();
      }
    } finally {
      isAnalyzingRef.current = false;
      setMaskingAnimating(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setLoading(false);
    }
  };

  const handleClear = () => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setNoTcPrompt(null);
    setMaskingPending(null);
    setTermsText('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMaskingCancel = () => {
    setMaskingAnimating(false);
    setMaskingPending(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMaskingProceed = async () => {
    if (!maskingPending) return;
    const { maskedText, fileName } = maskingPending;
    setMaskingPending(null);
    setMaskingAnimating(false);
    setLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    isAnalyzingRef.current = true;
    try {
      await runAnalysisWithText(maskedText, `upload:${fileName}`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      setAnalysisError(errMsg);
      if (errMsg.toLowerCase().includes('login')) {
        await clearTokens();
      }
    } finally {
      isAnalyzingRef.current = false;
      setLoading(false);
    }
  };

  const maskingModal =
    maskingPending && !loading && typeof document !== 'undefined'
      ? createPortal(
          <div style={maskingOverlayStyle} role="dialog" aria-modal="true" aria-label="Mask">
            <div style={maskingModalShell} onClick={(e) => e.stopPropagation()}>
              <div style={maskingModalHeader}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={maskingModalTitle}>Masked preview</span>
                  <span style={maskingModalSubTitle}>Sensitive details are hidden before analysis.</span>
                </div>
                <button type="button" data-eziterms-btn="icon" onClick={handleMaskingCancel} aria-label="Close" style={maskingCloseBtn}>
                  ×
                </button>
              </div>
              <div style={maskingPreviewTagWrap}>
                <span style={maskingPreviewTag}>Mask enabled</span>
                <span style={maskingPreviewTagNote}>Review and continue if this looks right</span>
              </div>
              <div style={maskedTextPreviewModal}>{maskingPending.maskedText}</div>
              <div style={maskingModalFooter}>
                <button type="button" data-eziterms-btn="secondary" onClick={handleMaskingCancel} style={secondaryButton}>
                  Cancel upload
                </button>
                <button type="button" data-eziterms-btn="primary" onClick={handleMaskingProceed} style={mainButton}>
                  Continue with masked text
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const handleScanAnyway = async () => {
    if (!noTcPrompt) return;
    const { text, pageUrl } = noTcPrompt;
    setNoTcPrompt(null);
    setAnalysisError(null);
    setLoading(true);
    isAnalyzingRef.current = true;
    try {
      await runAnalysisWithText(text, pageUrl);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      setAnalysisError(errMsg);
      if (errMsg.toLowerCase().includes('login')) {
        await clearTokens();
      }
    } finally {
      isAnalyzingRef.current = false;
      setLoading(false);
    }
  };

  const sortedResults = analysisResult
    ? [...analysisResult].sort((a, b) => {
      return riskOrder[a.risktype] - riskOrder[b.risktype];
    })
    : null;

  const totalHigh = sortedResults?.filter(r => r.risktype === 'high').length || 0;
  const totalMedium = sortedResults?.filter(r => r.risktype === 'medium').length || 0;
  const totalLow = sortedResults?.filter(r => r.risktype === 'low' || r.risktype === 'none').length || 0;
  const riskScore = computeRiskScore(sortedResults ?? null);

  return (
    <div style={containerStyle}>
      <div style={contentWrapper}>
        {!analysisResult && !loading && !analysisError && !noTcPrompt && !maskingPending && (
          <div style={initialStateWrapper}>
            <div style={infoBox}>
              <p style={{ margin: 0, lineHeight: fusion.lineHeightNormal, fontSize: fusion.fontSizeBase }}>Scan this page or upload a document to detect risks in terms and privacy policies.</p>
            </div>
            <button type="button" data-eziterms-btn="primary" style={mainButton} onClick={handleClick}>
              Scan page
            </button>
            <div style={uploadSectionDivider} />
            <div style={uploadBlock}>
              <div style={maskSwitchRow}>
                <span style={maskLabel}>Mask</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={maskingEnabled}
                  aria-label={`Mask ${maskingEnabled ? 'on' : 'off'}`}
                  onClick={() => setMaskingEnabled((v) => !v)}
                  style={{
                    ...maskToggleTrack,
                    ...(maskingEnabled ? maskToggleTrackOn : {}),
                  }}
                >
                  <span
                    style={{
                      ...maskToggleThumb,
                      ...(maskingEnabled ? maskToggleThumbOn : {}),
                    }}
                  />
                </button>
              </div>
              <div style={uploadContainer}>
                <label htmlFor="file-upload" style={uploadLabel}>
                  Upload document
                  <input
                    id="file-upload"
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
                {selectedFile && <span style={fileName}>{selectedFile.name}</span>}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div style={loaderContainer}>
            {maskingAnimating ? (
              <div style={maskingWordMaskShell} className="eziterms-mask-viewport">
                <div className="eziterms-mask-stream">
                  {MASKING_WORD_LINES.map((line, lineIdx) => (
                    <div key={lineIdx} className="eziterms-mask-line">
                      {line.map((word, tokenIdx) => (
                        <span
                          key={`${lineIdx}-${tokenIdx}`}
                          className="eziterms-mask-token"
                          style={{ ['--ez-mask-delay' as string]: `${(lineIdx * 0.18) + (tokenIdx * 0.1)}s` }}
                        >
                          <span className="eziterms-mask-token-text">{word}</span>
                          <span className="eziterms-mask-token-block">████</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="eziterms-mask-progress">
                  <span />
                </div>
              </div>
            ) : (
              <div style={loader3dScene}>
                <div style={loader3dOrbitOuter} />
                <div style={loader3dOrbitMid} />
                <div style={loader3dOrbitInner} />
                <div style={loader3dCore} />
              </div>
            )}
            <p style={loaderText}>{maskingAnimating ? 'Masking sensitive words...' : 'Analyzing terms...'}</p>
          </div>
        )}

        {noTcPrompt && (
          <div style={noTcBox}>
            <p style={{ margin: 0, marginBottom: fusion.space2, fontWeight: fusion.fontWeightMedium }}>This page doesn’t look like it contains Terms & Conditions or Privacy policies.</p>
            <p style={{ margin: 0, fontSize: fusion.fontSizeSm, color: fusion.textMuted }}>You can still run a scan if you’re sure.</p>
            <div style={noTcActionsRow}>
              <button type="button" data-eziterms-btn="secondary" onClick={handleClear} style={secondaryButton}>Try again</button>
              <button type="button" data-eziterms-btn="primary" onClick={handleScanAnyway} style={mainButton}>Scan anyway</button>
            </div>
          </div>
        )}

        {analysisError && !noTcPrompt && (
          <div style={errorBox}>
            <p style={{ margin: 0, marginBottom: fusion.space4 }}>{analysisError}</p>
            <button type="button" data-eziterms-btn="primary" onClick={handleClear} style={mainButton}>Try again</button>
          </div>
        )}

        {sortedResults && (
          <div style={resultsContainer}>
            {riskScore != null && (
              <div style={{ ...riskMeterCard, borderColor: getRiskScoreColor(riskScore).border, backgroundColor: getRiskScoreColor(riskScore).bg }}>
                <div style={riskMeterTitle}>Risk meter</div>
                <div style={riskMeterTrack}>
                  <div style={riskMeterTrackGradient} />
                  <div style={{ ...riskMeterPointer, left: `${Math.min(100, Math.max(0, riskScore))}%` }} title={`${riskScore} — ${getRiskScoreLabel(riskScore)}`} />
                </div>
                <div style={riskMeterLabels}>
                  <span style={riskMeterNum}>0</span>
                  <span style={{ ...riskMeterScore, color: getRiskScoreColor(riskScore).text }}>{riskScore}</span>
                  <span style={riskMeterNum}>100</span>
                </div>
                <div style={{ ...riskMeterSub, color: getRiskScoreColor(riskScore).text }}>{getRiskScoreLabel(riskScore)}</div>
              </div>
            )}
            <div style={summaryBox}>
              <h3 style={summaryTitle}>Risk breakdown</h3>
              <div style={summaryStats}>
                <div style={statItem}>
                  <div style={{ ...statColor, backgroundColor: getBadgeColor('high') }}></div>
                  <span>High: {totalHigh}</span>
                </div>
                <div style={statItem}>
                  <div style={{ ...statColor, backgroundColor: getBadgeColor('medium') }}></div>
                  <span>Medium: {totalMedium}</span>
                </div>
                <div style={statItem}>
                  <div style={{ ...statColor, backgroundColor: getBadgeColor('low') }}></div>
                  <span>Low: {totalLow}</span>
                </div>
              </div>
            </div>

            {sortedResults.map((entry, index) => (
              <div key={index} style={riskItemContainer}>
                <div
                  style={riskItemHeader}
                  onClick={() => setExpandedSummary(expandedSummary === entry.lineSummary ? null : entry.lineSummary)}
                >
                  <div style={{ ...riskBadge, backgroundColor: getBadgeColor(entry.risktype) }}>
                    {(entry.risktype === 'none' ? 'low' : entry.risktype).toUpperCase()}
                  </div>
                  <p style={riskSummaryText}>{entry.lineSummary}</p>
                  <span style={arrowStyle(expandedSummary === entry.lineSummary)}>➡️</span>
                </div>
                {expandedSummary === entry.lineSummary && (
                  <div style={riskReasonBox}>
                    <p style={riskReasonText}>{entry.riskReason}</p>
                  </div>
                )}
              </div>
            ))}
            <button type="button" data-eziterms-btn="secondary" onClick={handleClear} style={{ ...secondaryButton, marginTop: 12 }}>
              New scan
            </button>
          </div>
        )}
      </div>
      {maskingModal}
    </div>
  );
};

export default TermsAnalyse;

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  width: '100%',
  minWidth: 0,
  fontFamily: fusion.font,
  boxSizing: 'border-box',
};

const contentWrapper: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
};

const initialStateWrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 16,
  padding: '16px 0',
  textAlign: 'center',
};

const infoBox: React.CSSProperties = {
  padding: 14,
  border: `1px solid ${fusion.border}`,
  borderRadius: 8,
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  color: fusion.textMuted,
  fontSize: 13,
  maxWidth: '100%',
  lineHeight: 1.45,
};

const mainButton: React.CSSProperties = {
  padding: '12px 24px',
  fontSize: 14,
  borderRadius: 8,
  border: 'none',
  background: '#fff',
  color: '#000',
  cursor: 'pointer',
  fontWeight: 600,
  boxShadow: 'none',
  transition: fusion.transition,
};

const secondaryButton: React.CSSProperties = {
  ...mainButton,
  background: 'rgba(255, 255, 255, 0.06)',
  color: fusion.text,
  border: `1px solid ${fusion.border}`,
  boxShadow: 'none',
};

const uploadSectionDivider: React.CSSProperties = {
  width: '100%',
  maxWidth: 200,
  height: 1,
  background: fusion.border,
  margin: `${fusion.space1}px 0`,
};

const riskMeterCard: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid',
  marginBottom: 8,
};

const riskMeterTitle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: fusion.textMuted,
  marginBottom: 6,
  textAlign: 'center',
};

const riskMeterTrack: React.CSSProperties = {
  position: 'relative',
  height: 10,
  borderRadius: 5,
  overflow: 'visible',
  marginBottom: 4,
};

const riskMeterTrackGradient: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 5,
  background: 'linear-gradient(90deg, #22c55e 0%, #22c55e 32%, #eab308 32%, #eab308 52%, #f59e0b 52%, #f59e0b 72%, #ef4444 72%, #ef4444 100%)',
  opacity: 0.85,
};

const riskMeterPointer: React.CSSProperties = {
  position: 'absolute',
  top: -1,
  width: 3,
  height: 12,
  borderRadius: 1,
  backgroundColor: fusion.text,
  boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
  transform: 'translateX(-50%)',
  transition: 'left 0.35s ease',
  pointerEvents: 'none',
};

const riskMeterLabels: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '0 1px',
  marginBottom: 2,
};

const riskMeterNum: React.CSSProperties = {
  fontSize: 9,
  color: fusion.textMuted,
  fontWeight: 600,
};

const riskMeterScore: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
};

const riskMeterSub: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textAlign: 'center',
};

const loaderContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${fusion.space10}px 0`,
};

const loader3dScene: React.CSSProperties = {
  position: 'relative',
  width: 72,
  height: 72,
  perspective: 140,
  perspectiveOrigin: 'center center',
};

const loader3dRingBase: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  border: '2px solid transparent',
  borderTopColor: 'rgba(255, 255, 255, 0.7)',
  borderRightColor: 'rgba(255, 255, 255, 0.2)',
  transformStyle: 'preserve-3d',
};

const loader3dOrbitOuter: React.CSSProperties = {
  ...loader3dRingBase,
  animation: 'eziterms-3d-orbit-outer 1.2s linear infinite',
};

const loader3dOrbitMid: React.CSSProperties = {
  ...loader3dRingBase,
  animation: 'eziterms-3d-orbit-mid 1.8s linear infinite reverse',
  inset: 8,
  borderTopColor: 'rgba(50, 145, 255, 0.7)',
  borderRightColor: 'rgba(50, 145, 255, 0.25)',
};

const loader3dOrbitInner: React.CSSProperties = {
  ...loader3dRingBase,
  animation: 'eziterms-3d-orbit-inner 2.4s linear infinite',
  inset: 16,
  borderTopColor: 'rgba(50, 145, 255, 0.5)',
  borderRightColor: 'rgba(50, 145, 255, 0.15)',
};

const loader3dCore: React.CSSProperties = {
  position: 'absolute',
  inset: 24,
  borderRadius: '50%',
  background: `radial-gradient(circle at 30% 30%, rgba(50, 145, 255, 0.7), rgba(50, 145, 255, 0.2))`,
  boxShadow: '0 0 20px rgba(50, 145, 255, 0.3)',
  animation: 'eziterms-3d-pulse 1.5s ease-in-out infinite',
};

const loaderText: React.CSSProperties = {
  marginTop: fusion.space4,
  color: fusion.textMuted,
  fontSize: fusion.fontSizeMd,
};

const maskingWordMaskShell: React.CSSProperties = {
  width: 'min(98%, 440px)',
  border: `1px solid ${fusion.glassBorder}`,
  borderRadius: fusion.radius,
  background: 'rgba(0, 0, 0, 0.4)',
  boxShadow: fusion.shadowGlass,
  padding: '12px 14px',
  overflow: 'hidden',
};

const noTcBox: React.CSSProperties = {
  backgroundColor: fusion.bgCard,
  border: `1px solid ${fusion.border}`,
  padding: fusion.space5,
  borderRadius: fusion.radius,
  textAlign: 'center',
  color: fusion.text,
};

const noTcActionsRow: React.CSSProperties = {
  display: 'flex',
  gap: fusion.space3,
  marginTop: fusion.space4,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const errorBox: React.CSSProperties = {
  backgroundColor: fusion.dangerBg,
  border: '1px solid rgba(239, 68, 68, 0.35)',
  padding: fusion.space5,
  borderRadius: fusion.radius,
  textAlign: 'center',
  color: fusion.dangerText,
};

const uploadContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
};

const uploadLabel: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 20px',
  fontSize: 13,
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  border: `1px solid ${fusion.border}`,
  borderRadius: 8,
  cursor: 'pointer',
  color: fusion.text,
  fontWeight: 600,
  transition: fusion.transition,
};

const fileName: React.CSSProperties = {
  fontSize: fusion.fontSizeSm,
  color: fusion.textMuted,
};

const uploadBlock: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  width: '100%',
};

const maskSwitchRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  maxWidth: 280,
  padding: '0 4px',
};

const maskLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: fusion.text,
};

const maskToggleTrack: React.CSSProperties = {
  width: 36,
  height: 20,
  borderRadius: 10,
  background: fusion.bgInput,
  border: `1px solid ${fusion.border}`,
  cursor: 'pointer',
  padding: 2,
  position: 'relative',
  transition: fusion.transition,
  flexShrink: 0,
};

const maskToggleTrackOn: React.CSSProperties = {
  background: fusion.accent,
  borderColor: fusion.accent,
};

const maskToggleThumb: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  left: 2,
  width: 14,
  height: 14,
  borderRadius: 7,
  background: fusion.textMuted,
  transition: fusion.transition,
};

const maskToggleThumbOn: React.CSSProperties = {
  left: 18,
  background: '#fff',
};

const maskingOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483647,
  backgroundColor: 'rgba(0, 0, 0, 0.72)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  boxSizing: 'border-box',
};

const maskingModalShell: React.CSSProperties = {
  width: 'min(96vw, 720px)',
  maxHeight: 'min(92vh, 900px)',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: fusion.bgElevated,
  border: `1px solid ${fusion.borderStrong}`,
  borderRadius: fusion.radiusLg,
  boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const maskingModalHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px',
  borderBottom: `1px solid ${fusion.border}`,
  flexShrink: 0,
};

const maskingModalTitle: React.CSSProperties = {
  fontSize: fusion.fontSizeBase,
  fontWeight: fusion.fontWeightSemibold,
  color: fusion.text,
};

const maskingModalSubTitle: React.CSSProperties = {
  fontSize: fusion.fontSizeXs,
  color: fusion.textMuted,
};

const maskingCloseBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: fusion.textMuted,
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: fusion.radiusSm,
};

const maskedTextPreviewModal: React.CSSProperties = {
  flex: 1,
  minHeight: 'min(60vh, 560px)',
  maxHeight: 'min(72vh, 720px)',
  overflow: 'auto',
  padding: 14,
  fontSize: fusion.fontSizeSm,
  color: fusion.text,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  border: `1px solid ${fusion.border}`,
  borderRadius: fusion.radius,
  margin: '0 14px',
};

const maskingPreviewTagWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  gap: 8,
};

const maskingPreviewTag: React.CSSProperties = {
  fontSize: fusion.fontSizeXs,
  fontWeight: fusion.fontWeightSemibold,
  color: '#ededed',
  border: `1px solid ${fusion.glassBorder}`,
  background: 'rgba(50, 145, 255, 0.12)',
  borderRadius: 999,
  padding: '3px 8px',
};

const maskingPreviewTagNote: React.CSSProperties = {
  fontSize: fusion.fontSizeXs,
  color: fusion.textSubtle,
};

const maskingModalFooter: React.CSSProperties = {
  display: 'flex',
  gap: fusion.space3,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  flexShrink: 0,
  padding: `16px 14px 18px`,
};

const resultsContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: fusion.space3,
};

const summaryBox: React.CSSProperties = {
  padding: 12,
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  borderRadius: 8,
  border: `1px solid ${fusion.border}`,
};

const summaryTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: fusion.text,
  marginBottom: 8,
};

const summaryStats: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-around',
};

const statItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: fusion.textMuted,
};

const statColor: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
};

const riskItemContainer: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.04)',
  borderRadius: 8,
  border: `1px solid ${fusion.border}`,
  overflow: 'hidden',
  cursor: 'pointer',
  transition: fusion.transition,
};

const riskItemHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '10px 12px',
  gap: 8,
};

const riskBadge: React.CSSProperties = {
  padding: '3px 6px',
  borderRadius: 4,
  color: 'white',
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  minWidth: 42,
  textAlign: 'center',
  flexShrink: 0,
};

const riskSummaryText: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: fusion.text,
  margin: 0,
  lineHeight: 1.4,
  minWidth: 0,
};

const arrowStyle = (isExpanded: boolean): React.CSSProperties => ({
  marginLeft: 'auto',
  fontSize: 18,
  transition: 'transform 0.3s ease',
  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
  color: fusion.textMuted,
});

const riskReasonBox: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: fusion.bgInput,
  borderTop: `1px dashed ${fusion.border}`,
};

const riskReasonText: React.CSSProperties = {
  fontSize: 11,
  color: fusion.textMuted,
  margin: 0,
  lineHeight: 1.4,
};