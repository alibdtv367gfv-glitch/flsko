#!/usr/bin/env bash
# Download Piper Arabic (Jordan / Kareem low) ONNX + JSON for offline packaging or CDN upload.
set -euo pipefail
OUT="${1:-artifacts/piper-ar}"
mkdir -p "$OUT"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low"
echo "Downloading Piper ar_JO-kareem-low → $OUT"
curl -L --fail -o "$OUT/ar_JO-kareem-low.onnx" "$BASE/ar_JO-kareem-low.onnx"
curl -L --fail -o "$OUT/ar_JO-kareem-low.onnx.json" "$BASE/ar_JO-kareem-low.onnx.json" || true
ls -lh "$OUT"
echo "Done. Host the .onnx on HTTPS and set EXPO_PUBLIC_VODER_MODEL_URL if not using the default HF URL."
