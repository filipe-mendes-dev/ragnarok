import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentService } from "@/server/modules/documents/document-service";

import { createTextDocumentFixture } from "../../../../fixtures/documents";
import { createUserFixture } from "../../../../fixtures/users";
import { deleteTestUsers } from "../../../support/cleanup";
import { createIntegrationDatabase } from "../../../support/database";
import { readPersistedDocument } from "../../../support/read-documents";
import { seedTextDocument } from "../../../support/seed-documents";
import { seedUser } from "../../../support/seed-users";

const testUserIds: string[] = [];
const { database, databasePool } = createIntegrationDatabase();
const documentRepository = createDocumentRepository(database);
const documentService = createDocumentService(documentRepository);

async function arrangeUser(
    name: string,
): Promise<ReturnType<typeof createUserFixture>> {
    const fixture = createUserFixture({ name });

    await seedUser(database, fixture);
    testUserIds.push(fixture.id);

    return fixture;
}

describe("documentService", () => {
    afterEach(async () => {
        await deleteTestUsers(database, testUserIds);
        testUserIds.length = 0;
    });

    afterAll(async () => {
        await databasePool.end();
    });

    describe("getDocument", () => {
        it("does not expose an owned document to another user", async () => {
            const owner = await arrangeUser("Document owner");
            const otherUser = await arrangeUser("Other user");
            const documentFixture = createTextDocumentFixture({
                userId: owner.id,
            });
            await seedTextDocument(database, documentFixture);

            const ownerResult = await documentService.getDocument(
                owner.id,
                documentFixture.id,
            );
            const otherUserResult = await documentService.getDocument(
                otherUser.id,
                documentFixture.id,
            );

            expect(ownerResult?.id).toBe(documentFixture.id);
            expect(otherUserResult).toBeNull();
        });
    });

    describe("listDocuments", () => {
        it("returns only the authenticated user's documents newest first", async () => {
            const owner = await arrangeUser("Document owner");
            const otherUser = await arrangeUser("Other user");
            const olderDocument = createTextDocumentFixture({
                createdAt: new Date("2026-09-06T10:00:00.000Z"),
                title: "Older",
                userId: owner.id,
            });
            const newerDocument = createTextDocumentFixture({
                createdAt: new Date("2026-09-06T11:00:00.000Z"),
                title: "Newer",
                userId: owner.id,
            });
            const otherDocument = createTextDocumentFixture({
                title: "Other user's document",
                userId: otherUser.id,
            });
            await seedTextDocument(database, olderDocument);
            await seedTextDocument(database, newerDocument);
            await seedTextDocument(database, otherDocument);

            const result = await documentService.listDocuments(owner.id);

            expect(result.map((row) => row.id)).toEqual([
                newerDocument.id,
                olderDocument.id,
            ]);
        });
    });

    describe("createTextDocument", () => {
        it("persists a valid text source without object-storage fields", async () => {
            const owner = await arrangeUser("Document owner");
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
