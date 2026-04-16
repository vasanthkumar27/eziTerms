"""AWS Bedrock LLM client for EziTerms (converse API). Uses model/region from env or DB."""
import os
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Default model and region; can be overridden by env BEDROCK_MODEL_ID, AWS_DEFAULT_REGION
_DEFAULT_MODEL_ID = "qwen.qwen3-next-80b-a3b"
_DEFAULT_REGION = "ap-south-1"

_client = None


def _get_client(region_name: Optional[str] = None):
    global _client
    region = region_name or os.getenv("AWS_DEFAULT_REGION") or _DEFAULT_REGION
    if region_name is not None:
        return boto3.client("bedrock-runtime", region_name=region)
    if _client is None:
        _client = boto3.client("bedrock-runtime", region_name=region)
    return _client


def get_model_id() -> str:
    """Model ID for Bedrock (env BEDROCK_MODEL_ID or default)."""
    return os.getenv("BEDROCK_MODEL_ID") or _DEFAULT_MODEL_ID


def get_region() -> str:
    """AWS region for Bedrock (env AWS_DEFAULT_REGION or default)."""
    return os.getenv("AWS_DEFAULT_REGION") or _DEFAULT_REGION


def converse(
    user_content: str,
    *,
    system_prompt: Optional[str] = None,
    model_id: Optional[str] = None,
    region_name: Optional[str] = None,
    max_tokens: int = 1024,
    temperature: float = 0.5,
    top_p: float = 1.0,
) -> str:
    """
    Call Bedrock Converse (non-streaming). Returns the assistant reply as a single string.

    :param user_content: The user message text.
    :param system_prompt: Optional system prompt (inferenceConfig.systemBlock for supported models).
    :param model_id: Override model (default from get_model_id()).
    :param region_name: Override AWS region (default from get_region()).
    :param max_tokens: Max tokens to generate.
    :param temperature: Sampling temperature.
    :param top_p: Top-p sampling.
    :return: Full assistant response text.
    """
    client = _get_client(region_name=region_name)
    mid = model_id or get_model_id()
    messages = [{"role": "user", "content": [{"text": user_content}]}]
    inference_config = {
        "maxTokens": max_tokens,
        "temperature": temperature,
        "topP": top_p,
    }
    kwargs = {
        "modelId": mid,
        "messages": messages,
        "inferenceConfig": inference_config,
    }
    if system_prompt:
        kwargs["system"] = [{"text": system_prompt}]
    try:
        response = client.converse(**kwargs)
    except (BotoCoreError, ClientError) as e:
        raise ValueError(f"Bedrock Converse error: {e}") from e
    output = response.get("output") or {}
    message = output.get("message") or {}
    content_blocks = message.get("content") or []
    parts = []
    for block in content_blocks:
        if "text" in block:
            parts.append(block["text"])
    return "".join(parts)
