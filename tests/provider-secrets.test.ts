import { describe, expect, it } from "vitest";

describe("provider secrets", () => {
  it("authenticates with Gemini using a metadata-only request", async () => {
    const key = process.env.FLSKO_GEMINI_API_KEY?.trim();
    expect(key, "FLSKO_GEMINI_API_KEY is not configured").toBeTruthy();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": key! },
    });
    expect(response.ok, `Gemini metadata request failed with ${response.status}`).toBe(true);
  }, 15_000);
});
