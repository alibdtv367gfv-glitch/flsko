import { describe, expect, it } from "vitest";

describe("Render API key", () => {
  it("can read the current Render workspaces without creating a resource", async () => {
    const apiKey = process.env.RENDER_API_KEY?.trim();
    expect(apiKey, "RENDER_API_KEY is missing").toBeTruthy();
    const response = await fetch("https://api.render.com/v1/owners?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await response.text();
    expect(response.status, `Render rejected the API key: ${body.slice(0, 180)}`).toBe(200);
    expect(() => JSON.parse(body)).not.toThrow();
  }, 20_000);
});
