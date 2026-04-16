"""
T&C page classifier service: load trained pipeline and predict whether page text is T&C.

Model is loaded lazily from path set in env TC_CLASSIFIER_MODEL_PATH or default models/tc_page_classifier.joblib.
"""
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("eziterms")

# Default path relative to project root
_DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "tc_page_classifier.joblib"
_pipeline: Any = None


def _model_path() -> Path:
    import os
    p = os.environ.get("TC_CLASSIFIER_MODEL_PATH")
    if p:
        return Path(p)
    return _DEFAULT_MODEL_PATH


def _get_pipeline() -> Any:
    """Load pipeline once and cache."""
    global _pipeline
    if _pipeline is None:
        from ml.pipeline import load_pipeline
        path = _model_path()
        if not path.is_file():
            raise FileNotFoundError(
                f"T&C classifier model not found at {path}. Run: python -m scripts.train_tc_classifier"
            )
        _pipeline = load_pipeline(path)
        logger.info("Loaded T&C page classifier from %s", path)
    return _pipeline


def is_tc_page(text: str) -> bool:
    """
    Predict whether the given page text is a Terms & Conditions page.
    Returns True if T&C, False otherwise.
    """
    if not (text or "").strip():
        return False
    pipeline = _get_pipeline()
    from ml.pipeline import predict_tc_page
    return predict_tc_page(pipeline, text)


def tc_page_probability(text: str) -> float:
    """Return probability that the page is T&C (0.0 to 1.0)."""
    if not (text or "").strip():
        return 0.0
    pipeline = _get_pipeline()
    from ml.pipeline import predict_proba_tc_page
    return predict_proba_tc_page(pipeline, text)
