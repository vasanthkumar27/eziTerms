"""PII masking with Microsoft Presidio (analyzer + anonymizer). Lazy-loaded."""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

logger = logging.getLogger("eziterms")

MASKING_NOTICE = (
    "This text was extracted (OCR if needed) and masked for PII. "
    "If you continue, this masked version—not the original—will be sent to the LLM."
)


@lru_cache(maxsize=1)
def _engines() -> tuple[Any, Any]:
    try:
        from presidio_analyzer import AnalyzerEngine
        from presidio_anonymizer import AnonymizerEngine
    except ImportError as e:
        raise RuntimeError(
            "Presidio is not installed. Run: pip install presidio-analyzer presidio-anonymizer "
            "and: python -m spacy download en_core_web_sm"
        ) from e
    # Presidio may call spacy.cli.download(); on failure spaCy does sys.exit(1) → kills the worker / no HTTP response.
    try:
        return AnalyzerEngine(), AnonymizerEngine()
    except SystemExit as e:
        raise RuntimeError(
            "spaCy model for Presidio is missing or failed to install. On the server run: "
            "uv run python -m spacy download en_core_web_sm"
        ) from e
    except Exception as e:
        logger.exception("Presidio engine init failed: %s", e)
        raise RuntimeError(
            "PII masking engine failed to start. Install: uv run python -m spacy download en_core_web_sm"
        ) from e


def mask_pii(text: str, *, language: str = "en") -> dict[str, Any]:
    """
    Detect PII and return anonymized text plus entity metadata for the UI.

    Returns:
        masked_text: str
        entity_types: list of distinct entity type names (e.g. PERSON, EMAIL_ADDRESS)
        entity_count: number of analyzer hits
    """
    if not text or not text.strip():
        return {
            "masked_text": "",
            "entity_types": [],
            "entity_count": 0,
        }
    analyzer, anonymizer = _engines()
    results = analyzer.analyze(text=text, language=language)
    out = anonymizer.anonymize(text=text, analyzer_results=results)
    types: list[str] = []
    seen: set[str] = set()
    for r in results:
        if r.entity_type not in seen:
            seen.add(r.entity_type)
            types.append(r.entity_type)
    return {
        "masked_text": out.text,
        "entity_types": types,
        "entity_count": len(results),
    }
