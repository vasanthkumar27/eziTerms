"""
Build T&C (Terms & Conditions) binary classification dataset.

Positive class:
  - Hugging Face: CodeHima/TOS_Dataset, CodeHima/TOS_DatasetV3 (sentences → aggregated docs)
  - Zenodo: ToS;DR clean policies (clean_tosdr_all_data.csv, point_quote_text)
  - Mendeley: Annotated ToS of 100 Platforms – "Clear ToS" folder (full documents; local path)
Negative class: General web text from Hugging Face (Wikitext).
"""
import csv
import io
import logging
import random
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger("eziterms.ml")

# Positive-class Hugging Face datasets (sentence column = ToS text)
TOS_HF_DATASETS = [
    "CodeHima/TOS_DatasetV3",  # ~10k sentences
    "CodeHima/TOS_Dataset",    # ~6.8k sentences
]

# Zenodo ToS;DR clean policies (https://zenodo.org/records/15013541)
ZENODO_TOSDR_RECORD_ID = "15013541"
ZENODO_TOSDR_CSV_KEY = "clean_tosdr_all_data.csv"

# Mendeley: Annotated ToS of 100 Online Platforms (https://data.mendeley.com/datasets/dtbj87j937/3)
# Use local path to extracted "Clear ToS" folder; no public bulk-download API.
MENDELEY_CLEAR_TOS_ENV = "MENDELEY_CLEAR_TOS_PATH"

# Negative-class: Wikitext raw (paragraphs/lines of general text)
NEGATIVE_HF_DATASET = "wikitext"
NEGATIVE_HF_CONFIG = "wikitext-2-raw-v1"

# Document construction
MIN_SENTENCES_PER_DOC = 10
MAX_SENTENCES_PER_DOC = 50
RANDOM_SEED = 42


def _get_sentences_from_tosdr_zenodo(
    record_id: str = ZENODO_TOSDR_RECORD_ID,
    csv_key: str = ZENODO_TOSDR_CSV_KEY,
    text_column: str = "point_quote_text",
    timeout: int = 120,
) -> list[str]:
    """
    Load ToS snippets from Zenodo ToS;DR clean dataset (CSV).
    https://zenodo.org/records/15013541 – column point_quote_text.
    """
    api_url = f"https://zenodo.org/api/records/{record_id}"
    r = requests.get(api_url, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    files = data.get("files") or []
    if not isinstance(files, list):
        files = list(files.values()) if isinstance(files, dict) else []
    download_url = None
    for f in files:
        key = f.get("key") or f.get("filename") or ""
        if csv_key in key or key == csv_key:
            links = f.get("links") or {}
            download_url = links.get("content") or links.get("self") or links.get("download")
            break
    if not download_url:
        download_url = f"https://zenodo.org/records/{record_id}/files/{csv_key}?download=1"
    r2 = requests.get(download_url, timeout=timeout)
    r2.raise_for_status()
    reader = csv.DictReader(io.StringIO(r2.text))
    sentences: list[str] = []
    for row in reader:
        text = (row.get(text_column) or "").strip()
        if text:
            sentences.append(text)
    return sentences


def _get_documents_from_mendeley_clear_tos(local_path: str | Path) -> list[str]:
    """
    Load full ToS documents from local "Clear ToS" folder of Mendeley dataset.
    Dataset: Annotated Terms of Service of 100 Online Platforms
    https://data.mendeley.com/datasets/dtbj87j937/3
    Place the extracted folder and set MENDELEY_CLEAR_TOS_PATH or pass path.
    """
    path = Path(local_path)
    if not path.is_dir():
        raise FileNotFoundError(f"Mendeley Clear ToS path is not a directory: {path}")
    docs: list[str] = []
    for ext in ("*.txt", "*.text", "*.md", "*.html", "*.htm"):
        for f in path.rglob(ext):
            try:
                raw = f.read_text(encoding="utf-8", errors="replace")
                text = raw.strip()
                if len(text) > 100:
                    docs.append(text)
            except Exception as e:
                logger.debug("Skip %s: %s", f, e)
    if not docs:
        try:
            entries = list(path.iterdir())[:25]
            logger.warning("No .txt/.html/.md documents in %s. First entries: %s", path, [str(p.name) for p in entries])
        except Exception:
            logger.warning("No documents read from %s. Ensure it contains .txt, .html, or .md files.", path)
    return docs


def _get_sentences_from_tos_hf(dataset_name: str) -> list[str]:
    """Load ToS sentences from a Hugging Face dataset. Returns list of sentence strings."""
    try:
        from datasets import load_dataset
    except ImportError:
        raise ImportError("Install 'datasets' (pip install datasets) to build the T&C dataset.")
    ds = load_dataset(dataset_name, trust_remote_code=True)
    sentences: list[str] = []
    for split in ("train", "validation", "test"):
        if split not in ds:
            continue
        for row in ds[split]:
            text = row.get("sentence") or row.get("text") or ""
            if isinstance(text, str) and text.strip():
                sentences.append(text.strip())
    return sentences


def _aggregate_sentences_into_documents(
    sentences: list[str],
    min_per_doc: int = MIN_SENTENCES_PER_DOC,
    max_per_doc: int = MAX_SENTENCES_PER_DOC,
    seed: int = RANDOM_SEED,
) -> list[str]:
    """Group sentences into page-like documents of 10--50 sentences each."""
    rng = random.Random(seed)
    docs: list[str] = []
    shuffled = sentences.copy()
    rng.shuffle(shuffled)
    i = 0
    while i < len(shuffled):
        remaining = len(shuffled) - i
        if remaining < min_per_doc:
            # Take the rest as one document if any
            if remaining > 0:
                chunk = shuffled[i:]
                doc_text = " ".join(chunk)
                if doc_text.strip():
                    docs.append(doc_text)
            break
        high = min(max_per_doc, remaining)
        n = rng.randint(min_per_doc, high)
        chunk = shuffled[i : i + n]
        i += n
        doc_text = " ".join(chunk)
        if doc_text.strip():
            docs.append(doc_text)
    return docs


def _get_negative_documents_from_wikitext(
    target_count: int,
    min_chars: int = 500,
    max_chars: int = 15000,
    seed: int = RANDOM_SEED,
) -> list[str]:
    """Build negative-class documents from Wikitext by concatenating lines into chunks."""
    try:
        from datasets import load_dataset
    except ImportError:
        raise ImportError("Install 'datasets' to build the T&C dataset.")
    ds = load_dataset(NEGATIVE_HF_DATASET, NEGATIVE_HF_CONFIG, split="train", trust_remote_code=True)
    # Wikitext-2-raw: 'text' column has one line per row; empty lines separate articles
    lines: list[str] = []
    for row in ds:
        line = (row.get("text") or "").strip()
        if line:
            lines.append(line)
    rng = random.Random(seed)
    rng.shuffle(lines)
    docs: list[str] = []
    current: list[str] = []
    current_len = 0
    for line in lines:
        current.append(line)
        current_len += len(line) + 1
        if current_len >= min_chars:
            doc = " ".join(current)
            if min_chars <= len(doc) <= max_chars or len(doc) >= min_chars:
                docs.append(doc)
                if len(docs) >= target_count:
                    break
            current = []
            current_len = 0
    return docs[:target_count]


def load_positive_documents(
    datasets: list[str] | None = None,
    min_per_doc: int = MIN_SENTENCES_PER_DOC,
    max_per_doc: int = MAX_SENTENCES_PER_DOC,
    max_documents: int | None = 5000,
    seed: int = RANDOM_SEED,
    *,
    use_zenodo_tosdr: bool = True,
    zenodo_record_id: str = ZENODO_TOSDR_RECORD_ID,
    mendeley_clear_tos_path: str | Path | None = None,
) -> list[str]:
    """
    Load positive-class (T&C) documents from:
    - Hugging Face ToS sentence datasets (aggregated into page-like docs)
    - Zenodo ToS;DR clean policies CSV (point_quote_text → aggregated docs)
    - Optional: Mendeley "Clear ToS" folder (full documents; local path or env MENDELEY_CLEAR_TOS_PATH)
    Returns up to max_documents page-like documents.
    """
    import os

    datasets = datasets or TOS_HF_DATASETS
    all_sentences: list[str] = []
    for name in datasets:
        try:
            s = _get_sentences_from_tos_hf(name)
            all_sentences.extend(s)
            logger.info("Loaded %s sentences from %s", len(s), name)
        except Exception as e:
            logger.warning("Skipping dataset %s: %s", name, e)

    if use_zenodo_tosdr:
        try:
            s = _get_sentences_from_tosdr_zenodo(record_id=zenodo_record_id)
            all_sentences.extend(s)
            logger.info("Loaded %s sentences from Zenodo ToS;DR (record %s)", len(s), zenodo_record_id)
        except Exception as e:
            logger.warning("Skipping Zenodo ToS;DR: %s", e)

    mendeley_path = mendeley_clear_tos_path or os.environ.get(MENDELEY_CLEAR_TOS_ENV)
    full_docs: list[str] = []
    if mendeley_path:
        try:
            full_docs = _get_documents_from_mendeley_clear_tos(mendeley_path)
            logger.info("Loaded %s full ToS documents from Mendeley Clear ToS: %s", len(full_docs), mendeley_path)
        except Exception as e:
            logger.warning("Skipping Mendeley Clear ToS: %s", e)

    if not all_sentences and not full_docs:
        raise ValueError("No positive data loaded from any source (HF, Zenodo, or Mendeley).")
    docs = _aggregate_sentences_into_documents(all_sentences, min_per_doc, max_per_doc, seed) if all_sentences else []
    docs = docs + full_docs
    if max_documents is not None and len(docs) > max_documents:
        rng = random.Random(seed)
        docs = rng.sample(docs, max_documents)
    return docs


def load_negative_documents(
    target_count: int = 5000,
    source: str = "wikitext",
    seed: int = RANDOM_SEED,
) -> list[str]:
    """
    Load negative-class (not T&C) documents from general web text.
    source='wikitext' uses Wikitext-2-raw.
    """
    if source == "wikitext":
        return _get_negative_documents_from_wikitext(target_count, seed=seed)
    raise ValueError(f"Unsupported negative source: {source}. Use 'wikitext'.")


def build_tc_dataset(
    positive_datasets: list[str] | None = None,
    negative_source: str = "wikitext",
    max_positive: int | None = 5000,
    max_negative: int | None = 5000,
    balance: bool = True,
    seed: int = RANDOM_SEED,
    *,
    use_zenodo_tosdr: bool = True,
    mendeley_clear_tos_path: str | Path | None = None,
) -> tuple[list[str], list[int]]:
    """
    Build a binary T&C classification dataset.

    Returns:
        texts: list of document strings (page-like)
        labels: list of int (1 = T&C, 0 = not T&C)

    If balance=True, the smaller class is upsampled or the larger downsampled
    so both classes have the same count.
    """
    pos_docs = load_positive_documents(
        datasets=positive_datasets,
        max_documents=max_positive,
        seed=seed,
        use_zenodo_tosdr=use_zenodo_tosdr,
        mendeley_clear_tos_path=mendeley_clear_tos_path,
    )
    n_pos = len(pos_docs)
    n_neg_target = max_negative if max_negative is not None else n_pos
    neg_docs = load_negative_documents(target_count=n_neg_target, source=negative_source, seed=seed)
    n_neg = len(neg_docs)

    if balance:
        n = min(n_pos, n_neg)
        rng = random.Random(seed)
        if n_pos > n:
            pos_docs = rng.sample(pos_docs, n)
        if n_neg > n:
            neg_docs = rng.sample(neg_docs, n)

    texts = pos_docs + neg_docs
    labels = [1] * len(pos_docs) + [0] * len(neg_docs)
    # Shuffle
    combined = list(zip(texts, labels))
    random.Random(seed).shuffle(combined)
    texts, labels = [list(x) for x in zip(*combined)]
    logger.info("Dataset built: %d positive, %d negative, total %d", len(pos_docs), len(neg_docs), len(texts))
    return texts, labels
