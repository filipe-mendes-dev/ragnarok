import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { conversation, message } from "@/server/db/schema/conversations";

import type { ChatMessage, ConversationSummary } from "@/shared/chat";

interface StoredChatMessage extends ChatMessage { sequence: number }
type ConversationRecord = typeof conversation.$inferSelect;

export type ChatDatabase = Pick<Database, "select" | "insert" | "delete" | "update">;

export function createChatRepository(db: ChatDatabase) {
    async function listForUser(userId: string): Promise<ConversationSummary[]> {
        return db.select({ id: conversation.id, title: conversation.title }).from(conversation)
            .where(eq(conversation.userId, userId)).orderBy(desc(conversation.updatedAt), desc(conversation.id));
    }
    async function findForUser(userId: string, id: string): Promise<ConversationRecord | null> {
        const [row] = await db.select().from(conversation)
            .where(and(eq(conversation.id, id), eq(conversation.userId, userId))).limit(1);
        return row ?? null;
    }
    async function listMessagesForUser(userId: string, id: string): Promise<StoredChatMessage[]> {
        return db.select({ id: message.id, role: message.role, content: message.content, sequence: message.sequence })
            .from(message).innerJoin(conversation, eq(message.conversationId, conversation.id))
            .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
            .orderBy(asc(message.sequence));
    }
    async function insertConversation(input: typeof conversation.$inferInsert): Promise<void> {
        await db.insert(conversation).values(input).onConflictDoNothing();
    }
    async function lockForUser(userId: string, id: string): Promise<ConversationRecord | null> {
        const [row] = await db.select().from(conversation)
            .where(and(eq(conversation.id, id), eq(conversation.userId, userId))).for("update");
        return row ?? null;
    }
    async function insertMessages(rows: (typeof message.$inferInsert)[]): Promise<void> {
        await db.insert(message).values(rows);
    }
    async function updateActivity(userId: string, id: string): Promise<void> {
        await db.update(conversation).set({ updatedAt: new Date() })
            .where(and(eq(conversation.id, id), eq(conversation.userId, userId)));
    }
    async function deleteForUser(userId: string, id: string): Promise<void> {
        await db.delete(conversation).where(and(eq(conversation.id, id), eq(conversation.userId, userId)));
    }
    return { listForUser, findForUser, listMessagesForUser, insertConversation, lockForUser, insertMessages, updateActivity, deleteForUser };
}
