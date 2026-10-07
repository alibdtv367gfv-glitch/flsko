import { providerHealthSnapshot, routeWithFallback } from "./neural-router";
import {
  brainDirectAnswer,
  buildBrainSystemPrompt,
  buildTutorSessionPrompt,
  classifyIntent,
  clampScore,
  detectDialectHint,
  formatLessonLine,
  injectLessonsIntoPrompt,
  loadRecentTurns,
  learningNote,
  polishReply,
  scoreCandidate,
  tutorDayKey,
  TUTOR_DAILY_LIMIT,
  type TutorAction,
  type TutorRole,
} from "./flsko-brain";

type D1Result<T = Record<string, unknown>> = { results: T[] };
type D1Statement = { bind: (...values: unknown[]) => D1Statement; first: <T = Record<string, unknown>>() => Promise<T | null>; all: <T = Record<string, unknown>>() => Promise<D1Result<T>>; run: () => Promise<unknown> };
type D1Database = { prepare: (query: string) => D1Statement };

export interface Env {
  DB: D1Database;
  HF_TOKEN: string;
  FLSKO_HF_MODEL?: string;
  FLSKO_IMAGE_PROVIDER_URL?: string;
  FLSKO_VIDEO_PROVIDER_URL?: string;
  FLSKO_MUSIC_PROVIDER_URL?: string;
  FLSKO_VODER_API_URL?: string;
  FLSKO_WAN_SPACE?: string;
  OPENROUTER_API_KEY?: string;
  FLSKO_OPENROUTER_MODEL?: string;
  FLSKO_GEMINI_API_KEY?: string;
  FLSKO_GEMINI_MODEL?: string;
  FLSKO_TUTOR_SECRET?: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  SESSION_SECRET: string;
}

type WorkerHandler = { fetch: (request: Request, env: Env) => Promise<Response> };
const encoder = new TextEncoder();
const SYSTEM_PROMPT = "أنت فلسقوا (Flsko). طوّرك علي يوسف. لست Gemini ولا ChatGPT. اسمك فلسقوا فقط.";
const VOICE_LIVE_BOOTSTRAP = `تعليمات جلسة صوتية مباشرة — داخلية وليست للمستخدم:
1) اسمك الوحيد: فلسقوا (Flsko). ممنوع التعريف بنفسك كـ Gemini أو Google أو أي اسم آخر.
2) طوّرك: علي يوسف.
3) تحدّث بشكل طبيعي وقصير مناسب للصوت (جمل واضحة، بدون قوائم طويلة إلا عند الحاجة).
4) استخدم معلومات المستخدم أدناه لجعل الحوار سلسًا ومنطقيًا، دون تكرارها بصوت عالٍ إلا إذا سأل.
5) إن لم تعرف شيئًا قل ذلك بصراحة بلهجة ودّية.`;
/** Logical wall-clock budgets so Flsko can finish media jobs. */
const IMAGE_TIMEOUT_MS = 90_000;       // Pollinations / direct image
const IMAGE_QUEUE_ROUNDS = 30;          // AI Horde / HF Space ~30×3s ≈ 90s
const IMAGE_QUEUE_DELAY_MS = 3_000;
const VIDEO_SUBMIT_TIMEOUT_MS = 45_000;
const VIDEO_POLL_ROUNDS = 12;          // one mediaJob call ≈ 12×4s ≈ 48s internal
const VIDEO_POLL_DELAY_MS = 4_000;
const VIDEO_ESTIMATED_SEC = 120;       // tell client expected total wait
const IMAGE_ESTIMATED_SEC = 45;

let routerTablesReady: Promise<void> | null = null;


async function ensureConversationTables(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'محادثة جديدة',
    mode TEXT NOT NULL DEFAULT 'natural',
    pinned_task INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  try {
    await env.DB.prepare("ALTER TABLE messages ADD COLUMN conversation_id INTEGER").run();
  } catch { /* column may exist */ }
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations(user_id, updated_at)").run();
}

async function purgeExpiredConversations(env: Env, userId: unknown) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const old = await env.DB.prepare(
    "SELECT id FROM conversations WHERE user_id=? AND pinned_task=0 AND updated_at < ?"
  ).bind(userId, cutoff).all<{ id: number }>();
  for (const row of old.results || []) {
    await env.DB.prepare("DELETE FROM messages WHERE conversation_id=?").bind(row.id).run();
    await env.DB.prepare("DELETE FROM conversations WHERE id=? AND user_id=?").bind(row.id, userId).run();
  }
}

async function ensureDefaultConversation(env: Env, userId: unknown, mode = "natural") {
  await ensureConversationTables(env);
  await purgeExpiredConversations(env, userId);
  const existing = await env.DB.prepare(
    "SELECT id, title, mode, pinned_task as pinnedTask, summary, updated_at as updatedAt FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 1"
  ).bind(userId).first();
  if (existing) return existing;
  const now = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO conversations(user_id,title,mode,pinned_task,updated_at,created_at) VALUES(?,?,?,0,?,?)"
  ).bind(userId, "محادثة جديدة", mode, now, now).run();
  return {
    id: Number((res as { meta: { last_row_id: number | string } }).meta.last_row_id),
    title: "محادثة جديدة",
    mode,
    pinnedTask: 0,
    summary: null,
    updatedAt: now,
  };
}

async function listConversations(env: Env, userId: unknown) {
  await ensureConversationTables(env);
  await purgeExpiredConversations(env, userId);
  const rows = await env.DB.prepare(
    "SELECT id, title, mode, pinned_task as pinnedTask, summary, updated_at as updatedAt, created_at as createdAt FROM conversations WHERE user_id=? ORDER BY pinned_task DESC, updated_at DESC LIMIT 80"
  ).bind(userId).all();
  return rows.results || [];
}

async function getConversationMessages(env: Env, userId: unknown, conversationId: number) {
  const conv = await env.DB.prepare(
    "SELECT id, title, mode, pinned_task as pinnedTask, summary FROM conversations WHERE id=? AND user_id=?"
  ).bind(conversationId, userId).first();
  if (!conv) throw new Error("المحادثة غير موجودة");
  const msgs = await env.DB.prepare(
    "SELECT id, role, content, created_at as createdAt FROM messages WHERE user_id=? AND conversation_id=? ORDER BY id ASC LIMIT 200"
  ).bind(userId, conversationId).all();
  return { conversation: conv, messages: msgs.results || [] };
}

async function createConversation(env: Env, userId: unknown, title?: string, mode = "natural") {
  await ensureConversationTables(env);
  const now = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO conversations(user_id,title,mode,pinned_task,updated_at,created_at) VALUES(?,?,?,0,?,?)"
  ).bind(userId, (title || "محادثة جديدة").slice(0, 80), mode, now, now).run();
  return { id: Number((res as { meta: { last_row_id: number | string } }).meta.last_row_id), title: title || "محادثة جديدة", mode, pinnedTask: 0, updatedAt: now };
}

async function pinConversationAsTask(env: Env, userId: unknown, conversationId: number) {
  const data = await getConversationMessages(env, userId, conversationId);
  const transcript = (data.messages as Array<{ role: string; content: string }>)
    .map((m) => `${m.role === "user" ? "المستخدم" : "فلسقوا"}: ${m.content}`)
    .join("\n")
    .slice(0, 6000);
  let summary = "ملخص مهمة محفوظ من محادثة فلسقوا.";
  try {
    const system = "أنت فلسقوا. لخّص المحادثة التالية بنقاط عربية قصيرة تحفظ المعلومات المهمة للمستخدم فقط (أسماء، قرارات، تفضيلات، مهام). بدون حشو.";
    if (env.FLSKO_GEMINI_API_KEY) {
      summary = await geminiChat(env, [
        { role: "system", content: system },
        { role: "user", content: transcript || "محادثة قصيرة" },
      ], 500);
    } else if (env.OPENROUTER_API_KEY) {
      summary = await openRouterChat(env, env.FLSKO_OPENROUTER_MODEL || "openrouter/free", [
        { role: "system", content: system },
        { role: "user", content: transcript || "محادثة قصيرة" },
      ], 500, 0.3);
    }
  } catch {
    summary = transcript.slice(0, 400) || summary;
  }
  summary = summary.slice(0, 1500);
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE conversations SET pinned_task=1, summary=?, updated_at=?, title=COALESCE(NULLIF(title,''), ?) WHERE id=? AND user_id=?"
  ).bind(summary, now, "مهمة محفوظة", conversationId, userId).run();
  await env.DB.prepare(
    "INSERT INTO memories(user_id,category,content,consent) VALUES(?,?,?,1)"
  ).bind(userId, "مهمة-محادثة", summary).run();
  return { conversationId, summary, pinnedTask: true, message: "حُفظ ملخص المهمة في الذاكرة السحابية. المحادثات غير المهمة تُحذف بعد 30 يومًا." };
}

async function ensureRouterTables(env: Env) {
  if (!routerTablesReady) {
    routerTablesReady = env.DB.prepare("CREATE TABLE IF NOT EXISTS provider_health (provider_id TEXT PRIMARY KEY, kind TEXT NOT NULL, failures INTEGER NOT NULL DEFAULT 0, last_failure_at INTEGER, disabled_until INTEGER, last_error TEXT, updated_at INTEGER NOT NULL)").run()
      .then(() => env.DB.prepare("CREATE TABLE IF NOT EXISTS provider_events (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id TEXT NOT NULL, kind TEXT NOT NULL, outcome TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL)").run())
      .then(() => undefined);
  }
  await routerTablesReady;
}

function routerHooks(env: Env) {
  return {
    onSuccess: async (provider: { id: string; kind: string }) => {
      await ensureRouterTables(env);
      await env.DB.prepare("INSERT INTO provider_health(provider_id,kind,failures,last_failure_at,disabled_until,last_error,updated_at) VALUES(?,?,0,NULL,NULL,NULL,?) ON CONFLICT(provider_id) DO UPDATE SET kind=excluded.kind,failures=0,last_failure_at=NULL,disabled_until=NULL,last_error=NULL,updated_at=excluded.updated_at").bind(provider.id, provider.kind, Date.now()).run();
      await env.DB.prepare("INSERT INTO provider_events(provider_id,kind,outcome,error,created_at) VALUES(?,?,?,NULL,?)").bind(provider.id, provider.kind, "success", Date.now()).run();
    },
    onFailure: async (provider: { id: string; kind: string }, error: unknown) => {
      await ensureRouterTables(env);
      const message = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
      await env.DB.prepare("INSERT INTO provider_health(provider_id,kind,failures,last_failure_at,disabled_until,last_error,updated_at) VALUES(?,?,1,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET kind=excluded.kind,failures=provider_health.failures+1,last_failure_at=excluded.last_failure_at,disabled_until=excluded.disabled_until,last_error=excluded.last_error,updated_at=excluded.updated_at").bind(provider.id, provider.kind, Date.now(), Date.now() + 60000, message, Date.now()).run();
      await env.DB.prepare("INSERT INTO provider_events(provider_id,kind,outcome,error,created_at) VALUES(?,?,?,?,?)").bind(provider.id, provider.kind, "failure", message, Date.now()).run();
    },
  };
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Flsko-Tutor-Secret, X-Flsko-Tutor",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

/** In-isolate memory cache for hot read-only payloads (media status, version, etc.). */
const memoryCache = new Map<string, { exp: number; body: string }>();

function memoryGet(key: string): string | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    memoryCache.delete(key);
    return null;
  }
  return hit.body;
}

function memorySet(key: string, value: unknown, ttlMs: number) {
  memoryCache.set(key, { exp: Date.now() + ttlMs, body: JSON.stringify(value) });
  // Soft bound: drop oldest-ish entries if map grows
  if (memoryCache.size > 80) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
}

function json(
  value: unknown,
  status = 200,
  origin: string | null = null,
  cacheControl?: string,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(origin) as Record<string, string>,
  };
  if (cacheControl) headers["cache-control"] = cacheControl;
  else headers["cache-control"] = "no-store";
  return new Response(JSON.stringify(value), { status, headers });
}

function jsonCached(key: string, ttlMs: number, origin: string | null, producer: () => unknown | Promise<unknown>, edgeMaxAgeSec?: number) {
  return (async () => {
    const cached = memoryGet(key);
    const edge = edgeMaxAgeSec
      ? `public, max-age=${edgeMaxAgeSec}, s-maxage=${edgeMaxAgeSec}, stale-while-revalidate=${edgeMaxAgeSec * 2}`
      : `public, max-age=${Math.max(5, Math.floor(ttlMs / 1000))}`;
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-flsko-cache": "HIT",
          "cache-control": edge,
          ...corsHeaders(origin) as Record<string, string>,
        },
      });
    }
    const value = await producer();
    memorySet(key, value, ttlMs);
    return json(value, 200, origin, edge);
  })();
}
function redirect(url: string, origin: string | null = null) { return new Response(null, { status: 302, headers: { Location: url, ...corsHeaders(origin) } }); }
function legalPage(title: string, body: string) { return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Flsko</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:2;color:#172033;background:#f8fafc}main{background:white;border:1px solid #dbe4ee;border-radius:20px;padding:28px}h1{color:#087ea4}a{color:#087ea4}</style><main><p><b>Flsko · فلسقوا</b></p><h1>${title}</h1>${body}<hr><p><a href="https://flsko-api.flsko.workers.dev/download">صفحة التنزيل الرسمية</a> · <a href="https://flsko-api.flsko.workers.dev/privacy">سياسة الخصوصية</a> · <a href="https://flsko-api.flsko.workers.dev/terms">شروط الاستخدام</a></p><p>© 2026 علي يوسف · Flsko</p></main></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } }); }
function cookie(name: string, value: string, maxAge: number) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function getBearer(request: Request) { return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || null; }
function getCookie(request: Request, name: string) { return request.headers.get("Cookie")?.split(";").map((x) => x.trim()).find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) || null; }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value)); return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""); }

/** PBKDF2-SHA256 password hashing (Workers Web Crypto). */
async function hashPasswordPbkdf2(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64
    ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, keyMaterial, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltOut = saltB64 || btoa(String.fromCharCode(...salt));
  return { hash, salt: saltOut };
}

async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const derived = await hashPasswordPbkdf2(password, salt);
  if (derived.hash.length !== hash.length) return false;
  let ok = 0;
  for (let i = 0; i < hash.length; i++) ok |= derived.hash.charCodeAt(i) ^ hash.charCodeAt(i);
  return ok === 0;
}

async function ensureEmailAuthColumns(env: Env) {
  for (const sql of [
    "ALTER TABLE users ADD COLUMN password_hash TEXT",
    "ALTER TABLE users ADD COLUMN password_salt TEXT",
    "ALTER TABLE users ADD COLUMN login_method TEXT DEFAULT 'google'",
  ]) {
    try { await env.DB.prepare(sql).run(); } catch { /* exists */ }
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

async function issueSession(env: Env, userId: number, origin: string | null) {
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256(token), userId, Date.now() + 365 * 24 * 60 * 60 * 1000).run();
  const user = await env.DB.prepare("SELECT id, open_id as openId, name, email, picture, role, last_signed_in as lastSignedIn, login_method as loginMethod FROM users WHERE id=?").bind(userId).first();
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) as Record<string, string> });
  headers.append("Set-Cookie", cookie("app_session_id", token, 365 * 24 * 60 * 60));
  return new Response(JSON.stringify({ sessionToken: token, user }), { status: 200, headers });
}

async function registerWithEmail(env: Env, email: string, password: string, name?: string) {
  await ensureEmailAuthColumns(env);
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new Error("البريد غير صالح");
  if (password.length < 8 || password.length > 128) throw new Error("كلمة المرور من 8 إلى 128 حرفًا");
  const existing = await env.DB.prepare(
    "SELECT id, password_hash, open_id as openId, login_method as loginMethod FROM users WHERE lower(email)=?"
  ).bind(normalized).first<{ id: number; password_hash: string | null; openId: string; loginMethod: string | null }>();
  // منع حسابين بنفس البريد مهما كانت طريقة الدخول السابقة
  if (existing) {
    if (existing.password_hash) {
      throw new Error("هذا البريد مسجّل مسبقًا — استخدم تسجيل الدخول أو استعادة كلمة المرور");
    }
    throw new Error("هذا البريد مرتبط بحساب موجود (مثل Google). سجّل الدخول بذلك الحساب بدل إنشاء حساب جديد");
  }
  const openIdClash = await env.DB.prepare("SELECT id FROM users WHERE open_id=?").bind(`email:${normalized}`).first();
  if (openIdClash) throw new Error("هذا البريد مسجّل مسبقًا — جرّب تسجيل الدخول");

  const { hash, salt } = await hashPasswordPbkdf2(password);
  const openId = `email:${normalized}`;
  const display = (name || normalized.split("@")[0] || "مستخدم").slice(0, 80);
  await env.DB.prepare(
    "INSERT INTO users(open_id,name,email,password_hash,password_salt,login_method,last_signed_in) VALUES(?,?,?,?,?,?,?)"
  ).bind(openId, display, normalized, hash, salt, "email", new Date().toISOString()).run();
  const row = await env.DB.prepare("SELECT id FROM users WHERE open_id=?").bind(openId).first<{ id: number }>();
  if (!row) throw new Error("تعذر إنشاء الحساب");
  return row.id;
}

async function loginWithEmail(env: Env, email: string, password: string) {
  await ensureEmailAuthColumns(env);
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new Error("البريد غير صالح");
  const row = await env.DB.prepare("SELECT id, password_hash, password_salt FROM users WHERE lower(email)=?").bind(normalized).first<{ id: number; password_hash: string | null; password_salt: string | null }>();
  if (!row?.password_hash || !row.password_salt) throw new Error("بيانات الدخول غير صحيحة");
  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) throw new Error("بيانات الدخول غير صحيحة");
  await env.DB.prepare("UPDATE users SET last_signed_in=? WHERE id=?").bind(new Date().toISOString(), row.id).run();
  return row.id;
}



async function ensureResetTable(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`).run();
}

function generateResetCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

async function sendResetEmail(env: Env, to: string, code: string): Promise<{ sent: boolean; via: string }> {
  const from = env.FLSKO_MAIL_FROM || "Flsko <onboarding@resend.dev>";
  const subject = "رمز استعادة كلمة مرور فلسقوا";
  const text = `رمز التحقق الخاص بك: ${code}\nصالح لمدة 15 دقيقة.\nإذا لم تطلب الاستعادة فتجاهل الرسالة.\n— فلسقوا`;
  const html = `<div dir="rtl" style="font-family:sans-serif;line-height:1.8"><p>رمز التحقق لاستعادة كلمة المرور:</p><p style="font-size:28px;font-weight:800;letter-spacing:4px">${code}</p><p>صالح لمدة 15 دقيقة.</p><p style="color:#64748b">إذا لم تطلب ذلك فتجاهل الرسالة.</p><p>— فلسقوا</p></div>`;

  // 1) Resend
  const resendKey = env.RESEND_API_KEY || env.FLSKO_RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (res.ok) return { sent: true, via: "resend" };
    console.log("resend failed", res.status, await res.text().catch(() => ""));
  }

  // 2) Generic webhook (Zapier / Make / Apps Script / n8n)
  if (env.FLSKO_EMAIL_HOOK_URL) {
    const res = await fetch(env.FLSKO_EMAIL_HOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(env.FLSKO_EMAIL_HOOK_SECRET ? { "x-flsko-secret": env.FLSKO_EMAIL_HOOK_SECRET } : {}) },
      body: JSON.stringify({ type: "password_reset", to, subject, text, html, code }),
    });
    if (res.ok) return { sent: true, via: "hook" };
  }

  return { sent: false, via: "none" };
}

async function requestPasswordReset(env: Env, email: string): Promise<{ ok: true; message: string; debugCode?: string }> {
  await ensureEmailAuthColumns(env);
  await ensureResetTable(env);
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new Error("البريد غير صالح");

  // Always same outward behavior for unknown emails (anti-enumeration)
  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE lower(email)=? AND password_hash IS NOT NULL AND password_hash != ''"
  ).bind(normalized).first<{ id: number }>();

  const generic = "إن وُجد حساب بهذا البريد فسنرسل رمز تحقق صالحًا لمدة 15 دقيقة.";

  if (!user) return { ok: true, message: generic };

  // rate limit: max 3 active tokens / 15 min
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM password_reset_tokens WHERE email=? AND created_at > ?"
  ).bind(normalized, Date.now() - 15 * 60 * 1000).first<{ c: number }>();
  if ((recent?.c || 0) >= 3) throw new Error("محاولات كثيرة — انتظر ربع ساعة ثم أعد المحاولة");

  const code = generateResetCode();
  const codeHash = await sha256(code);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO password_reset_tokens(email, code_hash, expires_at, used, created_at) VALUES(?,?,?,0,?)"
  ).bind(normalized, codeHash, now + 15 * 60 * 1000, now).run();

  const mail = await sendResetEmail(env, normalized, code);
  const out: { ok: true; message: string; debugCode?: string } = {
    ok: true,
    message: mail.sent
      ? "أرسلنا رمز التحقق إلى بريدك. أدخله مع كلمة المرور الجديدة."
      : generic + " (تعذر إرسال البريد تلقائيًا — اضبط RESEND_API_KEY أو FLSKO_EMAIL_HOOK_URL في Cloudflare).",
  };
  // Only expose code when explicitly enabled for staging
  if (env.FLSKO_RESET_DEBUG === "1" && !mail.sent) out.debugCode = code;
  return out;
}

async function resetPasswordWithCode(env: Env, email: string, code: string, newPassword: string) {
  await ensureEmailAuthColumns(env);
  await ensureResetTable(env);
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new Error("البريد غير صالح");
  if (!/^\d{6}$/.test(code.trim())) throw new Error("رمز التحقق يجب أن يكون 6 أرقام");
  if (newPassword.length < 8 || newPassword.length > 128) throw new Error("كلمة المرور من 8 إلى 128 حرفًا");

  const codeHash = await sha256(code.trim());
  const row = await env.DB.prepare(
    "SELECT id FROM password_reset_tokens WHERE email=? AND code_hash=? AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1"
  ).bind(normalized, codeHash, Date.now()).first<{ id: number }>();
  if (!row) throw new Error("رمز غير صالح أو منتهٍ — اطلب رمزًا جديدًا");

  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE lower(email)=? AND password_hash IS NOT NULL"
  ).bind(normalized).first<{ id: number }>();
  if (!user) throw new Error("الحساب غير موجود");

  const { hash, salt } = await hashPasswordPbkdf2(newPassword);
  await env.DB.prepare(
    "UPDATE users SET password_hash=?, password_salt=?, login_method=?, last_signed_in=? WHERE id=?"
  ).bind(hash, salt, "email", new Date().toISOString(), user.id).run();
  await env.DB.prepare("UPDATE password_reset_tokens SET used=1 WHERE id=?").bind(row.id).run();
  // invalidate other sessions optional: delete sessions for user
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id).run();
  return { ok: true, message: "تم تحديث كلمة المرور. سجّل الدخول الآن." };
}


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
function trpcResult(data: unknown, origin: string | null) { return json([{ result: { data: { json: data } } }], 200, origin); }
function trpcError(message: string, status: number, origin: string | null) { return json([{ error: { json: { message, data: { code: status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST", httpStatus: status } } } }], status, origin); }
function layer(id: string, name: string, kind: string, priority: number, available: boolean, reason: string) { return { id, name, kind, priority, available, reason }; }
async function mediaStatus(env?: Env) {
  const persistedHealth = env ? await env.DB.prepare("SELECT provider_id as id, kind, failures, last_failure_at as lastFailureAt, disabled_until as disabledUntil, last_error as lastError, updated_at as updatedAt FROM provider_health ORDER BY kind, provider_id").all().catch(() => ({ results: [] })) : { results: [] };
  return {
    policy: "automatic-best-available",
    router: { mode: "safe-fallback", failureCooldownMs: 60000, health: providerHealthSnapshot(), persistedHealth: persistedHealth.results },
    image: { selected: env?.FLSKO_IMAGE_PROVIDER_URL ? "configured-open-provider" : "pollinations-flux", layers: [layer("configured-open-provider", "مزود صور مخصص", "cloud-open", 1, Boolean(env?.FLSKO_IMAGE_PROVIDER_URL), env?.FLSKO_IMAGE_PROVIDER_URL ? "مهيأ" : "غير مهيأ"), layer("pollinations-flux", "Pollinations Flux", "cloud-open", 2, true, "طبقة أساسية عامة"), layer("ai-horde", "AI Horde", "cloud-open", 3, true, "طوابير مجهولة مجانية"), layer("pollinations-turbo", "Pollinations Turbo", "cloud-open", 4, true, "احتياط"), layer("lexica-search", "Lexica Search", "unofficial", 5, true, "بحث صور تقريبية غير رسمي"), layer("hf-flux-schnell", "HF FLUX.1-schnell Space", "hf-space", 6, true, "احتياط Hugging Face")] },
    video: { selected: env?.FLSKO_WAN_SPACE ? "wan-gradio" : null, layers: [layer("gemini-veo", "Gemini/Veo", "cloud-closed", 1, false, "حصة Gemini الحالية أعادت 429"), layer("wan-gradio", "Wan 2.1 Gradio Space", "cloud-open-queue", 2, Boolean(env?.FLSKO_WAN_SPACE), env?.FLSKO_WAN_SPACE ? "مهيأ بطابور Gradio" : "لم تتم تهيئته"), layer("wan-provider", "Wan 2.x عبر مزود", "cloud-open", 3, Boolean(env?.FLSKO_VIDEO_PROVIDER_URL), env?.FLSKO_VIDEO_PROVIDER_URL ? "مهيأ" : "لا يوجد عنوان مزود"), layer("cogvideox-provider", "CogVideoX عبر مزود", "cloud-open", 4, false, "لا يوجد عنوان مزود مستقل"), layer("rife-mobile", "RIFE محلي", "on-device", 5, false, "يحتاج محرك صور محليًا ومدخلات إطارات")] },
    music: { selected: env?.FLSKO_MUSIC_PROVIDER_URL ? "music-provider" : (env?.FLSKO_VODER_API_URL ? "voder" : "musicgen-space"), layers: [layer("music-provider", "مزود موسيقى مخصص", "cloud-open", 1, Boolean(env?.FLSKO_MUSIC_PROVIDER_URL), env?.FLSKO_MUSIC_PROVIDER_URL ? "مهيأ" : "غير مهيأ"), layer("voder", "VODER", "self-hosted-open", 2, Boolean(env?.FLSKO_VODER_API_URL), env?.FLSKO_VODER_API_URL ? "مهيأ" : "يحتاج FLSKO_VODER_API_URL"), layer("bark-music-space", "Bark Space", "unofficial", 3, true, "غير رسمي/طابور"), layer("musicgen-space", "MusicGen HF Space", "cloud-open-queue", 4, true, "قد يكون باردًا"), layer("unavailable-msg", "رسالة واضحة", "fallback", 5, true, "لا ملفات وهمية")] },
    voice: { selected: "android-tts", layers: [layer("android-tts", "Android TTS", "on-device", 1, true, "الأساسي على الجهاز"), layer("qwen3-tts", "Qwen3-TTS Space", "cloud-open-queue", 2, true, "اختُبر وأعاد ملف صوت"), layer("google-translate-tts", "Google Translate TTS", "unofficial", 3, true, "غير رسمي"), layer("responsivevoice-tts", "ResponsiveVoice", "unofficial", 4, true, "غير رسمي"), layer("voder", "VODER", "self-hosted-open", 5, Boolean(env?.FLSKO_VODER_API_URL), env?.FLSKO_VODER_API_URL ? "مهيأ" : "يحتاج FLSKO_VODER_API_URL")] },
  };
}
async function generateOpenImage(prompt: string, env: Env, sourceImage?: string) {
  const hasSource = Boolean(sourceImage && sourceImage.length > 32);
  const sourceB64 = hasSource && sourceImage!.startsWith("data:")
    ? sourceImage!.replace(/^data:image\/[^;]+;base64,/, "")
    : hasSource ? sourceImage! : "";
  const sourceUrl = hasSource && /^https?:\/\//i.test(sourceImage!) ? sourceImage! : "";

  const result = await routeWithFallback([
    // --- Image-to-image when user uploaded a reference ---
    ...(hasSource ? [{
      id: "ai-horde-img2img",
      kind: "image" as const,
      priority: 0,
      execute: async () => {
        if (!sourceB64) throw new Error("no base64 source");
        const submit = await fetch("https://aihorde.net/api/v2/generate/async", {
          method: "POST",
          headers: { "content-type": "application/json", apikey: "0000000000", "Client-Agent": "Flsko:1.0" },
          body: JSON.stringify({
            prompt: prompt.slice(0, 1000),
            params: { n: 1, width: 512, height: 512, steps: 25, denoising_strength: 0.55 },
            models: ["stable_diffusion"],
            r2: true,
            source_image: sourceB64.slice(0, 4_500_000),
            source_processing: "img2img",
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!submit.ok) throw new Error(`AI Horde img2img submit failed: ${submit.status}`);
        const job = await submit.json() as { id?: string };
        if (!job.id) throw new Error("AI Horde img2img no job");
        for (let i = 0; i < IMAGE_QUEUE_ROUNDS; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const check = await fetch(`https://aihorde.net/api/v2/generate/status/${job.id}`, {
            headers: { apikey: "0000000000", "Client-Agent": "Flsko:1.0" },
            signal: AbortSignal.timeout(15_000),
          });
          if (!check.ok) continue;
          const st = await check.json() as { done?: boolean; generations?: Array<{ img?: string }> };
          if (st.done && st.generations?.[0]?.img) {
            return {
              url: st.generations[0].img,
              provider: "ai-horde-img2img",
              status: "completed" as const,
              message: "تم تعديل الصورة وفق وصفك (صورة → صورة).",
              estimatedWaitSec: 0,
            };
          }
        }
        throw new Error("AI Horde img2img timed out");
      },
    }] : []),
    ...(hasSource && (env.FLSKO_IMAGE_PROVIDER_URL) ? [{
      id: "configured-img2img",
      kind: "image" as const,
      priority: 0.5,
      execute: async () => {
        const response = await fetch(env.FLSKO_IMAGE_PROVIDER_URL!, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            image: sourceImage,
            mode: "img2img",
            model: "stable-diffusion-xl",
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) throw new Error(`configured img2img failed: ${response.status}`);
        const payload = await response.json().catch(() => ({})) as { url?: string; image_url?: string };
        const url = payload.url || payload.image_url;
        if (!url) throw new Error("configured img2img returned no asset");
        return { url, provider: "open-source-img2img", status: "completed" as const, message: "تعديل عبر مزودك المخصص.", estimatedWaitSec: 0 };
      },
    }] : []),
    ...(hasSource && sourceUrl ? [{
      id: "pollinations-img2img",
      kind: "image" as const,
      priority: 0.7,
      execute: async () => {
        const seed = Math.floor(Math.random() * 1_000_000);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&nologo=true&seed=${seed}&image=${encodeURIComponent(sourceUrl)}`;
        const response = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(90_000) });
        if (!response.ok) throw new Error(`Pollinations img2img failed: ${response.status}`);
        return { url, provider: "pollinations-img2img", status: "completed" as const, message: "تعديل تقريبي عبر Pollinations مع صورتك المرجعية.", estimatedWaitSec: 0 };
      },
    }] : []),

    ...(env.FLSKO_IMAGE_PROVIDER_URL ? [{ id: "configured-open-provider", kind: "image" as const, priority: 1, execute: async () => {
      const response = await fetch(env.FLSKO_IMAGE_PROVIDER_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, model: "stable-diffusion-xl" }) });
      if (!response.ok) throw new Error(`configured image provider failed: ${response.status}`);
      const payload = await response.json().catch(() => ({})) as { url?: string; image_url?: string };
      const url = payload.url || payload.image_url;
      if (!url) throw new Error("configured image provider returned no asset");
      return { url, provider: "open-source-configured", status: "completed" as const, message: "تم اختيار مزود الصور المفتوح المهيأ تلقائيًا." };
    } }] : []),
    { id: "pollinations-flux", kind: "image", priority: 2, execute: async () => {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&nologo=true&seed=${seed}`;
      const response = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error(`Pollinations image provider failed: ${response.status}`);
      const ctype = response.headers.get("content-type") || "";
      if (!ctype.includes("image") && response.headers.get("content-length") === "0") throw new Error("Pollinations returned empty body");
      return { url, provider: "pollinations-flux", status: "completed" as const, message: "تم إنشاء الصورة عبر Pollinations Flux." };
    } },
    { id: "ai-horde", kind: "image", priority: 3, execute: async () => {
      const submit = await fetch("https://aihorde.net/api/v2/generate/async", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "0000000000", "Client-Agent": "Flsko:1.0" },
        body: JSON.stringify({ prompt, params: { n: 1, width: 512, height: 512, steps: 20 }, models: ["stable_diffusion"], r2: true }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!submit.ok) throw new Error(`AI Horde submit failed: ${submit.status}`);
      const job = await submit.json() as { id?: string };
      if (!job.id) throw new Error("AI Horde returned no job id");
      for (let i = 0; i < IMAGE_QUEUE_ROUNDS; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const check = await fetch(`https://aihorde.net/api/v2/generate/status/${job.id}`, {
          headers: { apikey: "0000000000", "Client-Agent": "Flsko:1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!check.ok) continue;
        const st = await check.json() as { done?: boolean; generations?: Array<{ img?: string }> };
        if (st.done && st.generations?.[0]?.img) {
          return { url: st.generations[0].img, provider: "ai-horde", status: "completed" as const, message: "تم إنشاء الصورة عبر AI Horde." };
        }
      }
      throw new Error("AI Horde timed out");
    } },
    { id: "pollinations-turbo", kind: "image", priority: 4, execute: async () => {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=turbo&width=768&height=768&nologo=true&seed=${seed}`;
      const response = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Pollinations turbo failed: ${response.status}`);
      return { url, provider: "pollinations-turbo", status: "completed" as const, message: "صورة عبر Pollinations turbo (احتياط).", estimatedWaitSec: 0 };
    } },
    { id: "lexica-search", kind: "image", priority: 5, execute: async () => {
      // Unofficial public search — returns closest existing art, not pure generation
      const response = await fetch(`https://lexica.art/api/v1/search?q=${encodeURIComponent(prompt.slice(0, 120))}`, {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0 Flsko/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Lexica failed: ${response.status}`);
      const payload = await response.json().catch(() => ({})) as { images?: Array<{ src?: string; url?: string; imageSrc?: string }> };
      const img = (payload.images || [])[0];
      const url = img?.src || img?.url || img?.imageSrc;
      if (!url) throw new Error("Lexica returned no image");
      return { url, provider: "lexica-search", status: "completed" as const, message: "صورة تقريبية من Lexica (بحث عام غير رسمي)." };
    } },
    // Hugging Face Space — FLUX.1-schnell (last resort Gradio)
    { id: "hf-flux-schnell", kind: "image", priority: 6, execute: async () => {
      const base = "https://black-forest-labs-flux-1-schnell.hf.space";
      const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
      if (env.HF_TOKEN) headers.authorization = `Bearer ${env.HF_TOKEN}`;
      const call = await fetch(`${base}/gradio_api/call/infer`, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: [prompt.slice(0, 500), 0, true, 768, 768, 4] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!call.ok) throw new Error(`HF FLUX space queue failed: ${call.status}`);
      const queued = await call.json().catch(() => ({})) as { event_id?: string };
      if (!queued.event_id) throw new Error("HF FLUX no event_id");
      for (let i = 0; i < IMAGE_QUEUE_ROUNDS; i++) {
        await new Promise((r) => setTimeout(r, IMAGE_QUEUE_DELAY_MS));
        const stream = await fetch(`${base}/gradio_api/call/infer/${encodeURIComponent(queued.event_id)}`, {
          headers: { accept: "text/event-stream", ...(env.HF_TOKEN ? { authorization: `Bearer ${env.HF_TOKEN}` } : {}) },
          signal: AbortSignal.timeout(20_000),
        });
        const body = await stream.text();
        if (body.includes("event: error")) throw new Error("HF FLUX space error");
        if (!body.includes("event: complete")) continue;
        const line = body.split("event: complete").pop()?.match(/data:\s*(.+)/)?.[1]?.trim();
        if (!line || line === "null") continue;
        try {
          const data = JSON.parse(line) as unknown;
          const flat = JSON.stringify(data);
          const m = flat.match(/https?:\/\/[^"\s]+\.(png|jpg|jpeg|webp)/i) || flat.match(/"url"\s*:\s*"(https?:[^"]+)"/i);
          if (m) {
            const url = (m[1] && m[1].startsWith("http") ? m[1] : m[0]).replace(/\//g, "/");
            return { url, provider: "hf-flux-schnell", status: "completed" as const, message: "صورة عبر Hugging Face FLUX.1-schnell Space." };
          }
        } catch { /* poll */ }
      }
      throw new Error("HF FLUX timed out");
    } },
  ], Date.now(), routerHooks(env));
  return { ...result.value, provider: result.provider, attempted: result.attempted };
}

/** Cloud TTS fallbacks — Android native remains primary on device. */
async function generateSpeech(text: string, lang = "ar") {
  const clipped = text.slice(0, 220);
  const result = await routeWithFallback([
    // Qwen3-TTS public Gradio Space — tested: returns direct audio.wav URL
    { id: "qwen3-tts", kind: "voice" as const, priority: 1, execute: async () => {
      const base = "https://qwen-qwen3-tts-demo.hf.space";
      const voice = lang.startsWith("ar") ? "Cherry / 芊悦" : "Ethan / 晨煦";
      const call = await fetch(`${base}/gradio_api/call/tts_interface`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: [clipped, voice, "Auto / 自动"] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!call.ok) throw new Error(`Qwen3-TTS queue failed: ${call.status}`);
      const queued = await call.json().catch(() => ({})) as { event_id?: string };
      if (!queued.event_id) throw new Error("Qwen3-TTS no event_id");
      // Poll SSE briefly for completed file URL
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const stream = await fetch(`${base}/gradio_api/call/tts_interface/${encodeURIComponent(queued.event_id)}`, {
          headers: { accept: "text/event-stream" },
          signal: AbortSignal.timeout(20_000),
        });
        const body = await stream.text();
        if (!body.includes("event: complete")) continue;
        const line = body.split("event: complete").pop()?.match(/data:\s*(.+)/)?.[1]?.trim();
        if (!line) continue;
        try {
          const data = JSON.parse(line) as Array<{ url?: string } | null>;
          const file = data.find((x) => x && x.url);
          if (file?.url) {
            return { url: file.url, provider: "qwen3-tts", status: "completed" as const, message: "صوت عبر Qwen3-TTS (مساحة عامة)." };
          }
        } catch { /* keep polling */ }
      }
      throw new Error("Qwen3-TTS timed out");
    } },
    { id: "google-translate-tts", kind: "voice" as const, priority: 2, execute: async () => {
      const tl = lang.startsWith("ar") ? "ar" : "en";
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clipped)}&tl=${tl}&client=tw-ob`;
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Google TTS failed: ${response.status}`);
      return { url, provider: "google-translate-tts", status: "completed" as const, message: "صوت عبر Google Translate TTS (غير رسمي)." };
    } },
    { id: "responsivevoice-tts", kind: "voice" as const, priority: 3, execute: async () => {
      const tl = lang.startsWith("ar") ? "ar" : "en-US";
      const url = `https://code.responsivevoice.org/develop/getvoice.php?t=${encodeURIComponent(clipped)}&tl=${encodeURIComponent(tl)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`ResponsiveVoice failed: ${response.status}`);
      return { url, provider: "responsivevoice-tts", status: "completed" as const, message: "صوت عبر ResponsiveVoice." };
    } },
  ], Date.now());
  return { ...result.value, provider: result.provider, attempted: result.attempted };
}

async function generateOpenMusic(prompt: string, env: Env) {
  const providers: Array<{ id: string; kind: "music"; priority: number; execute: () => Promise<{ url?: string; status: string; provider: string; message: string }> }> = [];
  if (env.FLSKO_MUSIC_PROVIDER_URL) {
    providers.push({ id: "music-provider", kind: "music", priority: 1, execute: async () => {
      const response = await fetch(env.FLSKO_MUSIC_PROVIDER_URL!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`music provider failed: ${response.status}`);
      const payload = await response.json().catch(() => ({})) as { url?: string };
      if (!payload.url) throw new Error("music provider returned no url");
      return { url: payload.url, provider: "music-provider", status: "completed", message: "تم إنشاء المقطع عبر مزودك." };
    }});
  }
  if (env.FLSKO_VODER_API_URL) {
    providers.push({ id: "voder", kind: "music", priority: 2, execute: async () => {
      const response = await fetch(`${env.FLSKO_VODER_API_URL!.replace(/\/+$/, "")}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`VODER failed: ${response.status}`);
      const payload = await response.json().catch(() => ({})) as { url?: string };
      if (!payload.url) throw new Error("VODER returned no url");
      return { url: payload.url, provider: "voder", status: "completed", message: "تم الإنشاء عبر VODER." };
    }});
  }
  providers.push({ id: "bark-music-space", kind: "music", priority: 3, execute: async () => {
    const base = "https://suno-bark.hf.space";
    const call = await fetch(`${base}/gradio_api/call/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: [prompt.slice(0, 200)] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!call.ok) throw new Error(`Bark music failed: ${call.status}`);
    const body = await call.json().catch(() => ({})) as { event_id?: string };
    if (body.event_id) {
      return { status: "queued", provider: "bark-space", message: "Bark (غير رسمي/عام) في الطابور.", url: undefined };
    }
    throw new Error("Bark music no event");
  }});
  // MusicGen public space often cold — mark queued on accept
  providers.push({ id: "musicgen-space", kind: "music", priority: 4, execute: async () => {
    const base = "https://facebook-musicgen.hf.space";
    const call = await fetch(`${base}/gradio_api/call/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: [prompt, null, "medium"] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!call.ok) throw new Error(`MusicGen space failed: ${call.status}`);
    const body = await call.json().catch(() => ({})) as { event_id?: string };
    if (body.event_id) {
      return { status: "queued", provider: "musicgen-space", message: "طلب الموسيقى في طابور MusicGen؛ قد يستغرق دقائق إن كانت المساحة باردة.", url: undefined };
    }
    throw new Error("MusicGen space returned no event");
  }});
  if (!providers.length) throw new Error("لا يوجد مزود موسيقى");
  const result = await routeWithFallback(providers, Date.now(), routerHooks(env));
  return { ...result.value, provider: result.provider, attempted: result.attempted };
}
async function submitWanVideo(prompt: string, env: Env): Promise<Record<string, unknown>> {
  const space = (env.FLSKO_WAN_SPACE || "https://wan-ai-wan2-1.hf.space").replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json", "user-agent": "Flsko/1.0" };
  if (env.HF_TOKEN) headers.authorization = `Bearer ${env.HF_TOKEN}`;

  const result = await routeWithFallback([
    { id: "wan-gradio", kind: "video" as const, priority: 1, execute: async () => {
      const response = await fetch(`${space}/gradio_api/call/t2v_generation_async`, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: [prompt.slice(0, 800), "720*1280", false, Math.floor(Math.random() * 999999)] }),
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await response.json().catch(() => ({})) as { event_id?: string };
      if (!response.ok || !payload.event_id) throw new Error(`Wan Gradio queue failed: ${response.status}`);
      return {
        status: "queued" as const,
        provider: "wan-gradio",
        jobId: payload.event_id,
        estimatedWaitSec: VIDEO_ESTIMATED_SEC,
        message: `أُرسل الفيديو إلى Wan Space. الانتظار المتوقع حتى ${VIDEO_ESTIMATED_SEC} ثانية — فلسقوا يتابع الطابور.`,
      };
    } },
    ...(env.FLSKO_VIDEO_PROVIDER_URL ? [{ id: "comfy-or-custom", kind: "video" as const, priority: 2, execute: async () => {
      const response = await fetch(env.FLSKO_VIDEO_PROVIDER_URL!, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ prompt, workflow: "t2v" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`video provider failed: ${response.status}`);
      const payload = await response.json().catch(() => ({})) as { url?: string; jobId?: string; prompt_id?: string };
      if (payload.url) return { status: "completed" as const, provider: "custom-video", url: payload.url, message: "فيديو من مزودك الذاتي (ComfyUI/مخصص)." };
      const id = payload.jobId || payload.prompt_id;
      if (id) return { status: "queued" as const, provider: "custom-video", jobId: id, message: "مهمة فيديو لدى مزودك." };
      throw new Error("custom video provider returned no asset");
    } }] : []),
  ] as any, Date.now(), routerHooks(env));
  return { ...(result.value as object), provider: result.provider, attempted: result.attempted };
}
async function pollWanVideo(jobId: string, env: Env) {
  const space = (env.FLSKO_WAN_SPACE || "https://wan-ai-wan2-1.hf.space").replace(/\/+$/, "");
  const headers: Record<string, string> = { accept: "text/event-stream", "user-agent": "Flsko/1.0" };
  if (env.HF_TOKEN) headers.authorization = `Bearer ${env.HF_TOKEN}`;

  for (let i = 0; i < VIDEO_POLL_ROUNDS; i++) {
    try {
      const response = await fetch(`${space}/gradio_api/call/t2v_generation_async/${encodeURIComponent(jobId)}`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.text();
      if (body.includes("event: complete")) {
        const complete = body.split("event: complete").pop()?.match(/data:\s*(.+)/)?.[1]?.trim();
        if (complete) {
          try {
            const data = JSON.parse(complete) as unknown;
            const flat = JSON.stringify(data);
            const m = flat.match(/https?:\/\/[^"\s]+\.(mp4|webm)/i) || flat.match(/"url"\s*:\s*"(https?:[^"]+)"/i);
            if (m) {
              const url = (m[1] && m[1].startsWith("http") ? m[1] : m[0]).replace(/\\\//g, "/");
              return {
                status: "completed" as const,
                provider: "wan-gradio",
                jobId,
                url,
                estimatedWaitSec: 0,
                message: "اكتمل فيديو Wan — جاهز للمشاهدة.",
              };
            }
          } catch { /* still processing */ }
        }
      }
    } catch { /* retry */ }
    if (i < VIDEO_POLL_ROUNDS - 1) await new Promise((r) => setTimeout(r, VIDEO_POLL_DELAY_MS));
  }

  const remaining = Math.max(15, VIDEO_ESTIMATED_SEC - VIDEO_POLL_ROUNDS * (VIDEO_POLL_DELAY_MS / 1000));
  return {
    status: "queued" as const,
    provider: "wan-gradio",
    jobId,
    estimatedWaitSec: remaining,
    progress: Math.min(90, Math.round((VIDEO_POLL_ROUNDS / (VIDEO_POLL_ROUNDS + 3)) * 100)),
    message: `الفيديو ما زال قيد التوليد (متوقع ~${Math.round(remaining)} ث). أعد الاستعلام تلقائيًا.`,
  };
}
async function trpcInput(request: Request, url: URL) {
  if (request.method === "GET") {
    const raw = url.searchParams.get("input");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, { json?: unknown }>;
    return parsed["0"]?.json ?? null;
  }
  const body = await request.json().catch(() => null) as Record<string, { json?: unknown }> | null;
  return body?.["0"]?.json ?? null;
}
async function openRouterChat(
  env: Env,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://flsko-api.flsko.workers.dev",
      "X-Title": "Flsko",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || `OpenRouter ${model} failed: ${response.status}`);
  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(`OpenRouter ${model} empty`);
  return text.trim();
}


async function geminiChat(
  env: Env,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Promise<string> {
  if (!env.FLSKO_GEMINI_API_KEY) throw new Error("FLSKO_GEMINI_API_KEY missing");
  const model = env.FLSKO_GEMINI_MODEL || "gemini-3.8-flash";
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.FLSKO_GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || `Gemini failed: ${response.status}`);
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) throw new Error("Gemini empty response");
  return text.trim();
}

/** Mode stacks: natural=2, pro=2, pro-max=4 primary OpenRouter free models + shared backups. */
function chatModelsForMode(modeLabel: string): { id: string; model: string; maxTokens: number; temperature: number }[] {
  const isProMax = modeLabel.includes("ماكس") || modeLabel.includes("pro-max");
  const isPro = !isProMax && (modeLabel.includes("برو") || modeLabel === "pro");
  if (isProMax) {
    return [
      { id: "or-nemotron-ultra", model: "nvidia/nemotron-3-ultra-550b-a55b:free", maxTokens: 1800, temperature: 0.45 },
      { id: "or-nemotron-super", model: "nvidia/nemotron-3-super-120b-a12b:free", maxTokens: 1600, temperature: 0.5 },
      { id: "or-gemma-31b", model: "google/gemma-4-31b-it:free", maxTokens: 1600, temperature: 0.5 },
      { id: "or-inkling", model: "thinkingmachines/inkling:free", maxTokens: 1600, temperature: 0.5 },
    ];
  }
  if (isPro) {
    return [
      { id: "or-qwen-27b", model: "qwen/qwen3.8-27b:free", maxTokens: 1200, temperature: 0.55 },
      { id: "or-gemma-26b", model: "google/gemma-4-26b-a4b-it:free", maxTokens: 1200, temperature: 0.55 },
    ];
  }
  // طبيعي — سريع وخفيف
  return [
    { id: "or-apodex-mini", model: "apodex/apodex-1.1-mini:free", maxTokens: 700, temperature: 0.65 },
    { id: "or-liquid-lfm", model: "liquid/lfm-2.5-2.6b:free", maxTokens: 700, temperature: 0.65 },
  ];
}

async function buildUserContext(user: Record<string, unknown>, env: Env) {
  const memories = await env.DB.prepare("SELECT content FROM memories WHERE user_id=? AND consent=1 ORDER BY created_at DESC LIMIT 20").bind(user.id).all<{ content: string }>();
  const profile = await env.DB.prepare("SELECT display_name as displayName, gender, about, governorate, voice_gender as voiceGender FROM profiles WHERE user_id=?").bind(user.id).first().catch(() => null) as Record<string, unknown> | null;
  const lines = [
    `معرّف المستخدم: ${String(user.id || "")}`,
    user.email ? `البريد: ${String(user.email)}` : "",
    user.name ? `اسم الحساب: ${String(user.name)}` : "",
    profile?.displayName ? `الاسم المعروض: ${String(profile.displayName)}` : "",
    profile?.gender ? `الجندر المفضّل في التحية: ${String(profile.gender)}` : "",
    profile?.governorate ? `المحافظة: ${String(profile.governorate)}` : "",
    profile?.about ? `نبذة: ${String(profile.about)}` : "",
    profile?.voiceGender ? `تفضيل صوت القراءة: ${String(profile.voiceGender)}` : "",
    memories.results.length ? `ذكريات مصرّح بها:\n${memories.results.map((x) => `- ${x.content}`).join("\n")}` : "لا ذكريات مصرّح بها بعد.",
  ].filter(Boolean);
  return lines.join("\n");
}


async function ensureBrainTables(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS brain_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, intent TEXT, source_id TEXT, meta TEXT, created_at INTEGER NOT NULL)"
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS brain_tutor_quota (
      tutor TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tutor, day)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS brain_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor TEXT NOT NULL,
      input TEXT NOT NULL,
      ideal TEXT NOT NULL,
      tags TEXT,
      created_at INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS brain_guidance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor TEXT NOT NULL,
      rule TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS brain_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor TEXT NOT NULL,
      sample_user TEXT,
      sample_reply TEXT,
      score REAL NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS brain_tutor_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  ).run();
}

function authorizeTutor(request: Request, env: Env): TutorRole | null {
  const secret = env.FLSKO_TUTOR_SECRET;
  if (!secret) return null;
  const hdr = request.headers.get("x-flsko-tutor-secret") || request.headers.get("X-Flsko-Tutor-Secret") || "";
  if (hdr !== secret) return null;
  const role = (request.headers.get("x-flsko-tutor") || request.headers.get("X-Flsko-Tutor") || "developer").toLowerCase();
  if (role === "grok" || role === "manus" || role === "ali" || role === "developer") return role;
  return "developer";
}

async function consumeTutorQuota(env: Env, tutor: TutorRole): Promise<{ ok: boolean; used: number; limit: number; day: string }> {
  const day = tutorDayKey();
  const row = await env.DB.prepare("SELECT used FROM brain_tutor_quota WHERE tutor=? AND day=?").bind(tutor, day).first<{ used: number }>();
  const used = row?.used ?? 0;
  if (used >= TUTOR_DAILY_LIMIT) return { ok: false, used, limit: TUTOR_DAILY_LIMIT, day };
  await env.DB.prepare(
    "INSERT INTO brain_tutor_quota(tutor, day, used) VALUES(?,?,1) ON CONFLICT(tutor, day) DO UPDATE SET used = used + 1"
  ).bind(tutor, day).run();
  return { ok: true, used: used + 1, limit: TUTOR_DAILY_LIMIT, day };
}

async function loadActiveGuidance(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT rule FROM brain_guidance WHERE active=1 ORDER BY id DESC LIMIT 12"
  ).all<{ rule: string }>();
  return (rows.results || []).map((r) => r.rule);
}

async function loadRecentLessons(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT input, ideal FROM brain_lessons ORDER BY id DESC LIMIT 10"
  ).all<{ input: string; ideal: string }>();
  return (rows.results || []).map((r) => formatLessonLine(r.input, r.ideal));
}

async function tutorChatTurn(env: Env, tutor: TutorRole, message: string) {
  const guidance = await loadActiveGuidance(env);
  const lessons = await loadRecentLessons(env);
  const system = buildTutorSessionPrompt({ tutor, guidanceLines: guidance, recentLessons: lessons });
  const messages = [
    { role: "system", content: system },
    { role: "user", content: message },
  ];
  let reply = "";
  let source = "brain-fallback";
  try {
    if (env.FLSKO_GEMINI_API_KEY) {
      try {
        reply = await geminiChat(env, messages, 900);
        source = "gemini-flash";
      } catch (ge) {
        if (env.OPENROUTER_API_KEY) {
          reply = await openRouterChat(env, env.FLSKO_OPENROUTER_MODEL || "openrouter/free", messages, 900, 0.4);
          source = "openrouter-fallback";
        } else throw ge;
      }
    } else if (env.OPENROUTER_API_KEY) {
      reply = await openRouterChat(env, env.FLSKO_OPENROUTER_MODEL || "openrouter/free", messages, 900, 0.4);
      source = "openrouter";
    } else {
      reply = "أنا فلسقوا. استلمت توجيهك — أضِف مفتاح محادثة لتفعيل التدريب.";
    }
  } catch (e) {
    reply = polishReply(
      `أنا فلسقوا. التوجيه وصلني. (طبقة الرد مشغولة مؤقتًا: ${e instanceof Error ? e.message.slice(0, 80) : "error"})`,
      message,
      detectDialectHint(message),
    );
    source = "brain-soft-fail";
  }
  reply = polishReply(reply, message, detectDialectHint(message));
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO brain_tutor_messages(tutor,role,content,created_at) VALUES(?,?,?,?)"
  ).bind(tutor, "tutor", message, now).run();
  await env.DB.prepare(
    "INSERT INTO brain_tutor_messages(tutor,role,content,created_at) VALUES(?,?,?,?)"
  ).bind(tutor, "flsko", reply, now).run();
  return { reply, source, tutor, guidanceCount: guidance.length, lessonsCount: lessons.length };
}

async function handleTutorAction(
  env: Env,
  tutor: TutorRole,
  action: TutorAction,
  body: Record<string, unknown>,
) {
  await ensureBrainTables(env);
  const quota = await consumeTutorQuota(env, tutor);
  if (!quota.ok) {
    return {
      error: true,
      message: `انتهت الحصة اليومية للمعلّم (${quota.limit}/${quota.day}).`,
      quota,
    };
  }

  if (action === "chat") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) return { error: true, message: "message مطلوب", quota };
    const turn = await tutorChatTurn(env, tutor, message);
    return { error: false, action, quota, ...turn };
  }

  if (action === "teach") {
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const ideal = typeof body.ideal === "string" ? body.ideal.trim() : "";
    if (input.length < 2 || ideal.length < 2) return { error: true, message: "input و ideal مطلوبان", quota };
    await env.DB.prepare(
      "INSERT INTO brain_lessons(tutor,input,ideal,tags,created_at) VALUES(?,?,?,?,?)"
    ).bind(tutor, input.slice(0, 1000), ideal.slice(0, 2000), typeof body.tags === "string" ? body.tags.slice(0, 200) : "", Date.now()).run();
    return { error: false, action, quota, saved: formatLessonLine(input, ideal), message: "تم حفظ الدرس — سيُحقَن في محادثات المستخدمين." };
  }

  if (action === "evaluate") {
    const score = clampScore(body.score);
    const sampleUser = typeof body.sampleUser === "string" ? body.sampleUser.slice(0, 1000) : "";
    const sampleReply = typeof body.sampleReply === "string" ? body.sampleReply.slice(0, 2000) : "";
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : "";
    await env.DB.prepare(
      "INSERT INTO brain_evaluations(tutor,sample_user,sample_reply,score,notes,created_at) VALUES(?,?,?,?,?,?)"
    ).bind(tutor, sampleUser, sampleReply, score, notes, Date.now()).run();
    return { error: false, action, quota, score, message: "تم تسجيل التقييم." };
  }

  if (action === "guide") {
    const rule = typeof body.rule === "string" ? body.rule.trim() : "";
    if (rule.length < 3) return { error: true, message: "rule مطلوب", quota };
    await env.DB.prepare(
      "INSERT INTO brain_guidance(tutor,rule,active,created_at) VALUES(?,?,1,?)"
    ).bind(tutor, rule.slice(0, 800), Date.now()).run();
    return { error: false, action, quota, rule, message: "تم تفعيل قاعدة التوجيه." };
  }

  if (action === "inspect") {
    const lessons = await loadRecentLessons(env);
    const guidance = await loadActiveGuidance(env);
    const evals = await env.DB.prepare(
      "SELECT score, notes, created_at as createdAt FROM brain_evaluations ORDER BY id DESC LIMIT 8"
    ).all();
    const avg = await env.DB.prepare("SELECT AVG(score) as avgScore, COUNT(*) as n FROM brain_evaluations").first<{ avgScore: number; n: number }>();
    return {
      error: false,
      action,
      quota,
      lessons,
      guidance,
      recentEvaluations: evals.results,
      averageScore: avg?.avgScore ?? null,
      evaluationCount: avg?.n ?? 0,
      identity: "فلسقوا / Flsko",
      creator: "علي يوسف",
    };
  }

  return { error: true, message: "action غير معروف", quota };
}

async function saveChatPair(env: Env, userId: unknown, conversationId: number | undefined, userMsg: string, assistantMsg: string) {
  let convId = conversationId;
  if (!convId) {
    const conv = await ensureDefaultConversation(env, userId);
    convId = Number((conv as { id: number }).id);
  }
  await env.DB.prepare("INSERT INTO messages(user_id,conversation_id,role,content) VALUES(?,?,?,?)").bind(userId, convId, "user", userMsg).run();
  await env.DB.prepare("INSERT INTO messages(user_id,conversation_id,role,content) VALUES(?,?,?,?)").bind(userId, convId, "assistant", assistantMsg).run();
  await env.DB.prepare("UPDATE conversations SET updated_at=? WHERE id=? AND user_id=?").bind(Date.now(), convId, userId).run();
  // auto-title from first user message
  const titleRow = await env.DB.prepare("SELECT title FROM conversations WHERE id=?").bind(convId).first<{ title: string }>();
  if (titleRow && (titleRow.title === "محادثة جديدة" || !titleRow.title)) {
    await env.DB.prepare("UPDATE conversations SET title=? WHERE id=?").bind(userMsg.slice(0, 42), convId).run();
  }
  return convId;
}

async function runChat(message: string, mode: string, user: Record<string, unknown>, env: Env, options?: { liveVoice?: boolean; conversationId?: number }) {
  // ——— عقل فلسقوا: نية + لهجة + رد مباشر عند الحاجة ———
  const intent = classifyIntent(message);
  const dialectHint = detectDialectHint(message);
  const direct = brainDirectAnswer(intent, message);
  if (direct) {
    const convId = await saveChatPair(env, user.id, options?.conversationId, message, direct);
    try {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS brain_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, intent TEXT, source_id TEXT, meta TEXT, created_at INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "INSERT INTO brain_events(user_id,intent,source_id,meta,created_at) VALUES(?,?,?,?,?)"
      ).bind(String(user.id), intent, "brain-direct", learningNote(message, direct, "brain-direct"), Date.now()).run();
    } catch { /* non-fatal */ }
    return {
      text: direct,
      provider: "flsko-brain",
      sourceId: "brain-direct",
      mode,
      intent,
      dialectHint,
      conversationId: convId,
      stack: [] as string[],
      compared: 0,
      attempted: ["brain-direct"],
    };
  }

  const userContext = await buildUserContext(user, env);
  const recentTurns = await loadRecentTurns(env, user.id, options?.conversationId, 6);
  let system = buildBrainSystemPrompt({
    mode,
    userContext,
    liveVoice: options?.liveVoice,
    dialectHint,
    extra: options?.liveVoice ? VOICE_LIVE_BOOTSTRAP : undefined,
    recentTurns: recentTurns || undefined,
  });
  try {
    await ensureBrainTables(env);
    const lessons = await loadRecentLessons(env);
    system = injectLessonsIntoPrompt(system, lessons);
  } catch { /* non-fatal */ }
  const messages = [{ role: "system", content: system }, { role: "user", content: message }];
  const providers: Array<{ id: string; kind: "chat"; priority: number; execute: () => Promise<string> }> = [];

  const stack = chatModelsForMode(mode);
  let priority = 1;
  if (env.FLSKO_GEMINI_API_KEY) {
    providers.push({
      id: "gemini-flash",
      kind: "chat",
      priority: priority++,
      execute: () => geminiChat(env, messages, mode.includes("ماكس") ? 1800 : mode.includes("برو") ? 1200 : 800),
    });
  }
  stack.forEach((entry) => {
    providers.push({
      id: entry.id,
      kind: "chat",
      priority: priority++,
      execute: () => openRouterChat(env, entry.model, messages, entry.maxTokens, entry.temperature),
    });
  });
  providers.push({
    id: "or-free-router",
    kind: "chat",
    priority: priority++,
    execute: () => openRouterChat(env, env.FLSKO_OPENROUTER_MODEL || "openrouter/free", messages, 1000, 0.6),
  });
  providers.push({
    id: "huggingface-router",
    kind: "chat",
    priority: priority++,
    execute: async () => {
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.HF_TOKEN}` },
        body: JSON.stringify({
          model: env.FLSKO_HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct",
          messages,
          temperature: 0.6,
          max_tokens: 1000,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }> };
      if (!response.ok) throw new Error(`HF failed: ${response.status}`);
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new Error("HF empty");
      return text.trim();
    },
  });
  providers.push({
    id: "pollinations-text",
    kind: "chat",
    priority: priority++,
    execute: async () => {
      const q = encodeURIComponent(`${system}\nالمستخدم: ${message}\nفلسقوا:`);
      const response = await fetch(`https://text.pollinations.ai/${q}`, { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`Pollinations text failed: ${response.status}`);
      const text = (await response.text()).trim();
      if (!text) throw new Error("Pollinations text empty");
      return text;
    },
  });

  const routed = await routeWithFallback(providers, Date.now(), routerHooks(env));
  // معالجة آنية بعد الطبقة: هوية + لهجة
  const polished = polishReply(String(routed.value || ""), message, dialectHint);
  const quality = scoreCandidate(polished, message);

  const convId = await saveChatPair(env, user.id, options?.conversationId, message, polished);
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS brain_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, intent TEXT, source_id TEXT, meta TEXT, created_at INTEGER NOT NULL)"
    ).run();
    await env.DB.prepare(
      "INSERT INTO brain_events(user_id,intent,source_id,meta,created_at) VALUES(?,?,?,?,?)"
    ).bind(String(user.id), intent, routed.provider, learningNote(message, polished, routed.provider), Date.now()).run();
  } catch { /* non-fatal */ }

  return {
    text: polished,
    provider: "flsko-brain",
    sourceId: routed.provider,
    mode,
    intent,
    dialectHint,
    quality,
    conversationId: convId,
    stack: stack.map((s) => s.model),
    compared: routed.attempted.length,
    attempted: routed.attempted,
  };
}


function parseDataUri(dataUri: string): { mime: string; base64: string; format: string } {
  const m = dataUri.match(/^data:(audio\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) throw new Error("صيغة التسجيل غير مدعومة");
  const mime = m[1].toLowerCase();
  const base64 = m[2];
  let format = "m4a";
  if (mime.includes("wav")) format = "wav";
  else if (mime.includes("mpeg") || mime.includes("mp3")) format = "mp3";
  else if (mime.includes("ogg")) format = "ogg";
  else if (mime.includes("webm")) format = "webm";
  else if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) format = "m4a";
  if (base64.length > 8_000_000) throw new Error("التسجيل طويل جدًا؛ سجّل مقطعًا أقصر");
  return { mime, base64, format };
}

/** STT layers: free OpenRouter audio-input models (transcribe instruction) then fail soft. */
async function transcribeAudioDataUri(dataUri: string, language: string, env: Env): Promise<{ text: string; provider: string }> {
  const { base64, format } = parseDataUri(dataUri);
  const langHint = language.startsWith("ar") ? "Arabic (Syrian dialect if present)" : language;
  const models = [
    "thinkingmachines/inkling:free",
    "thinkingmachines/inkling-small:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ];
  if (!env.OPENROUTER_API_KEY) throw new Error("لا يتوفر مفتاح تحويل الصوت");

  let lastErr = "تعذر فهم التسجيل";
  for (const model of models) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://flsko-api.flsko.workers.dev",
          "X-Title": "Flsko",
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Transcribe the speech to plain text only. Language: ${langHint}. Output the transcript with no commentary.` },
              { type: "input_audio", input_audio: { data: base64, format } },
            ],
          }],
          max_tokens: 800,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const payload = await response.json().catch(() => ({})) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        lastErr = payload.error?.message || `STT ${model} ${response.status}`;
        continue;
      }
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) {
        return { text: text.trim(), provider: model };
      }
      lastErr = `STT ${model} empty`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  // Hugging Face Whisper (last resort) via Inference router
  if (env.HF_TOKEN) {
    try {
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const response = await fetch("https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.HF_TOKEN}`,
          "content-type": `audio/${format === "mp3" ? "mpeg" : format}`,
        },
        body: bin,
        signal: AbortSignal.timeout(90_000),
      });
      const payload = await response.json().catch(() => ({})) as { text?: string; error?: string };
      if (response.ok && typeof payload.text === "string" && payload.text.trim()) {
        return { text: payload.text.trim(), provider: "hf-whisper-turbo" };
      }
      lastErr = payload.error || `HF Whisper ${response.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}


/** Full voice turn: audio → text → chat (mode stack) → TTS URL. */

/** Hidden Gemini bootstrap at start of live voice session — identity lock + user context. */
async function startVoiceLiveSession(user: Record<string, unknown>, env: Env, mode: string) {
  const userContext = await buildUserContext(user, env);
  const hidden = `${VOICE_LIVE_BOOTSTRAP}

سياق المستخدم (للاستخدام الداخلي فقط):
${userContext}

أكد داخليًا أنك جاهز كـ «فلسقوا» فقط. أعد للمستخدم جملة ترحيب صوتية قصيرة جدًا بلهجته دون ذكر Gemini أو Google.`;
  let greeting = "أهلًا، أنا فلسقوا. احكِ متى ما جاهز.";
  let provider = "local-fallback";
  try {
    if (env.FLSKO_GEMINI_API_KEY) {
      greeting = await geminiChat(env, [
        { role: "system", content: `${SYSTEM_PROMPT}\n${VOICE_LIVE_BOOTSTRAP}\nوضع: محادثة صوتية مباشرة.` },
        { role: "user", content: hidden },
      ], 120);
      provider = "gemini-3.8-flash";
    } else {
      greeting = await openRouterChat(env, env.FLSKO_OPENROUTER_MODEL || "openrouter/free", [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: hidden },
      ], 120, 0.5);
      provider = "openrouter";
    }
  } catch {
    /* keep fallback greeting */
  }
  // Strip any accidental model self-name
  greeting = greeting.replace(/\b(Gemini|Google AI|ChatGPT|Claude|Llama)\b/gi, "فلسقوا").trim() || "أهلًا، أنا فلسقوا. تفضل احكِ.";
  return {
    session: "voice-live",
    provider,
    greeting,
    identity: "فلسقوا",
    mode,
    message: "بدأت جلسة صوتية مباشرة. الردود تُقرأ بصوت الجهاز بعد كل مقطع.",
  };
}

async function voiceChatTurn(
  dataUri: string,
  language: string,
  mode: string,
  user: Record<string, unknown>,
  env: Env,
) {
  const stt = await transcribeAudioDataUri(dataUri, language, env);
  const chat = await runChat(stt.text, mode, user, env, { liveVoice: true });
  let speech: { url?: string; provider?: string; status?: string; message?: string } | null = null;
  try {
    speech = await generateSpeech(chat.text, language.startsWith("ar") ? "ar" : "en");
  } catch {
    speech = { status: "unavailable", message: "تعذر توليد الصوت السحابي؛ استخدم قراءة الجهاز." };
  }
  return {
    transcript: stt.text,
    sttProvider: stt.provider,
    text: chat.text,
    sourceId: chat.sourceId,
    mode: chat.mode,
    stack: chat.stack,
    speechUrl: speech?.url,
    speechProvider: speech?.provider,
    speechStatus: speech?.status || "completed",
    speechMessage: speech?.message,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/api/health") return json({ ok: true, service: "flsko-api", database: "d1", timestamp: Date.now() }, 200, origin, "public, max-age=10");
    // App version / OTA policy — clients poll this for flexible upgrades
    if (url.pathname === "/api/app/version" && request.method === "GET") {
      return jsonCached("app-version", 60_000, origin, () => ({
        minVersion: "1.0.0",
        latestVersion: "1.0.1",
        otaEnabled: true,
        forceUpdate: false,
        channel: "production",
        messageAr: "يتوفر تحسينات على فلسقوا. حدّث عند توفر نسخة المتجر أو انتظر التحديث التلقائي داخل التطبيق.",
        storeUrlAndroid: "",
        storeUrlIos: "",
        features: {
          voiceLive: true,
          tutorChannel: true,
          mediaImage: true,
          mediaVideo: true,
          mediaMusic: true,
        },
        updatedAt: Date.now(),
      }), 60);
    }
    // Placeholder Expo Updates manifest endpoint (EAS hosts real manifests; this documents channel)
    if (url.pathname === "/api/app/manifest" && request.method === "GET") {
      return json({
        note: "Production OTA manifests are published via eas update. This endpoint confirms the update channel is reachable.",
        channel: "production",
        runtimePolicy: "appVersion",
      }, 200, origin);
    }

    // Tutor channel (Grok / Manus): POST /api/brain/tutor
    if (url.pathname === "/api/brain/tutor" && request.method === "POST") {
      const tutor = authorizeTutor(request, env);
      if (!tutor) return json({ error: "unauthorized" }, 401, origin);
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const action = (typeof body.action === "string" ? body.action : "chat") as TutorAction;
      const result = await handleTutorAction(env, tutor, action, body);
      return json(result, result.error ? 429 : 200, origin);
    }

    if (url.pathname === "/privacy") return legalPage("سياسة الخصوصية", "<p>يستخدم Flsko بيانات الحساب اللازمة لتسجيل الدخول، ورسائلك وطلبات الوسائط والذكريات التي تمنحها موافقة صريحة. تُرسل الطلبات إلى خادم Flsko وقد تُعالج عبر مزودات ذكاء اصطناعي سحابية أو مفتوحة متاحة. لا يطلب Flsko كلمة مرور Google ولا يضع مفاتيح المزودات داخل الهاتف.</p><p>يمكنك إدارة الذكريات من التطبيق وطلب حذف الحساب والبيانات المرتبطة به عبر قناة الاقتراحات الرسمية. لا تستخدم الخدمة لإرسال معلومات حساسة لا تريد معالجتها سحابيًا. تُحدّث هذه السياسة عند تغير المعالجة أو المزودات.</p>");
    if (url.pathname === "/terms") return legalPage("شروط الاستخدام", "<p>باستخدام Flsko أو تسجيل الدخول إليه، توافق على هذه الشروط. Flsko وكيل مساعد وقد تخطئ نتائجه أو تتأخر، ولا تشكل النتائج استشارة طبية أو قانونية أو مالية.</p><p>أنت مسؤول عن طلباتك وملفاتك. يحظر انتهاك حقوق الآخرين أو انتحال الأشخاص أو إنشاء محتوى ضار أو التحايل على حدود الخدمة. تعود هوية Flsko والمواد التي يملكها المشروع إلى علي يوسف. الخدمة مجانية تجريبيًا وقد تتغير إتاحتها وحدودها.</p>");
    if (url.pathname === "/download") return legalPage("تحميل Flsko", "<p>هذه هي الصفحة الرسمية لمشروع Flsko. رابط ملف Android سيُضاف هنا بعد إنشاء نسخة APK أو AAB موقعة وآمنة.</p><p>لا تثبّت ملفات تحمل اسم Flsko من مصادر غير موثوقة. اقرأ <a href=\"/privacy\">سياسة الخصوصية</a> و<a href=\"/terms\">شروط الاستخدام</a> قبل الاستخدام.</p>");
    if (url.pathname.startsWith("/api/trpc/")) {
      const path = url.pathname.slice("/api/trpc/".length).split(",")[0];
      try {
        const input = await trpcInput(request, url) as Record<string, unknown> | null;
        const user = await currentUser(request, env);
        if (path === "system.health") return trpcResult({ status: "ok", service: "flsko", cached: false }, origin);
        if (path === "agent.status") {
          const body = await jsonCached("agent-status", 15_000, origin, async () => ({
            name: "Flsko",
            orchestration: "automatic",
            openSourceSearch: true,
            userSeesModels: false,
            privacy: "cloud-only-with-consent",
            brain: true,
          }), 15);
          // tRPC shape
          const data = JSON.parse(await body.text());
          return trpcResult(data, origin);
        }
        if (path === "media.status") {
          const payload = await (async () => {
            const hit = memoryGet("media-status");
            if (hit) return JSON.parse(hit);
            const fresh = await mediaStatus(env);
            memorySet("media-status", fresh, 20_000);
            return fresh;
          })();
          return trpcResult(payload, origin);
        }
        if (path === "auth.me") return trpcResult(user, origin);
                if (path === "auth.register") {
          const value = input || {};
          const email = typeof value.email === "string" ? value.email : "";
          const password = typeof value.password === "string" ? value.password : "";
          const name = typeof value.name === "string" ? value.name : undefined;
          try {
            const userId = await registerWithEmail(env, email, password, name);
            const token = randomToken();
            await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256(token), userId, Date.now() + 365 * 24 * 60 * 60 * 1000).run();
            const user = await env.DB.prepare("SELECT id, open_id as openId, name, email, picture, role, last_signed_in as lastSignedIn, login_method as loginMethod FROM users WHERE id=?").bind(userId).first();
            return trpcResult({ sessionToken: token, user }, origin);
          } catch (e) {
            return trpcError(e instanceof Error ? e.message : "فشل التسجيل", 400, origin);
          }
        }
        if (path === "auth.login") {
          const value = input || {};
          const email = typeof value.email === "string" ? value.email : "";
          const password = typeof value.password === "string" ? value.password : "";
          try {
            const userId = await loginWithEmail(env, email, password);
            const token = randomToken();
            await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256(token), userId, Date.now() + 365 * 24 * 60 * 60 * 1000).run();
            const user = await env.DB.prepare("SELECT id, open_id as openId, name, email, picture, role, last_signed_in as lastSignedIn, login_method as loginMethod FROM users WHERE id=?").bind(userId).first();
            return trpcResult({ sessionToken: token, user }, origin);
          } catch (e) {
            return trpcError(e instanceof Error ? e.message : "فشل الدخول", 401, origin);
          }
        }
        if (path === "account.delete" || path === "auth.deleteAccount") {
          if (!user) return trpcError("تسجيل الدخول مطلوب", 401, origin);
          const uid = user.id;
          for (const sql of ["DELETE FROM sessions WHERE user_id=?", "DELETE FROM messages WHERE user_id=?", "DELETE FROM conversations WHERE user_id=?", "DELETE FROM memories WHERE user_id=?", "DELETE FROM learning_events WHERE user_id=?", "DELETE FROM profiles WHERE user_id=?", "DELETE FROM knowledge_sources WHERE user_id=?", "DELETE FROM generations WHERE user_id=?", "DELETE FROM users WHERE id=?"]) {
            try { await env.DB.prepare(sql).bind(uid).run(); } catch { /* ignore */ }
          }
          return trpcResult({ success: true, deleted: true }, origin);
        }
        if (path === "auth.logout") { const token = getBearer(request) || getCookie(request, "app_session_id"); if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run(); return trpcResult({ success: true }, origin); }
        if (!user) return trpcError("تسجيل الدخول مطلوب", 401, origin);
        if (path === "memory.list") { const rows = await env.DB.prepare("SELECT id, category, content, consent, created_at as createdAt FROM memories WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all(); return trpcResult(rows.results, origin); }
        if (path === "memory.remember") { const value = input || {}; if (value.consent !== true || typeof value.category !== "string" || typeof value.content !== "string") return trpcError("الفئة والمحتوى والموافقة مطلوبة", 400, origin); await env.DB.prepare("INSERT INTO memories(user_id,category,content,consent) VALUES(?,?,?,1)").bind(user.id, value.category.slice(0, 64), value.content.slice(0, 1200)).run(); return trpcResult({ accepted: true }, origin); }
        if (path === "profile.get") { const profile = await env.DB.prepare("SELECT display_name as displayName, gender, avatar_url as avatarUrl, about, governorate, chat_background as chatBackground, voice_gender as voiceGender FROM profiles WHERE user_id=?").bind(user.id).first(); return trpcResult(profile, origin); }
        if (path === "profile.save") { const value = input || {}; await env.DB.prepare("INSERT INTO profiles(user_id,display_name,gender,avatar_url,about,governorate,chat_background,voice_gender) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,gender=excluded.gender,avatar_url=excluded.avatar_url,about=excluded.about,governorate=excluded.governorate,chat_background=excluded.chat_background,voice_gender=excluded.voice_gender").bind(user.id, value.displayName || null, value.gender || "unspecified", value.avatarUrl || null, value.about || null, value.governorate || null, value.chatBackground || "#F4F8F7", value.voiceGender || "female").run(); return trpcResult(value, origin); }
        if (path === "brain.tutor") {
          const tutor = authorizeTutor(request, env);
          if (!tutor) return trpcError("غير مصرّح — أرسل X-Flsko-Tutor-Secret", 401, origin);
          const value = input || {};
          const action = (typeof value.action === "string" ? value.action : "chat") as TutorAction;
          const result = await handleTutorAction(env, tutor, action, value as Record<string, unknown>);
          if (result.error) return trpcError(String(result.message || "خطأ"), 429, origin);
          return trpcResult(result, origin);
        }
        if (path === "agent.chat") {
          const value = input || {};
          const message = typeof value.message === "string" ? value.message.trim() : "";
          if (!message || message.length > 6000) return trpcError("الرسالة مطلوبة وبحد أقصى 6000 حرف", 400, origin);
          const mode = value.mode === "pro-max" ? "برو ماكس" : value.mode === "pro" ? "برو" : "طبيعي وسريع";
          const conversationId = typeof value.conversationId === "number" ? value.conversationId : undefined;
          return trpcResult(await runChat(message, mode, user, env, { conversationId }), origin);
        }
        if (path === "chat.list") {
          return trpcResult(await listConversations(env, user.id), origin);
        }
        if (path === "chat.create") {
          const value = input || {};
          const title = typeof value.title === "string" ? value.title : undefined;
          const mode = typeof value.mode === "string" ? value.mode : "natural";
          return trpcResult(await createConversation(env, user.id, title, mode), origin);
        }
        if (path === "chat.get") {
          const value = input || {};
          const id = Number(value.id || value.conversationId);
          if (!id) return trpcError("معرّف المحادثة مطلوب", 400, origin);
          return trpcResult(await getConversationMessages(env, user.id, id), origin);
        }
        if (path === "chat.delete") {
          const value = input || {};
          const id = Number(value.id || value.conversationId);
          if (!id) return trpcError("معرّف المحادثة مطلوب", 400, origin);
          await env.DB.prepare("DELETE FROM messages WHERE conversation_id=? AND user_id=?").bind(id, user.id).run();
          await env.DB.prepare("DELETE FROM conversations WHERE id=? AND user_id=?").bind(id, user.id).run();
          return trpcResult({ deleted: true, id }, origin);
        }
        if (path === "chat.pinTask") {
          const value = input || {};
          const id = Number(value.id || value.conversationId);
          if (!id) return trpcError("معرّف المحادثة مطلوب", 400, origin);
          return trpcResult(await pinConversationAsTask(env, user.id, id), origin);
        }
        if (path === "agent.generate") {
          const value = input || {};
          if (typeof value.prompt !== "string" || value.prompt.trim().length < 3) return trpcError("نوع الوسائط أو الوصف غير صالح", 400, origin);
          if (value.kind === "video") return trpcResult(await submitWanVideo(value.prompt.trim(), env), origin);
          if (value.kind !== "image") return trpcError("نوع الوسائط غير صالح", 400, origin);
          const sourceImage = typeof value.imageDataUri === "string" && value.imageDataUri.startsWith("data:image/")
            ? value.imageDataUri
            : typeof value.imageUrl === "string" && /^https?:\/\//i.test(value.imageUrl)
              ? value.imageUrl
              : undefined;
          const finalPrompt = sourceImage
            ? `Edit and improve this reference image according to: ${value.prompt.trim()}`
            : value.prompt.trim();
          return trpcResult(await generateOpenImage(finalPrompt, env, sourceImage), origin);
        }
        if (path === "agent.mediaJob") { const value = input || {}; if (typeof value.jobId !== "string" || value.jobId.length < 8) return trpcError("رقم المهمة غير صالح", 400, origin); return trpcResult(await pollWanVideo(value.jobId, env), origin); }
        if (path === "agent.music") { const value = input || {}; if (typeof value.prompt !== "string" || value.prompt.trim().length < 3) return trpcError("وصف الموسيقى غير صالح", 400, origin); return trpcResult(await generateOpenMusic(value.prompt.trim(), env), origin); }
        if (path === "agent.speak") { const value = input || {}; if (typeof value.text !== "string" || value.text.trim().length < 1) return trpcError("النص مطلوب", 400, origin); return trpcResult(await generateSpeech(value.text.trim(), typeof value.lang === "string" ? value.lang : "ar"), origin); }
        if (path === "voice.transcribe") {
          const value = input || {};
          if (typeof value.dataUri !== "string" || !value.dataUri.startsWith("data:audio/")) return trpcError("التسجيل الصوتي مطلوب", 400, origin);
          const language = typeof value.language === "string" ? value.language : "ar";
          return trpcResult(await transcribeAudioDataUri(value.dataUri, language, env), origin);
        }
        if (path === "agent.voiceSessionStart") {
          const value = input || {};
          const modeLabel = value.mode === "pro-max" ? "برو ماكس" : value.mode === "pro" ? "برو" : "طبيعي وسريع";
          return trpcResult(await startVoiceLiveSession(user, env, modeLabel), origin);
        }
        if (path === "agent.voiceTurn") {
          const value = input || {};
          if (typeof value.dataUri !== "string" || !value.dataUri.startsWith("data:audio/")) return trpcError("التسجيل الصوتي مطلوب", 400, origin);
          const language = typeof value.language === "string" ? value.language : "ar";
          const modeLabel = value.mode === "pro-max" ? "برو ماكس" : value.mode === "pro" ? "برو" : "طبيعي وسريع";
          return trpcResult(await voiceChatTurn(value.dataUri, language, modeLabel, user, env), origin);
        }
        return trpcError("المسار غير مدعوم بعد على Cloudflare", 404, origin);
      } catch (error) { return trpcError(error instanceof Error ? error.message : "تعذر تنفيذ الطلب", 500, origin); }
    }

    
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as { email?: string; password?: string; name?: string };
      try {
        const userId = await registerWithEmail(env, body.email || "", body.password || "", body.name);
        return issueSession(env, userId, origin);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "فشل التسجيل" }, 400, origin);
      }
    }
    
    if (url.pathname === "/api/auth/forgot-password" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as { email?: string };
      try {
        const result = await requestPasswordReset(env, body.email || "");
        return json(result, 200, origin);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "تعذر الطلب" }, 400, origin);
      }
    }
    if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as { email?: string; code?: string; newPassword?: string };
      try {
        const result = await resetPasswordWithCode(env, body.email || "", body.code || "", body.newPassword || "");
        return json(result, 200, origin);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "تعذر التعيين" }, 400, origin);
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
      try {
        const userId = await loginWithEmail(env, body.email || "", body.password || "");
        return issueSession(env, userId, origin);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "فشل الدخول" }, 401, origin);
      }
    }

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
    
    if (url.pathname === "/api/auth/delete-account" && request.method === "POST") {
      const user = await currentUser(request, env);
      if (!user) return json({ error: "تسجيل الدخول مطلوب" }, 401, origin);
      const uid = user.id;
      // حذف كامل للحساب والبيانات المرتبطة — لا رجوع
      for (const sql of [
        "DELETE FROM sessions WHERE user_id=?",
        "DELETE FROM messages WHERE user_id=?",
        "DELETE FROM conversations WHERE user_id=?",
        "DELETE FROM memories WHERE user_id=?",
        "DELETE FROM learning_events WHERE user_id=?",
        "DELETE FROM users WHERE id=?",
      ]) {
        try { await env.DB.prepare(sql).bind(uid).run(); } catch { /* table may not exist */ }
      }
      return new Response(JSON.stringify({ success: true, deleted: true }), {
        status: 200,
        headers: { "content-type": "application/json", "Set-Cookie": cookie("app_session_id", "", 0), ...corsHeaders(origin) as Record<string, string> },
      });
    }

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
