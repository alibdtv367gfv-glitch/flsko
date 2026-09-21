# Flsko open media adapters (self-hosted)

These Docker services implement **FLSKO_MUSIC_PROVIDER_URL** and **FLSKO_VIDEO_PROVIDER_URL** without paid APIs.

## MusicGen (useful on CPU/GPU)

```bash
cd adapters/musicgen
docker compose up --build -d
# health: curl http://127.0.0.1:8090/health
```

Point Flsko server env:

```env
FLSKO_MUSIC_PROVIDER_URL=http://127.0.0.1:8090/generate
```

- Default model: `facebook/musicgen-small` (fits modest RAM; slow on CPU).
- First run downloads weights from Hugging Face.
- License: MusicGen weights are **CC-BY-NC** — non-commercial use only unless you switch model/license.

## Video adapter

```bash
cd adapters/video-stub
docker compose up --build -d
```

```env
FLSKO_VIDEO_PROVIDER_URL=http://127.0.0.1:8091/generate
```

| `FLSKO_VIDEO_BACKEND` | Behavior |
|----------------------|----------|
| `stub` (default) | Returns queued + Arabic guidance |
| `frames` | Short test MP4 via ffmpeg (not AI) |
| `external` | Proxies to `EXTERNAL_GENERATE_URL` (your Wan/LTX service) |

Real open video (Wan 2.x / LTX) needs a **GPU host**; this stub keeps the Flsko app contract stable while you attach a real engine.

## Production note

Expose adapters only on a private network or behind auth. Do not publish unauthenticated GPU endpoints to the public internet.
