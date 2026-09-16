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
});
