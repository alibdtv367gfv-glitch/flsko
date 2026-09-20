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

  it("exposes a consistent chat composer and media studio", () => {
    const chat = readFileSync(resolve(process.cwd(), "app/(tabs)/chat.tsx"), "utf8");
    const create = readFileSync(resolve(process.cwd(), "app/(tabs)/create.tsx"), "utf8");
    expect(chat).toContain("اكتب ما يدور ببالك...");
    expect(chat).toContain("إجابة أخرى من مصدر مختلف");
    expect(create).toContain("صف الفكرة، ونحن نرتّب الباقي.");
    expect(create).toContain("صمّم مشهدك");
    expect(create).toContain("حرّك فكرتك");
    expect(create).toContain("اصنع مزاجًا");
  });

  it("provides an explicit light/dark theme control", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
    expect(source).toContain("تبديل الوضع الداكن");
    expect(source).toContain("setColorScheme(colorScheme === \"dark\" ? \"light\" : \"dark\")");
  });

  it("persists the theme preference and restores it on the next launch", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/theme-provider.tsx"), "utf8");
    expect(source).toContain("@react-native-async-storage/async-storage");
    expect(source).toContain("flsko-color-scheme");
    expect(source).toContain("AsyncStorage.setItem(THEME_STORAGE_KEY, scheme)");
    expect(source).toContain("AsyncStorage.getItem(THEME_STORAGE_KEY)");
    expect(source).toContain("stored === \"light\" || stored === \"dark\"");
  });

  it("explains the direct browser OAuth return flow", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/_layout.tsx"), "utf8");
    const oauth = readFileSync(resolve(process.cwd(), "constants/oauth.ts"), "utf8");
    expect(layout).toContain("ستظهر نافذة Google داخل التطبيق");
    expect(oauth).toContain("WebBrowser.openAuthSessionAsync");
    expect(oauth).toContain("WebBrowser.maybeCompleteAuthSession");
    expect(oauth).toContain("const redirectUri = getRedirectUri()");
  });
});
