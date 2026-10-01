# Flsko wiring (vault-aligned)

## Production

- API: `https://flsko-api.flsko.workers.dev`
- OAuth callback: `https://flsko-api.flsko.workers.dev/api/google/callback`
- Worker: `flsko-api` · D1: `flsko-db`

## Code paths

| Feature | Function | Order |
|---------|----------|--------|
| Chat | `answerAsFlsko` | Gemini → OpenAI → HF → custom LLM |
| Image | `createFlskoImage` | Pollinations → Horde → HF → keyed → self → Gemini |
| Video | `createFlskoVideo` | **Wan Space** → remote cascade → self/Pollinations → Gemini |
| Music | `createFlskoMusic` | self MusicGen → Pollinations → Gemini |
| Env | `server/_core/flsko-env.ts` | all vault names |

## Minimum Cloudflare Secrets

`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `HF_TOKEN`, `SESSION_SECRET`

Optional quality: `FLSKO_GEMINI_API_KEY`, `FLSKO_POLLINATIONS_API_KEY`, `FLSKO_WAN_SPACE`

Redeploy Worker after pulling this commit.
