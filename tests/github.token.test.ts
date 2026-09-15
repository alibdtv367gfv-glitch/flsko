import { describe, expect, it } from "vitest";

describe("GitHub deployment token", () => {
  it("authenticates against GitHub before deployment", async () => {
    const token = process.env.GITHUB_TOKEN?.trim();
    expect(token, "GITHUB_TOKEN is missing").toBeTruthy();
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const body = await response.text();
    expect(response.status, `GitHub rejected the token: ${body.slice(0, 180)}`).toBe(200);
    expect((JSON.parse(body) as { login?: string }).login).toBeTruthy();
  }, 20_000);
});
