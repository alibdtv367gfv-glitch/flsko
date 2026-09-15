import { and, desc, eq, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  agentMessages,
  contentReports,
  generations,
  InsertAgentMessage,
  InsertContentReport,
  InsertGeneration,
  InsertKnowledgeSource,
  InsertMemory,
  InsertUser,
  knowledgeSources,
  memories,
  userProfiles,
  InsertUserProfile,
  userFiles,
  musicGenerations,
  suggestions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  textFields.forEach((field: TextField) => { const value = user[field]; if (value !== undefined) { const normalized = value ?? null; values[field] = normalized; updateSet[field] = normalized; } });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserProfile(userId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserProfile(userId: number, data: Omit<InsertUserProfile, "id" | "userId" | "createdAt" | "updatedAt">) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.insert(userProfiles).values({ userId, ...data }).onDuplicateKeyUpdate({ set: data });
  return getUserProfile(userId);
}

export async function createUserFile(data: typeof userFiles.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const result = await db.insert(userFiles).values(data);
  return Number(result[0].insertId);
}

export async function listUserFiles(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(userFiles).where(eq(userFiles.userId, userId)).orderBy(desc(userFiles.createdAt));
}

export async function deleteUserFile(userId: number, fileId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.delete(userFiles).where(and(eq(userFiles.id, fileId), eq(userFiles.userId, userId)));
  return { deleted: true as const };
}

/**
 * Conservative retention cleanup. It removes only failed or abandoned jobs;
 * user files, memories, successful generations, and conversations are never
 * deleted automatically because importance cannot be inferred safely.
 */
export async function cleanupStaleTransientData(userId: number, now = new Date()) {
  const db = await getDb(); if (!db) return { cleaned: false as const };
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.delete(generations).where(and(eq(generations.userId, userId), lt(generations.createdAt, cutoff), or(eq(generations.status, "failed"), eq(generations.status, "queued"))));
    await tx.delete(musicGenerations).where(and(eq(musicGenerations.userId, userId), lt(musicGenerations.createdAt, cutoff), or(eq(musicGenerations.status, "failed"), eq(musicGenerations.status, "queued"))));
  });
  return { cleaned: true as const };
}

export async function createMusicGeneration(data: typeof musicGenerations.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const result = await db.insert(musicGenerations).values(data);
  return Number(result[0].insertId);
}

export async function updateMusicGeneration(id: number, userId: number, data: Partial<typeof musicGenerations.$inferInsert>) {
  const db = await getDb(); if (!db) return;
  await db.update(musicGenerations).set(data).where(and(eq(musicGenerations.id, id), eq(musicGenerations.userId, userId)));
}

function getInsertId(result: unknown): number { return Number((result as { insertId?: number | bigint }).insertId ?? 0); }

export async function listMemories(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(memories).where(eq(memories.userId, userId)).orderBy(desc(memories.updatedAt)); }
export async function createMemory(data: InsertMemory) { const db = await getDb(); if (!db) throw new Error("Database not available"); return getInsertId(await db.insert(memories).values(data)); }
export async function createAgentMessage(data: InsertAgentMessage) { const db = await getDb(); if (!db) return null; return getInsertId(await db.insert(agentMessages).values(data)); }
export async function getRecentAgentMessages(userId: number, limit = 12) { const db = await getDb(); if (!db) return []; return db.select().from(agentMessages).where(eq(agentMessages.userId, userId)).orderBy(desc(agentMessages.createdAt)).limit(limit); }
export async function createGeneration(data: InsertGeneration) { const db = await getDb(); if (!db) throw new Error("Database not available"); return getInsertId(await db.insert(generations).values(data)); }
export async function updateGeneration(id: number, userId: number, data: Partial<InsertGeneration>) { const db = await getDb(); if (!db) return; await db.update(generations).set(data).where(and(eq(generations.id, id), eq(generations.userId, userId))); }
export async function createKnowledgeSource(data: InsertKnowledgeSource) { const db = await getDb(); if (!db) throw new Error("Database not available"); return getInsertId(await db.insert(knowledgeSources).values(data)); }
export async function listKnowledgeSources(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(knowledgeSources).where(eq(knowledgeSources.userId, userId)).orderBy(desc(knowledgeSources.createdAt)); }
export async function createContentReport(data: InsertContentReport) { const db = await getDb(); if (!db) throw new Error("Database not available"); return getInsertId(await db.insert(contentReports).values(data)); }
export async function createSuggestion(data: typeof suggestions.$inferInsert) { const db = await getDb(); if (!db) throw new Error("Database not available"); return getInsertId(await db.insert(suggestions).values(data)); }
export async function updateSuggestionStatus(id: number, userId: number, emailStatus: typeof suggestions.$inferInsert.emailStatus) { const db = await getDb(); if (!db) return; await db.update(suggestions).set({ emailStatus }).where(and(eq(suggestions.id, id), eq(suggestions.userId, userId))); }
export async function listSuggestionsForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: suggestions.id, category: suggestions.category, content: suggestions.content, emailStatus: suggestions.emailStatus, createdAt: suggestions.createdAt, userName: users.name, userEmail: users.email }).from(suggestions).leftJoin(users, eq(suggestions.userId, users.id)).orderBy(desc(suggestions.createdAt));
}

/**
 * Removes every application-owned record for a user in one transaction.
 * Storage objects become unreachable because their only account reference is removed.
 */
export async function deleteUserAccount(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.transaction(async (tx) => {
    await tx.delete(contentReports).where(eq(contentReports.userId, userId));
    await tx.delete(suggestions).where(eq(suggestions.userId, userId));
    await tx.delete(knowledgeSources).where(eq(knowledgeSources.userId, userId));
    await tx.delete(musicGenerations).where(eq(musicGenerations.userId, userId));
    await tx.delete(generations).where(eq(generations.userId, userId));
    await tx.delete(userFiles).where(eq(userFiles.userId, userId));
    await tx.delete(agentMessages).where(eq(agentMessages.userId, userId));
    await tx.delete(memories).where(eq(memories.userId, userId));
    await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
  return { deleted: true as const };
}
