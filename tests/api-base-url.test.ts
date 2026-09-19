import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("production API configuration", () => {
  it("uses the configured Flsko API and responds to health check", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(baseUrl).toBe("https://flsko-api.flsko.workers.dev");

    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { ok?: boolean; service?: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("flsko-api");
  }, 30_000);

  it("contains a production fallback that rejects stale preview API values", () => {
    const source = readFileSync(resolve(process.cwd(), "constants/oauth.ts"), "utf8");
    expect(source).toContain("PRODUCTION_API_BASE_URL");
    expect(source).toContain("isPreviewApi");
    expect(source).toContain("!isPreviewApi");
  });
});
