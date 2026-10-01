"""Small remote connectors for external inference services.

The connectors intentionally do not know model weights or import torch. Each
provider URL is supplied by environment variables and may point to RunPod,
Modal, Replicate, Cloud Run GPU, LibreChat/MCP, or a private gateway.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import requests


@dataclass(frozen=True)
class RemoteResult:
    provider: str
    payload: dict[str, Any]


class RemoteInferenceError(RuntimeError):
    pass


class RemoteConnector:
    def __init__(self, provider: str, endpoint: str | None = None, token: str | None = None, timeout: int = 90):
        self.provider = provider
        self.endpoint = (endpoint or "").strip()
        self.token = (token or "").strip()
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self.endpoint)

    def submit(self, payload: dict[str, Any]) -> RemoteResult:
        if not self.configured:
            raise RemoteInferenceError(f"{self.provider} endpoint is not configured")
        headers = {"content-type": "application/json", "accept": "application/json"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        response = requests.post(self.endpoint, json=payload, headers=headers, timeout=self.timeout)
        if not response.ok:
            raise RemoteInferenceError(f"{self.provider} returned HTTP {response.status_code}: {response.text[:240]}")
        data = response.json() if response.content else {}
        return RemoteResult(self.provider, data if isinstance(data, dict) else {"data": data})


def connector_from_env(name: str, *, timeout: int = 90) -> RemoteConnector:
    key = name.upper().replace("-", "_")
    return RemoteConnector(name, os.getenv(f"{key}_URL"), os.getenv(f"{key}_TOKEN"), timeout)


def configured_connectors(names: list[str]) -> list[RemoteConnector]:
    return [connector_from_env(name) for name in names if connector_from_env(name).configured]


def select_result_url(payload: dict[str, Any]) -> str | None:
    for key in ("url", "output_url", "video_url", "audio_url", "image_url", "result_url"):
        value = payload.get(key)
        if isinstance(value, str) and value.startswith(("https://", "http://")):
            return value
    output = payload.get("output")
    if isinstance(output, str) and output.startswith(("https://", "http://")):
        return output
    if isinstance(output, list):
        for value in output:
            if isinstance(value, str) and value.startswith(("https://", "http://")):
                return value
    return None
