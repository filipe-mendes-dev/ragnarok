import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { document } from "@/server/db/schema/documents";
import { documentChunk } from "@/server/db/schema/document-chunks";
import { chunkConfig } from "@/server/db/schema/chunk-configs";
import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentDeletionService, DocumentDeletionError } from "@/server/modules/documents/document-deletion-service";
import { createPdfDocumentFixture, createTextDocumentFixture } from "../../../../fixtures/documents";
import { createIntegrationDatabase } from "../../../support/database";
import { seedDocument } from "../../../support/seeders/documents";
import { createUserSeeder } from "../../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const users = createUserSeeder(database);
const deleteObject = vi.fn<(key: string) => Promise<void>>();
const service = createDocumentDeletionService(createDocumentRepository(database), { deleteObject });
const configIds: string[] = [];
afterEach(async () => {
    await users.cleanup(); deleteObject.mockReset();
    for (const id of configIds.splice(0)) await database.delete(chunkConfig).where(eq(chunkConfig.id, id));
});
afterAll(async () => { await databasePool.end(); });

describe("documentDeletionService.deleteDocument", () => {
    it("removes a text document and its chunks without calling storage", async () => {
        const owner = await users.seed(); const fixture = createTextDocumentFixture({ userId: owner.id });
        await seedDocument(database, fixture);
        const configId = randomUUID(); configIds.push(configId);
        await database.insert(chunkConfig).values({ id: configId, chunkingMethod: configId, chunkSize: 100, chunkOverlap: 10 });
        await database.insert(documentChunk).values({ documentId: fixture.id, revision: 1, ordinal: 0, text: "Source", chunkConfigId: configId });
        await service.deleteDocument(owner.id, fixture.id);
        expect(await database.select().from(document).where(eq(document.id, fixture.id))).toEqual([]);
        expect(await database.select().from(documentChunk).where(eq(documentChunk.documentId, fixture.id))).toEqual([]);
        expect(deleteObject).not.toHaveBeenCalled();
    });
    it("removes the PDF object before discarding its database record", async () => {
        const owner = await users.seed(); const fixture = createPdfDocumentFixture({ userId: owner.id });
        await seedDocument(database, fixture);
        deleteObject.mockImplementationOnce(async () => {
            expect(await database.select().from(document).where(eq(document.id, fixture.id))).toMatchObject([{ status: "deleting", storageKey: fixture.storageKey }]);
        });
        await service.deleteDocument(owner.id, fixture.id);
        expect(deleteObject).toHaveBeenCalledExactlyOnceWith(fixture.storageKey);
        expect(await database.select().from(document).where(eq(document.id, fixture.id))).toEqual([]);
    });
    it("retains cleanup information on a storage failure and supports a retry", async () => {
        const owner = await users.seed(); const fixture = createPdfDocumentFixture({ userId: owner.id, status: "processing" });
        await seedDocument(database, fixture);
        deleteObject.mockRejectedValueOnce(new Error("Unavailable"));
        await expect(service.deleteDocument(owner.id, fixture.id)).rejects.toBeInstanceOf(DocumentDeletionError);
        expect(await database.select().from(document).where(eq(document.id, fixture.id))).toMatchObject([{ status: "deleting", storageKey: fixture.storageKey }]);
        await service.deleteDocument(owner.id, fixture.id);
        expect(await database.select().from(document).where(eq(document.id, fixture.id))).toEqual([]);
    });
    it("does not mutate or remove another user's source", async () => {
        const owner = await users.seed(); const other = await users.seed(); const fixture = createPdfDocumentFixture({ userId: owner.id });
        await seedDocument(database, fixture);
        await service.deleteDocument(other.id, fixture.id);
        expect(deleteObject).not.toHaveBeenCalled();
        expect(await database.select().from(document).where(eq(document.id, fixture.id))).toMatchObject([{ status: "uploading", storageKey: fixture.storageKey }]);
    });
    it("retains recent PDF objects until upload authorization expires", async () => {
        const owner = await users.seed(); const createdAt = new Date();
        const fixture = createPdfDocumentFixture({ userId: owner.id, createdAt });
        await seedDocument(database, fixture);
        await expect(service.deleteDocument(owner.id, fixture.id)).rejects.toBeInstanceOf(DocumentDeletionError);
        expect(deleteObject).not.toHaveBeenCalled();
        expect(await database.update(document).set({ status: "processing" }).where(and(eq(document.id, fixture.id), eq(document.status, "queued"))).returning()).toEqual([]);
        const expiredService = createDocumentDeletionService(createDocumentRepository(database), { deleteObject }, () => new Date(createdAt.getTime() + 301000));
        await expiredService.deleteDocument(owner.id, fixture.id);
        expect(await database.select().from(document).where(eq(document.id, fixture.id))).toEqual([]);
    });
});
