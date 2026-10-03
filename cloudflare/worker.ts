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
  OPENROUTER_API_KEY?: string;
  FLSKO_OPENROUTER_MODEL?: string;
  FLSKO_GEMINI_API_KEY?: string;
  FLSKO_GEMINI_MODEL?: string;
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
    image: { selected: env?.FLSKO_IMAGE_PROVIDER_URL ? "configured-open-provider" : "pollinations-flux", layers: [layer("configured-open-provider", "مزود صور مخصص", "cloud-open", 1, Boolean(env?.FLSKO_IMAGE_PROVIDER_URL), env?.FLSKO_IMAGE_PROVIDER_URL ? "مهيأ" : "غير مهيأ"), layer("pollinations-flux", "Pollinations Flux", "cloud-open", 2, true, "طبقة أساسية عامة"), layer("ai-horde", "AI Horde", "cloud-open", 3, true, "طوابير مجهولة مجانية"), layer("pollinations-turbo", "Pollinations Turbo", "cloud-open", 4, true, "احتياط"), layer("lexica-search", "Lexica Search", "unofficial", 5, true, "بحث صور تقريبية غير رسمي")] },
    video: { selected: env?.FLSKO_WAN_SPACE ? "wan-gradio" : null, layers: [layer("gemini-veo", "Gemini/Veo", "cloud-closed", 1, false, "حصة Gemini الحالية أعادت 429"), layer("wan-gradio", "Wan 2.1 Gradio Space", "cloud-open-queue", 2, Boolean(env?.FLSKO_WAN_SPACE), env?.FLSKO_WAN_SPACE ? "مهيأ بطابور Gradio" : "لم تتم تهيئته"), layer("wan-provider", "Wan 2.x عبر مزود", "cloud-open", 3, Boolean(env?.FLSKO_VIDEO_PROVIDER_URL), env?.FLSKO_VIDEO_PROVIDER_URL ? "مهيأ" : "لا يوجد عنوان مزود"), layer("cogvideox-provider", "CogVideoX عبر مزود", "cloud-open", 4, false, "لا يوجد عنوان مزود مستقل"), layer("rife-mobile", "RIFE محلي", "on-device", 5, false, "يحتاج محرك صور محليًا ومدخلات إطارات")] },
    music: { selected: env?.FLSKO_MUSIC_PROVIDER_URL ? "music-provider" : (env?.FLSKO_VODER_API_URL ? "voder" : "musicgen-space"), layers: [layer("music-provider", "مزود موسيقى مخصص", "cloud-open", 1, Boolean(env?.FLSKO_MUSIC_PROVIDER_URL), env?.FLSKO_MUSIC_PROVIDER_URL ? "مهيأ" : "غير مهيأ"), layer("voder", "VODER", "self-hosted-open", 2, Boolean(env?.FLSKO_VODER_API_URL), env?.FLSKO_VODER_API_URL ? "مهيأ" : "يحتاج FLSKO_VODER_API_URL"), layer("bark-music-space", "Bark Space", "unofficial", 3, true, "غير رسمي/طابور"), layer("musicgen-space", "MusicGen HF Space", "cloud-open-queue", 4, true, "قد يكون باردًا"), layer("unavailable-msg", "رسالة واضحة", "fallback", 5, true, "لا ملفات وهمية")] },
    voice: { selected: "android-tts", layers: [layer("android-tts", "Android TTS", "on-device", 1, true, "الأساسي على الجهاز"), layer("streamelements-tts", "StreamElements TTS", "unofficial", 2, true, "غير رسمي"), layer("google-translate-tts", "Google Translate TTS", "unofficial", 3, true, "غير رسمي"), layer("responsivevoice-tts", "ResponsiveVoice", "unofficial", 4, true, "غير رسمي"), layer("bark-space", "Bark HF Space", "unofficial", 5, true, "طابور عام"), layer("voder", "VODER", "self-hosted-open", 6, Boolean(env?.FLSKO_VODER_API_URL), env?.FLSKO_VODER_API_URL ? "مهيأ" : "يحتاج FLSKO_VODER_API_URL")] },
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
      for (let i = 0; i < 24; i++) {
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
      const response = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Pollinations turbo failed: ${response.status}`);
      return { url, provider: "pollinations-turbo", status: "completed" as const, message: "صورة عبر Pollinations turbo (احتياط)." };
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
  ], Date.now(), routerHooks(env));
  return { ...result.value, provider: result.provider, attempted: result.attempted };
}

/** Cloud TTS fallbacks — Android native remains primary on device. */
async function generateSpeech(text: string, lang = "ar") {
  const clipped = text.slice(0, 180);
  const result = await routeWithFallback([
    { id: "streamelements-tts", kind: "voice" as const, priority: 1, execute: async () => {
      const voice = lang.startsWith("ar") ? "Brian" : "Brian";
      const url = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(clipped)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`StreamElements TTS failed: ${response.status}`);
      return { url, provider: "streamelements-tts", status: "completed" as const, message: "تم توليد الصوت عبر طبقة سحابية مجانية." };
    } },
    { id: "google-translate-tts", kind: "voice" as const, priority: 2, execute: async () => {
      const tl = lang.startsWith("ar") ? "ar" : "en";
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clipped)}&tl=${tl}&client=tw-ob`;
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Google TTS failed: ${response.status}`);
      return { url, provider: "google-translate-tts", status: "completed" as const, message: "تم توليد الصوت عبر طبقة احتياطية غير رسمية." };
    } },
    { id: "responsivevoice-tts", kind: "voice" as const, priority: 3, execute: async () => {
      const tl = lang.startsWith("ar") ? "ar" : "en-US";
      const url = `https://code.responsivevoice.org/develop/getvoice.php?t=${encodeURIComponent(clipped)}&tl=${encodeURIComponent(tl)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`ResponsiveVoice failed: ${response.status}`);
      return { url, provider: "responsivevoice-tts", status: "completed" as const, message: "صوت عبر ResponsiveVoice (غير رسمي)." };
    } },
    { id: "bark-space", kind: "voice" as const, priority: 4, execute: async () => {
      const base = "https://suno-bark.hf.space";
      const call = await fetch(`${base}/gradio_api/call/predict`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: [clipped] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!call.ok) throw new Error(`Bark space failed: ${call.status}`);
      const body = await call.json().catch(() => ({})) as { event_id?: string };
      if (body.event_id) {
        return { url: undefined as unknown as string, provider: "bark-space", status: "queued" as const, message: "طلب Bark في الطابور (مساحة غير رسمية/عامة)." };
      }
      throw new Error("Bark no event");
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
async function submitWanVideo(prompt: string, env: Env) {
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
        message: "أُرسل الفيديو عبر Gradio إلى Wan Space. استعلم عبر agent.mediaJob.",
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
  ], Date.now(), routerHooks(env));
  return { ...result.value, provider: result.provider, attempted: result.attempted };
}
async function pollWanVideo(jobId: string, env: Env) {
  const space = (env.FLSKO_WAN_SPACE || "https://wan-ai-wan2-1.hf.space").replace(/\/+$/, "");
  const headers: Record<string, string> = { accept: "text/event-stream", "user-agent": "Flsko/1.0" };
  if (env.HF_TOKEN) headers.authorization = `Bearer ${env.HF_TOKEN}`;

  try {
    const response = await fetch(`${space}/gradio_api/call/t2v_generation_async/${encodeURIComponent(jobId)}`, {
      headers,
      signal: AbortSignal.timeout(25_000),
    });
    const body = await response.text();
    const complete = body.split("event: complete").pop()?.match(/data:\s*(.+)/)?.[1]?.trim();
    if (response.ok && complete) {
      try {
        const data = JSON.parse(complete) as unknown;
        const flat = JSON.stringify(data);
        const m = flat.match(/https?:\/\/[^"\\s]+\.(mp4|webm)/i) || flat.match(/"url"\s*:\s*"(https?:[^"]+)"/i);
        if (m) {
          const url = (m[1] && m[1].startsWith("http") ? m[1] : m[0]).replace(/\\\//g, "/");
          return { status: "completed" as const, provider: "wan-gradio", jobId, url, message: "اكتمل فيديو Wan عبر Gradio." };
        }
      } catch { /* still queued */ }
    }
  } catch { /* still queued */ }

  return { status: "queued" as const, provider: "wan-gradio", jobId, message: "الفيديو ما زال في طابور Wan (مساحة مجانية قد تتأخر)." };
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

async function runChat(message: string, mode: string, user: Record<string, unknown>, env: Env) {
  const memories = await env.DB.prepare("SELECT content FROM memories WHERE user_id=? AND consent=1 ORDER BY created_at DESC LIMIT 20").bind(user.id).all<{ content: string }>();
  const system = `${SYSTEM_PROMPT}\nوضع الإجابة: ${mode}.\nذاكرة المستخدم المصرح بها:\n${memories.results.map((x) => x.content).join("\n")}`;
  const messages = [{ role: "system", content: system }, { role: "user", content: message }];
  const providers: Array<{ id: string; kind: "chat"; priority: number; execute: () => Promise<string> }> = [];

  const stack = chatModelsForMode(mode);
  let priority = 1;
  // Gemini first when key present (best quality; needs Generative Language API enabled)
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

  // Shared backups after mode stack
  providers.push({
    id: "or-free-router",
    kind: "chat",
    priority: priority++,
    execute: () => openRouterChat(env, env.FLSKO_OPENROUTER_MODEL || "openrouter/free", messages, 1000, 0.6),
  });
  providers.push({
    id: "huggingface-router",
    kind: "chat",
    priority: stack.length + 2,
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
    priority: stack.length + 3,
    execute: async () => {
      const q = encodeURIComponent(`${SYSTEM_PROMPT}\nالمستخدم: ${message}\nفلسقوا:`);
      const response = await fetch(`https://text.pollinations.ai/${q}`, { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`Pollinations text failed: ${response.status}`);
      const text = (await response.text()).trim();
      if (!text) throw new Error("Pollinations text empty");
      return text;
    },
  });

  const routed = await routeWithFallback(providers, Date.now(), routerHooks(env));
  const text = routed.value;
  await env.DB.prepare("INSERT INTO messages(user_id,role,content) VALUES(?,?,?)").bind(user.id, "user", message).run();
  await env.DB.prepare("INSERT INTO messages(user_id,role,content) VALUES(?,?,?)").bind(user.id, "assistant", text.trim()).run();
  return {
    text: text.trim(),
    provider: "orchestrator",
    sourceId: routed.provider,
    mode,
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
  throw new Error(lastErr);
}

/** Full voice turn: audio → text → chat (mode stack) → TTS URL. */
async function voiceChatTurn(
  dataUri: string,
  language: string,
  mode: string,
  user: Record<string, unknown>,
  env: Env,
) {
  const stt = await transcribeAudioDataUri(dataUri, language, env);
  const chat = await runChat(stt.text, mode, user, env);
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
        if (path === "agent.music") { const value = input || {}; if (typeof value.prompt !== "string" || value.prompt.trim().length < 3) return trpcError("وصف الموسيقى غير صالح", 400, origin); return trpcResult(await generateOpenMusic(value.prompt.trim(), env), origin); }
        if (path === "agent.speak") { const value = input || {}; if (typeof value.text !== "string" || value.text.trim().length < 1) return trpcError("النص مطلوب", 400, origin); return trpcResult(await generateSpeech(value.text.trim(), typeof value.lang === "string" ? value.lang : "ar"), origin); }
        if (path === "voice.transcribe") {
          const value = input || {};
          if (typeof value.dataUri !== "string" || !value.dataUri.startsWith("data:audio/")) return trpcError("التسجيل الصوتي مطلوب", 400, origin);
          const language = typeof value.language === "string" ? value.language : "ar";
          return trpcResult(await transcribeAudioDataUri(value.dataUri, language, env), origin);
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
