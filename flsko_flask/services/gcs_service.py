"""Streaming Google Cloud Storage manager.

This module never writes media to the local filesystem. Credentials are read from
GCP_CREDENTIALS_JSON (JSON/base64) or GOOGLE_APPLICATION_CREDENTIALS.
"""
from __future__ import annotations

import base64
import json
import os
import re
from datetime import timedelta
from typing import BinaryIO, Iterable
from uuid import uuid4

from google.cloud import storage
from google.oauth2 import service_account


class GCSConfigurationError(RuntimeError):
    pass


class GCSManager:
    """Upload remote/local file-like streams directly to GCS."""

    def __init__(self, bucket_name: str | None = None, credentials_json: str | None = None):
        self.bucket_name = bucket_name or os.getenv("GCP_BUCKET_NAME", "").strip()
        if not self.bucket_name:
            raise GCSConfigurationError("GCP_BUCKET_NAME is required")
        self.client = self._build_client(credentials_json or os.getenv("GCP_CREDENTIALS_JSON", ""))
        self.bucket = self.client.bucket(self.bucket_name)
        self.url_ttl_seconds = int(os.getenv("GCS_SIGNED_URL_TTL_SECONDS", "900"))

    @staticmethod
    def _build_client(credentials_json: str) -> storage.Client:
        # Prefer inline JSON/base64 for container platforms; never persist it.
        if credentials_json:
            try:
                raw = credentials_json
                if not raw.lstrip().startswith("{"):
                    raw = base64.b64decode(raw).decode("utf-8")
                info = json.loads(raw)
                credentials = service_account.Credentials.from_service_account_info(info)
                return storage.Client(project=info.get("project_id"), credentials=credentials)
            except (ValueError, json.JSONDecodeError, base64.binascii.Error) as exc:
                raise GCSConfigurationError("GCP_CREDENTIALS_JSON must be valid JSON or base64 JSON") from exc
        # Uses GOOGLE_APPLICATION_CREDENTIALS or the platform default identity.
        return storage.Client()

    @staticmethod
    def _safe_object_name(prefix: str, filename: str, content_type: str) -> str:
        clean_prefix = re.sub(r"[^a-zA-Z0-9/_-]+", "-", prefix.strip("/")) or "media"
        extension = {"image/jpeg": "jpg", "image/png": "png", "audio/mpeg": "mp3", "audio/wav": "wav", "video/mp4": "mp4"}.get(content_type, "bin")
        clean_name = re.sub(r"[^a-zA-Z0-9._-]+", "-", filename or "output")[:100]
        if "." not in clean_name:
            clean_name = f"{clean_name}.{extension}"
        return f"{clean_prefix}/{uuid4().hex}-{clean_name}"

    def upload_stream(self, stream: BinaryIO | Iterable[bytes], *, filename: str, content_type: str, prefix: str = "generated") -> dict[str, str]:
        object_name = self._safe_object_name(prefix, filename, content_type)
        blob = self.bucket.blob(object_name)
        blob.upload_from_file(stream, content_type=content_type, rewind=False)
        return {"object_name": object_name, "url": self.signed_url(object_name), "content_type": content_type}

    def upload_bytes(self, data: bytes, *, filename: str, content_type: str, prefix: str = "generated") -> dict[str, str]:
        # Intended only for small provider responses; large media should use upload_stream.
        from io import BytesIO
        return self.upload_stream(BytesIO(data), filename=filename, content_type=content_type, prefix=prefix)

    def upload_remote(self, response, *, filename: str, content_type: str, prefix: str = "generated") -> dict[str, str]:
        """Upload a requests/HTTPX response body without creating a temp file."""
        response.raise_for_status()
        raw = getattr(response, "raw", None)
        if raw is None:
            raise TypeError("response must expose a streaming .raw file object")
        return self.upload_stream(raw, filename=filename, content_type=content_type, prefix=prefix)

    def signed_url(self, object_name: str, ttl_seconds: int | None = None) -> str:
        blob = self.bucket.blob(object_name)
        return blob.generate_signed_url(version="v4", expiration=timedelta(seconds=ttl_seconds or self.url_ttl_seconds), method="GET")

    def delete(self, object_name: str) -> None:
        self.bucket.blob(object_name).delete()
