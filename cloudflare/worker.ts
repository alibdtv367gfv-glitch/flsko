import { providerHealthSnapshot, routeWithFallback } from "./neural-router";

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
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  SESSION_SECRET: string;
}

type WorkerHandler = { fetch: (request: Request, env: Env) => Promise<Response> };
const encoder = new TextEncoder();
const SYSTEM_PROMPT = "أنت فلسقوا، وكيل عربي أولًا يفهم السوريين بتنوعهم دون تنميط. أجب بلهجة المستخدم قدر الإمكان، وكن دقيقًا وصريحًا بشأن حدود معرفتك. إذا سأل المستخدم عن اسمك فقل: اسمي فلسقوا.";
let routerTablesReady: Promise<void> | null = null;

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
  return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Credentials": "true", "Access-Control-Max-Age": "86400" };
}
function json(value: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) } });
}
function redirect(url: string, origin: string | null = null) { return new Response(null, { status: 302, headers: { Location: url, ...corsHeaders(origin) } }); }
function legalPage(title: string, body: string) { return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Flsko</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:2;color:#172033;background:#f8fafc}main{background:white;border:1px solid #dbe4ee;border-radius:20px;padding:28px}h1{color:#087ea4}a{color:#087ea4}</style><main><p><b>Flsko · فلسقوا</b></p><h1>${title}</h1>${body}<hr><p><a href="https://flsko-api.flsko.workers.dev/download">صفحة التنزيل الرسمية</a> · <a href="https://flsko-api.flsko.workers.dev/privacy">سياسة الخصوصية</a> · <a href="https://flsko-api.flsko.workers.dev/terms">شروط الاستخدام</a></p><p>© 2026 علي يوسف · Flsko</p></main></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } }); }
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
function trpcResult(data: unknown, origin: string | null) { return json([{ result: { data: { json: data } } }], 200, origin); }
function trpcError(message: string, status: number, origin: string | null) { return json([{ error: { json: { message, data: { code: status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST", httpStatus: status } } } }], status, origin); }
function layer(id: string, name: string, kind: string, priority: number, available: boolean, reason: string) { return { id, name, kind, priority, available, reason }; }
async function mediaStatus(env?: Env) {
  const persistedHealth = env ? await env.DB.prepare("SELECT provider_id as id, kind, failures, last_failure_at as lastFailureAt, disabled_until as disabledUntil, last_error as lastError, updated_at as updatedAt FROM provider_health ORDER BY kind, provider_id").all().catch(() => ({ results: [] })) : { results: [] };
  return {
    policy: "automatic-best-available",
    router: { mode: "safe-fallback", failureCooldownMs: 60000, health: providerHealthSnapshot(), persistedHealth: persistedHealth.results },
    image: { selected: env?.FLSKO_IMAGE_PROVIDER_URL ? "configured-open-provider" : "pollinations-flux", layers: [layer("gemini-image", "Gemini Image", "cloud-closed", 1, false, "حصة Gemini الحالية أعادت 429"), layer("configured-open-provider", "مزود صور مفتوح مخصص", "cloud-open", 2, Boolean(env?.FLSKO_IMAGE_PROVIDER_URL), env?.FLSKO_IMAGE_PROVIDER_URL ? "مهيأ" : "لم تتم تهيئته"), layer("pollinations-flux", "Pollinations Flux", "cloud-open", 3, true, "تم اختباره وأعاد JPEG فعليًا"), layer("mobile-sd-lcm", "Stable Diffusion LCM محلي", "on-device", 4, false, "يحتاج حزمة نموذج Android أصلية ولم تُضمّن بعد")] },
    video: { selected: env?.FLSKO_WAN_SPACE ? "wan-gradio" : null, layers: [layer("gemini-veo", "Gemini/Veo", "cloud-closed", 1, false, "حصة Gemini الحالية أعادت 429"), layer("wan-gradio", "Wan 2.1 Gradio Space", "cloud-open-queue", 2, Boolean(env?.FLSKO_WAN_SPACE), env?.FLSKO_WAN_SPACE ? "مهيأ بطابور Gradio" : "لم تتم تهيئته"), layer("wan-provider", "Wan 2.x عبر مزود", "cloud-open", 3, Boolean(env?.FLSKO_VIDEO_PROVIDER_URL), env?.FLSKO_VIDEO_PROVIDER_URL ? "مهيأ" : "لا يوجد عنوان مزود"), layer("cogvideox-provider", "CogVideoX عبر مزود", "cloud-open", 4, false, "لا يوجد عنوان مزود مستقل"), layer("rife-mobile", "RIFE محلي", "on-device", 5, false, "يحتاج محرك صور محليًا ومدخلات إطارات")] },
    music: { selected: env?.FLSKO_VODER_API_URL ? "voder" : null, layers: [layer("gemini-lyria", "Gemini/Lyria", "cloud-closed", 1, false, "حصة Gemini الحالية أعادت 429"), layer("ace-step-provider", "ACE-Step عبر مزود", "cloud-open", 2, Boolean(env?.FLSKO_MUSIC_PROVIDER_URL), env?.FLSKO_MUSIC_PROVIDER_URL ? "مهيأ" : "لا يوجد عنوان مزود"), layer("voder", "VODER / ACE-Step", "self-hosted-open", 3, Boolean(env?.FLSKO_VODER_API_URL), env?.FLSKO_VODER_API_URL ? "مهيأ" : "يحتاج خادم VODER مستقلًا؛ ليس مناسبًا لهاتف عادي"), layer("musicgen-mobile", "MusicGen Small محلي", "on-device", 4, false, "يحتاج نموذج INT8 وتكامل Android أصلي"), layer("audioldm-provider", "AudioLDM عبر مزود", "cloud-open", 5, false, "لا يوجد عنوان مزود مستقل")] },
    voice: { selected: env?.FLSKO_VODER_API_URL ? "voder" : "android-tts", layers: [layer("android-tts", "Android TTS", "on-device", 1, true, "متاح من خلال Expo Speech حسب أصوات الجهاز"), layer("voder", "VODER Voice Studio", "self-hosted-open", 2, Boolean(env?.FLSKO_VODER_API_URL), env?.FLSKO_VODER_API_URL ? "مهيأ" : "يحتاج خادم VODER مستقلًا؛ متطلباته أعلى من الهاتف"), layer("piper-onnx", "Piper ONNX عربي", "on-device", 3, false, "يحتاج حزمة صوت عربية داخل التطبيق"), layer("whisper-local", "Whisper محلي", "on-device", 4, false, "يحتاج نموذج ONNX محليًا"), layer("managed-whisper", "Whisper سحابي", "cloud-managed", 5, true, "متاح عند تهيئة خدمة التفريغ الخادمية")] },
  };
}
async function generateOpenImage(prompt: string, env: Env) {
  const result = await routeWithFallback([
    ...(env.FLSKO_IMAGE_PROVIDER_URL ? [{ id: "configured-open-provider", kind: "image" as const, priority: 1, execute: async () => {
      const response = await fetch(env.FLSKO_IMAGE_PROVIDER_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, model: "stable-diffusion-xl" }) });
      if (!response.ok) throw new Error(`configured image provider failed: ${response.status}`);
      const payload = await response.json().catch(() => ({})) as { url?: string; image_url?: string };
      const url = payload.url || payload.image_url;
      if (!url) throw new Error("configured image provider returned no asset");
      return { url, provider: "open-source-configured", status: "completed" as const, message: "تم اختيار مزود الصور المفتوح المهيأ تلقائيًا." };
    } }] : []),
    { id: "pollinations-flux", kind: "image", priority: 2, execute: async () => {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&nologo=true`;
      const response = await fetch(url, { headers: { accept: "image/jpeg" } });
      if (!response.ok) throw new Error(`Pollinations image provider failed: ${response.status}`);
      return { url, provider: "open-source", status: "completed" as const, message: "تم إنشاء الصورة عبر نموذج مفتوح المصدر." };
    } },
  ], Date.now(), routerHooks(env));
  return { ...result.value, provider: result.provider, attempted: result.attempted };
}
async function submitWanVideo(prompt: string, env: Env) {
  const space = env.FLSKO_WAN_SPACE || "https://wan-ai-wan2-1.hf.space";
  const result = await routeWithFallback([{ id: "wan-gradio", kind: "video", priority: 1, execute: async () => {
    const response = await fetch(`${space.replace(/\/$/, "")}/gradio_api/call/t2v_generation_async`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: [prompt, "1280*720", true, -1] }) });
    const payload = await response.json().catch(() => ({})) as { event_id?: string };
    if (!response.ok || !payload.event_id) throw new Error(`Wan Gradio queue failed: ${response.status}`);
    return { status: "queued" as const, provider: "wan-gradio", jobId: payload.event_id, message: "تم إرسال الفيديو إلى طابور Wan المفتوح. سيحتاج وقتًا للمعالجة بسبب موارد Space المجانية." };
  } }], Date.now(), routerHooks(env));
  return { ...result.value, provider: result.provider, attempted: result.attempted };
}
async function pollWanVideo(jobId: string, env: Env) {
  const space = env.FLSKO_WAN_SPACE || "https://wan-ai-wan2-1.hf.space";
  const response = await fetch(`${space.replace(/\/$/, "")}/gradio_api/call/t2v_generation_async/${encodeURIComponent(jobId)}`, { headers: { accept: "text/event-stream" } });
  const body = await response.text();
  const complete = body.split("event: complete").pop()?.match(/data:\s*(.+)/)?.[1]?.trim();
  if (!response.ok || !complete) return { status: "queued" as const, provider: "wan-gradio", jobId, message: "الفيديو ما زال في طابور Wan." };
  const data = JSON.parse(complete) as Array<{ url?: string; path?: string } | null>;
  const file = data.find((item) => item && (item.url || item.path));
  if (!file) return { status: "queued" as const, provider: "wan-gradio", jobId, message: "لم تكتمل مهمة Wan بعد أو أُعيدت دون ملف." };
  return { status: "completed" as const, provider: "wan-gradio", jobId, url: file.url || file.path, message: "اكتمل فيديو Wan." };
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
async function runChat(message: string, mode: string, user: Record<string, unknown>, env: Env) {
  const memories = await env.DB.prepare("SELECT content FROM memories WHERE user_id=? AND consent=1 ORDER BY created_at DESC LIMIT 20").bind(user.id).all<{ content: string }>();
  const routed = await routeWithFallback([{ id: "huggingface-router", kind: "chat", priority: 1, execute: async () => {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.HF_TOKEN}` }, body: JSON.stringify({ model: env.FLSKO_HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct", messages: [{ role: "system", content: `${SYSTEM_PROMPT}\nوضع الإجابة: ${mode}.\nذاكرة المستخدم المصرح بها:\n${memories.results.map((x) => x.content).join("\n")}` }, { role: "user", content: message }], temperature: 0.6, max_tokens: 1000 }) });
    const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }> };
    if (!response.ok) throw new Error(`تعذر الحصول على رد من مزود النموذج: ${response.status}`);
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("لم يصل رد نصي من النموذج");
    return text.trim();
  } }], Date.now(), routerHooks(env));
  const text = routed.value;
  await env.DB.prepare("INSERT INTO messages(user_id,role,content) VALUES(?,?,?)").bind(user.id, "user", message).run();
  await env.DB.prepare("INSERT INTO messages(user_id,role,content) VALUES(?,?,?)").bind(user.id, "assistant", text.trim()).run();
  return { text: text.trim(), provider: "orchestrator", sourceId: routed.provider, compared: routed.attempted.length, attempted: routed.attempted };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/api/health") return json({ ok: true, service: "flsko-api", database: "d1", timestamp: Date.now() }, 200, origin);
    if (url.pathname === "/privacy") return legalPage("سياسة الخصوصية", "<p>يستخدم Flsko بيانات الحساب اللازمة لتسجيل الدخول، ورسائلك وطلبات الوسائط والذكريات التي تمنحها موافقة صريحة. تُرسل الطلبات إلى خادم Flsko وقد تُعالج عبر مزودات ذكاء اصطناعي سحابية أو مفتوحة متاحة. لا يطلب Flsko كلمة مرور Google ولا يضع مفاتيح المزودات داخل الهاتف.</p><p>يمكنك إدارة الذكريات من التطبيق وطلب حذف الحساب والبيانات المرتبطة به عبر قناة الاقتراحات الرسمية. لا تستخدم الخدمة لإرسال معلومات حساسة لا تريد معالجتها سحابيًا. تُحدّث هذه السياسة عند تغير المعالجة أو المزودات.</p>");
    if (url.pathname === "/terms") return legalPage("شروط الاستخدام", "<p>باستخدام Flsko أو تسجيل الدخول إليه، توافق على هذه الشروط. Flsko وكيل مساعد وقد تخطئ نتائجه أو تتأخر، ولا تشكل النتائج استشارة طبية أو قانونية أو مالية.</p><p>أنت مسؤول عن طلباتك وملفاتك. يحظر انتهاك حقوق الآخرين أو انتحال الأشخاص أو إنشاء محتوى ضار أو التحايل على حدود الخدمة. تعود هوية Flsko والمواد التي يملكها المشروع إلى علي يوسف. الخدمة مجانية تجريبيًا وقد تتغير إتاحتها وحدودها.</p>");
    if (url.pathname === "/download") return legalPage("تحميل Flsko", "<p>هذه هي الصفحة الرسمية لمشروع Flsko. رابط ملف Android سيُضاف هنا بعد إنشاء نسخة APK أو AAB موقعة وآمنة.</p><p>لا تثبّت ملفات تحمل اسم Flsko من مصادر غير موثوقة. اقرأ <a href=\"/privacy\">سياسة الخصوصية</a> و<a href=\"/terms\">شروط الاستخدام</a> قبل الاستخدام.</p>");
    if (url.pathname.startsWith("/api/trpc/")) {
      const path = url.pathname.slice("/api/trpc/".length).split(",")[0];
      try {
        const input = await trpcInput(request, url) as Record<string, unknown> | null;
        const user = await currentUser(request, env);
        if (path === "system.health" || path === "agent.status" || path === "media.status") return trpcResult(path === "system.health" ? { status: "ok", service: "flsko" } : path === "media.status" ? await mediaStatus(env) : { name: "Flsko", orchestration: "automatic", openSourceSearch: true, userSeesModels: false, privacy: "cloud-only-with-consent" }, origin);
        if (path === "auth.me") return trpcResult(user, origin);
        if (path === "auth.logout") { const token = getBearer(request) || getCookie(request, "app_session_id"); if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run(); return trpcResult({ success: true }, origin); }
        if (!user) return trpcError("تسجيل الدخول مطلوب", 401, origin);
        if (path === "memory.list") { const rows = await env.DB.prepare("SELECT id, category, content, consent, created_at as createdAt FROM memories WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all(); return trpcResult(rows.results, origin); }
        if (path === "memory.remember") { const value = input || {}; if (value.consent !== true || typeof value.category !== "string" || typeof value.content !== "string") return trpcError("الفئة والمحتوى والموافقة مطلوبة", 400, origin); await env.DB.prepare("INSERT INTO memories(user_id,category,content,consent) VALUES(?,?,?,1)").bind(user.id, value.category.slice(0, 64), value.content.slice(0, 1200)).run(); return trpcResult({ accepted: true }, origin); }
        if (path === "profile.get") { const profile = await env.DB.prepare("SELECT display_name as displayName, gender, avatar_url as avatarUrl, about, governorate, chat_background as chatBackground, voice_gender as voiceGender FROM profiles WHERE user_id=?").bind(user.id).first(); return trpcResult(profile, origin); }
        if (path === "profile.save") { const value = input || {}; await env.DB.prepare("INSERT INTO profiles(user_id,display_name,gender,avatar_url,about,governorate,chat_background,voice_gender) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,gender=excluded.gender,avatar_url=excluded.avatar_url,about=excluded.about,governorate=excluded.governorate,chat_background=excluded.chat_background,voice_gender=excluded.voice_gender").bind(user.id, value.displayName || null, value.gender || "unspecified", value.avatarUrl || null, value.about || null, value.governorate || null, value.chatBackground || "#F4F8F7", value.voiceGender || "female").run(); return trpcResult(value, origin); }
        if (path === "agent.chat") { const value = input || {}; const message = typeof value.message === "string" ? value.message.trim() : ""; if (!message || message.length > 6000) return trpcError("الرسالة مطلوبة وبحد أقصى 6000 حرف", 400, origin); const mode = value.mode === "pro-max" ? "برو ماكس" : value.mode === "pro" ? "برو" : "طبيعي وسريع"; return trpcResult(await runChat(message, mode, user, env), origin); }
        if (path === "agent.generate") { const value = input || {}; if (typeof value.prompt !== "string" || value.prompt.trim().length < 3) return trpcError("نوع الوسائط أو الوصف غير صالح", 400, origin); if (value.kind === "video") return trpcResult(await submitWanVideo(value.prompt.trim(), env), origin); if (value.kind !== "image") return trpcError("نوع الوسائط غير صالح", 400, origin); return trpcResult(await generateOpenImage(value.prompt.trim(), env), origin); }
        if (path === "agent.mediaJob") { const value = input || {}; if (typeof value.jobId !== "string" || value.jobId.length < 8) return trpcError("رقم المهمة غير صالح", 400, origin); return trpcResult(await pollWanVideo(value.jobId, env), origin); }
        if (path === "agent.music") return trpcError("لا يوجد مزود موسيقى صالح حاليًا. لم يتم إنشاء ملف وهمي.", 503, origin);
        return trpcError("المسار غير مدعوم بعد على Cloudflare", 404, origin);
      } catch (error) { return trpcError(error instanceof Error ? error.message : "تعذر تنفيذ الطلب", 500, origin); }
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
