/**
 * Scan session = one tab per website URL.
 * Each scan has its own terms, analysis, and chat.
 */

import type { RiskEntry } from './messages';

export type ScanTab = {
  id: string;
  url: string;
  urlDisplay: string;
  termsText: string | null;
  analysisResult: RiskEntry[] | null;
  chatMessages: Array<{ sender: 'user' | 'bot'; text: string }>;
  analysisId?: number;
  createdAt: number;
};

export function urlToDisplay(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname || url;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + '...' : url;
  }
}

export function urlToId(url: string): string {
  return url.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 100);
}
