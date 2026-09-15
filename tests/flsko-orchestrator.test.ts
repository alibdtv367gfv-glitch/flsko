import { describe, expect, it } from "vitest";
import { buildProfileContext, getFlskoProviderStatus } from "../server/flsko-ai";
import { buildSyrianContext, detectInteractionMode } from "../server/syrian-knowledge";
import { assertRateLimit } from "../server/rate-limit";

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
    expect(buildSyrianContext("شو الأخبار؟")).toContain("الحسكة");
    expect(buildProfileContext({ displayName: "ليان", governorate: "اللاذقية", about: "أفضل الإجابات المختصرة" })).toContain("اللاذقية");
    expect(buildProfileContext({ displayName: "ليان", governorate: "اللاذقية", about: "أفضل الإجابات المختصرة" })).toContain("أفضل الإجابات المختصرة");
  });

  it("limits repeated requests per authenticated user", () => {
    const userId = 987654;
    assertRateLimit(userId, "unit-test", 2);
    assertRateLimit(userId, "unit-test", 2);
    expect(() => assertRateLimit(userId, "unit-test", 2)).toThrow("الحد المؤقت");
  });
});
