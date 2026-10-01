from __future__ import annotations

import os
from flask import Blueprint, jsonify, request

from ..services.context_mode import compress_messages
from ..services.remote_inference import RemoteConnector, RemoteInferenceError

chat_agent_bp = Blueprint("chat_agent", __name__, url_prefix="/api/chat")


def _connector() -> RemoteConnector:
    # LibreChat/MCP can be a private gateway that exposes one stable JSON contract.
    return RemoteConnector("librechat-mcp", os.getenv("LIBRECHAT_URL") or os.getenv("MCP_GATEWAY_URL"), os.getenv("LIBRECHAT_TOKEN") or os.getenv("MCP_GATEWAY_TOKEN"))


@chat_agent_bp.post("")
def chat():
    body = request.get_json(silent=True) or {}
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        message = str(body.get("message", "")).strip()
        messages = [{"role": "user", "content": message}] if message else []
    if not messages:
        return jsonify(error="message or messages is required"), 400
    compacted = compress_messages(messages, max_chars=int(body.get("max_context_chars", 24000)))
    connector = _connector()
    if not connector.configured:
        return jsonify(error="LIBRECHAT_URL or MCP_GATEWAY_URL is not configured"), 503
    try:
        result = connector.submit({"messages": compacted, "mode": body.get("mode", "natural"), "stream": False})
        return jsonify(provider=result.provider, context_messages=len(compacted), result=result.payload)
    except RemoteInferenceError as exc:
        return jsonify(error=str(exc)), 502


@chat_agent_bp.get("/health")
def chat_health():
    return jsonify({"librechat_configured": _connector().configured, "context_mode": "deterministic-recent-message compression"})
