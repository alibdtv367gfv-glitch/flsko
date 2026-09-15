const destination = process.env.FLSKO_SUGGESTIONS_TO_EMAIL?.trim();
const resendKey = process.env.RESEND_API_KEY?.trim();
const fromAddress = process.env.FLSKO_EMAIL_FROM?.trim() || "Flsko Suggestions <onboarding@resend.dev>";
const emailEnabled = process.env.FLSKO_ENABLE_SUGGESTION_EMAIL === "true";

export async function deliverSuggestionEmail(input: { category: string; content: string; userId: number }) {
  if (!emailEnabled || !destination || !resendKey) return "not_configured" as const;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: fromAddress,
      to: [destination],
      subject: `اقتراح جديد لتطبيق Flsko — ${input.category}`,
      text: `اقتراح مستخدم Flsko\n\nالتصنيف: ${input.category}\nمعرّف المستخدم الداخلي: ${input.userId}\n\n${input.content}`,
    }),
  });
  if (!response.ok) throw new Error(`Suggestion email failed: ${response.status}`);
  return "sent" as const;
}
