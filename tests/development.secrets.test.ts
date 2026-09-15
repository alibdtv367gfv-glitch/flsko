import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// WebDev injects deployment secrets into the running server, not the local test shell.
describe("development portal secrets", () => {
  it("references three independent server-side password variables", () => {
    const routerSource = readFileSync(path.resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routerSource).toContain("FLSKO_DEV_PASSWORD_1");
    expect(routerSource).toContain("FLSKO_DEV_PASSWORD_2");
    expect(routerSource).toContain("FLSKO_DEV_PASSWORD_3");
    expect(routerSource).toContain("كلمات مرور بوابة التطوير غير صحيحة");
  });
});
