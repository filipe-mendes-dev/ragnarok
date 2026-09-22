import { randomUUID } from "node:crypto";
import type { Database } from "@/server/db/client";
import { createChatRepository } from "@/server/modules/chat/chat-repository";
import { parseConversationId, parseSendMessageInput } from "@/server/modules/chat/chat-input";
import type { ChatMessage, ConversationSummary, SendMessageInput } from "@/shared/chat";

export class ChatError extends Error {}

export function createChatService(db: Database) {
    const repository = createChatRepository(db);
    async function listConversations(userId: string): Promise<ConversationSummary[]> {
        return repository.listForUser(userId);
    }
    async function getConversation(userId: string, id: string): Promise<{ title: string; messages: ChatMessage[] } | null> {
        const row = await repository.findForUser(userId, parseConversationId(id));
        if (!row) return null;
        return { title: row.title, messages: await repository.listMessagesForUser(userId, id) };
    }
    async function sendMessage(userId: string, rawInput: SendMessageInput): Promise<void> {
        if (!userId.trim()) throw new ChatError("Sign in to send a message");
        const input = parseSendMessageInput(rawInput);
        await db.transaction(async (tx) => {
            const records = createChatRepository(tx);
            await records.insertConversation({ id: input.conversationId, userId, title: input.content.slice(0, 80) });
            const owned = await records.lockForUser(userId, input.conversationId);
            if (!owned) throw new ChatError("Conversation not found");
            const history = await records.listMessagesForUser(userId, input.conversationId);
            const existing = history.find((row) => row.id === input.messageId);
            if (existing) {
                if (existing.role !== "user" || existing.content !== input.content) throw new ChatError("This message was already sent with different content");
                return;
            }
            const sequence = (history.at(-1)?.sequence ?? -1) + 1;
            await records.insertMessages([
                { id: input.messageId, conversationId: input.conversationId, role: "user", content: input.content, sequence },
                { id: randomUUID(), conversationId: input.conversationId, role: "assistant", content: "Answers coming later", sequence: sequence + 1 },
            ]);
            await records.updateActivity(userId, input.conversationId);
        });
    }
    async function deleteConversation(userId: string, id: string): Promise<void> {
        await repository.deleteForUser(userId, parseConversationId(id));
    }
    return { listConversations, getConversation, sendMessage, deleteConversation };
}
