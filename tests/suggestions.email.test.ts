import { describe, expect, it } from "vitest";

describe("suggestion email provider", () => {
  it("keeps delivery disabled when cloud-only mode is selected", () => {
    expect(process.env.FLSKO_ENABLE_SUGGESTION_EMAIL).not.toBe("true");
  });
});
