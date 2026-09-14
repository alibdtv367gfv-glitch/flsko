import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  agentMessages,
  generations,
  InsertAgentMessage,
  InsertGeneration,
  InsertKnowledgeSource,
  InsertMemory,
  InsertUser,
  knowledgeSources,
  memories,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
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

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listMemories(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(memories).where(eq(memories.userId, userId)).orderBy(desc(memories.updatedAt));
}

function getInsertId(result: unknown): number {
  const insertId = (result as { insertId?: number | bigint }).insertId;
  return Number(insertId ?? 0);
}

export async function createMemory(data: InsertMemory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(memories).values(data);
  return getInsertId(result);
}

export async function createAgentMessage(data: InsertAgentMessage) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(agentMessages).values(data);
  return getInsertId(result);
}

export async function getRecentAgentMessages(userId: number, limit = 12) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.userId, userId))
    .orderBy(desc(agentMessages.createdAt))
    .limit(limit);
}

export async function createGeneration(data: InsertGeneration) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(generations).values(data);
  return getInsertId(result);
}

export async function updateGeneration(id: number, userId: number, data: Partial<InsertGeneration>) {
  const db = await getDb();
  if (!db) return;
  await db.update(generations).set(data).where(and(eq(generations.id, id), eq(generations.userId, userId)));
}

export async function createKnowledgeSource(data: InsertKnowledgeSource) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(knowledgeSources).values(data);
  return getInsertId(result);
}

export async function listKnowledgeSources(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.userId, userId))
    .orderBy(desc(knowledgeSources.createdAt));
}
