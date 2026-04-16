/**
 * Shared message types for extension messaging between popup/side-panel, background, and content script.
 * Use chrome.runtime.sendMessage / chrome.tabs.sendMessage with these payloads.
 */

export type RiskEntry = {
  risktype: 'high' | 'medium' | 'low' | 'none';
  lineSummary: string;
  riskReason: string;
};

/**
 * Consolidated, lenient risk scoring: doesn't over-alarm on a few clauses.
 * Weights: high=55, medium=15, low=0. Normalized to 0–100 (all-high = 100).
 * Same formula as backend so stored and displayed scores match.
 */
const RISK_WEIGHTS = { high: 55, medium: 15, low: 0, none: 0 } as const;
const RISK_MAX_RAW = 55;

export function computeRiskScore(entries: RiskEntry[] | null): number | null {
  if (!entries || entries.length === 0) return null;
  let sum = 0;
  for (const e of entries) {
    sum += RISK_WEIGHTS[e.risktype] ?? 0;
  }
  const rawAvg = sum / entries.length;
  const displayScore = Math.min(100, (rawAvg / RISK_MAX_RAW) * 100);
  return Math.round(Math.max(0, displayScore) * 10) / 10;
}

/** Lenient bands for labels: wider "Low" and "Moderate" so we don’t scare on small issues. */
export function getRiskScoreLabel(score: number): 'Low risk' | 'Moderate' | 'Elevated' | 'High risk' {
  if (score <= 32) return 'Low risk';
  if (score <= 52) return 'Moderate';
  if (score <= 72) return 'Elevated';
  return 'High risk';
}

export function getRiskScoreColor(score: number): { bg: string; border: string; text: string; zone: string } {
  if (score <= 32) return { bg: 'rgba(34, 197, 94, 0.18)', border: 'rgba(34, 197, 94, 0.45)', text: '#4ade80', zone: 'low' };
  if (score <= 52) return { bg: 'rgba(234, 179, 8, 0.18)', border: 'rgba(234, 179, 8, 0.45)', text: '#facc15', zone: 'moderate' };
  if (score <= 72) return { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)', text: '#fbbf24', zone: 'elevated' };
  return { bg: 'rgba(239, 68, 68, 0.18)', border: 'rgba(239, 68, 68, 0.45)', text: '#f87171', zone: 'high' };
}

/** Message sent from popup/side-panel or background to content script when analysis completes */
export type EziTermsAnalysisResultMessage = {
  type: 'EZITERMS_ANALYSIS_RESULT';
  payload: {
    pageUrl: string;
    analysisResult: RiskEntry[];
    termsText: string;
  };
};

/** Message sent from popup/side-panel to request opening the in-page sidebar (optional) */
export type EziTermsOpenSidebarMessage = {
  type: 'EZITERMS_OPEN_SIDEBAR';
};

/** Message sent from side panel to content script: show T&C detected bubble on the page (so user sees it without opening the panel). */
export type EziTermsShowTcBubbleMessage = {
  type: 'EZITERMS_SHOW_TC_BUBBLE';
  payload: { text: string; url: string; probability?: number };
};

export const EZITERMS_OPEN_AND_ANALYZE = 'EZITERMS_OPEN_AND_ANALYZE';
export const EZITERMS_READ_PENDING_ANALYZE = 'EZITERMS_READ_PENDING_ANALYZE';

export type EziTermsContentMessage =
  | EziTermsAnalysisResultMessage
  | EziTermsOpenSidebarMessage
  | EziTermsShowTcBubbleMessage;

export function isEziTermsAnalysisResult(
  msg: unknown
): msg is EziTermsAnalysisResultMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as EziTermsAnalysisResultMessage).type === 'EZITERMS_ANALYSIS_RESULT'
  );
}

export function isEziTermsOpenSidebar(msg: unknown): msg is EziTermsOpenSidebarMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as EziTermsOpenSidebarMessage).type === 'EZITERMS_OPEN_SIDEBAR'
  );
}

export function isEziTermsShowTcBubble(msg: unknown): msg is EziTermsShowTcBubbleMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as EziTermsShowTcBubbleMessage).type === 'EZITERMS_SHOW_TC_BUBBLE' &&
    typeof (msg as EziTermsShowTcBubbleMessage).payload === 'object' &&
    typeof (msg as EziTermsShowTcBubbleMessage).payload?.text === 'string' &&
    typeof (msg as EziTermsShowTcBubbleMessage).payload?.url === 'string'
  );
}
