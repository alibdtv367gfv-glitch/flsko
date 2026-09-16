type D1Result<T = Record<string, unknown>> = { results: T[] };
type D1Statement = { bind: (...values: unknown[]) => D1Statement; first: <T = Record<string, unknown>>() => Promise<T | null>; all: <T = Record<string, unknown>>() => Promise<D1Result<T>>; run: () => Promise<unknown> };
type D1Database = { prepare: (query: string) => D1Statement };

export interface Env {
  DB: D1Database;
  HF_TOKEN: string;
  FLSKO_HF_MODEL?: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  SESSION_SECRET: string;
}

type WorkerHandler = { fetch: (request: Request, env: Env) => Promise<Response> };
const encoder = new TextEncoder();
const SYSTEM_PROMPT = "أنت فلسقوا، وكيل عربي أولًا يفهم السوريين بتنوعهم دون تنميط. أجب بلهجة المستخدم قدر الإمكان، وكن دقيقًا وصريحًا بشأن حدود معرفتك. إذا سأل المستخدم عن اسمك فقل: اسمي فلسقوا.";

function corsHeaders(origin: string | null): HeadersInit {
  return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Credentials": "true", "Access-Control-Max-Age": "86400" };
}
function json(value: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) } });
}
function redirect(url: string, origin: string | null = null) { return new Response(null, { status: 302, headers: { Location: url, ...corsHeaders(origin) } }); }
function cookie(name: string, value: string, maxAge: number) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function getBearer(request: Request) { return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || null; }
function getCookie(request: Request, name: string) { return request.headers.get("Cookie")?.split(";").map((x) => x.trim()).find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) || null; }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value)); return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""); }
function randomToken() { return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`; }
function validReturnTo(value: string, platform: string) { if (platform === "native") return value.startsWith("manus"); try { const url = new URL(value); return url.protocol === "https:" || url.hostname === "localhost"; } catch { return false; } }
async function currentUser(request: Request, env: Env) {
  const token = getBearer(request) || getCookie(request, "app_session_id");
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare("SELECT u.id, u.open_id as openId, u.name, u.email, u.picture, u.role, u.last_signed_in as lastSignedIn FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?1").bind(hash, Date.now()).first<Record<string, unknown>>();
  return row || null;
}
async function exchangeGoogle(code: string, env: Env) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI, grant_type: "authorization_code" }) });
  if (!response.ok) throw new Error("Google token exchange failed");
  return response.json() as Promise<{ access_token: string }>;
}
async function googleUser(accessToken: string) { const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }); if (!response.ok) throw new Error("Google profile failed"); return response.json() as Promise<{ sub: string; name?: string; email?: string; picture?: string }>; }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/api/health") return json({ ok: true, service: "flsko-api", database: "d1", timestamp: Date.now() }, 200, origin);

    if (url.pathname === "/api/google/start" && request.method === "GET") {
      const platform = url.searchParams.get("platform") === "native" ? "native" : "web";
      const returnTo = url.searchParams.get("returnTo") || "";
      if (!validReturnTo(returnTo, platform)) return json({ error: "Invalid OAuth return URL" }, 400, origin);
      const state = randomToken();
      await env.DB.prepare("INSERT INTO oauth_states(state, return_to, platform, expires_at) VALUES(?,?,?,?)").bind(state, returnTo, platform, Date.now() + 10 * 60 * 1000).run();
      const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      google.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID); google.searchParams.set("redirect_uri", env.GOOGLE_OAUTH_REDIRECT_URI); google.searchParams.set("response_type", "code"); google.searchParams.set("scope", "openid email profile"); google.searchParams.set("state", state); google.searchParams.set("prompt", "select_account");
      return redirect(google.toString(), origin);
    }

    if (url.pathname === "/api/google/callback" && request.method === "GET") {
      const code = url.searchParams.get("code") || ""; const stateValue = url.searchParams.get("state") || "";
      try {
        const state = await env.DB.prepare("SELECT return_to as returnTo, platform FROM oauth_states WHERE state=? AND expires_at>?1").bind(stateValue, Date.now()).first<{ returnTo: string; platform: string }>();
        if (!code || !state) throw new Error("OAuth state invalid or expired");
        await env.DB.prepare("DELETE FROM oauth_states WHERE state=?").bind(stateValue).run();
        const profile = await googleUser((await exchangeGoogle(code, env)).access_token);
        const openId = `google:${profile.sub}`;
        await env.DB.prepare("INSERT INTO users(open_id,name,email,picture,last_signed_in) VALUES(?,?,?,?,?) ON CONFLICT(open_id) DO UPDATE SET name=excluded.name,email=excluded.email,picture=excluded.picture,last_signed_in=excluded.last_signed_in").bind(openId, profile.name || profile.email || "", profile.email || null, profile.picture || null, new Date().toISOString()).run();
        const user = await env.DB.prepare("SELECT id, open_id as openId, name, email, picture, role, last_signed_in as lastSignedIn FROM users WHERE open_id=?").bind(openId).first<Record<string, unknown>>();
        const token = randomToken(); await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256(token), user?.id, Date.now() + 365 * 24 * 60 * 60 * 1000).run();
        const target = new URL(state.returnTo); target.searchParams.set("sessionToken", token); target.searchParams.set("user", btoa(JSON.stringify(user)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""));
        return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": cookie("app_session_id", token, 365 * 24 * 60 * 60), ...corsHeaders(origin) } });
      } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر إكمال تسجيل الدخول" }, 401, origin); }
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") return json({ user: await currentUser(request, env) }, 200, origin);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") { const token = getBearer(request) || getCookie(request, "app_session_id"); if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run(); return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json", "Set-Cookie": cookie("app_session_id", "", 0), ...corsHeaders(origin) } }); }

    if (url.pathname === "/api/memory" && request.method === "GET") { const user = await currentUser(request, env); if (!user) return json({ error: "تسجيل الدخول مطلوب" }, 401, origin); const rows = await env.DB.prepare("SELECT id, category, content, consent, created_at as createdAt FROM memories WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all(); return json(rows.results, 200, origin); }
    if (url.pathname === "/api/memory" && request.method === "POST") { const user = await currentUser(request, env); if (!user) return json({ error: "تسجيل الدخول مطلوب" }, 401, origin); const body = await request.json().catch(() => ({})) as { category?: string; content?: string; consent?: boolean }; if (!body.category || !body.content || body.consent !== true) return json({ error: "الفئة والمحتوى والموافقة مطلوبة" }, 400, origin); await env.DB.prepare("INSERT INTO memories(user_id,category,content,consent) VALUES(?,?,?,1)").bind(user.id, body.category.slice(0, 64), body.content.slice(0, 1200)).run(); return json({ accepted: true }, 201, origin); }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const user = await currentUser(request, env); if (!user) return json({ error: "تسجيل الدخول مطلوب" }, 401, origin);
      const body = await request.json().catch(() => ({})) as { message?: unknown; mode?: string }; const message = typeof body.message === "string" ? body.message.trim() : ""; if (!message || message.length > 6000) return json({ error: "الرسالة مطلوبة وبحد أقصى 6000 حرف" }, 400, origin);
      const memories = await env.DB.prepare("SELECT content FROM memories WHERE user_id=? AND consent=1 ORDER BY created_at DESC LIMIT 20").bind(user.id).all<{ content: string }>();
      const mode = body.mode === "pro-max" ? "برو ماكس" : body.mode === "pro" ? "برو" : "طبيعي وسريع";
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.HF_TOKEN}` }, body: JSON.stringify({ model: env.FLSKO_HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct", messages: [{ role: "system", content: `${SYSTEM_PROMPT}\nوضع الإجابة: ${mode}.\nذاكرة المستخدم المصرح بها:\n${memories.results.map((x) => x.content).join("\n")}` }, { role: "user", content: message }], temperature: 0.6, max_tokens: 1000 }) });
      const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }> }; if (!response.ok) return json({ error: "تعذر الحصول على رد من مزود النموذج" }, 502, origin); const text = payload.choices?.[0]?.message?.content; if (typeof text !== "string" || !text.trim()) return json({ error: "لم يصل رد نصي من النموذج" }, 502, origin);
      await env.DB.prepare("INSERT INTO messages(user_id,role,content) VALUES(?,?,?)").bind(user.id, "user", message).run(); await env.DB.prepare("INSERT INTO messages(user_id,role,content) VALUES(?,?,?)").bind(user.id, "assistant", text.trim()).run(); return json({ text: text.trim(), provider: "orchestrator", sourceId: "huggingface", compared: 1 }, 200, origin);
    }
    return json({ error: "المسار غير موجود" }, 404, origin);
  },
} satisfies WorkerHandler;
