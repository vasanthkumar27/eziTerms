import traceback
from typing import Optional

from services.bedrock_llm import converse
from services.prompts import CHATBOT_PROMPT


def chatbot(
    message: str,
    terms_text: str,
    *,
    model_id: Optional[str] = None,
    region_name: Optional[str] = None,
) -> dict:
    prompt = CHATBOT_PROMPT.format(message=message, terms_text=terms_text)
    try:
        response_text = converse(
            prompt,
            model_id=model_id,
            region_name=region_name,
            max_tokens=1024,
            temperature=0.7,
            top_p=1.0,
        )
    except Exception:
        print(traceback.format_exc())
        raise ValueError("Error while calling Bedrock LLM")
    return {"response": response_text}
