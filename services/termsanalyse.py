import json
import re
import traceback
from typing import Optional

from services.bedrock_llm import converse
from services.prompts import TERMS_ANALYZE_PROMPT


def analyze_terms(
    terms_text: str,
    *,
    model_id: Optional[str] = None,
    region_name: Optional[str] = None,
):
    try:
        raw_content = converse(
            TERMS_ANALYZE_PROMPT.format(terms_text=terms_text),
            model_id=model_id,
            region_name=region_name,
            max_tokens=1024,
            temperature=0.5,
            top_p=1.0,
        )
    except Exception:
        print(traceback.format_exc())
        raise ValueError("Error while calling Bedrock LLM")
    json_match = re.search(r"\[.*\]", raw_content, re.DOTALL)
    if not json_match:
        raise ValueError("No JSON array found in LLM response.")
    return json.loads(json_match.group())
