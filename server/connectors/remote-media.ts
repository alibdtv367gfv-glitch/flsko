/**
 * Remote API wrappers for heavy open-source video stacks.
 * No model weights on this process — only HTTP to your hosted endpoints
 * (RunPod / Modal / Cloud Run GPU / self-hosted Docker).
 */

export type RemoteJobResult = {
  status: "completed" | "queued" | "unavailable";
  url?: string;
  jobId?: string;
  provider: string;
  message?: string;
};

async function postJson(url: string, body: unknown, apiKey?: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`remote ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}

/** SkyReels-style long video / talking avatar host */
export async function callSkyReels(prompt: string): Promise<RemoteJobResult> {
  const url = process.env.REMOTE_SKYREELS_URL?.trim();
  if (!url) {
    return {
      status: "unavailable",
      provider: "skyreels",
      message: "REMOTE_SKYREELS_URL غير مضبوط. انشر SkyReels على GPU سحابي ثم ضع الرابط.",
    };
  }
  const data = (await postJson(
    url,
    { prompt, mode: "t2v" },
    process.env.REMOTE_SKYREELS_KEY?.trim(),
  )) as { url?: string; job_id?: string };
  return {
    status: data.url ? "completed" : "queued",
    url: data.url,
    jobId: data.job_id,
    provider: "skyreels",
  };
}

/** Allegro-style short 720p clips */
export async function callAllegro(prompt: string): Promise<RemoteJobResult> {
  const url = process.env.REMOTE_ALLEGRO_URL?.trim();
  if (!url) {
    return {
      status: "unavailable",
      provider: "allegro",
      message: "REMOTE_ALLEGRO_URL غير مضبوط.",
    };
  }
  const data = (await postJson(
    url,
    { prompt, duration_seconds: 6, resolution: "720p" },
    process.env.REMOTE_ALLEGRO_KEY?.trim(),
  )) as { url?: string; job_id?: string };
  return {
    status: data.url ? "completed" : "queued",
    url: data.url,
    jobId: data.job_id,
    provider: "allegro",
  };
}

/** Generic Open Generative AI Studio / Cosmos / custom GPU */
export async function callRemoteStudio(
  prompt: string,
  kind: "genstudio" | "cosmos" = "genstudio",
): Promise<RemoteJobResult> {
  const envUrl =
    kind === "cosmos"
      ? process.env.REMOTE_COSMOS_URL?.trim()
      : process.env.REMOTE_GENSTUDIO_URL?.trim();
  const envKey =
    kind === "cosmos"
      ? process.env.REMOTE_COSMOS_KEY?.trim()
      : process.env.REMOTE_GENSTUDIO_KEY?.trim();
  if (!envUrl) {
    return {
      status: "unavailable",
      provider: kind,
      message: `لم يُضبط عنوان ${kind}.`,
    };
  }
  const data = (await postJson(envUrl, { prompt }, envKey)) as {
    url?: string;
    job_id?: string;
  };
  return {
    status: data.url ? "completed" : "queued",
    url: data.url,
    jobId: data.job_id,
    provider: kind,
  };
}

/** Try remote video hosts in order (no local weights). */
export async function remoteVideoCascade(prompt: string): Promise<RemoteJobResult> {
  for (const fn of [
    () => callAllegro(prompt),
    () => callSkyReels(prompt),
    () => callRemoteStudio(prompt, "genstudio"),
  ]) {
    try {
      const r = await fn();
      if (r.status === "completed" || r.status === "queued") return r;
    } catch {
      // try next
    }
  }
  return {
    status: "unavailable",
    provider: "remote-cascade",
    message: "لا يوجد مضيف فيديو بعيد مضبوط (Allegro/SkyReels/GenStudio).",
  };
}
