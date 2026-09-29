import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { IngestionJobInput } from "@/server/modules/ingestion/ingestion-input";
import { IngestionPublishError } from "@/server/queue/rabbitmq-ingestion-publisher";

import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentService } from "@/server/modules/documents/document-service";

import { createTextDocumentFixture } from "../../../../fixtures/documents";
import { createIntegrationDatabase } from "../../../support/database";
import { readPersistedDocument } from "../../../support/read-documents";
import { seedDocument } from "../../../support/seeders/documents";
import { createUserSeeder } from "../../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const documentRepository = createDocumentRepository(database);
const publish = vi.fn<(job: IngestionJobInput) => Promise<void>>();
const documentService = createDocumentService(documentRepository, publish);
const userSeeder = createUserSeeder(database);

describe("documentService", () => {
    afterEach(async () => {
        publish.mockReset();
        await userSeeder.cleanup();
    });

    afterAll(async () => {
        await databasePool.end();
    });

    describe("getDocument", () => {
        it("returns a document owned by the authenticated user", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const documentFixture = createTextDocumentFixture({
                userId: owner.id,
            });
            await seedDocument(database, documentFixture);

            const result = await documentService.getDocument(
                owner.id,
                documentFixture.id,
            );

            expect(result?.id).toBe(documentFixture.id);
        });

        it("does not expose an owned document to another user", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const otherUser = await userSeeder.seed({ name: "Other user" });
            const documentFixture = createTextDocumentFixture({
                userId: owner.id,
            });
            await seedDocument(database, documentFixture);

            const result = await documentService.getDocument(
                otherUser.id,
                documentFixture.id,
            );

            expect(result).toBeNull();
        });
    });

    describe("listDocuments", () => {
        it("returns only documents owned by the authenticated user", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const otherUser = await userSeeder.seed({ name: "Other user" });
            const ownedDocument = createTextDocumentFixture({ userId: owner.id });
            const otherDocument = createTextDocumentFixture({
                userId: otherUser.id,
            });
            await seedDocument(database, ownedDocument);
            await seedDocument(database, otherDocument);

            const result = await documentService.listDocuments(owner.id);

            expect(result.map((document) => document.id)).toEqual([
                ownedDocument.id,
            ]);
        });
    });

    describe("createTextDocument", () => {
        it("persists a valid text source without object-storage fields", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const input = {
                sourceText: "Persisted source text",
                title: "Persisted notes",
            };

            const result = await documentService.createTextDocument(
                owner.id,
                input,
            );
            const persistedDocument = await readPersistedDocument(
                database,
                result.id,
            );

            expect(persistedDocument).toMatchObject({
                userId: owner.id,
                sourceType: "text",
                sourceText: input.sourceText,
                title: input.title,
                storageKey: null,
                originalFilename: null,
                mimeType: "text/plain",
                sizeBytes: Buffer.byteLength(input.sourceText, "utf8"),
                status: "queued",
                revision: 1,
            });
            expect(publish).toHaveBeenCalledExactlyOnceWith({
                version: 1, documentId: result.id, revision: 1, userId: owner.id,
            });
        });

        it("commits an eligible owned source before publishing", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            publish.mockImplementationOnce(async (job) => {
                expect(await readPersistedDocument(database, job.documentId)).toMatchObject({
                    status: "queued", userId: owner.id, sourceText: "Ready for Python", revision: 1,
                });
            });
            await documentService.createTextDocument(owner.id, { title: "Notes", sourceText: "Ready for Python" });
            expect(publish).toHaveBeenCalledOnce();
        });

        it("preserves the source and queued state when delivery is uncertain", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            publish.mockRejectedValueOnce(new IngestionPublishError("timeout"));
            await expect(documentService.createTextDocument(owner.id, {
                title: "Saved notes", sourceText: "Keep this source",
            })).rejects.toEqual(new IngestionPublishError("timeout"));
            const rows = await database.query.document.findMany({
                where: (document, { eq }) => eq(document.userId, owner.id),
            });
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ status: "queued", sourceText: "Keep this source" });
        });

        it("does not publish or insert for an empty authenticated identity", async () => {
            await expect(documentService.createTextDocument(" ", {
                title: "Notes", sourceText: "Private source",
            })).rejects.toThrow("Authenticated user ID is required");
            expect(publish).not.toHaveBeenCalled();
        });
    });
});
