from __future__ import annotations

import os
from flask import Blueprint, jsonify, request

from ..services.remote_inference import RemoteConnector, RemoteInferenceError

interactive_bp = Blueprint("interactive", __name__, url_prefix="/api/interactive")


def _connector(name: str) -> RemoteConnector:
    key = name.upper().replace("-", "_")
    return RemoteConnector(name, os.getenv(f"{key}_URL"), os.getenv(f"{key}_TOKEN"))


@interactive_bp.post("/vtuber")
def vtuber():
    body = request.get_json(silent=True) or {}
    text = str(body.get("text", "")).strip()
    if not text:
        return jsonify(error="text is required"), 400
    connector = _connector("open-llm-vtuber")
    if not connector.configured:
        return jsonify(error="OPEN_LLM_VTUBER_URL is not configured"), 503
    try:
        result = connector.submit({"text": text, "voice": body.get("voice", "default"), "avatar": body.get("avatar")})
        return jsonify(provider=result.provider, result=result.payload)
    except RemoteInferenceError as exc:
        return jsonify(error=str(exc)), 502


@interactive_bp.post("/trading/analyze")
def trading_analyze():
    body = request.get_json(silent=True) or {}
    symbol = str(body.get("symbol", "")).strip()
    if not symbol:
        return jsonify(error="symbol is required"), 400
    connector = _connector("vibe-trading")
    if not connector.configured:
        return jsonify(error="VIBE_TRADING_URL is not configured"), 503
    try:
        result = connector.submit({"symbol": symbol, "timeframe": body.get("timeframe", "1d"), "features": body.get("features", {})})
        return jsonify(provider=result.provider, disclaimer="Not financial advice; verify data and make decisions independently.", result=result.payload)
    except RemoteInferenceError as exc:
        return jsonify(error=str(exc)), 502
