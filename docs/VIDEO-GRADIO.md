# Flsko video generation path

## On Cloudflare Worker (production)

- **No Playwright/Puppeteer** — Workers cannot run headless browsers.
- Use **Gradio HTTP client** against HF Spaces:
  - `POST /gradio_api/call/t2v_generation_async` → `event_id`
  - Poll SSE on same path with `event_id`
- Config: `FLSKO_WAN_SPACE` (default `https://wan-ai-wan2-1.hf.space`)
- Optional self-host: `FLSKO_VIDEO_PROVIDER_URL` (ComfyUI wrapper or any POST `{prompt}` → `{url|jobId}`)

## On a separate Node server (optional later)

Playwright intercept of non-Gradio web UIs can run on Cloud Run / VPS, then point `FLSKO_VIDEO_PROVIDER_URL` at that service.

## App flow

1. `agent.generate` kind=video → queue jobId  
2. `agent.mediaJob` jobId → poll until url  
