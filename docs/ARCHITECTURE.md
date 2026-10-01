# Flsko Architecture (Orchestrator, Identity, Free Providers)

## Stack

- **Mobile:** Expo + React Native + TypeScript  
- **API (production):** Cloudflare Workers + D1 (`https://flsko-api.flsko.workers.dev`)  
- **Repo server package:** Node/Express reference implementation under `server/` (used for local/dev and shared logic)

## Legal constraints

- No unauthorized scraping, credential stuffing, or API key bypasses.  
- Only documented HTTP APIs, official free tiers, or operator-configured endpoints.  
- Google Play policy compliance required for any store release.

## Phase map

| Phase | Status in repo | Notes |
|-------|----------------|--------|
| 1 Orchestrator + translation bridge + circuit breaker | **Implemented (server package)** | `circuit-breaker.ts`, `translation-bridge.ts`, scoring in `flsko-ai.ts` |
| 2 Free media providers | **Partial** | Images: Pollinations + AI Horde chain. Video/music: configured URLs + graceful degrade |
| 3 Expo Dev Build / ONNX | **Documented only** | Requires leaving Expo Go; JNI draft not shipped |
| 4 Git + docs sync | **Ongoing** | This file + README |
| 5 Semantic identity | **Implemented** | `flsko-identity.ts` — name Flsko/فلسقوا, creator علي يوسف |

## Identity (Phase 5)

System prompt (injected every chat turn) enforces:

- Name: **Flsko / فلسقوا** only  
- Creator: **Ali Youssef / علي يوسف**  
- Never claim to be ChatGPT/Claude/Llama/etc.  
- Semantic answers to “who made you?” via LLM context, not keyword if/else  

## Circuit breaker

`server/circuit-breaker.ts`: after 3 failures a provider opens for 60s, then half-open.  
Future: persist `openedAt` in D1 for multi-isolate Workers.

## Free image chain

Order after paid/configured providers fail:

1. Pollinations public image URL API  
2. AI Horde async REST (`aihorde.net`) — optional `AI_HORDE_API_KEY`, anonymous key allowed with lower priority  

## Video / music

Remain **async / queued** when only `FLSKO_VIDEO_PROVIDER_URL` / `FLSKO_MUSIC_PROVIDER_URL` are set.  
Public Gradio/HF Spaces must be wired as **your** server-side adapters (not direct mobile → Space scraping).

## Deploy note

Pushing to GitHub updates this repo. **Cloudflare Workers production must be redeployed** from the Worker project that serves `flsko-api.flsko.workers.dev` for API behavior to change live.
