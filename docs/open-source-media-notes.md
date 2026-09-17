# Open-source media integration notes

- Pollinations official docs: https://gen.pollinations.ai/docs
  - The current `gen.pollinations.ai` API requires an API key for generation.
  - The legacy `https://image.pollinations.ai/prompt/<prompt>?model=flux` endpoint was tested on 2026-09-18 and returned HTTP 200 with `Content-Type: image/jpeg` and a real image body (30,729 bytes at 512x512).
- Hugging Face text-to-image docs: https://huggingface.co/docs/inference-providers/en/tasks/text-to-image
  - The tested `black-forest-labs/FLUX.1-schnell` route returned HTTP 410 because the model was deprecated for the selected provider.
- Gemini media tests returned HTTP 429 quota errors for image, video, and music generation.

Implementation decision: use the tested Pollinations legacy image endpoint as an automatic fallback after Gemini failure; keep video and music unavailable until a valid provider and secret are configured. Never create placeholder media files.
