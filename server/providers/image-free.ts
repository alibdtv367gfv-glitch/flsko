/**
 * Documented free/public image generation fallbacks.
 * Only official or well-documented HTTP interfaces — no scraping, no key bypass.
 *
 * Providers:
 * - Pollinations image URL API (public documented image endpoint)
 * - AI Horde (https://aihorde.net) — open REST, anonymous allowed with lower priority
 * - Optional configured FLSKO_IMAGE_PROVIDER_URL / Gemini / built-in generateImage stay in flsko-ai.ts
 */

import { adaptPromptForVisualProvider } from "../translation-bridge";
import { withCircuitBreaker } from "../circuit-breaker";

export type FreeImageResult = { url: string; provider: string };

/** Pollinations public image endpoint (documented path-style prompt URL). */
export async function generatePollinationsImage(prompt: string): Promise<FreeImageResult> {
  return withCircuitBreaker("pollinations-image", async () => {
    const adapted = adaptPromptForVisualProvider(prompt, "en");
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(adapted)}?width=1024&height=1024&nologo=true&model=flux`;
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "image/*", "user-agent": "Flsko/1.0 (documented image client)" },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Pollinations image failed: ${response.status}`);
    // Return the generation URL itself when the service streams the image
    const finalUrl = response.url || url;
    return { url: finalUrl, provider: "pollinations-image" };
  });
}

/** AI Horde async text-to-image (documented REST). Anonymous requests are rate-limited. */
export async function generateAiHordeImage(prompt: string): Promise<FreeImageResult> {
  return withCircuitBreaker("ai-horde", async () => {
    const adapted = adaptPromptForVisualProvider(prompt, "en");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      apikey: process.env.AI_HORDE_API_KEY?.trim() || "0000000000",
      "client-agent": "Flsko:1.0:github.com/alibdtv367gfv-glitch/flsko",
    };
    const submit = await fetch("https://aihorde.net/api/v2/generate/async", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: adapted,
        params: { width: 512, height: 512, steps: 20, n: 1 },
        models: ["stable_diffusion"],
        r2: true,
      }),
    });
    if (!submit.ok) throw new Error(`AI Horde submit failed: ${submit.status}`);
    const submitted = (await submit.json()) as { id?: string };
    if (!submitted.id) throw new Error("AI Horde returned no job id");

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(`https://aihorde.net/api/v2/generate/status/${submitted.id}`, { headers });
      if (!statusRes.ok) continue;
      const status = (await statusRes.json()) as {
        done?: boolean;
        faulted?: boolean;
        generations?: Array<{ img?: string }>;
      };
      if (status.faulted) throw new Error("AI Horde job faulted");
      if (status.done && status.generations?.[0]?.img) {
        return { url: status.generations[0].img, provider: "ai-horde" };
      }
    }
    throw new Error("AI Horde timed out");
  });
}

/**
 * Try free image providers in order. Caller may still try paid/configured providers first.
 */
export async function generateImageFreeChain(prompt: string): Promise<FreeImageResult> {
  const errors: string[] = [];
  for (const fn of [generatePollinationsImage, generateAiHordeImage]) {
    try {
      return await fn(prompt);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(`Free image providers unavailable: ${errors.join("; ")}`);
}
