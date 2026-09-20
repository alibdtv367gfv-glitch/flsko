import { describe, expect, it } from "vitest";

const baseUrl = "https://flsko-api.flsko.workers.dev";

describe("deployed Flsko Cloudflare Worker", () => {
  it("reports healthy with D1 attached", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.ok).toBe(true);
    const body = await response.json() as { ok?: boolean; database?: string };
    expect(body.ok).toBe(true);
    expect(body.database).toBe("d1");
  }, 20_000);

  it("protects chat behind authentication", async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "اختبار" }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "تسجيل الدخول مطلوب" });
  }, 20_000);

  it("exposes safe router health metadata without authentication", async () => {
    const response = await fetch(`${baseUrl}/api/trpc/media.status`);
    expect(response.ok).toBe(true);
    const body = await response.json() as Array<{ result?: { data?: { json?: { router?: { mode?: string; persistedHealth?: unknown[] } } } } }>;
    const router = body[0]?.result?.data?.json?.router;
    expect(router?.mode).toBe("safe-fallback");
    expect(Array.isArray(router?.persistedHealth)).toBe(true);
  }, 20_000);
});
