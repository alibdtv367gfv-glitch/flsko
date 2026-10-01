/**
 * Wan 2.1 Hugging Face Space connector (FLSKO_WAN_SPACE).
 */

import { FlskoEnv } from "../_core/flsko-env";

export type WanResult = {
  status: "completed" | "queued" | "unavailable";
  url?: string;
  jobId?: string;
  provider: string;
  message?: string;
};

function spaceBase(): string {
  return (FlskoEnv.wanSpace || "https://wan-ai-wan2-1.hf.space").replace(/\/+$/, "");
}

export async function generateViaWanSpace(prompt: string): Promise<WanResult> {
  const base = spaceBase();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": "Flsko/1.0",
  };
  if (FlskoEnv.hfToken) {
    headers.authorization = `Bearer ${FlskoEnv.hfToken}`;
  }

  try {
    const cfg = await fetch(`${base}/config`, { headers, signal: AbortSignal.timeout(12_000) });
    if (!cfg.ok && cfg.status !== 404) {
      return {
        status: "unavailable",
        provider: "wan-space",
        message: `مساحة Wan غير جاهزة (${cfg.status}).`,
      };
    }
  } catch {
    return {
      status: "unavailable",
      provider: "wan-space",
      message: "تعذر الوصول إلى مساحة Wan على Hugging Face.",
    };
  }

  const apiNames = ["predict", "generate", "t2v", "text_to_video"];
  for (const name of apiNames) {
    try {
      const callUrl = `${base}/gradio_api/call/${name}`;
      const start = await fetch(callUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: [prompt] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!start.ok) continue;
      const body = (await start.json()) as { event_id?: string };
      if (!body.event_id) continue;

      const pollUrl = `${callUrl}/${body.event_id}`;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(pollUrl, {
          headers: { accept: "text/event-stream", ...headers },
          signal: AbortSignal.timeout(20_000),
        });
        if (!poll.ok) continue;
        const text = await poll.text();
        const urlMatch =
          text.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm)/i) ||
          text.match(/"url"\s*:\s*"(https?:[^"]+)"/i);
        if (urlMatch) {
          return {
            status: "completed",
            url: urlMatch[1] || urlMatch[0],
            jobId: body.event_id,
            provider: "wan-space",
          };
        }
      }
      return {
        status: "queued",
        jobId: body.event_id,
        provider: "wan-space",
        message: "طلب الفيديو أُرسل إلى مساحة Wan؛ قد يستغرق دقائق.",
      };
    } catch {
      // next
    }
  }

  return {
    status: "queued",
    provider: "wan-space",
    message:
      "مساحة Wan مضبوطة لكن Gradio لم يُرجع ملفًا فورًا. أعد المحاولة أو اربط FLSKO_VIDEO_PROVIDER_URL.",
  };
}
