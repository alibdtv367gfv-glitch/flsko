import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("web authentication refresh", () => {
  it("caches web auth refresh silently instead of notifying the auth listener recursively", () => {
    const source = readFileSync(resolve(process.cwd(), "hooks/use-auth.ts"), "utf8");
    expect(source).toContain("Persist silently; callback owns the single auth notification.");
    expect(source).not.toContain("await Auth.setUserInfo(userInfo);");
    const callback = readFileSync(resolve(process.cwd(), "app/oauth/callback.tsx"), "utf8");
    expect(callback).toContain("handledRef.current");
    expect(callback).toContain("notify: false");
    expect(callback).toContain("Auth.notifyAuthChanges();");
    expect(source).toContain("AUTH_REFRESH_COOLDOWN_MS = 3000");
    expect(source).toContain("inFlightFetch");
    expect(source).toContain("if (inFlightFetch) return inFlightFetch;");
  });

  it("checks for a stored web session before calling auth.me", () => {
    const source = readFileSync(resolve(process.cwd(), "hooks/use-auth.ts"), "utf8");
    expect(source).toContain("const sessionToken = await Auth.getSessionToken();");
    expect(source).toContain("if (!sessionToken) {");
    expect(source).toContain("sharedUser = null;");
  });
});
