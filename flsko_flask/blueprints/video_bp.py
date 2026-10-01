from __future__ import annotations

import os
from flask import Blueprint, jsonify, request
import requests

from ..services.gcs_service import GCSManager
from ..services.remote_inference import RemoteInferenceError, RemoteConnector, select_result_url

video_bp = Blueprint("video", __name__, url_prefix="/api/video")


def _providers() -> dict[str, RemoteConnector]:
    return {
        "skyreels": RemoteConnector("skyreels", os.getenv("SKYREELS_URL"), os.getenv("SKYREELS_TOKEN")),
        "allegro": RemoteConnector("allegro", os.getenv("ALLEGRO_URL"), os.getenv("ALLEGRO_TOKEN")),
        "cosmos": RemoteConnector("cosmos", os.getenv("COSMOS_URL"), os.getenv("COSMOS_TOKEN")),
        "open-generative-ai": RemoteConnector("open-generative-ai", os.getenv("OPEN_GENERATIVE_AI_URL"), os.getenv("OPEN_GENERATIVE_AI_TOKEN")),
    }


@video_bp.post("/generate")
def generate_video():
    body = request.get_json(silent=True) or {}
    prompt = str(body.get("prompt", "")).strip()
    provider_name = str(body.get("provider", "allegro")).lower()
    if not prompt or len(prompt) > 4000:
        return jsonify(error="prompt is required and must be <= 4000 chars"), 400
    provider = _providers().get(provider_name)
    if not provider or not provider.configured:
        return jsonify(error=f"provider '{provider_name}' is not configured", configured=[p for p, c in _providers().items() if c.configured]), 503
    try:
        result = provider.submit({"prompt": prompt, "kind": "video", "options": body.get("options", {})})
        result_url = select_result_url(result.payload)
        response = {"provider": result.provider, "job": result.payload}
        # Async providers return a job id. Upload only when a completed URL exists.
        if result_url:
            with requests.get(result_url, stream=True, timeout=180) as remote:
                remote.raise_for_status()
                gcs = GCSManager()
                response["media"] = gcs.upload_remote(remote, filename="video.mp4", content_type="video/mp4", prefix="videos")
        return jsonify(response), 202 if not result_url else 200
    except (RemoteInferenceError, requests.RequestException) as exc:
        return jsonify(error=str(exc), provider=provider_name), 502


@video_bp.get("/providers")
def video_providers():
    return jsonify({name: connector.configured for name, connector in _providers().items()})
