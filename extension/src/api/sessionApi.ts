/**
 * Session/scan APIs - extension-activity, document-analysis, subscriptions.
 * Uses existing backend APIs without modification.
 */

import API_ENDPOINTS from '../masterconstans/MasterConstants';
import { getAccessToken, getRefreshToken, setTokens } from '../utils/tokenStore';
import { getUserIdFromToken } from '../utils/jwtHelper';
import type { RiskEntry } from '../types/messages';
import { computeRiskScore } from '../types/messages';

const BASE = API_ENDPOINTS.AWS_BASE_API_URL;

export async function logExtensionActivity(
  _pageUrl: string,
  _actionTaken: string,
  _detectedTc?: boolean
): Promise<void> {
  // no-op — activity tracking removed
}

export async function saveDocumentAnalysis(
  _documentUrl: string,
  _summary: string,
  _analysisType: string = 'terms',
  _riskScore: number | null = null
): Promise<number | null> {
  return null;
}

const STORAGE_KEY = 'distil_scan_tabs';

type ScanTab = {
  id: string;
  url: string;
  termsText: string | null;
  analysisResult: RiskEntry[] | null;
  analysisId?: number;
};

export async function hasUnsavedResults(useSessionStorage: boolean): Promise<boolean> {
  try {
    const s = useSessionStorage ? chrome.storage.session : chrome.storage.local;
    const stored = await s.get([STORAGE_KEY]);
    const tabs: ScanTab[] = stored[STORAGE_KEY] ?? [];
    return tabs.some(
      (t) =>
        t.analysisResult &&
        t.analysisResult.length > 0 &&
        (t.termsText || t.url)
    );
  } catch {
    return false;
  }
}

export async function saveScanTabsToBackend(
  useSessionStorage: boolean
): Promise<{ saved: number }> {
  const token = await getAccessToken();
  if (!token) return { saved: 0 };
  try {
    const s = useSessionStorage ? chrome.storage.session : chrome.storage.local;
    const stored = await s.get([STORAGE_KEY]);
    const tabs: ScanTab[] = stored[STORAGE_KEY] ?? [];
    let saved = 0;
    for (const t of tabs) {
      if (!t.analysisResult || t.analysisResult.length === 0) continue;
      const summary = JSON.stringify(t.analysisResult);
      const riskScore = computeRiskScore(t.analysisResult);
      const url = t.url || `upload:${t.id}`;
      const analysisType = t.url?.startsWith('upload:') ? 'upload' : 'terms';
      const id = await saveDocumentAnalysis(url, summary, analysisType, riskScore);
      if (id != null) saved++;
    }
    return { saved };
  } catch {
    return { saved: 0 };
  }
}

export type DocumentAnalysisItem = {
  analysis_id: number;
  document_url: string | null;
  document_name: string | null;
  summary: string | null;
  analysis_type: string | null;
  created_at: string;
};

export async function fetchDocumentAnalyses(): Promise<DocumentAnalysisItem[]> {
  return [];
}

export async function deleteDocumentAnalysis(_analysisId: number): Promise<boolean> {
  return true;
}

export async function logoutBackend(): Promise<void> {
  const [access, refresh] = await Promise.all([getAccessToken(), getRefreshToken()]);
  if (!access && !refresh) return;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (access) headers['Authorization'] = `Bearer ${access}`;
    await fetch(BASE + API_ENDPOINTS.LOGOUT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refresh: refresh || undefined }),
    });
  } catch {
    // ignore - will clear local tokens anyway
  }
}

export type ClassifyPageResult = { is_tc_page: boolean; probability: number };

/** Same as ClassifyPageResult; when from classifyPageForUi, source tells you if local model or API was used. */
export type ClassifyPageResultWithSource = ClassifyPageResult & { source?: 'local' | 'api' };

/** Prefer local classifier; fall back to API if model not loaded. */
export async function classifyPageForUi(text: string): Promise<ClassifyPageResultWithSource | null> {
  const { classifyPageLocal } = await import('../classifier/tcClassifier');
  const local = await classifyPageLocal(text);
  if (local != null) return { ...local, source: 'local' };
  const apiResult = await classifyPage(text);
  if (apiResult) return { ...apiResult, source: 'api' };
  return null;
}

export async function classifyPage(text: string): Promise<ClassifyPageResult | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const snippet = text.slice(0, 5000).trim();
    if (!snippet) return null;
    const resp = await fetch(BASE + API_ENDPOINTS.CLASSIFY_PAGE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: snippet }),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

/** All features are free — no premium gating. */
export async function hasPremiumSubscription(): Promise<boolean> {
  return true;
}

export async function hasFeature(_featureKey: string): Promise<boolean> {
  return true;
}

export function clearEntitlementCache(): void {
  // no-op — no caches to clear
}
