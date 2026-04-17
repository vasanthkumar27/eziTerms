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
export function getRiskScoreLabel(score: number): 'Low risk' | 'Moderate' | 'High risk' {
  if (score <= 32) return 'Low risk';
  if (score <= 72) return 'Moderate';
  return 'High risk';
}

export function getRiskScoreColor(score: number): { bg: string; border: string; text: string; zone: string } {
  // Unified with the chip palette — 3 hues (green / yellow / red) across all bands.
  if (score <= 32) return { bg: 'rgba(34, 197, 94, 0.10)',  border: 'rgba(34, 197, 94, 0.35)',  text: '#4ade80', zone: 'low' };
  if (score <= 72) return { bg: 'rgba(234, 179, 8, 0.10)',  border: 'rgba(234, 179, 8, 0.35)',  text: '#fbbf24', zone: 'moderate' };
  return { bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.35)', text: '#f87171', zone: 'high' };
}

/** Message sent from popup/side-panel or background to content script when analysis completes */
export type DistilAnalysisResultMessage = {
  type: 'DISTIL_ANALYSIS_RESULT';
  payload: {
    pageUrl: string;
    analysisResult: RiskEntry[];
    termsText: string;
  };
};

/** Message sent from popup/side-panel to request opening the in-page sidebar (optional) */
export type DistilOpenSidebarMessage = {
  type: 'DISTIL_OPEN_SIDEBAR';
};

/** Message sent from side panel to content script: show T&C detected bubble on the page (so user sees it without opening the panel). */
export type DistilShowTcBubbleMessage = {
  type: 'DISTIL_SHOW_TC_BUBBLE';
  payload: { text: string; url: string; probability?: number };
};

export const DISTIL_OPEN_AND_ANALYZE = 'DISTIL_OPEN_AND_ANALYZE';
export const DISTIL_READ_PENDING_ANALYZE = 'DISTIL_READ_PENDING_ANALYZE';

export type DistilContentMessage =
  | DistilAnalysisResultMessage
  | DistilOpenSidebarMessage
  | DistilShowTcBubbleMessage;

export function isDistilAnalysisResult(
  msg: unknown
): msg is DistilAnalysisResultMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as DistilAnalysisResultMessage).type === 'DISTIL_ANALYSIS_RESULT'
  );
}

export function isDistilOpenSidebar(msg: unknown): msg is DistilOpenSidebarMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as DistilOpenSidebarMessage).type === 'DISTIL_OPEN_SIDEBAR'
  );
}

export function isDistilShowTcBubble(msg: unknown): msg is DistilShowTcBubbleMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as DistilShowTcBubbleMessage).type === 'DISTIL_SHOW_TC_BUBBLE' &&
    typeof (msg as DistilShowTcBubbleMessage).payload === 'object' &&
    typeof (msg as DistilShowTcBubbleMessage).payload?.text === 'string' &&
    typeof (msg as DistilShowTcBubbleMessage).payload?.url === 'string'
  );
}
