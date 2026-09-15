const destination = process.env.FLSKO_SUGGESTIONS_TO_EMAIL?.trim();
const resendKey = process.env.RESEND_API_KEY?.trim();
const fromAddress = process.env.FLSKO_EMAIL_FROM?.trim() || "Flsko Suggestions <onboarding@resend.dev>";
const emailEnabled = process.env.FLSKO_ENABLE_SUGGESTION_EMAIL === "true";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

export async function deliverSuggestionEmail(input: { category: string; content: string; userId: number }) {
  if (!emailEnabled || !destination || !resendKey) return "not_configured" as const;
  const category = escapeHtml(input.category);
  const content = escapeHtml(input.content).replace(/\n/g, "<br />");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: fromAddress,
      to: [destination],
      subject: `اقتراح جديد لتطبيق Flsko — ${input.category}`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#10233f"><h2 style="color:#087f8c">اقتراح جديد لتطبيق Flsko</h2><p><strong>التصنيف:</strong> ${category}</p><p><strong>المعرّف الداخلي:</strong> ${input.userId}</p><hr /><p>${content}</p><p style="color:#6b7280;font-size:12px">هذه الرسالة أُرسلت من خادم Flsko دون كشف بريد المالك للمستخدم.</p></div>`,
      text: `اقتراح مستخدم Flsko\n\nالتصنيف: ${input.category}\nمعرّف المستخدم الداخلي: ${input.userId}\n\n${input.content}`,
    }),
  });
  if (!response.ok) throw new Error(`Suggestion email failed: ${response.status}`);
  return "sent" as const;
}
