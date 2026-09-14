import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  displayName: varchar("displayName", { length: 120 }),
  gender: mysqlEnum("gender", ["male", "female", "unspecified"]).default("unspecified").notNull(),
  avatarUrl: text("avatarUrl"),
  about: text("about"),
  governorate: varchar("governorate", { length: 80 }),
  chatBackground: varchar("chatBackground", { length: 16 }).default("#F4F8F7").notNull(),
  voiceGender: mysqlEnum("voiceGender", ["male", "female"]).default("female").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const memories = mysqlTable("memories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  content: text("content").notNull(),
  consent: boolean("consent").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const agentMessages = mysqlTable("agent_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const generations = mysqlTable("generations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["image", "video"]).notNull(),
  prompt: text("prompt").notNull(),
  provider: varchar("provider", { length: 128 }),
  status: mysqlEnum("status", ["queued", "completed", "failed"]).default("queued").notNull(),
  assetUrl: text("assetUrl"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const knowledgeSources = mysqlTable("knowledge_sources", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  url: text("url").notNull(),
  title: varchar("title", { length: 255 }),
  permission: boolean("permission").default(false).notNull(),
  status: mysqlEnum("status", ["submitted", "review", "rejected"]).default("submitted").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const contentReports = mysqlTable("content_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  targetType: mysqlEnum("targetType", ["chat", "image", "video"]).notNull(),
  targetId: varchar("targetId", { length: 128 }),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const userFiles = mysqlTable("user_files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["image", "video", "document", "audio", "other"]).notNull(),
  sizeBytes: int("sizeBytes").default(0).notNull(),
  storageUrl: text("storageUrl").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const musicGenerations = mysqlTable("music_generations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  prompt: text("prompt").notNull(),
  provider: varchar("provider", { length: 128 }),
  status: mysqlEnum("status", ["queued", "completed", "failed"]).default("queued").notNull(),
  assetUrl: text("assetUrl"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type InsertAgentMessage = typeof agentMessages.$inferInsert;
export type Generation = typeof generations.$inferSelect;
export type InsertGeneration = typeof generations.$inferInsert;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type InsertKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type ContentReport = typeof contentReports.$inferSelect;
export type InsertContentReport = typeof contentReports.$inferInsert;
export type UserFile = typeof userFiles.$inferSelect;
export type InsertUserFile = typeof userFiles.$inferInsert;
export type MusicGeneration = typeof musicGenerations.$inferSelect;
export type InsertMusicGeneration = typeof musicGenerations.$inferInsert;
