import { describe, expect, it } from "vitest";

describe("Google OAuth credentials", () => {
  it("are accepted by Google token endpoint without exchanging a real code", async () => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    expect(clientId, "GOOGLE_OAUTH_CLIENT_ID is missing").toMatch(/\.apps\.googleusercontent\.com$/);
    expect(clientSecret, "GOOGLE_OAUTH_CLIENT_SECRET is missing").toBeTruthy();

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: "flsko-credential-check",
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: "https://localhost/oauth/callback",
        grant_type: "authorization_code",
      }).toString(),
    });
    const body = await response.text();
    expect(response.status, `Google rejected the OAuth client configuration: ${body.slice(0, 160)}`).not.toBe(401);
    expect(response.status).toBe(400);
  }, 20_000);
});
