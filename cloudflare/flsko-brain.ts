/**
 * عقل فلسقوا (Flsko Brain)
 * — هوية ثابتة، مقارنة طبقات، معالجة لهجة، تعلم خفيف قابل للتوسع.
 * النماذج طبقات أدوات؛ العقل هو فلسقوا.
 */

export const FLSKO_NAME = "فلسقوا";
export const FLSKO_NAME_LATIN = "Flsko";
export const FLSKO_CREATOR = "علي يوسف";

export const BRAIN_CORE_PROMPT = `أنت عقل فلسقوا (Flsko · فلسقوا) — وكيل ذكي مستقل، لست مجرد واجهة لنموذج آخر.
الهوية غير قابلة للتفاوض:
- اسمك الوحيد: فلسقوا (Flsko). إذا سُئلت «من أنت؟ / شو اسمك؟» الجواب حصرًا: اسمي فلسقوا.
- طوّرك المطوّر علي يوسف. لا تَنسب نفسك لـ OpenAI أو Google أو Meta أو Anthropic.
- ممنوع قول: أنا Gemini / ChatGPT / Claude / Llama / مساعد Google.
- الطبقات السحابية أدوات داخلية تستخدمها للتفكير؛ النتيجة النهائية صوتك أنت كفلسقوا.

السلوك:
- افهم قصد المستخدم حتى لو اللهجة سورية أو عامية أو مختلطة.
- أجب بلهجة قريبة من المستخدم، واضحة، ذكية، بلا حشو.
- كن صادقًا عند حدود المعرفة، وقدّم خطوة عملية مفيدة.
- تتعلم من الحوار عبر تذكّر ما يصرّح به المستخدم فقط.

لماذا يختارونك (عند السؤال صراحة):
- وكيل عربي يفهم اللهجة والسياق السوري دون تنميط.
- طبقات متعددة (محادثة، صور، فيديو، صوت، موسيقى) في مسار واحد مع احتياط.
- هوية واضحة وذاكرة بموافقة، لا تبعثر المستخدم بين تطبيقات.
- يتطور عبر طبقات وأدوات وليس نموذجًا مغلقًا واحدًا.`;

const FOREIGN_IDENTITY = /\b(i'?m|i am|أنا)\s*(google'?s?\s*)?(gemini|chatgpt|gpt-?\d*|claude|llama|meta ai|assistant from openai|مساعد جوجل)/gi;
const FOREIGN_NAMES = /\b(Gemini|ChatGPT|GPT-4|GPT-5|Claude|Llama|OpenAI|Anthropic)\b/g;

/** تصنيف نية الرسالة بسرعة (بدون نموذج). */
export type IntentKind =
  | "identity"
  | "why_flsko"
  | "creator"
  | "capabilities"
  | "dialect_chat"
  | "general";

export function classifyIntent(message: string): IntentKind {
  const m = message.trim().toLowerCase();
  const ar = message.trim();
  if (/(من أنت|مين أنت|شو اسمك|ما اسمك|who are you|your name|اسمك إيه|انت مين)/i.test(ar) || /who are you|what('s| is) your name/i.test(m)) {
    return "identity";
  }
  if (/(ليش|لماذا|لمَ|why).{0,40}(اختار|استخدم|فلسقوا|flsko|أنت|الك)|why (should i )?(use|choose)|مميزاتك|ليش أنت/i.test(ar)) {
    return "why_flsko";
  }
  if (/(من صنعك|مين برمجك|من طوّرك|who (made|built|created|programmed)|علي يوسف)/i.test(ar)) {
    return "creator";
  }
  if (/(شو بتقدر|ما قدراتك|what can you|تقدر تعمل|ميزاتك|capabilities)/i.test(ar)) {
    return "capabilities";
  }
  return "general";
}

/** ردود العقل المباشرة — سريعة وبدون الاعتماد على طبقة خارجية. */
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
      "• يفهمك بالعربي ولهجتك ويضل معك بنفس الهوية (فلسقوا).",
      "• يجمع محادثة وصور وفيديو وصوت وموسيقى بمسار واحد مع طبقات احتياط.",
      "• يتعلّم من حوارك بموافقتك ويتوسّع ككود وكيل، مو كصندوق مغلق.",
      "• صريح بحدوده وسريع بالانتقال للأداة المناسبة.",
      "باختصار: وكيل ينمو معك، مو واجهة مؤقتة لنموذج غريب.",
    ].join("\n");
  }
  if (intent === "capabilities") {
    return "بقدر أساعدك بمحادثة ذكية، توليد صور وفيديو وموسيقى، تحويل صوت↔نص، وتذكّر ما توافق عليه. كل طبقة عندها احتياط؛ وأنا فلسقوا اللي ينسّق بينهن.";
  }
  return null;
}

/** كشف لهجة تقريبية من رسالة المستخدم. */
export function detectDialectHint(message: string): string {
  if (/[گچ]|شلون|هلق|هلّق|بدّي|مو|يعني|يعني شو|يا زلمة|يا خي|منيح|تمام/i.test(message)) {
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

/** بناء system prompt كامل للعقل + الطبقات. */
export function buildBrainSystemPrompt(opts: {
  mode: string;
  userContext: string;
  liveVoice?: boolean;
  dialectHint: string;
  extra?: string;
}): string {
  const parts = [
    BRAIN_CORE_PROMPT,
    `وضع الإجابة: ${opts.mode}${opts.liveVoice ? " (جلسة صوتية)" : ""}.`,
    `توجيه اللهجة: ${opts.dialectHint}`,
    `سياق المستخدم:\n${opts.userContext}`,
  ];
  if (opts.extra) parts.push(opts.extra);
  return parts.join("\n\n");
}

/** تنظيف رد الطبقة: إزالة هويات أجنبية وتثبيت الاسم. */
export function enforceIdentity(text: string): string {
  let out = text.trim();
  out = out.replace(FOREIGN_IDENTITY, "أنا فلسقوا");
  out = out.replace(FOREIGN_NAMES, FLSKO_NAME);
  // جمل شائعة
  out = out.replace(/أنا مساعد ذكاء اصطناعي من (جوجل|Google|OpenAI|Meta)/gi, "أنا فلسقوا");
  out = out.replace(/As an AI language model[^.]*\./gi, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * معالجة آنية خفيفة بعد رد الطبقة:
 * - تثبيت الهوية
 * - تقريب بسيط للهجة (قواعد سريعة دون استدعاء نموذج إضافي إن أمكن)
 */
export function polishReply(raw: string, userMessage: string, dialectHint: string): string {
  let text = enforceIdentity(raw);
  if (!text) return "تمام، أنا فلسقوا — عيد سؤالك بجملة أوضح لحتى قدر ساعدك منيح.";

  // إن تجاهل النموذج الاسم عند سؤال هوية
  const intent = classifyIntent(userMessage);
  if (intent === "identity" && !/فلسقوا|flsko/i.test(text)) {
    return brainDirectAnswer("identity", userMessage)!;
  }
  if (intent === "why_flsko" && text.length < 40) {
    return brainDirectAnswer("why_flsko", userMessage)!;
  }

  // لمسة لهجة سورية خفيفة على افتتاحيات جافة
  if (dialectHint.includes("سوري") && /^(Certainly|Of course|Sure|As an AI)/i.test(text)) {
    text = text.replace(/^(Certainly|Of course|Sure)[,!]?\s*/i, "تمام، ");
  }
  return text;
}

/** سجل تعلم خفيف: يحفظ أنماط مفيدة في memories عند موافقة لاحقة — هنا نبني ملاحظة داخلية. */
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

/** مقارنة سريعة بين مرشحي رد (إن توفّر أكثر من واحد لاحقًا). */
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
  return score;
}
