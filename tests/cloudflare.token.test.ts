import { describe, expect, it } from "vitest";

describe("Cloudflare API token", () => {
  it("authenticates and verifies the token", async () => {
    const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
    expect(token, "CLOUDFLARE_API_TOKEN is missing").toBeTruthy();
    const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const body = (await response.json()) as { success?: boolean; result?: { status?: string }; errors?: unknown[] };
    expect(response.ok, `Cloudflare rejected the token: ${JSON.stringify(body.errors ?? body).slice(0, 240)}`).toBe(true);
    expect(body.success).toBe(true);
    expect(body.result?.status).toBe("active");
  }, 20_000);
});
