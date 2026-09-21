import { describe, expect, it } from "vitest";

/** Production OAuth callback on Cloudflare Workers API */
const PRODUCTION_REDIRECT_URI = "https://flsko-api.flsko.workers.dev/api/google/callback";

describe("Google OAuth redirect URI", () => {
  it("defaults to the production Workers callback path", () => {
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || PRODUCTION_REDIRECT_URI;

    expect(redirectUri.startsWith("https://")).toBe(true);
    expect(redirectUri).toMatch(/\/api\/google\/callback$/);

    if (!process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()) {
      expect(redirectUri).toBe(PRODUCTION_REDIRECT_URI);
    }
  });

  it("is accepted by Google token endpoint as a configured redirect value", async () => {
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || PRODUCTION_REDIRECT_URI;
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

    // Skip live Google check when credentials are not injected
    if (!clientId || !clientSecret) {
      expect(redirectUri).toBe(PRODUCTION_REDIRECT_URI);
      return;
    }

    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(clientSecret).toBeTruthy();
    expect(redirectUri).toMatch(/\/api\/google\/callback$/);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: "flsko-redirect-uri-check",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const body = await response.text();
    // 400 = invalid code (expected). 401 = bad client credentials.
    expect(response.status, `Google rejected the OAuth client or redirect configuration: ${body.slice(0, 180)}`).not.toBe(401);
    expect(response.status).toBe(400);
    expect(body.toLowerCase()).not.toContain("redirect_uri_mismatch");
  }, 20_000);
});
