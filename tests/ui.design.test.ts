import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Flsko visual identity", () => {
  it("keeps the home screen centered on clear AI actions and trust", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
    expect(source).toContain("فلسقوا · وكيلك الذكي");
    expect(source).toContain("جاهز لمساعدتك");
    expect(source).toContain("احكِ مع فلسقوا");
    expect(source).toContain("خصوصيتك أولًا");
    expect(source).toContain("accessibilityRole=\"button\"");
  });

  it("keeps bottom navigation labels compact and consistent", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/_layout.tsx"), "utf8");
    expect(source).toContain("tabBarLabelStyle");
    expect(source).toContain("fontWeight: \"700\"");
    expect(source).toContain("elevation: 0");
  });
});
