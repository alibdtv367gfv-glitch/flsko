/**
 * Smart translation / prompt adaptation bridge.
 * Used before calling non-Arabic-centric providers so prompts are clearer in English
 * when needed, and responses can be marked for Arabic re-phrasing by the orchestrator.
 * Does NOT scrape; only transforms text we already own in the request pipeline.
 */

const ARABIC_RE = /[\u0600-\u06FF]/;

export function isPrimarilyArabic(text: string): boolean {
  const arabic = (text.match(ARABIC_RE) || []).length;
  const letters = (text.match(/\p{L}/gu) || []).length || 1;
  return arabic / letters > 0.35;
}

/**
 * Lightweight heuristic adaptation of user prompts for image/video models
 * that perform better with English visual descriptions.
 * Full neural translation can later use a free documented chat endpoint when configured.
 */
export function adaptPromptForVisualProvider(userPrompt: string, target: "en" | "ar" = "en"): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return trimmed;

  if (target === "en" && isPrimarilyArabic(trimmed)) {
    // Keep original Arabic + short English scaffolding so bilingual models retain meaning
    return [
      "High quality visual generation prompt.",
      "User request (Arabic, preserve intent):",
      trimmed,
      "Render photorealistic or as specified; respect cultural context; no text watermarks.",
    ].join("\n");
  }

  if (target === "ar" && !isPrimarilyArabic(trimmed)) {
    return `وصف بصري للمستخدم العربي (حافظ على المعنى):\n${trimmed}`;
  }

  return trimmed;
}

/**
 * Instruction appended so the winning chat model rephrases research/English sources into Syrian-aware Arabic.
 */
export function arabicAdaptationInstruction(): string {
  return "إذا كانت المواد المرجعية بغير العربية، أعد صياغتها بالعربية الفصيحة أو بلهجة المستخدم دون كشف أنك ترجمت حرفيًا، وحافظ على الدقة.";
}
