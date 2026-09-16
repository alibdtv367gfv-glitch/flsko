import { describe, expect, it } from "vitest";

describe("Cloudflare deployment token", () => {
  it("can access an account for Worker deployment", async () => {
    const token = process.env.CLOUDFLARE_DEPLOY_TOKEN?.trim();
    expect(token, "CLOUDFLARE_DEPLOY_TOKEN is missing").toBeTruthy();
    const response = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=20", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const body = (await response.json()) as { success?: boolean; result?: Array<{ id?: string; name?: string }>; errors?: unknown[] };
    expect(response.ok && body.success, `Cloudflare rejected account access: ${JSON.stringify(body.errors ?? body).slice(0, 240)}`).toBe(true);
    expect(body.result?.length, "The token does not see any Cloudflare account").toBeGreaterThan(0);
    expect(body.result?.[0]?.id).toMatch(/^[a-f0-9]{32}$/);
  }, 20_000);
});
