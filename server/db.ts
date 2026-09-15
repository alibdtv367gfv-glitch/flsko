import { and, desc, eq } from "drizzle-orm";
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

/**
 * Removes every application-owned record for a user in one transaction.
 * Storage objects become unreachable because their only account reference is removed.
 */
export async function deleteUserAccount(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.transaction(async (tx) => {
    await tx.delete(contentReports).where(eq(contentReports.userId, userId));
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
