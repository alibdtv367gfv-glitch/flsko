#!/usr/bin/env python3
"""
Lightweight video adapter for Flsko development.

Without a GPU / heavy weights, returns status=queued with instructions.
If FLSKO_VIDEO_BACKEND=frames is set, builds a short silent MP4 from a
solid-color + text card via ffmpeg (smoke test only — not generative AI).

For real open video: point this service at a Gradio/HF Space client or
install Wan/LTX separately and set BACKEND=external with EXTERNAL_GENERATE_URL.
"""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Flsko Video Adapter", version="1.0.0")
OUT = Path(os.environ.get("OUTPUT_DIR", "/data/output"))
OUT.mkdir(parents=True, exist_ok=True)
BACKEND = os.environ.get("FLSKO_VIDEO_BACKEND", "stub")  # stub | frames | external
EXTERNAL = os.environ.get("EXTERNAL_GENERATE_URL", "").strip()


class Body(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    durationSeconds: float = Field(4, ge=1, le=12)
    resolution: str = "720p"
    model: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "backend": BACKEND, "service": "flsko-video-adapter"}


@app.post("/generate")
def generate(body: Body):
    job = uuid.uuid4().hex[:12]

    if BACKEND == "external" and EXTERNAL:
        import urllib.request
        import json

        req = urllib.request.Request(
            EXTERNAL,
            data=json.dumps(body.model_dump()).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read().decode())

    if BACKEND == "frames":
        # Smoke-test MP4 (not AI) so the mobile app can exercise playback
        path = OUT / f"video-{job}.mp4"
        dur = max(2, int(body.durationSeconds))
        # ffmpeg color source
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x061A33:s=640x360:d={dur}",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={dur}",
            "-c:v",
            "libx264",
            "-tune",
            "stillimage",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=60)
        except Exception as e:
            raise HTTPException(500, f"ffmpeg failed: {e}") from e
        base = os.environ.get("PUBLIC_BASE", "").rstrip("/")
        url = f"{base}/files/{path.name}" if base else f"/files/{path.name}"
        return {
            "url": url,
            "job_id": job,
            "provider": "video-frames-stub",
            "message": "مقطع تجريبي (ليس توليد ذكاء اصطناعي). للإنتاج استخدم Wan/LTX.",
        }

    return {
        "job_id": job,
        "status": "queued",
        "message": (
            "محول الفيديو في وضع stub. للتوليد الحقيقي: ثبّت Wan/LTX على GPU "
            "أو اضبط FLSKO_VIDEO_BACKEND=external و EXTERNAL_GENERATE_URL، "
            "أو FLSKO_VIDEO_BACKEND=frames للاختبار فقط."
        ),
    }


@app.get("/files/{name}")
def files(name: str):
    path = OUT / name
    if not path.is_file() or ".." in name:
        raise HTTPException(404)
    return FileResponse(path, media_type="video/mp4")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8091")))
