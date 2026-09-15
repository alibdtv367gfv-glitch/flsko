import { describe, expect, it } from "vitest";

describe("Google OAuth redirect URI", () => {
  it("is accepted by Google token endpoint as a configured redirect value", async () => {
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

    expect(redirectUri).toBe("https://3000-ip2xurojkgt2ynq8i8vhh-a8a8c131.us4.manus.computer/api/google/callback");
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(clientSecret).toBeTruthy();

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: "flsko-redirect-uri-check",
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
        grant_type: "authorization_code",
      }).toString(),
    });
    const body = await response.text();
    expect(response.status, `Google rejected the OAuth client or redirect configuration: ${body.slice(0, 180)}`).not.toBe(401);
    expect(response.status).toBe(400);
  }, 20_000);
});
