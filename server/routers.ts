import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { answerAsFlsko, createFlskoImage, createFlskoVideo, createFlskoMusic, getFlskoProviderStatus } from "./flsko-ai";
import { storagePut } from "./storage";
import { assertRateLimit } from "./rate-limit";
import { deliverSuggestionEmail } from "./suggestions";
import { transcribeAudio } from "./_core/voiceTranscription";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const projectRoot = process.cwd();
const protectedProjectFiles = new Set([".env", ".env.local", ".env.production"]);
const ignoredProjectDirs = new Set(["node_modules", ".git", ".expo", "dist"]);
const developmentCookieName = "flsko-dev-unlocked";
const execFileAsync = promisify(execFile);

function developmentToken(userId: number, issuedAt: number) {
  const payload = `${userId}.${issuedAt}`;
  const signature = createHmac("sha256", process.env.JWT_SECRET || "flsko-development-session").update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function isDevelopmentUnlocked(req: { headers: { cookie?: string } }, userId: number) {
  const raw = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${developmentCookieName}=`))?.slice(developmentCookieName.length + 1);
  if (!raw) return false;
  const [tokenUser, issuedAtText, signature] = raw.split(".");
  const issuedAt = Number(issuedAtText);
  if (tokenUser !== String(userId) || !Number.isFinite(issuedAt) || Date.now() - issuedAt > 30 * 60 * 1000 || !signature) return false;
  const expected = developmentToken(userId, issuedAt).split(".").pop() || "";
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function requireDevelopmentSession(ctx: { req: { headers: { cookie?: string } }; user: { id: number } }) {
  if (!isDevelopmentUnlocked(ctx.req, ctx.user.id)) throw new Error("انتهت جلسة بوابة التطوير. أدخل كلمات المرور الثلاث مجددًا.");
}

async function listProjectFiles(dir = projectRoot, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (ignoredProjectDirs.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listProjectFiles(path.join(dir, entry.name), relative));
    else if (!protectedProjectFiles.has(entry.name)) result.push(relative);
  }
  return result.sort();
}

export const appRouter = router({
  system: router({
    health: publicProcedure.query(() => ({ status: "ok", service: "flsko" })),
  }),
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  account: router({
    cleanup: protectedProcedure.mutation(({ ctx }) => db.cleanupStaleTransientData(ctx.user.id)),
    delete: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await db.deleteUserAccount(ctx.user.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return result;
    }),
  }),
  agent: router({
    status: publicProcedure.query(() => getFlskoProviderStatus()),

    chat: protectedProcedure
      .input(z.object({ message: z.string().trim().min(1).max(6000), mode: z.enum(["natural", "pro", "pro-max"]).default("natural"), excludeSource: z.string().max(64).optional(), attachmentIds: z.array(z.number().int().positive()).max(4).optional() }))
      .mutation(async ({ ctx, input }) => {
        assertRateLimit(ctx.user.id, "chat", 30);
        await db.cleanupStaleTransientData(ctx.user.id);
        const memories = await db.listMemories(ctx.user.id);
        const recentConversation = await db.getRecentAgentMessages(ctx.user.id, 8);
        const profile = await db.getUserProfile(ctx.user.id);
        const files = await db.listUserFiles(ctx.user.id);
        const attachments = files.filter((file) => input.attachmentIds?.includes(file.id)).map((file) => ({ name: file.name, mimeType: file.mimeType, storageUrl: file.storageUrl }));
        const result = await answerAsFlsko(input.message, memories.filter((item) => item.consent).map((item) => item.content), recentConversation.reverse().map((item) => ({ role: item.role, content: item.content })), input.excludeSource ? [input.excludeSource] : [], profile, attachments, input.mode);
        await db.createAgentMessage({ userId: ctx.user.id, role: "user", content: input.message });
        await db.createAgentMessage({ userId: ctx.user.id, role: "assistant", content: result.text });
        return result;
      }),

    generate: protectedProcedure
      .input(z.object({ kind: z.enum(["image", "video"]), prompt: z.string().trim().min(3).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        assertRateLimit(ctx.user.id, `generate-${input.kind}`, 6);
        if (input.kind === "video") {
          const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
          const used = await db.countRecentGenerations(ctx.user.id, "video", since);
          if (used >= 1) throw new Error("حد الفيديو هو مقطع واحد كل 12 ساعة لكل حساب. الجودة القصوى 720p والمدة 5 ثوانٍ للحفاظ على السلاسة.");
        }
        const generationId = await db.createGeneration({ userId: ctx.user.id, kind: input.kind, prompt: input.prompt, status: "queued" });
        try {
          if (input.kind === "image") {
            const result = await createFlskoImage(input.prompt);
            await db.updateGeneration(generationId, ctx.user.id, { status: "completed", provider: result.provider, assetUrl: result.url });
            return { id: generationId, kind: input.kind, status: "completed" as const, ...result };
          }
          const result = await createFlskoVideo(input.prompt);
          await db.updateGeneration(generationId, ctx.user.id, {
            status: result.status === "completed" ? "completed" : "queued",
            provider: result.provider,
            assetUrl: result.url,
          });
          return { id: generationId, kind: input.kind, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : "تعذر تنفيذ التوليد";
          await db.updateGeneration(generationId, ctx.user.id, { status: "failed", errorMessage: message });
          throw error;
        }
      }),
    music: protectedProcedure
      .input(z.object({ prompt: z.string().trim().min(3).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        assertRateLimit(ctx.user.id, "music", 4);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const used = await db.countRecentMusicGenerations(ctx.user.id, since);
        if (used >= 2) throw new Error("حد الموسيقى مقطعان كل 24 ساعة لكل حساب، ومدة المقطع الواحد حتى 60 ثانية للحفاظ على استقرار الخادم.");
        const id = await db.createMusicGeneration({ userId: ctx.user.id, prompt: input.prompt, status: "queued" });
        try {
          const result = await createFlskoMusic(input.prompt);
          await db.updateMusicGeneration(id, ctx.user.id, { status: result.status === "completed" ? "completed" : "queued", provider: result.provider, assetUrl: result.url });
          return { id, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : "تعذر إنشاء الموسيقى";
          await db.updateMusicGeneration(id, ctx.user.id, { status: "failed", errorMessage: message });
          throw error;
        }
      }),
  }),
  voice: router({
    transcribe: protectedProcedure
      .input(z.object({ dataUri: z.string().regex(/^data:audio\/[a-z0-9.+-]+;base64,/i).max(22000000), language: z.string().trim().max(12).default("ar") }))
      .mutation(async ({ ctx, input }) => {
        assertRateLimit(ctx.user.id, "voice-transcribe", 12);
        const match = input.dataUri.match(/^data:(audio\/[^;]+);base64,(.+)$/i);
        if (!match) throw new Error("صيغة التسجيل غير مدعومة");
        const stored = await storagePut(`transient-audio/${ctx.user.id}/${Date.now()}.m4a`, Buffer.from(match[2], "base64"), match[1]);
        const result = await transcribeAudio({ audioUrl: stored.url, language: input.language, prompt: "حوّل كلام المستخدم العربي واللهجة السورية إلى نص عربي واضح دون ترجمة." });
        if ("error" in result) throw new Error(result.error);
        return { text: result.text, language: result.language };
      }),
  }),

  memory: router({
    list: protectedProcedure.query(({ ctx }) => db.listMemories(ctx.user.id)),
    remember: protectedProcedure
      .input(z.object({ category: z.string().trim().min(1).max(64), content: z.string().trim().min(1).max(1200), consent: z.literal(true) }))
      .mutation(({ ctx, input }) => db.createMemory({ userId: ctx.user.id, ...input })),
  }),

  profile: router({
    get: protectedProcedure.query(({ ctx }) => db.getUserProfile(ctx.user.id)),
    uploadAvatar: protectedProcedure
      .input(z.object({ dataUri: z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,/).max(5000000) }))
      .mutation(async ({ ctx, input }) => {
        const match = input.dataUri.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
        if (!match) throw new Error("صيغة الصورة غير مدعومة");
        const stored = await storagePut(`profiles/${ctx.user.id}/avatar`, Buffer.from(match[2], "base64"), match[1]);
        const existing = await db.getUserProfile(ctx.user.id);
        return db.upsertUserProfile(ctx.user.id, { displayName: existing?.displayName || undefined, gender: existing?.gender || "unspecified", avatarUrl: stored.url, about: existing?.about || undefined, governorate: existing?.governorate || undefined, chatBackground: existing?.chatBackground || "#F4F8F7", voiceGender: existing?.voiceGender || "female" });
      }),
    save: protectedProcedure
      .input(z.object({ displayName: z.string().trim().max(120).optional(), gender: z.enum(["male", "female", "unspecified"]), avatarUrl: z.string().max(2000).refine((value) => value === "" || value.startsWith("/") || /^https?:\/\//.test(value), "رابط الصورة غير صالح").optional(), about: z.string().trim().max(2000).optional(), governorate: z.string().trim().max(80).optional(), chatBackground: z.string().regex(/^#[0-9A-Fa-f]{6}$/), voiceGender: z.enum(["male", "female"]) }))
      .mutation(({ ctx, input }) => db.upsertUserProfile(ctx.user.id, input)),
  }),

  files: router({
    list: protectedProcedure.query(({ ctx }) => db.listUserFiles(ctx.user.id)),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.deleteUserFile(ctx.user.id, input.id)),
    upload: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(160), dataUri: z.string().regex(/^data:[^;]+;base64,/).max(15000000) }))
      .mutation(async ({ ctx, input }) => {
        assertRateLimit(ctx.user.id, "upload", 12);
        const match = input.dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) throw new Error("صيغة الملف غير مدعومة");
        const kind = match[1].startsWith("image/") ? "image" : match[1].startsWith("video/") ? "video" : match[1].startsWith("audio/") ? "audio" : ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(match[1]) ? "document" : "other";
        const buffer = Buffer.from(match[2], "base64");
        const stored = await storagePut(`user-files/${ctx.user.id}/${input.name}`, buffer, match[1]);
        const id = await db.createUserFile({ userId: ctx.user.id, name: input.name, mimeType: match[1], kind, sizeBytes: buffer.length, storageUrl: stored.url });
        return { id, url: stored.url, kind };
      }),
  }),

  knowledge: router({
    list: protectedProcedure.query(({ ctx }) => db.listKnowledgeSources(ctx.user.id)),
    submitPublicSource: protectedProcedure
      .input(z.object({ url: z.string().url().max(2000), title: z.string().trim().max(255).optional(), permission: z.literal(true) }))
      .mutation(({ ctx, input }) => db.createKnowledgeSource({ userId: ctx.user.id, ...input })),
  }),

  safety: router({
    report: protectedProcedure
      .input(z.object({ targetType: z.enum(["chat", "image", "video"]), targetId: z.string().max(128).optional(), reason: z.string().trim().min(3).max(1000) }))
      .mutation(({ ctx, input }) => db.createContentReport({ userId: ctx.user.id, ...input })),
  }),
  suggestions: router({
    submit: protectedProcedure
      .input(z.object({ category: z.string().trim().min(1).max(64), content: z.string().trim().min(10).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        assertRateLimit(ctx.user.id, "suggestions", 3);
        const id = await db.createSuggestion({ userId: ctx.user.id, category: input.category, content: input.content, emailStatus: "pending" });
        try {
          const emailStatus = await deliverSuggestionEmail({ ...input, userId: ctx.user.id });
          await db.updateSuggestionStatus(id, ctx.user.id, emailStatus);
          return { accepted: true as const, delivered: emailStatus === "sent" };
        } catch (error) {
          await db.updateSuggestionStatus(id, ctx.user.id, "failed");
          console.error("[Suggestions] delivery failed", error);
          return { accepted: true as const, delivered: false };
        }
      }),
    adminList: adminProcedure.query(() => db.listSuggestionsForAdmin()),
  }),
  development: router({
    unlock: adminProcedure
      .input(z.object({ passwordOne: z.string().min(1).max(256), passwordTwo: z.string().min(1).max(256), passwordThree: z.string().min(1).max(256) }))
      .mutation(({ ctx, input }) => {
        const expected = [process.env.FLSKO_DEV_PASSWORD_1, process.env.FLSKO_DEV_PASSWORD_2, process.env.FLSKO_DEV_PASSWORD_3];
        const valid = expected.every((value, index) => Boolean(value) && value === [input.passwordOne, input.passwordTwo, input.passwordThree][index]);
        if (!valid) throw new Error("كلمات مرور بوابة التطوير غير صحيحة أو غير مهيأة.");
        const issuedAt = Date.now();
        ctx.res.cookie(developmentCookieName, developmentToken(ctx.user.id, issuedAt), { httpOnly: true, sameSite: "lax", secure: ctx.req.protocol === "https", maxAge: 30 * 60 * 1000, path: "/" });
        return { unlocked: true as const };
      }),
    stats: adminProcedure.query(({ ctx }) => { requireDevelopmentSession(ctx); return db.getAdminStats(); }),
    dailyStats: adminProcedure.query(({ ctx }) => { requireDevelopmentSession(ctx); return db.getAdminDailyStats(7); }),
    archive: adminProcedure.mutation(async ({ ctx }) => {
      requireDevelopmentSession(ctx);
      const archivePath = `/tmp/flsko-development-${ctx.user.id}.zip`;
      await execFileAsync("zip", ["-r", "-q", archivePath, ".", "-x", "node_modules/*", ".git/*", ".expo/*", "dist/*", ".env", ".env.*"], { cwd: projectRoot, maxBuffer: 1024 * 1024 });
      const archive = await fs.readFile(archivePath);
      const stored = await storagePut(`development/${ctx.user.id}/flsko-project.zip`, archive, "application/zip");
      await fs.rm(archivePath, { force: true });
      return { url: stored.url };
    }),
    files: adminProcedure.query(async ({ ctx }) => { requireDevelopmentSession(ctx); return { files: await listProjectFiles() }; }),
    file: adminProcedure
      .input(z.object({ relativePath: z.string().min(1).max(240) }))
      .query(async ({ ctx, input }) => {
        requireDevelopmentSession(ctx);
        const normalized = path.posix.normalize(input.relativePath).replace(/^\.\//, "");
        if (normalized.startsWith("..") || normalized.split("/").some((part) => protectedProjectFiles.has(part))) throw new Error("الملف غير متاح عبر البوابة.");
        const absolute = path.resolve(projectRoot, normalized);
        if (!absolute.startsWith(`${projectRoot}${path.sep}`)) throw new Error("مسار غير صالح");
        const stat = await fs.stat(absolute);
        if (!stat.isFile() || stat.size > 2_000_000) throw new Error("الملف غير متاح أو حجمه كبير للعرض المباشر.");
        return { relativePath: normalized, content: await fs.readFile(absolute, "utf8") };
      }),
  }),
});

export type AppRouter = typeof appRouter;
