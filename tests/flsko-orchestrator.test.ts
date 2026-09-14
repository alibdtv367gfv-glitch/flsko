import { describe, expect, it } from "vitest";
import { getFlskoProviderStatus } from "../server/flsko-ai";
import { buildSyrianContext, detectInteractionMode } from "../server/syrian-knowledge";

describe("فلسقوا orchestrator", () => {
  it("keeps model selection behind the server", () => {
    const status = getFlskoProviderStatus();
    expect(status.name).toBe("Flsko");
    expect(status.orchestration).toBe("automatic");
    expect(status.userSeesModels).toBe(false);
  });

  it("adapts tone without turning Syrian culture into a stereotype", () => {
    expect(detectInteractionMode("هههه احكيلي نكتة")).toBe("playful");
    expect(detectInteractionMode("كيف أصلح المشكلة بخطوات دقيقة؟")).toBe("practical");
    expect(buildSyrianContext("شو الأخبار؟")).toContain("المحافظات");
  });
});
