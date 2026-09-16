import { describe, expect, it } from "vitest";

describe("Hugging Face inference token", () => {
  it("authenticates with the Hugging Face account API", async () => {
    const token = process.env.HF_TOKEN?.trim();
    expect(token, "HF_TOKEN is missing").toBeTruthy();
    const response = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.text();
    expect(response.ok, `Hugging Face rejected the token: ${body.slice(0, 180)}`).toBe(true);
    expect((JSON.parse(body) as { name?: string }).name).toBeTruthy();
  }, 20_000);
});
