import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { ONE_YEAR_MS } from "../../shared/const.js";
import { getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

type GoogleState = { returnTo: string; platform: "web" | "native"; nonce: string };

type GoogleUserInfo = { sub: string; name?: string; email?: string; picture?: string };

function googleSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

/**
 * Google OAuth redirect URI.
 * Production (Cloudflare Workers): set GOOGLE_OAUTH_REDIRECT_URI to
 * https://flsko-api.flsko.workers.dev/api/google/callback
 * and register the same value in Google Cloud Console → Credentials → Authorized redirect URIs.
 * Legacy Manus hosts (3000-*.manus.computer) must not be used in production.
 */
function getCallbackUri(req: Request) {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  const forwarded = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() || req.protocol;
  return `${protocol}://${req.get("host")}/api/google/callback`;
}

function validReturnTo(value: string, platform: "web" | "native") {
  if (!value || value.length > 2000) return false;
  if (platform === "native") {
    // Custom app scheme (com.flsko.app → manusapp), Expo Go (exp:// / exps://), and legacy
    if (value.startsWith("manusapp://")) return true;
    if (value.startsWith("flsko://")) return true;
    if (value.startsWith("exp://") || value.startsWith("exps://")) return true;
    return false;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
    if (url.protocol !== "https:") return false;
    // Allow app/API hosts only (block open redirects)
    const host = url.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".flsko.workers.dev") ||
      host.endsWith(".manus.computer") ||
      host.endsWith(".expo.dev") ||
      host === "flsko.workers.dev"
    );
  } catch {
    return false;
  }
}

async function createState(state: GoogleState) {
  return new SignJWT(state)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(googleSecret());
}

async function readState(value: string): Promise<GoogleState> {
  const { payload } = await jwtVerify(value, googleSecret(), { algorithms: ["HS256"] });
  if (payload.platform !== "web" && payload.platform !== "native") throw new Error("Invalid OAuth platform");
  if (typeof payload.returnTo !== "string" || !validReturnTo(payload.returnTo, payload.platform)) throw new Error("Invalid OAuth return URL");
  if (typeof payload.nonce !== "string") throw new Error("Invalid OAuth state");
  return { returnTo: payload.returnTo, platform: payload.platform, nonce: payload.nonce };
}

async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials are not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  return response.json() as Promise<{ access_token: string }>;
}

async function getGoogleUser(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google profile request failed (${response.status})`);
  return response.json() as Promise<GoogleUserInfo>;
}

async function createFlskoSession(profile: GoogleUserInfo) {
  if (!profile.sub) throw new Error("Google profile has no subject");
  const openId = `google:${profile.sub}`;
  await upsertUser({ openId, name: profile.name ?? profile.email ?? "", email: profile.email ?? null, loginMethod: "google", lastSignedIn: new Date() });
  const user = await getUserByOpenId(openId);
  const sessionToken = await sdk.createSessionToken(openId, { name: profile.name ?? profile.email ?? "", expiresInMs: ONE_YEAR_MS });
  return { sessionToken, user: user ?? { openId, name: profile.name ?? profile.email ?? "", email: profile.email ?? null, loginMethod: "google", lastSignedIn: new Date() } };
}

function encodeUser(user: any) {
  const safe = { id: user.id ?? null, openId: user.openId, name: user.name ?? null, email: user.email ?? null, loginMethod: "google", role: user.role ?? "user", lastSignedIn: new Date(user.lastSignedIn ?? Date.now()).toISOString() };
  return Buffer.from(JSON.stringify(safe), "utf8").toString("base64url");
}

export function registerGoogleOAuthRoutes(app: Express) {
  app.get("/api/google/start", async (req: Request, res: Response) => {
    try {
      const platform = req.query.platform === "native" ? "native" : "web";
      const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "";
      if (!validReturnTo(returnTo, platform)) { res.status(400).json({ error: "Invalid OAuth return URL" }); return; }
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
      if (!clientId) { res.status(503).json({ error: "Google login is not configured" }); return; }
      const redirectUri = getCallbackUri(req);
      const state = await createState({ returnTo, platform, nonce: crypto.randomUUID() });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("state", state);
      url.searchParams.set("prompt", "select_account");
      url.searchParams.set("access_type", "online");
      res.redirect(302, url.toString());
    } catch (error) {
      console.error("[Google OAuth] Start failed", error);
      res.status(500).json({ error: "تعذر بدء تسجيل الدخول عبر Google" });
    }
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateValue = typeof req.query.state === "string" ? req.query.state : "";
    try {
      if (!code || !stateValue) throw new Error("Google لم يُرجع رمز تسجيل الدخول");
      const state = await readState(stateValue);
      const token = await exchangeGoogleCode(code, getCallbackUri(req));
      const profile = await getGoogleUser(token.access_token);
      const session = await createFlskoSession(profile);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie("app_session_id", session.sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      if (state.platform === "native") {
        const callback = new URL(state.returnTo);
        callback.searchParams.set("sessionToken", session.sessionToken);
        callback.searchParams.set("user", encodeUser(session.user));
        res.redirect(302, callback.toString());
      } else {
        res.redirect(302, state.returnTo);
      }
    } catch (error) {
      console.error("[Google OAuth] Callback failed", error);
      const fallback = stateValue ? await readState(stateValue).catch(() => null) : null;
      if (fallback) {
        const callback = new URL(fallback.returnTo);
        callback.searchParams.set("error", "google_login_failed");
        res.redirect(302, callback.toString());
      } else {
        res.status(401).json({ error: "تعذر إكمال تسجيل الدخول عبر Google" });
      }
    }
  });
}
