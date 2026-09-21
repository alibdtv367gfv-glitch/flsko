/**
 * Lightweight context compression before LLM calls (Context Mode idea).
 * Goal: cut token use without a separate heavy service.
 * Not a full proprietary "Context Mode" product — a practical middleware.
 */

const MAX_MEMORY_LINES = 6;
const MAX_HISTORY_TURNS = 6;
const MAX_CHARS_PER_TURN = 400;

export function compressConversation(
  recent: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return recent.slice(-MAX_HISTORY_TURNS).map((m) => ({
    role: m.role,
    content:
      m.content.length > MAX_CHARS_PER_TURN
        ? `${m.content.slice(0, MAX_CHARS_PER_TURN)}…`
        : m.content,
  }));
}

export function compressMemories(memories: string[]): string[] {
  return memories
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(-MAX_MEMORY_LINES)
    .map((m) => (m.length > 200 ? `${m.slice(0, 200)}…` : m));
}

/**
 * Optional: collapse very long user paste into a short brief for the orchestrator.
 */
export function compressUserMessage(message: string, maxChars = 4000): string {
  const t = message.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[…تم اختصار الرسالة لتوفير التوكنز]`;
}
