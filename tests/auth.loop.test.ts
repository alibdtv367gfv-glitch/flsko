import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("web authentication refresh", () => {
  it("caches web auth refresh silently instead of notifying the auth listener recursively", () => {
    const source = readFileSync(resolve(process.cwd(), "hooks/use-auth.ts"), "utf8");
    expect(source).toContain("Cache without notifying subscribers");
    expect(source).toContain("Persist silently; notifying here would recursively trigger fetchUser.");
    expect(source).not.toContain("await Auth.setUserInfo(userInfo);");
  });
});
