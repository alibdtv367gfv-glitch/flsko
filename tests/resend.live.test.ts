import { describe, expect, it } from "vitest";

describe("Resend suggestion email provider", () => {
  it("accepts the configured key on a read-only domains request", async () => {
    const key = process.env.RESEND_API_KEY?.trim();
    expect(key, "RESEND_API_KEY is not configured").toBeTruthy();

    const response = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${key!}` },
    });

    expect(response.ok, `Resend metadata request failed with ${response.status}`).toBe(true);
  }, 15_000);
});
