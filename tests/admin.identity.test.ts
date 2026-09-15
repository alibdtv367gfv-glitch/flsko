import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Flsko admin identity", () => {
  it("uses the server-side admin email for role assignment", () => {
    const source = readFileSync(path.resolve(process.cwd(), "server/db.ts"), "utf8");
    expect(source).toContain("FLSKO_ADMIN_EMAIL");
    expect(source).toContain('values.role = "admin"');
  });
});
