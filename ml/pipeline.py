"""
TF-IDF + Logistic Regression pipeline for T&C page binary classification.

Pipeline: TfidfVectorizer(ngram_range=(1,2)) -> LogisticRegression(L2, class_weight='balanced').
"""
import logging
from pathlib import Path
from typing import Any

import joblib

logger = logging.getLogger("eziterms.ml")

# Default vectorizer and classifier params (per spec)
DEFAULT_TFIDF_KWARGS = {
    "ngram_range": (1, 2),
    "max_features": 50_000,
    "min_df": 2,
    "max_df": 0.95,
    "strip_accents": "unicode",
    "sublinear_tf": True,
}
DEFAULT_CLF_KWARGS = {
    "penalty": "l2",
    "C": 1.0,
    "class_weight": "balanced",
    "max_iter": 1000,
    "random_state": 42,
}


def create_pipeline(
    tfidf_kwargs: dict[str, Any] | None = None,
    clf_kwargs: dict[str, Any] | None = None,
):
    """Build sklearn Pipeline: TfidfVectorizer -> LogisticRegression."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline

    tfidf_kwargs = {**DEFAULT_TFIDF_KWARGS, **(tfidf_kwargs or {})}
    clf_kwargs = {**DEFAULT_CLF_KWARGS, **(clf_kwargs or {})}
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(**tfidf_kwargs)),
            ("clf", LogisticRegression(**clf_kwargs)),
        ]
    )


def train_pipeline(
    pipeline: Any,
    texts: list[str],
    labels: list[int],
) -> Any:
    """Fit the pipeline on (texts, labels). Returns the fitted pipeline."""
    pipeline.fit(texts, labels)
    return pipeline


def evaluate_pipeline(
    pipeline: Any,
    texts: list[str],
    labels: list[int],
) -> dict[str, float]:
    """Compute precision, recall, F1 (macro and binary) and accuracy."""
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

    preds = pipeline.predict(texts)
    return {
        "accuracy": float(accuracy_score(labels, preds)),
        "precision": float(precision_score(labels, preds, zero_division=0)),
        "recall": float(recall_score(labels, preds, zero_division=0)),
        "f1": float(f1_score(labels, preds, zero_division=0)),
        "f1_macro": float(f1_score(labels, preds, average="macro", zero_division=0)),
    }


def top_features(
    pipeline: Any,
    n: int = 20,
    class_index: int = 1,
) -> list[tuple[str, float]]:
    """Return top n features (ngrams) for the positive class (T&C) by coefficient."""
    clf = pipeline.named_steps["clf"]
    vec = pipeline.named_steps["tfidf"]
    if not hasattr(vec, "get_feature_names_out"):
        names = vec.get_feature_names()
    else:
        names = vec.get_feature_names_out()
    coef = clf.coef_[0]
    # Positive class (1) = higher coef => more T&C-like
    indexed = list(zip(names, coef))
    indexed.sort(key=lambda x: -x[1])
    return indexed[:n]


def save_pipeline(pipeline: Any, path: str | Path) -> None:
    """Persist the pipeline to disk with joblib."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, path)
    logger.info("Saved pipeline to %s", path)


def load_pipeline(path: str | Path) -> Any:
    """Load pipeline from disk."""
    return joblib.load(Path(path))


def predict_tc_page(pipeline: Any, text: str) -> bool:
    """Predict whether the given page text is T&C (True) or not (False)."""
    return bool(pipeline.predict([text])[0])


def predict_proba_tc_page(pipeline: Any, text: str) -> float:
    """Return probability of positive class (T&C)."""
    return float(pipeline.predict_proba([text])[0][1])
