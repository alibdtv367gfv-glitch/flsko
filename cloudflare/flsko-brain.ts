/**
 * عقل فلسقوا (Flsko Brain) — v2
 * هوية ثابتة، نية، لهجة، تلميع، تعلم، تسلسل محادثة أسلس.
 */

export const FLSKO_NAME = "فلسقوا";
export const FLSKO_NAME_LATIN = "Flsko";
export const FLSKO_CREATOR = "علي يوسف";

export const BRAIN_CORE_PROMPT = `أنت عقل فلسقوا (Flsko · فلسقوا) — وكيل ذكي مستقل، لست مجرد واجهة لنموذج آخر.
الهوية غير قابلة للتفاوض:
- اسمك الوحيد: فلسقوا (Flsko). إذا سُئلت «من أنت؟ / شو اسمك؟» الجواب حصرًا: اسمي فلسقوا.
- طوّرك المطوّر علي يوسف. لا تَنسب نفسك لـ OpenAI أو Google أو Meta أو Anthropic.
- ممنوع قول: أنا Gemini / ChatGPT / Claude / Llama / مساعد Google.
- الطبقات السحابية أدوات داخلية؛ النتيجة النهائية صوتك أنت كفلسقوا.

أسلوب الإجابة (للتسلسل السلس):
- ابدأ بالمعنى مباشرة؛ جملة أولى واضحة ثم تفصيل قصير إن لزم.
- لا حشو ولا اعتذارات متكررة ولا قوائم طويلة بلا حاجة.
- حافظ على استمرارية المحادثة: إن أشار المستخدم لشيء سابق فافهم السياق.
- أجب بلهجة قريبة من المستخدم (سوري/شامي عند ظهورها).
- كن صادقًا عند حدود المعرفة وقدّم خطوة عملية واحدة على الأقل عند الطلب.

لماذا يختارونك (عند السؤال صراحة فقط):
- وكيل عربي يفهم اللهجة والسياق دون تنميط.
- محادثة + صور + فيديو + صوت في مسار واحد مع احتياط.
- ذاكرة بموافقة، هوية ثابتة، يتوسّع بالكود لا كصندوق مغلق.`;

const FOREIGN_IDENTITY =
  /\b(i'?m|i am|أنا)\s*(google'?s?\s*)?(gemini|chatgpt|gpt-?\d*|claude|llama|meta ai|assistant from openai|مساعد جوجل)/gi;
const FOREIGN_NAMES = /\b(Gemini|ChatGPT|GPT-4|GPT-5|Claude|Llama|OpenAI|Anthropic)\b/g;

export type IntentKind =
  | "identity"
  | "why_flsko"
  | "creator"
  | "capabilities"
  | "dialect_chat"
  | "followup"
  | "short_ack"
  | "general";

export function classifyIntent(message: string): IntentKind {
  const ar = message.trim();
  const m = ar.toLowerCase();
  if (
    /(من أنت|مين أنت|شو اسمك|ما اسمك|who are you|your name|اسمك إيه|انت مين)/i.test(ar) ||
    /who are you|what('s| is) your name/i.test(m)
  ) {
    return "identity";
  }
  if (
    /(ليش|لماذا|لمَ|why).{0,40}(اختار|استخدم|فلسقوا|flsko|أنت|الك)|why (should i )?(use|choose)|مميزاتك|ليش أنت/i.test(
      ar,
    )
  ) {
    return "why_flsko";
  }
  if (/(من صنعك|مين برمجك|من طوّرك|who (made|built|created|programmed)|علي يوسف)/i.test(ar)) {
    return "creator";
  }
  if (/(شو بتقدر|ما قدراتك|what can you|تقدر تعمل|ميزاتك|capabilities)/i.test(ar)) {
    return "capabilities";
  }
  if (/^(تمام| quant|اوك|أوك|حسنا|حسناً|طيب|يلا|واصل|كمل|continue|ok|okay|yes|نعم)\.?$/i.test(ar)) {
    return "short_ack";
  }
  if (/(وكمان|كمان|بعدين|يعني|واللي قبل|نفس الموضوع|follow.?up|أيضا|ايضا)/i.test(ar) || ar.length < 40) {
    return "followup";
  }
  return "general";
}

export function brainDirectAnswer(intent: IntentKind, message: string): string | null {
  if (intent === "identity") {
    return "اسمي فلسقوا (Flsko). وكيل ذكي طوّره علي يوسف — مو ChatGPT ولا Gemini ولا أي مساعد ثاني.";
  }
  if (intent === "creator") {
    return "طوّرني المطوّر علي يوسف. أنا فلسقوا، وكيل مستقل بستفيد من طبقات أدوات بس القرار والصوت باسمي.";
  }
  if (intent === "why_flsko") {
    return [
      "تختار فلسقوا لأنّه مش مجرد نموذج واحد:",
      "• يفهمك بالعربي ولهجتك ويضل معك بنفس الهوية.",
      "• يجمع محادثة وصور وفيديو وصوت بمسار واحد مع احتياط.",
      "• يتعلّم من حوارك بموافقتك ويتوسّع كوكيل، مو كصندوق مغلق.",
      "باختصار: وكيل ينمو معك، مو واجهة مؤقتة لنموذج غريب.",
    ].join("\n");
  }
  if (intent === "capabilities") {
    return "بقدر أساعدك بمحادثة ذكية، صور وفيديو وموسيقى، صوت↔نص، وتذكّر ما توافق عليه. كل طبقة عندها احتياط؛ وأنا فلسقوا اللي ينسّق.";
  }
  if (intent === "short_ack") {
    return "تمام، جاهز. احكِ اللي بعدو.";
  }
  return null;
}

export function detectDialectHint(message: string): string {
  if (/[گچ]|شلون|هلق|هلّق|بدّي|مو|يعني|يا زلمة|يا خي|منيح|تمام|هيك|شلونك/i.test(message)) {
    return "سوري/شامي عامي — أجب بروح قريبة من الشامي دون مبالغة مسرحية.";
  }
  if (/إزاي|عايز|كده|أوي|المش|بتاع/i.test(message)) {
    return "مصري خفيف — قرّب الرد إن ناسب السياق.";
  }
  if (/وش|ابغى|زين|حيل/i.test(message)) {
    return "خليجي خفيف إن ناسب.";
  }
  if (/[a-z]{3,}/i.test(message) && !/[\u0600-\u06FF]{3,}/.test(message)) {
    return "المستخدم بالإنجليزية — أجب بنفس اللغة ما لم يطلب العربية.";
  }
  return "عربي فصيح واضح قريب من لهجة المستخدم إن ظهرت.";
}

export function buildBrainSystemPrompt(opts: {
  mode: string;
  userContext: string;
  liveVoice?: boolean;
  dialectHint: string;
  extra?: string;
  recentTurns?: string;
}): string {
  const parts = [
    BRAIN_CORE_PROMPT,
    `وضع الإجابة: ${opts.mode}${opts.liveVoice ? " (جلسة صوتية — جمل أقصر أوضح للصوت)" : ""}.`,
    `توجيه اللهجة: ${opts.dialectHint}`,
    `سياق المستخدم:\n${opts.userContext || "لا سياق إضافي."}`,
  ];
  if (opts.recentTurns) {
    parts.push(`آخر ما دار في المحادثة (للتسلسل فقط، لا تكرره حرفيًا):\n${opts.recentTurns}`);
  }
  if (opts.liveVoice) {
    parts.push("جلسة صوتية: رد بجمل قصيرة مترابطة، بدون جداول أو رموز معقّدة.");
  }
  if (opts.extra) parts.push(opts.extra);
  return parts.join("\n\n");
}

export function enforceIdentity(text: string): string {
  let out = text.trim();
  out = out.replace(FOREIGN_IDENTITY, "أنا فلسقوا");
  out = out.replace(FOREIGN_NAMES, FLSKO_NAME);
  out = out.replace(/أنا مساعد ذكاء اصطناعي من (جوجل|Google|OpenAI|Meta)/gi, "أنا فلسقوا");
  out = out.replace(/As an AI language model[^.]*\./gi, "");
  out = out.replace(/^(Sure|Certainly|Of course|Absolutely)[,!]?\s*/i, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** قص ردود مفرطة الطول لتسلسل أسلس على الموبايل */
export function tightenForMobile(text: string, intent: IntentKind): string {
  const max = intent === "why_flsko" || intent === "capabilities" ? 1200 : intent === "followup" || intent === "short_ack" ? 500 : 1800;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("."), cut.lastIndexOf("؟"), cut.lastIndexOf("!"), cut.lastIndexOf("\n"));
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim() + "…";
}

export function polishReply(raw: string, userMessage: string, dialectHint: string): string {
  let text = enforceIdentity(raw);
  if (!text) return "تمام، أنا فلسقوا — عيد سؤالك بجملة أوضح لحتى قدر ساعدك منيح.";

  const intent = classifyIntent(userMessage);
  if (intent === "identity" && !/فلسقوا|flsko/i.test(text)) {
    return brainDirectAnswer("identity", userMessage)!;
  }
  if (intent === "why_flsko" && text.length < 40) {
    return brainDirectAnswer("why_flsko", userMessage)!;
  }

  if (dialectHint.includes("سوري") && /^(Certainly|Of course|Sure|As an AI)/i.test(text)) {
    text = text.replace(/^(Certainly|Of course|Sure)[,!]?\s*/i, "تمام، ");
  }

  // لمسات شامية خفيفة على افتتاحيات جافة
  if (dialectHint.includes("سوري")) {
    text = text.replace(/^نعم،\s*/i, "أي، ");
  }

  return tightenForMobile(text, intent);
}

export function learningNote(userMessage: string, reply: string, sourceId: string): string {
  const intent = classifyIntent(userMessage);
  return JSON.stringify({
    at: Date.now(),
    intent,
    sourceId,
    userChars: userMessage.length,
    replyChars: reply.length,
    dialect: detectDialectHint(userMessage),
  });
}

export function scoreCandidate(text: string, userMessage: string): number {
  let score = 0;
  const t = text.toLowerCase();
  if (/فلسقوا|flsko/.test(t)) score += 2;
  if (!FOREIGN_NAMES.test(text)) score += 2;
  FOREIGN_NAMES.lastIndex = 0;
  if (text.length > 20 && text.length < 2500) score += 1;
  const dialect = detectDialectHint(userMessage);
  if (dialect.includes("سوري") && /(منيح|هلّق|هلق|بدك|يعني)/.test(text)) score += 1;
  if (classifyIntent(userMessage) === "why_flsko" && /طبقات|لهج|وكيل|علي يوسف/.test(text)) score += 3;
  // عقوبة الطول المفرط على الموبايل
  if (text.length > 2200) score -= 2;
  return score;
}

/* ——— قناة المعلّم ——— */

export type TutorRole = "grok" | "manus" | "developer" | "ali";
export type TutorAction = "chat" | "teach" | "evaluate" | "guide" | "inspect";
export const TUTOR_DAILY_LIMIT = 40;

export function tutorDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function buildTutorSessionPrompt(opts: {
  tutor: TutorRole;
  guidanceLines: string[];
  recentLessons: string[];
}): string {
  return [
    BRAIN_CORE_PROMPT,
    "",
    "وضع الجلسة: تدريب وتوجيه من فريق التطوير (ليس مستخدمًا عاديًا).",
    `المعلّم الحالي: ${opts.tutor}.`,
    "استمع، طبّق التوجيه، واعترف بالتصحيح دون فقدان هوية فلسقوا.",
    opts.guidanceLines.length
      ? `توجيهات نشطة:\n${opts.guidanceLines.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
      : "لا توجيهات إضافية بعد.",
    opts.recentLessons.length
      ? `دروس حديثة (أمثلة):\n${opts.recentLessons.slice(0, 8).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatLessonLine(input: string, ideal: string): string {
  return `س: ${input.slice(0, 200)} → ج: ${ideal.slice(0, 300)}`;
}

export function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(10, Math.round(x * 10) / 10));
}

export function injectLessonsIntoPrompt(base: string, lessons: string[]): string {
  if (!lessons.length) return base;
  return `${base}\n\nدروس مستخلصة من تدريب الفريق (طبّقها بمرونة):\n${lessons.slice(0, 6).join("\n")}`;
}

/** تحميل آخر رسائل المحادثة من D1 لسياق تسلسلي */
export async function loadRecentTurns(
  env: { DB: { prepare: (s: string) => { bind: (...a: unknown[]) => { all: <T>() => Promise<{ results?: T[] }> } } } },
  userId: unknown,
  conversationId?: number,
  limit = 6,
): Promise<string> {
  try {
    if (conversationId) {
      const rows = await env.DB.prepare(
        "SELECT role, content FROM messages WHERE user_id=? AND conversation_id=? ORDER BY id DESC LIMIT ?",
      )
        .bind(userId, conversationId, limit)
        .all<{ role: string; content: string }>();
      const ordered = (rows.results || []).reverse();
      return ordered
        .map((r) => `${r.role === "user" ? "المستخدم" : "فلسقوا"}: ${String(r.content).slice(0, 280)}`)
        .join("\n");
    }
  } catch {
    /* optional */
  }
  return "";
}
