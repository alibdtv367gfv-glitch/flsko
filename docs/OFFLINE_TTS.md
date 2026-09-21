# Offline TTS (VODER / VITS → ONNX) for Flsko

Flsko is an **Expo** app. Native ONNX code requires an **Expo Development Build** (not Expo Go).

## Phase 1 — Convert models (Python)

```bash
cd /path/to/flsko
python3 -m venv .venv-onnx && source .venv-onnx/bin/activate
pip install torch onnx onnxruntime

# Pipeline test without a real checkpoint:
python scripts/voder_to_onnx.py --checkpoint /dev/null --export-stub --quantize-int8 --output-dir artifacts/onnx

# Real VITS (vendor models.SynthesizerTrn on PYTHONPATH):
python scripts/voder_to_onnx.py \
  --checkpoint path/to/G_*.pth \
  --config path/to/config.json \
  --quantize-int8 \
  --output-dir artifacts/onnx
```

Upload `voder_tts_int8.onnx` to HTTPS (R2/S3/GitHub Release) and set that URL in the app config.

**Alternative (production-ready Arabic):** use [Piper](https://github.com/rhasspy/piper) voices that already ship as ONNX (e.g. `ar_JO-kareem-low`) — same Android loader, different phonemizer.

## Phase 2 — Gradle / Android deps

Reference module: `modules/voder-offline/android/build.gradle`

- Dependency: `com.microsoft.onnxruntime:onnxruntime-android:1.19.2`
- Manifest: `INTERNET` only for first download; models stored in `context.filesDir` (no legacy storage permission)

Wire the module via Expo config plugin or autolinking after `npx expo prebuild`.

## Phase 3 — Kotlin inference

`VoderOfflineManager`:

- `initialize(path)` → `OrtEnvironment` + `OrtSession`
- `synthesize(LongArray)` → `FloatArray` PCM
- `playFloatAudio` / `speakPhonemes` via `AudioTrack`

## Phase 4 — Download once

`VoderModelDownloader.ensureModel(url)`:

- Checks internal `filesDir/voder-models/`
- Downloads with progress callback if missing
- Next launches are offline

## Build loop

1. `npx expo prebuild --platform android`
2. Open `android/` in Android Studio or `./gradlew :app:assembleDebug`
3. On red errors: copy the full Gradle/Kotlin stack trace back for a focused fix (one error at a time)

## Not in Expo Go

Custom native ONNX **will not** run inside Expo Go. Use a development client or release APK/AAB.
