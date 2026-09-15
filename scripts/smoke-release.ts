import fs from "node:fs/promises";
import { answerAsFlsko, createFlskoImage, createFlskoMusic, createFlskoVideo } from "../server/flsko-ai";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const conversation = [
  "مرحبا فلسقوا، بدي دردشة خفيفة باللهجة الشامية.",
  "أنا من دمشق وبحب الإجابات العملية والواضحة، شو بتعرف عن سوق الحميدية؟",
  "خلينا نمزح شوي: ليش القهوة السورية دايمًا بدها فنجان تاني؟",
  "هلق بدي معلومة دقيقة: كيف بنظم يومي بين الشغل والتعلم؟",
  "اختصرلي الخطة بثلاث خطوات قابلة للتنفيذ.",
  "تمام، شو أول خطوة ببلش فيها اليوم؟",
];

async function main() {
  const result: Record<string, unknown> = { startedAt: new Date().toISOString(), conversation: [] };
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (let index = 0; index < conversation.length; index += 1) {
    const userMessage = conversation[index];
    const reply = await answerAsFlsko(userMessage, [], messages);
    messages.push({ role: "user", content: userMessage }, { role: "assistant", content: reply.text });
    (result.conversation as unknown[]).push({ index: index + 1, userMessage, reply: reply.text, compared: reply.compared, sourceId: reply.sourceId });
    if (index < conversation.length - 1) await sleep(30_000);
  }
  await sleep(30_000);
  const capture = async (name: string, task: () => Promise<unknown>) => { try { result[name] = await task(); } catch (error) { result[name] = { status: "failed", error: error instanceof Error ? error.message : String(error) }; } };
  await capture("image", () => createFlskoImage("ملصق سينمائي مستقبلي عن دمشق القديمة ليلًا، إضاءة ذهبية، تفاصيل معمارية دقيقة، بدون نص"));
  await capture("video", () => createFlskoVideo("لقطة قصيرة سينمائية لسوق دمشقي قديم عند الغروب، حركة كاميرا هادئة، تفاصيل واقعية، ألوان دافئة"));
  await capture("music", () => createFlskoMusic("أغنية شامية قصيرة وهادئة عن الأمل والبيت، عود وإيقاع خفيف، كلمات عربية واضحة، مدة قصيرة"));
  result.finishedAt = new Date().toISOString();
  await fs.writeFile("/tmp/flsko-release-smoke.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ conversationTurns: (result.conversation as unknown[]).length, image: result.image, video: result.video, music: result.music, output: "/tmp/flsko-release-smoke.json" }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
