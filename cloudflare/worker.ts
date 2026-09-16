export interface Env {
  HF_TOKEN: string;
  FLSKO_HF_MODEL?: string;
}

type WorkerHandler = { fetch: (request: Request, env: Env) => Promise<Response> };

const SYSTEM_PROMPT = "أنت فلسقوا، وكيل عربي أولًا يفهم السوريين بتنوعهم دون تنميط. أجب بلهجة المستخدم قدر الإمكان، وكن دقيقًا وصريحًا بشأن حدود معرفتك. إذا سأل المستخدم عن اسمك فقل: اسمي فلسقوا.";

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(value: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);

    if (url.pathname === "/api/health" || url.pathname === "/") {
      return json({ ok: true, service: "flsko-api", provider: "huggingface", timestamp: Date.now() }, 200, origin);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!env.HF_TOKEN) return json({ error: "HF_TOKEN غير مهيأ على الخادم" }, 503, origin);
      let body: { message?: unknown; mode?: string };
      try { body = await request.json(); } catch { return json({ error: "صيغة الطلب غير صالحة" }, 400, origin); }
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 6000) return json({ error: "الرسالة مطلوبة وبحد أقصى 6000 حرف" }, 400, origin);
      const mode = body.mode === "pro-max" ? "برو ماكس" : body.mode === "pro" ? "برو" : "طبيعي وسريع";
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.HF_TOKEN}` },
        body: JSON.stringify({
          model: env.FLSKO_HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct",
          messages: [
            { role: "system", content: `${SYSTEM_PROMPT}\nوضع الإجابة: ${mode}. لا تكشف التفكير الداخلي أو أسماء المزودات.` },
            { role: "user", content: message },
          ],
          temperature: 0.6,
          max_tokens: 1000,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return json({ error: "تعذر الحصول على رد من مزود النموذج" }, 502, origin);
      const text = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) return json({ error: "لم يصل رد نصي من النموذج" }, 502, origin);
      return json({ text: text.trim(), provider: "orchestrator", sourceId: "huggingface", compared: 1 }, 200, origin);
    }

    return json({ error: "المسار غير موجود" }, 404, origin);
  },
} satisfies WorkerHandler;
