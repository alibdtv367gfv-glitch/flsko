/**
 * Free / public documented media providers — no paid keys required.
 * Legal: only official REST or documented public URL APIs (no scraping).
 *
 * Image layers (4):
 *  1. Pollinations legacy image.pollinations.ai (anonymous)
 *  2. AI Horde community cluster (anonymous key 0000000000)
 *  3. Pollinations gen.pollinations.ai when FLSKO_POLLINATIONS_API_KEY set
 *  4. Operator FLSKO_IMAGE_PROVIDER_URL (self-hosted open model)
 *
 * Video / music: public no-key options are scarce and unstable; we try
 * optional free adapters then degrade gracefully with Arabic status messages.
 */

import { adaptPromptForVisualProvider } from "../translation-bridge";
import { withCircuitBreaker } from "../circuit-breaker";

export type MediaResult = {
  url?: string;
  provider: string;
  status: "completed" | "queued" | "unavailable";
  message?: string;
  jobId?: string;
};

const HORDE_ANON = "0000000000";
const HORDE_BASE = "https://aihorde.net/api/v2";

function hordeHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    apikey: process.env.AI_HORDE_API_KEY?.trim() || HORDE_ANON,
    "Client-Agent": "Flsko:1.0:github.com/alibdtv367gfv-glitch/flsko",
  };
}

/** Layer 1 — Pollinations legacy public image URL (no key). */
export async function imagePollinationsLegacy(prompt: string): Promise<MediaResult> {
  return withCircuitBreaker("img-pollinations-legacy", async () => {
    const adapted = adaptPromptForVisualProvider(prompt, "en");
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(adapted)}` +
      `?width=768&height=768&nologo=true&model=flux&seed=${Date.now() % 1_000_000}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "image/*", "user-agent": "Flsko/1.0" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`pollinations-legacy ${res.status}`);
    const finalUrl = res.url || url;
    return { url: finalUrl, provider: "pollinations-legacy", status: "completed" };
  });
}

/** Layer 2 — AI Horde decentralized Stable Diffusion (anonymous OK, slower). */
export async function imageAiHorde(prompt: string): Promise<MediaResult> {
  return withCircuitBreaker("img-ai-horde", async () => {
    const adapted = adaptPromptForVisualProvider(prompt, "en");
    const submit = await fetch(`${HORDE_BASE}/generate/async`, {
      method: "POST",
      headers: hordeHeaders(),
      body: JSON.stringify({
        prompt: adapted,
        params: { width: 512, height: 512, steps: 20, n: 1 },
        nsfw: false,
        r2: true,
        models: ["stable_diffusion"],
      }),
    });
    if (!submit.ok) throw new Error(`horde-submit ${submit.status}`);
    const { id } = (await submit.json()) as { id?: string };
    if (!id) throw new Error("horde no job id");

    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const st = await fetch(`${HORDE_BASE}/generate/status/${id}`, { headers: hordeHeaders() });
      if (!st.ok) continue;
      const body = (await st.json()) as {
        done?: boolean;
        faulted?: boolean;
        generations?: Array<{ img?: string }>;
      };
      if (body.faulted) throw new Error("horde faulted");
      if (body.done && body.generations?.[0]?.img) {
        return { url: body.generations[0].img, provider: "ai-horde", status: "completed" };
      }
    }
    throw new Error("horde timeout");
  });
}

/** Layer 3 — Pollinations gen API (free key from enter.pollinations.ai optional). */
export async function imagePollinationsKeyed(prompt: string): Promise<MediaResult> {
  const key = process.env.FLSKO_POLLINATIONS_API_KEY?.trim();
  if (!key) throw new Error("pollinations key not set");
  return withCircuitBreaker("img-pollinations-keyed", async () => {
    const adapted = adaptPromptForVisualProvider(prompt, "en");
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(adapted)}?model=flux&width=768&height=768`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${key}`, accept: "image/*", "user-agent": "Flsko/1.0" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`pollinations-keyed ${res.status}`);
    return { url: res.url || url, provider: "pollinations-keyed", status: "completed" };
  });
}

/** Layer 4 — operator self-hosted open image server. */
export async function imageSelfHosted(prompt: string): Promise<MediaResult> {
  const endpoint = process.env.FLSKO_IMAGE_PROVIDER_URL?.trim();
  if (!endpoint) throw new Error("no self-hosted image url");
  return withCircuitBreaker("img-self-hosted", async () => {
    const key = process.env.FLSKO_LLM_PROVIDER_KEY?.trim();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        prompt: adaptPromptForVisualProvider(prompt, "en"),
        model: process.env.FLSKO_IMAGE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0",
      }),
    });
    if (!res.ok) throw new Error(`self-image ${res.status}`);
    const payload = (await res.json()) as { url?: string; image_url?: string };
    const url = payload.url || payload.image_url;
    if (!url) throw new Error("self-image empty");
    return { url, provider: "self-hosted-image", status: "completed" };
  });
}

/** Run image layers in order until one completes. */
export async function generateImageFourLayers(prompt: string): Promise<MediaResult> {
  const layers: Array<() => Promise<MediaResult>> = [
    imagePollinationsLegacy,
    imageAiHorde,
    imagePollinationsKeyed,
    imageSelfHosted,
  ];
  const errors: string[] = [];
  for (const layer of layers) {
    try {
      return await layer(prompt);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return {
    provider: "none",
    status: "unavailable",
    message: `تعذر إنشاء الصورة عبر الطبقات المجانية: ${errors.slice(0, 3).join(" | ")}`,
  };
}

/**
 * Video: try self-hosted open adapter, then optional Pollinations keyed video,
 * else clear queued/unavailable (true free public video APIs are rare).
 */
export async function generateVideoFourLayers(prompt: string): Promise<MediaResult> {
  const adapted = adaptPromptForVisualProvider(prompt, "en");
  const errors: string[] = [];

  // Layer 1 — self-hosted Wan/LTX/CogVideo adapter
  const videoUrl = process.env.FLSKO_VIDEO_PROVIDER_URL?.trim();
  if (videoUrl) {
    try {
      return await withCircuitBreaker("vid-self", async () => {
        const key = process.env.FLSKO_LLM_PROVIDER_KEY?.trim();
        const res = await fetch(videoUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(key ? { authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({ prompt: adapted, model: process.env.FLSKO_VIDEO_MODEL || "Wan-AI/Wan2.2-TI2V-5B" }),
        });
        if (!res.ok) throw new Error(`self-video ${res.status}`);
        const payload = (await res.json()) as { url?: string; job_id?: string };
        if (payload.url) return { url: payload.url, provider: "self-hosted-video", status: "completed" };
        return {
          provider: "self-hosted-video",
          status: "queued",
          jobId: payload.job_id,
          message: "تم إرسال طلب الفيديو إلى المحرك المفتوح؛ سيظهر عند اكتمال المعالجة.",
        };
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Layer 2 — Pollinations video (requires free key from enter.pollinations.ai)
  const pKey = process.env.FLSKO_POLLINATIONS_API_KEY?.trim();
  if (pKey) {
    try {
      return await withCircuitBreaker("vid-pollinations", async () => {
        const url = `https://gen.pollinations.ai/video/${encodeURIComponent(adapted)}?model=wan`;
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${pKey}`, accept: "video/*", "user-agent": "Flsko/1.0" },
          redirect: "follow",
        });
        if (!res.ok) throw new Error(`pollinations-video ${res.status}`);
        return { url: res.url || url, provider: "pollinations-video", status: "completed" };
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Layer 3/4 — no reliable no-key public video API; honest status
  return {
    provider: "none",
    status: "unavailable",
    message:
      "الفيديو المفتوح يحتاج محركًا ذاتيًا (Wan/LTX عبر FLSKO_VIDEO_PROVIDER_URL) أو مفتاح Pollinations مجاني من enter.pollinations.ai. الطبقات بلا مفتاح غير متاحة حاليًا بشكل مستقر.",
  };
}

/** Music layers — self-hosted MusicGen/ACE-Step, optional Pollinations audio, else clear message. */
export async function generateMusicFourLayers(prompt: string): Promise<MediaResult> {
  const errors: string[] = [];
  const musicUrl = process.env.FLSKO_MUSIC_PROVIDER_URL?.trim();
  if (musicUrl) {
    try {
      return await withCircuitBreaker("music-self", async () => {
        const key = process.env.FLSKO_MUSIC_PROVIDER_KEY?.trim();
        const res = await fetch(musicUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(key ? { authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({ prompt, durationSeconds: 30, instrumental: true }),
        });
        if (!res.ok) throw new Error(`self-music ${res.status}`);
        const payload = (await res.json()) as { url?: string; audio_url?: string; job_id?: string };
        const url = payload.url || payload.audio_url;
        if (url) return { url, provider: "self-hosted-music", status: "completed" };
        return {
          provider: "self-hosted-music",
          status: "queued",
          jobId: payload.job_id,
          message: "طلب الموسيقى في الطابور على المحرك المفتوح.",
        };
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const pKey = process.env.FLSKO_POLLINATIONS_API_KEY?.trim();
  if (pKey) {
    try {
      return await withCircuitBreaker("music-pollinations", async () => {
        const url = `https://gen.pollinations.ai/audio/${encodeURIComponent(prompt)}`;
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${pKey}`, accept: "audio/*", "user-agent": "Flsko/1.0" },
        });
        if (!res.ok) throw new Error(`pollinations-audio ${res.status}`);
        return { url: res.url || url, provider: "pollinations-audio", status: "completed" };
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return {
    provider: "none",
    status: "unavailable",
    message:
      "الموسيقى المفتوحة: اربط MusicGen/ACE-Step عبر FLSKO_MUSIC_PROVIDER_URL أو مفتاح Pollinations مجاني. لا توجد طبقة عامة مستقرة بلا مفتاح حاليًا.",
  };
}
