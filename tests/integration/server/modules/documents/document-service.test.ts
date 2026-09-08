import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentService } from "@/server/modules/documents/document-service";

import { createTextDocumentFixture } from "../../../../fixtures/documents";
import { createIntegrationDatabase } from "../../../support/database";
import { readPersistedDocument } from "../../../support/read-documents";
import { seedDocument } from "../../../support/seeders/documents";
import { createUserSeeder } from "../../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const documentRepository = createDocumentRepository(database);
const documentService = createDocumentService(documentRepository);
const userSeeder = createUserSeeder(database);

describe("documentService", () => {
    afterEach(async () => {
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
                status: "uploaded",
                revision: 1,
            });
        });
    });
});
