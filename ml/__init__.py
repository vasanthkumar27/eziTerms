"""T&C page binary classifier: dataset building and TF-IDF + Logistic Regression pipeline."""
from ml.dataset import build_tc_dataset
from ml.pipeline import create_pipeline, train_pipeline, evaluate_pipeline, save_pipeline, load_pipeline, predict_tc_page

__all__ = [
    "build_tc_dataset",
    "create_pipeline",
    "train_pipeline",
    "evaluate_pipeline",
    "save_pipeline",
    "load_pipeline",
    "predict_tc_page",
]
