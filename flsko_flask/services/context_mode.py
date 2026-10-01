from __future__ import annotations

import re
from typing import Any


def compress_messages(messages: list[dict[str, Any]], max_chars: int = 24000) -> list[dict[str, Any]]:
    """Keep system instructions plus the newest useful messages.

    This is deterministic middleware, not model inference. The reduction ratio
    depends on the conversation; never promise a fixed 90% saving.
    """
    if sum(len(str(m.get("content", ""))) for m in messages) <= max_chars:
        return messages
    system = [m for m in messages if m.get("role") == "system"][:2]
    rest = [m for m in messages if m.get("role") != "system"]
    kept: list[dict[str, Any]] = []
    size = sum(len(str(m.get("content", ""))) for m in system)
    for message in reversed(rest):
        content = str(message.get("content", ""))
        if size + len(content) > max_chars:
            break
        kept.append(message)
        size += len(content)
    return system + list(reversed(kept))


def summarize_for_context(text: str, limit: int = 1600) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
