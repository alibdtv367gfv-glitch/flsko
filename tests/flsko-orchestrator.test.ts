import { describe, expect, it } from "vitest";
import { getFlskoProviderStatus } from "../server/flsko-ai";

describe("فلسقوا orchestrator", () => {
  it("keeps model selection behind the server", () => {
    const status = getFlskoProviderStatus();
    expect(status.name).toBe("فلسقوا");
    expect(status.orchestration).toBe("automatic");
    expect(status.userSeesModels).toBe(false);
  });
});
