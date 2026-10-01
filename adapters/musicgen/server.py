#!/usr/bin/env python3
"""
Minimal open MusicGen HTTP adapter for Flsko.
POST /generate  { "prompt": "...", "durationSeconds": 15, "instrumental": true }
→ { "url": "http://host/files/xxx.wav", "job_id": "..." } or base64 audio_url data URI

CPU-friendly default: facebook/musicgen-small
GPU: set MUSICGEN_MODEL=facebook/musicgen-medium and deploy with CUDA image.
"""

from __future__ import annotations

import io
import os
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Flsko MusicGen Adapter", version="1.0.0")
OUT = Path(os.environ.get("OUTPUT_DIR", "/data/output"))
OUT.mkdir(parents=True, exist_ok=True)

MODEL_ID = os.environ.get("MUSICGEN_MODEL", "facebook/musicgen-small")
_model = None
_processor = None


class GenerateBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    durationSeconds: float = Field(12, ge=2, le=30)
    instrumental: bool = True


def load_model():
    global _model, _processor
    if _model is not None:
        return
    import torch
    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    print(f"[musicgen] loading {MODEL_ID} ...")
    _processor = AutoProcessor.from_pretrained(MODEL_ID)
    _model = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID)
    if torch.cuda.is_available():
        _model = _model.to("cuda")
    _model.eval()
    print("[musicgen] ready")


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID, "service": "flsko-musicgen"}


@app.post("/generate")
def generate(body: GenerateBody):
    try:
        load_model()
    except Exception as e:
        raise HTTPException(503, f"Model load failed: {e}") from e

    import torch
    import scipy.io.wavfile as wavfile

    prompt = body.prompt.strip()
    if body.instrumental and "instrumental" not in prompt.lower():
        prompt = f"{prompt}, instrumental only, no vocals"

    # ~50 tokens ≈ 1s for MusicGen; keep short on CPU
    max_new = int(max(64, min(750, body.durationSeconds * 50)))
    inputs = _processor(text=[prompt], padding=True, return_tensors="pt")
    if torch.cuda.is_available():
        inputs = {k: v.to("cuda") for k, v in inputs.items()}

    t0 = time.time()
    with torch.no_grad():
        audio = _model.generate(**inputs, max_new_tokens=max_new)
    sr = _model.config.audio_encoder.sampling_rate
    wav = audio[0, 0].cpu().numpy()

    job = uuid.uuid4().hex[:12]
    path = OUT / f"music-{job}.wav"
    wavfile.write(str(path), rate=sr, data=wav)
    elapsed = round(time.time() - t0, 1)

    # Relative URL — reverse-proxy or set PUBLIC_BASE
    base = os.environ.get("PUBLIC_BASE", "").rstrip("/")
    url = f"{base}/files/{path.name}" if base else f"/files/{path.name}"
    return {
        "url": url,
        "audio_url": url,
        "job_id": job,
        "sample_rate": sr,
        "latency_sec": elapsed,
        "provider": "musicgen-local",
    }


@app.get("/files/{name}")
def files(name: str):
    path = OUT / name
    if not path.is_file() or ".." in name:
        raise HTTPException(404)
    return FileResponse(path, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8090")))
