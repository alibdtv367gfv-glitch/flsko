import { describe, expect, it } from "vitest";

describe("suggestion email provider", () => {
  it("enables server delivery to the owner mailbox", () => {
    expect(process.env.FLSKO_ENABLE_SUGGESTION_EMAIL).toBe("true");
    expect(process.env.FLSKO_SUGGESTIONS_TO_EMAIL).toBe("alibdtv367gfv@gmail.com");
  });
});
