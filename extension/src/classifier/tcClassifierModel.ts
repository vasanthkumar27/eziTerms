/**
 * Exported T&C classifier model (from backend export_tc_classifier_json.py).
 * Loaded once and used for local inference so we don't call the API on every page view.
 */
export type TcClassifierModel = {
  vocabulary: string[];
  idf: number[];
  coef: number[];
  intercept: number;
  ngram_range: [number, number];
  sublinear_tf: boolean;
};
