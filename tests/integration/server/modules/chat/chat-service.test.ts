import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { conversation, message } from "@/server/db/schema/conversations";
import { ChatError, createChatService } from "@/server/modules/chat/chat-service";
import { createIntegrationDatabase } from "../../../support/database";
import { createUserSeeder } from "../../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const users = createUserSeeder(database);
const service = createChatService(database);
afterEach(async () => { await users.cleanup(); });
afterAll(async () => { await databasePool.end(); });

describe("chatService.sendMessage", () => {
    it("creates a titled conversation and persists the question and placeholder together", async () => {
        const owner = await users.seed();
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "  What is RAG?  " };
        await service.sendMessage(owner.id, input);
        expect(await database.select().from(conversation).where(eq(conversation.id, input.conversationId)))
            .toMatchObject([{ userId: owner.id, title: "What is RAG?" }]);
        expect(await database.select().from(message).where(eq(message.conversationId, input.conversationId)).orderBy(message.sequence))
            .toMatchObject([{ id: input.messageId, role: "user", content: "What is RAG?", sequence: 0 }, { role: "assistant", content: "Answers coming later", sequence: 1 }]);
    });
    it("saves a concurrent retry only once", async () => {
        const owner = await users.seed();
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "Question" };
        await Promise.all([service.sendMessage(owner.id, input), service.sendMessage(owner.id, input)]);
        expect(await database.select().from(message).where(eq(message.conversationId, input.conversationId))).toHaveLength(2);
    });
    it("serializes simultaneous questions into complete ordered pairs", async () => {
        const owner = await users.seed();
        const id = randomUUID();
        await database.insert(conversation).values({ id, userId: owner.id, title: "Existing" });
        await Promise.all(["First", "Second"].map((content) => service.sendMessage(owner.id, { conversationId: id, messageId: randomUUID(), content })));
        const rows = await database.select().from(message).where(eq(message.conversationId, id)).orderBy(message.sequence);
        expect(rows.map((row) => [row.sequence, row.role])).toEqual([[0, "user"], [1, "assistant"], [2, "user"], [3, "assistant"]]);
        expect(rows.filter((row) => row.role === "user").map((row) => row.content).sort()).toEqual(["First", "Second"]);
    });
    it("rejects writes to another user's conversation without changing it", async () => {
        const owner = await users.seed();
        const other = await users.seed();
        const id = randomUUID();
        await database.insert(conversation).values({ id, userId: owner.id, title: "Private" });
        await expect(service.sendMessage(other.id, { conversationId: id, messageId: randomUUID(), content: "Intrusion" })).rejects.toBeInstanceOf(ChatError);
        expect(await database.select().from(message).where(eq(message.conversationId, id))).toEqual([]);
    });
    it("rolls back conversation creation when a message ID collides", async () => {
        const owner = await users.seed();
        const existingId = randomUUID();
        const messageId = randomUUID();
        await database.insert(conversation).values({ id: existingId, userId: owner.id, title: "Existing" });
        await database.insert(message).values({ id: messageId, conversationId: existingId, role: "user", content: "Existing", sequence: 0 });
        const newId = randomUUID();
        await expect(service.sendMessage(owner.id, { conversationId: newId, messageId, content: "New" })).rejects.toBeDefined();
        expect(await database.select().from(conversation).where(eq(conversation.id, newId))).toEqual([]);
    });
});

describe("chatService.getConversation and listConversations", () => {
    it("returns only owned histories in latest activity order", async () => {
        const owner = await users.seed();
        const other = await users.seed();
        const old = randomUUID(); const recent = randomUUID(); const privateId = randomUUID();
        await database.insert(conversation).values([
            { id: old, userId: owner.id, title: "Old", updatedAt: new Date("2026-01-01") },
            { id: recent, userId: owner.id, title: "Recent", updatedAt: new Date("2026-02-01") },
            { id: privateId, userId: other.id, title: "Private" },
        ]);
        expect(await service.listConversations(owner.id)).toEqual([{ id: recent, title: "Recent" }, { id: old, title: "Old" }]);
        expect(await service.getConversation(owner.id, privateId)).toBeNull();
        expect(await service.getConversation(owner.id, recent)).toEqual({ title: "Recent", messages: [] });
    });
});

describe("chatService.deleteConversation", () => {
    it("cascades messages for an owned conversation", async () => {
        const owner = await users.seed(); const id = randomUUID();
        await database.insert(conversation).values({ id, userId: owner.id, title: "Delete" });
        await database.insert(message).values({ id: randomUUID(), conversationId: id, role: "user", content: "Question", sequence: 0 });
        await service.deleteConversation(owner.id, id);
        expect(await database.select().from(conversation).where(eq(conversation.id, id))).toEqual([]);
        expect(await database.select().from(message).where(eq(message.conversationId, id))).toEqual([]);
    });
    it("preserves another user's conversation", async () => {
        const owner = await users.seed(); const other = await users.seed(); const id = randomUUID();
        await database.insert(conversation).values({ id, userId: owner.id, title: "Private" });
        await service.deleteConversation(other.id, id);
        expect(await database.select().from(conversation).where(eq(conversation.id, id))).toHaveLength(1);
    });
});
