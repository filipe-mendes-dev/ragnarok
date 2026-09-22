import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { conversation, message } from "@/server/db/schema/conversations";
import { ChatError, createChatService } from "@/server/modules/chat/chat-service";
import { createIntegrationDatabase } from "../../../support/database";
import { createUserSeeder } from "../../../support/seeders/users";
import { createRetrievalService } from "@/server/modules/retrieval/retrieval-service";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, type QueryEmbedding, RetrievalError } from "@/server/modules/retrieval/retrieval-contract";
import { retrievalCandidate, retrievalRun } from "@/server/db/schema/retrieval";
import { document } from "@/server/db/schema/documents";
import { documentChunk } from "@/server/db/schema/document-chunks";
import { createTextDocumentFixture } from "../../../../fixtures/documents";
import { createChunkFixture } from "../../../../fixtures/retrieval";
import { createChunkSeeder } from "../../../support/seeders/chunks";
import { seedDocument } from "../../../support/seeders/documents";

const { database, databasePool } = createIntegrationDatabase();
const users = createUserSeeder(database);
const chunks = createChunkSeeder(database);
async function embedQueryFixture(): Promise<QueryEmbedding> {
    return { vector: [1, ...Array<number>(383).fill(0)], model: EMBEDDING_MODEL, revision: EMBEDDING_REVISION };
}
const retrieval = createRetrievalService(database, embedQueryFixture);
const service = createChatService(database, retrieval);
afterEach(async () => { await users.cleanup(); await chunks.cleanup(); });
afterAll(async () => { await databasePool.end(); });

describe("chatService.sendMessage", () => {
    it("persists the question, completed retrieval run, and explicit generation notice", async () => {
        const owner = await users.seed();
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "  What is RAG?  " };
        await service.sendMessage(owner.id, input);
        expect(await database.select().from(conversation).where(eq(conversation.id, input.conversationId)))
            .toMatchObject([{ userId: owner.id, title: "What is RAG?" }]);
        expect(await database.select().from(message).where(eq(message.conversationId, input.conversationId)).orderBy(message.sequence))
            .toMatchObject([{ id: input.messageId, role: "user", content: "What is RAG?", sequence: 0 }, { role: "assistant", content: "Generation is not implemented yet. Retrieved chunks are shown below.", sequence: 1 }]);
        expect(await database.select().from(retrievalRun).where(eq(retrievalRun.messageId, input.messageId)))
            .toMatchObject([{ status: "completed", query: "What is RAG?", scope: { mode: "all" }, model: EMBEDDING_MODEL }]);
    });
    it("saves a concurrent retry only once", async () => {
        const owner = await users.seed();
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "Question" };
        const outcomes = await Promise.allSettled([service.sendMessage(owner.id, input), service.sendMessage(owner.id, input)]);
        expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
        expect(await database.select().from(message).where(eq(message.conversationId, input.conversationId))).toHaveLength(2);
        expect(await database.select().from(retrievalRun).where(eq(retrievalRun.messageId, input.messageId))).toHaveLength(1);
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
    it("persists safe failure and retries the same question without duplicating messages", async () => {
        const owner = await users.seed();
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "Question" };
        const unavailable = createChatService(database, { ...retrieval, async retrieve() { throw new RetrievalError("unavailable"); } });
        await expect(unavailable.sendMessage(owner.id, input)).rejects.toBeInstanceOf(ChatError);
        expect(await database.select().from(retrievalRun).where(eq(retrievalRun.messageId, input.messageId)))
            .toMatchObject([{ status: "failed", errorMessage: "Retrieval is unavailable. Please retry." }]);
        await service.sendMessage(owner.id, input);
        expect(await database.select().from(retrievalRun).where(eq(retrievalRun.messageId, input.messageId)))
            .toMatchObject([{ status: "completed", errorMessage: null }]);
        expect(await database.select().from(message).where(eq(message.conversationId, input.conversationId))).toHaveLength(2);
    });
    it("does not hold a conversation lock during inference", async () => {
        const owner = await users.seed();
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "Question" };
        const checking = createChatService(database, { ...retrieval, async retrieve(userId, rawInput) {
            await database.transaction(async (tx) => {
                await tx.select().from(conversation).where(eq(conversation.id, input.conversationId)).for("update", { noWait: true });
            });
            return retrieval.retrieve(userId, rawInput);
        } });
        await checking.sendMessage(owner.id, input);
    });
});

describe("chatService.getConversation and listConversations", () => {
    it("keeps historical evidence after chunk replacement but removes it when its document is deleted", async () => {
        const owner = await users.seed();
        const other = await users.seed();
        const source = createTextDocumentFixture({ userId: owner.id, status: "completed", title: "Cancellation policy" });
        await seedDocument(database, source);
        const config = await chunks.seedConfig();
        const chunk = createChunkFixture(source.id, config);
        await chunks.seed(chunk);
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "When can I cancel?" };
        await service.sendMessage(owner.id, input);
        await database.delete(documentChunk).where(eq(documentChunk.documentId, source.id));
        const history = await service.getConversation(owner.id, input.conversationId);
        expect(history?.messages[1]?.retrieval?.chunks).toMatchObject([{ chunkId: chunk.id, text: chunk.text, documentTitle: "Cancellation policy", revision: 1 }]);
        expect(await service.getConversation(other.id, input.conversationId)).toBeNull();
        await database.delete(document).where(eq(document.id, source.id));
        expect((await service.getConversation(owner.id, input.conversationId))?.messages[1]?.retrieval?.chunks).toEqual([]);
        expect(await database.select().from(retrievalCandidate).where(eq(retrievalCandidate.documentId, source.id))).toEqual([]);
    });
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
