import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "@/server/db/schema/auth";

export const messageRole = pgEnum("message_role", ["user", "assistant"]);

export const conversation = pgTable("conversation", {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("conversation_user_activity_idx").on(table.userId, table.updatedAt),
    check("conversation_title_not_blank", sql`length(btrim(${table.title})) > 0`),
]);

export const message = pgTable("message", {
    id: uuid("id").primaryKey(),
    conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    sequence: integer("sequence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex("message_conversation_sequence_idx").on(table.conversationId, table.sequence),
    check("message_sequence_nonnegative", sql`${table.sequence} >= 0`),
    check("message_content_not_blank", sql`length(btrim(${table.content})) > 0`),
]);
