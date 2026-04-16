"""Terms API request bodies."""
from typing import Any, Optional

from pydantic import BaseModel, model_validator


class AnalyzeTermsBody(BaseModel):
    terms: str
    document_url: Optional[str] = None


class ClassifyPageBody(BaseModel):
    """Page text to classify as T&C or not."""
    text: str


class ChatbotBody(BaseModel):
    message: str
    terms_text: str = ""  # Backend also accepts 'context' (mapped here) for backwards compatibility
    scan_results: list[dict[str, Any]] | None = None

    @model_validator(mode="before")
    @classmethod
    def context_to_terms_text(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "terms_text" not in data and "context" in data:
                data = {**data, "terms_text": data["context"]}
            if "scan_results" not in data and "analysis_results" in data:
                data = {**data, "scan_results": data["analysis_results"]}
        return data


class MaskingPreviewTextBody(BaseModel):
    """Paste or pass text already extracted (no file upload)."""

    terms_text: str
