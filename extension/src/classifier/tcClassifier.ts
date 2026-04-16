/**
 * Local T&C page classifier: TF-IDF + Logistic Regression using an exported JSON model.
 */

import type { TcClassifierModel } from './tcClassifierModel';

const DEFAULT_MODEL_URL = 'models/tc_page_classifier.json';

let cachedModel: TcClassifierModel | null = null;
let loadPromise: Promise<TcClassifierModel | null> | null = null;

/**
 * Tokenize like sklearn TfidfVectorizer (default token_pattern \b\w\w+\b, lowercase).
 * We use word chars (letters, digits, underscore) and require length >= 2.
 */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = (lower.match(/\b[a-z0-9_]{2,}\b/g) || []) as string[];
  return tokens;
}

/**
 * Build unigrams and bigrams (sklearn ngram_range=(1,2)).
 * Bigrams are space-separated: "word1 word2".
 */
function getNgrams(tokens: string[], ngramRange: [number, number]): string[] {
  const [minN, maxN] = ngramRange;
  const out: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    if (n === 1) {
      out.push(...tokens);
    } else {
      for (let i = 0; i <= tokens.length - n; i++) {
        out.push(tokens.slice(i, i + n).join(' '));
      }
    }
  }
  return out;
}

/**
 * Build term counts for the document (ngrams).
 */
function getTermCounts(ngrams: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of ngrams) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

/**
 * Transform document text to TF-IDF vector (same index order as model.vocabulary).
 * Uses sublinear_tf: tf = 1 + log(tf), then tf * idf, then L2 normalize.
 */
function textToTfIdfVector(text: string, model: TcClassifierModel): number[] {
  const tokens = tokenize(text);
  const ngrams = getNgrams(tokens, model.ngram_range);
  const counts = getTermCounts(ngrams);

  const vec = new Array<number>(model.vocabulary.length);
  for (let i = 0; i < model.vocabulary.length; i++) {
    const term = model.vocabulary[i];
    const count = counts.get(term) ?? 0;
    let tf = 0;
    if (count > 0) {
      tf = model.sublinear_tf ? 1 + Math.log(count) : count;
    }
    vec[i] = tf * model.idf[i];
  }

  // L2 normalize (sklearn default norm='l2')
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-9) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Sigmoid for logistic regression probability.
 */
function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

/**
 * Predict probability that the document is T&C (class 1).
 */
function predictProbability(vec: number[], model: TcClassifierModel): number {
  let dot = model.intercept;
  for (let i = 0; i < model.coef.length; i++) {
    dot += model.coef[i] * vec[i];
  }
  return sigmoid(dot);
}

/**
 * Load the classifier model from the extension's packaged JSON.
 * Uses chrome.runtime.getURL when in extension context; otherwise fetch from same origin.
 */
export async function loadTcClassifier(
  modelUrl: string = DEFAULT_MODEL_URL
): Promise<TcClassifierModel | null> {
  if (cachedModel) return cachedModel;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const url =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL(modelUrl)
          : modelUrl;
      const res = await fetch(url);
      if (!res.ok) return null;
      const model = (await res.json()) as TcClassifierModel;
      if (
        !Array.isArray(model.vocabulary) ||
        !Array.isArray(model.idf) ||
        !Array.isArray(model.coef) ||
        typeof model.intercept !== 'number'
      ) {
        return null;
      }
      cachedModel = model;
      return model;
    } catch {
      return null;
    }
  })();

  return loadPromise;
}

/**
 * Run local classification. Returns null if model not loaded (caller can fall back to API).
 */
export function classifyLocal(
  text: string,
  model: TcClassifierModel | null
): { is_tc_page: boolean; probability: number } | null {
  if (!model) return null;
  const trimmed = (text || '').slice(0, 5000).trim();
  if (trimmed.length < 50) return { is_tc_page: false, probability: 0 };

  const vec = textToTfIdfVector(trimmed, model);
  const prob = predictProbability(vec, model);
  return {
    is_tc_page: prob >= 0.5,
    probability: Math.round(prob * 10000) / 10000,
  };
}

/**
 * One-shot: load model (if needed) and classify. Prefer this in the extension
 * so classification runs locally and only the heavy "analyze" step hits the API.
 */
export async function classifyPageLocal(text: string): Promise<{
  is_tc_page: boolean;
  probability: number;
} | null> {
  const model = await loadTcClassifier();
  return classifyLocal(text, model);
}
