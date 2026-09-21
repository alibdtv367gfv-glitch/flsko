import { storagePut } from "./storage";
import { generateImage } from "./_core/imageGeneration";
import { invokeLLM, type Message } from "./_core/llm";
import { buildSyrianContext } from "./syrian-knowledge";
import { buildFlskoSystemPrompt } from "./flsko-identity";
import { isProviderAvailable, withCircuitBreaker } from "./circuit-breaker";
import { arabicAdaptationInstruction } from "./translation-bridge";
import { generateImageFreeChain } from "./providers/image-free";

const geminiKey = process.env.FLSKO_GEMINI_API_KEY?.trim();
const openAiKey = process.env.FLSKO_OPENAI_API_KEY?.trim();
const openAiModel = process.env.FLSKO_OPENAI_MODEL?.trim() || "gpt-4o-mini";
const openSourceChatUrl = process.env.FLSKO_LLM_PROVIDER_URL?.trim();
const openSourceChatKey = process.env.FLSKO_LLM_PROVIDER_KEY?.trim();
const openSourceChatModel = process.env.FLSKO_LLM_MODEL?.trim() || "Qwen/Qwen2.5-7B-Instruct";
const huggingFaceToken = process.env.HF_TOKEN?.trim();
const huggingFaceModel = process.env.FLSKO_HF_MODEL?.trim() || "meta-llama/Llama-3.1-8B-Instruct";
const openResearchUrl = process.env.FLSKO_RESEARCH_PROVIDER_URL?.trim();
const openResearchKey = process.env.FLSKO_RESEARCH_PROVIDER_KEY?.trim() || openSourceChatKey;
const openSourceImageUrl = process.env.FLSKO_IMAGE_PROVIDER_URL?.trim();
const openSourceVideoUrl = process.env.FLSKO_VIDEO_PROVIDER_URL?.trim();
const openSourceMusicUrl = process.env.FLSKO_MUSIC_PROVIDER_URL?.trim();
const openSourceMusicKey = process.env.FLSKO_MUSIC_PROVIDER_KEY?.trim();
const pollinationsKey = process.env.FLSKO_POLLINATIONS_API_KEY?.trim();

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

const systemPrompt = buildFlskoSystemPrompt();

type Candidate = { provider: string; text: string; latencyMs: number; score: number };
export type ChatMode = "natural" | "pro" | "pro-max";

function buildChatModeContext(mode: ChatMode) {
  if (mode === "natural") return "وضع الإجابة: طبيعي وسريع. أجب بوضوح وبدون استعراض خطوات التفكير الداخلية.";
  if (mode === "pro") return "وضع الإجابة: برو. تحقّق من المعطيات، قارن الاحتمالات داخليًا، وقدّم جوابًا منظمًا مع أسباب مختصرة دون كشف التفكير الداخلي التفصيلي.";
  return "وضع الإجابة: برو ماكس. حلّل السؤال متعدد الزوايا، راجع التناقضات والمخاطر، واستند إلى المصادر المتاحة ثم قدّم خلاصة دقيقة. لا تكشف سلسلة التفكير الداخلية أو أسماء المزودات.";
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((part) => (typeof part === "string" ? part : (part as { text?: string }).text || "")).join(" ").trim();
  return "";
}

function scoreAnswer(text: string, userMessage: string) {
  let score = 0;
  if (text.length >= 80) score += 2;
  if (text.length <= 5000) score += 1;
  if (/[\x00-\u007f]/.test(userMessage) && /[\u0600-\u06ff]/.test(text)) score += 1;
  if (/[.!؟؟]/.test(text)) score += 1;
  if (!/error|failed|تعذر|لا أستطيع/iu.test(text)) score += 2;
  return score;
}

async function callOpenAi(messages: Message[]) {
  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${openAiKey}` },
    body: JSON.stringify({ model: openAiModel, messages, temperature: 0.55, max_tokens: 1000 }),
  });
  if (!response.ok) throw new Error(`OpenAI failed: ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const text = extractText(payload.choices?.[0]?.message?.content);
  if (!text) throw new Error("OpenAI returned no text");
  return { text, latencyMs: Date.now() - started };
}

async function callGemini(messages: Message[]) {
  const started = Date.now();
  const models = [process.env.FLSKO_GEMINI_MODEL?.trim() || "gemini-2.5-flash", "gemini-flash-latest"].filter((model, index, list) => list.indexOf(model) === index);
  const prompt = messages.map((message) => `${message.role}: ${extractText(message.content)}`).join("\n\n");
  let lastStatus = 0;
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey!)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.55, maxOutputTokens: 1000 } }),
    });
    lastStatus = response.status;
    if (response.ok) {
      const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(" ").trim() || "";
      if (text) return { text, latencyMs: Date.now() - started };
    }
    if (response.status !== 404) break;
  }
  throw new Error(`Gemini failed: ${lastStatus}`);
}

async function callOpenSourceChat(messages: Message[]) {
  const started = Date.now();
  const response = await fetch(openSourceChatUrl!, {
    method: "POST",
    headers: { "content-type": "application/json", ...(openSourceChatKey ? { authorization: `Bearer ${openSourceChatKey}` } : {}) },
    body: JSON.stringify({ model: openSourceChatModel, messages, temperature: 0.6, max_tokens: 1000 }),
  });
  if (!response.ok) throw new Error(`Open-source chat failed: ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const text = extractText(payload.choices?.[0]?.message?.content);
  if (!text) throw new Error("Open-source provider returned no text");
  return { text, latencyMs: Date.now() - started };
}

async function callHuggingFaceChat(messages: Message[]) {
  if (!huggingFaceToken) throw new Error("Hugging Face token not configured");
  const started = Date.now();
  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${huggingFaceToken}` },
    body: JSON.stringify({ model: huggingFaceModel, messages, temperature: 0.6, max_tokens: 1000 }),
  });
  if (!response.ok) throw new Error(`Hugging Face chat failed: ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const text = extractText(payload.choices?.[0]?.message?.content);
  if (!text) throw new Error("Hugging Face returned no text");
  return { text, latencyMs: Date.now() - started };
}

async function callPollinationsChat(messages: Message[]) {
  if (!pollinationsKey) throw new Error("Pollinations key not configured");
  const started = Date.now();
  const response = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${pollinationsKey}` },
    body: JSON.stringify({ model: "qwen/qwen3-4b", messages, temperature: 0.55, max_tokens: 1000 }),
  });
  if (!response.ok) throw new Error(`Pollinations text failed: ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const text = extractText(payload.choices?.[0]?.message?.content);
  if (!text) throw new Error("Pollinations returned no text");
  return { text, latencyMs: Date.now() - started };
}

async function callManagedChat(messages: Message[]) {
  const started = Date.now();
  const response = await invokeLLM({ messages, maxTokens: 1000 });
  const text = extractText(response.choices?.[0]?.message?.content);
  if (!text) throw new Error("Managed fallback returned no text");
  return { text, latencyMs: Date.now() - started };
}

async function callOpenResearch(userMessage: string) {
  const started = Date.now();
  if (!openResearchUrl) {
    const researchQuery = userMessage
      .replace(/(جاوبني|رد[ّ ]?علي|بالشامي|بالفصحى|باختصار|بالتفصيل).*/u, "")
      .replace(/^(شو بتعرف عن|ما هو|ما هي|أخبرني عن)\s*/u, "")
      .trim() || userMessage;
    const url = `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(researchQuery)}&srlimit=4&srprop=snippet&format=json&utf8=1`;
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Flsko/1.0 (open research)" } });
    if (!response.ok) throw new Error(`Wikipedia research failed: ${response.status}`);
    const payload = (await response.json()) as { query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> } };
    const items = payload.query?.search || [];
    const text = items.map((item) => `${item.title || "مصدر"}: ${(item.snippet || "").replace(/<[^>]+>/g, "")}`).join("\n");
    if (!text) throw new Error("Wikipedia returned no research");
    return { text: `مقتطفات من ويكيبيديا العربية للمقارنة:\n${text}`, latencyMs: Date.now() - started };
  }
  const response = await fetch(openResearchUrl!, {
    method: "POST",
    headers: { "content-type": "application/json", ...(openResearchKey ? { authorization: `Bearer ${openResearchKey}` } : {}) },
    body: JSON.stringify({ query: userMessage, language: "ar", include_sources: true }),
  });
  if (!response.ok) throw new Error(`Open research failed: ${response.status}`);
  const payload = (await response.json()) as { answer?: string; text?: string; summary?: string; sources?: Array<{ title?: string; url?: string }> };
  const text = payload.answer || payload.text || payload.summary || "";
  if (!text) throw new Error("Open research returned no answer");
  const sourceText = payload.sources?.filter((source) => source.title || source.url).slice(0, 3).map((source) => `\nالمصدر: ${source.title || source.url}`).join("") || "";
  return { text: `${text}${sourceText}`, latencyMs: Date.now() - started };
}

export async function answerAsFlsko(userMessage: string, memories: string[], recentConversation: Array<{ role: "user" | "assistant"; content: string }> = [], excludedProviders: string[] = [], profile?: { displayName?: string | null; gender?: string | null; about?: string | null; governorate?: string | null }, attachments: Array<{ name: string; mimeType: string; storageUrl: string }> = [], mode: ChatMode = "natural") {
  const context = memories.length ? `\nمعلومات وافق المستخدم على تذكرها:\n- ${memories.join("\n- ")}` : "";
  const recentContext = recentConversation.length ? `\nسياق المحادثة الأخيرة للتكيّف فقط، وليس ذاكرة دائمة:\n${recentConversation.slice(-8).map((message) => `${message.role}: ${message.content}`).join("\n")}` : "";
  const profileContext = buildProfileContext(profile);
  const attachmentContext = attachments.length ? `\nملفات اختار المستخدم إرفاقها بهذه الرسالة. استخدمها فقط إذا كانت متاحة للمزود، ولا تفترض محتواها من الاسم:\n${attachments.map((file) => `- ${file.name} (${file.mimeType}) — ${file.storageUrl}`).join("\n")}` : "";
  const messages: Message[] = [
    {
      role: "system",
      content: `${systemPrompt}\n${buildChatModeContext(mode)}\n${buildSyrianContext(userMessage)}\n${arabicAdaptationInstruction()}${profileContext}${attachmentContext}${context}${recentContext}`,
    },
    { role: "user", content: userMessage },
  ];
  const tasks: Array<Promise<Candidate>> = [];
  const pushProvider = (name: string, enabled: boolean, fn: () => Promise<{ text: string; latencyMs: number }>, scoreAdjust = 0) => {
    if (!enabled || excludedProviders.includes(name) || !isProviderAvailable(name)) return;
    tasks.push(
      withCircuitBreaker(name, fn).then((result) => ({
        provider: name,
        ...result,
        score: Math.max(0, scoreAnswer(result.text, userMessage) + scoreAdjust),
      })),
    );
  };
  pushProvider("gemini", Boolean(geminiKey), () => callGemini(messages));
  pushProvider("chatgpt", Boolean(openAiKey), () => callOpenAi(messages));
  pushProvider("open-source", Boolean(openSourceChatUrl), () => callOpenSourceChat(messages));
  pushProvider("huggingface", Boolean(huggingFaceToken), () => callHuggingFaceChat(messages));
  pushProvider("pollinations", Boolean(pollinationsKey), () => callPollinationsChat(messages));
  pushProvider("open-research", true, () => callOpenResearch(userMessage), -2);
  pushProvider("managed-fallback", true, () => callManagedChat(messages));

  const results = await Promise.allSettled(tasks);
  results.forEach((result, index) => { if (result.status === "rejected") console.warn(`[Flsko] candidate ${index + 1} unavailable:`, result.reason instanceof Error ? result.reason.message : result.reason); });
  const candidates = results.filter((result): result is PromiseFulfilledResult<Candidate> => result.status === "fulfilled").map((result) => result.value);
  if (candidates.length) {
    candidates.sort((a, b) => (b.score - a.score) || (a.latencyMs - b.latencyMs));
    const winner = candidates[0];
    return { text: winner.text, provider: "orchestrator", sourceId: winner.provider, compared: candidates.length };
  }

  return { text: "تعذر استخراج الرد.", provider: "managed-fallback", sourceId: "managed-fallback", compared: 0 };
}

export function buildProfileContext(profile?: { displayName?: string | null; gender?: string | null; about?: string | null; governorate?: string | null }) {
  return profile ? `\nملف المستخدم الذي أدخله بنفسه:\nالاسم: ${profile.displayName || "غير محدد"}\nالجنس: ${profile.gender || "غير محدد"}\nالمحافظة/اللهجة الأقرب: ${profile.governorate || "غير محددة"}\nمعلومات عامة: ${profile.about || "لا توجد"}` : "";
}

async function generateGeminiImage(prompt: string) {
  const model = process.env.FLSKO_GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey!)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
  });
  if (!response.ok) throw new Error(`Gemini image failed: ${response.status}`);
  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> };
  const image = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!image?.data) throw new Error("Gemini returned no image");
  const stored = await storagePut(`generated/${Date.now()}.png`, Buffer.from(image.data, "base64"), image.mimeType || "image/png");
  return { url: stored.url, provider: "orchestrator" };
}

export async function createFlskoImage(prompt: string) {
  if (geminiKey) {
    try { return await generateGeminiImage(prompt); } catch (error) { console.warn("[Flsko] Gemini image unavailable; falling back:", error instanceof Error ? error.message : error); }
  }
  if (isHttpUrl(openSourceImageUrl)) {
    try {
      const response = await fetch(openSourceImageUrl, { method: "POST", headers: { "content-type": "application/json", ...(openSourceChatKey ? { authorization: `Bearer ${openSourceChatKey}` } : {}) }, body: JSON.stringify({ prompt, model: process.env.FLSKO_IMAGE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0" }) });
      if (response.ok) {
        const payload = (await response.json()) as { url?: string; image_url?: string };
        if (payload.url || payload.image_url) return { url: payload.url || payload.image_url, provider: "orchestrator" };
      }
    } catch (error) {
      console.warn("[Flsko] Configured image provider failed:", error instanceof Error ? error.message : error);
    }
  }
  if (pollinationsKey) {
    try {
      const response = await fetch(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=black-forest-labs/flux-1-schnell`, { headers: { authorization: `Bearer ${pollinationsKey}` } });
      if (response.ok) {
        const stored = await storagePut(`generated/open-image-${Date.now()}.png`, Buffer.from(await response.arrayBuffer()), response.headers.get("content-type") || "image/png");
        return { url: stored.url, provider: "open-source" };
      }
    } catch (error) {
      console.warn("[Flsko] Pollinations keyed image failed:", error instanceof Error ? error.message : error);
    }
  }
  // Documented free public fallbacks (Pollinations URL API + AI Horde)
  try {
    const free = await generateImageFreeChain(prompt);
    return { url: free.url, provider: free.provider };
  } catch (error) {
    console.warn("[Flsko] Free image chain failed:", error instanceof Error ? error.message : error);
  }
  try {
    const result = await generateImage({ prompt, quality: "medium" });
    return { url: result.url, provider: "managed-fallback" };
  } catch {
    throw new Error("تعذر إنشاء الصورة عبر المزودات المتاحة حاليًا.");
  }
}

export async function createFlskoVideo(prompt: string) {
  if (geminiKey) {
    const model = process.env.FLSKO_GEMINI_VIDEO_MODEL?.trim() || "veo-3.1-generate-preview";
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    const start = await fetch(`${baseUrl}/models/${model}:predictLongRunning`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { numberOfVideos: 1, resolution: "720p", durationSeconds: 5 } }),
    });
    if (start.ok) {
      const operation = (await start.json()) as { name?: string };
      if (operation.name) {
        for (let attempt = 0; attempt < 18; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const poll = await fetch(`${baseUrl}/${operation.name}`, { headers: { "x-goog-api-key": geminiKey } });
          if (!poll.ok) continue;
          const status = (await poll.json()) as { done?: boolean; error?: { message?: string }; response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } } };
          if (!status.done) continue;
          if (status.error) throw new Error(status.error.message || "Gemini video generation failed");
          const videoUri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
          if (!videoUri) throw new Error("Gemini returned no video");
          const download = await fetch(videoUri, { headers: { "x-goog-api-key": geminiKey } });
          if (!download.ok) throw new Error(`Gemini video download failed: ${download.status}`);
          const stored = await storagePut(`generated/video-${Date.now()}.mp4`, Buffer.from(await download.arrayBuffer()), "video/mp4");
          return { status: "completed" as const, provider: "gemini", url: stored.url, message: "تم إنشاء فيديو قصير وحفظه سحابيًا." };
        }
        return { status: "queued" as const, provider: "gemini", message: "الفيديو قيد المعالجة السحابية وسيظهر عند اكتماله." };
      }
    }
  }
  if (!isHttpUrl(openSourceVideoUrl)) return { status: "queued" as const, provider: "not-configured", message: "لم يتوفر مزود فيديو فعال. يمكن ربط CogVideoX أو AnimateDiff أو Wan عبر FLSKO_VIDEO_PROVIDER_URL." };
  const response = await fetch(openSourceVideoUrl, { method: "POST", headers: { "content-type": "application/json", ...(openSourceChatKey ? { authorization: `Bearer ${openSourceChatKey}` } : {}) }, body: JSON.stringify({ prompt, model: process.env.FLSKO_VIDEO_MODEL || "Wan-AI/Wan2.2-TI2V-5B", durationSeconds: 5, resolution: "720p" }) });
  if (!response.ok) throw new Error(`Open-source video provider failed: ${response.status}`);
  const payload = (await response.json()) as { url?: string; video_url?: string; status?: string; job_id?: string };
  return { status: payload.url || payload.video_url ? ("completed" as const) : ("queued" as const), provider: "orchestrator", url: payload.url || payload.video_url, jobId: payload.job_id, message: payload.url || payload.video_url ? undefined : "تم إرسال مهمة الفيديو إلى الخادم السحابي." };
}

export async function createFlskoMusic(prompt: string) {
  if (geminiKey) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": geminiKey }, body: JSON.stringify({ model: process.env.FLSKO_GEMINI_MUSIC_MODEL?.trim() || "lyria-3.5", input: prompt, response_format: { type: "audio" } }) });
    if (response.ok) {
      const payload = (await response.json()) as { output_audio?: { data?: string; mime_type?: string; mimeType?: string }; outputAudio?: { data?: string; mime_type?: string; mimeType?: string } };
      const audio = payload.output_audio || payload.outputAudio;
      if (audio?.data) {
        const stored = await storagePut(`generated/music-${Date.now()}.mp3`, Buffer.from(audio.data, "base64"), audio.mime_type || audio.mimeType || "audio/mpeg");
        return { status: "completed" as const, provider: "gemini", url: stored.url, message: "تم إنشاء المقطع عبر مسار Gemini الموسيقي وحفظه سحابيًا." };
      }
    }
  }
  const url = isHttpUrl(openSourceMusicUrl) ? openSourceMusicUrl : (isHttpUrl(process.env.FLSKO_GEMINI_MUSIC_PROVIDER_URL?.trim()) ? process.env.FLSKO_GEMINI_MUSIC_PROVIDER_URL!.trim() : undefined);
  if (!url) return { status: "queued" as const, provider: "not-configured", message: "لم يتوفر مزود موسيقى فعال. يمكن ربط ACE-Step 1.5 المفتوح عبر FLSKO_MUSIC_PROVIDER_URL." };
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(openSourceMusicKey ? { authorization: `Bearer ${openSourceMusicKey}` } : {}) }, body: JSON.stringify({ prompt, durationSeconds: 60, instrumental: false }) });
  if (!response.ok) throw new Error(`Music provider failed: ${response.status}`);
  const payload = (await response.json()) as { url?: string; audio_url?: string; job_id?: string };
  const assetUrl = payload.url || payload.audio_url;
  return { status: assetUrl ? ("completed" as const) : ("queued" as const), provider: openSourceMusicUrl ? "open-source" : "gemini", url: assetUrl, jobId: payload.job_id, message: assetUrl ? "تم إنشاء المقطع وحفظه سحابيًا." : "تم إرسال طلب الموسيقى إلى الخادم." };
}

export function getFlskoProviderStatus() {
  return { name: "Flsko", orchestration: "automatic", openSourceSearch: true, music: { openSource: Boolean(openSourceMusicUrl), gemini: Boolean(geminiKey) }, availableChannels: [geminiKey, openAiKey, openSourceChatUrl, huggingFaceToken, openResearchUrl, "wikipedia-ar"].filter(Boolean).length, userSeesModels: false, privacy: "cloud-only-with-consent" } as const;
}
