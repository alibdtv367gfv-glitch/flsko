import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { answerAsFlsko, createFlskoImage, createFlskoVideo, getFlskoProviderStatus } from "./flsko-ai";
import { storagePut } from "./storage";

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
  agent: router({
    status: publicProcedure.query(() => getFlskoProviderStatus()),

    chat: protectedProcedure
      .input(z.object({ message: z.string().trim().min(1).max(6000), excludeSource: z.string().max(64).optional() }))
      .mutation(async ({ ctx, input }) => {
        const memories = await db.listMemories(ctx.user.id);
        const recentConversation = await db.getRecentAgentMessages(ctx.user.id, 8);
        const profile = await db.getUserProfile(ctx.user.id);
        const result = await answerAsFlsko(input.message, memories.filter((item) => item.consent).map((item) => item.content), recentConversation.reverse().map((item) => ({ role: item.role, content: item.content })), input.excludeSource ? [input.excludeSource] : [], profile);
        await db.createAgentMessage({ userId: ctx.user.id, role: "user", content: input.message });
        await db.createAgentMessage({ userId: ctx.user.id, role: "assistant", content: result.text });
        return result;
      }),

    generate: protectedProcedure
      .input(z.object({ kind: z.enum(["image", "video"]), prompt: z.string().trim().min(3).max(4000) }))
      .mutation(async ({ ctx, input }) => {
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
      .input(z.object({ displayName: z.string().trim().max(120).optional(), gender: z.enum(["male", "female", "unspecified"]), avatarUrl: z.string().url().max(2000).optional().or(z.literal("")), about: z.string().trim().max(2000).optional(), governorate: z.string().trim().max(80).optional(), chatBackground: z.string().regex(/^#[0-9A-Fa-f]{6}$/), voiceGender: z.enum(["male", "female"]) }))
      .mutation(({ ctx, input }) => db.upsertUserProfile(ctx.user.id, input)),
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
});

export type AppRouter = typeof appRouter;
