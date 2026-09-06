import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createDocumentRepository } from "@/server/documents/document-repository";

import { createTextDocumentFixture } from "../../../fixtures/documents";
import { createUserFixture } from "../../../fixtures/users";
import { deleteTestUsers } from "../../support/cleanup";
import { createIntegrationDatabase } from "../../support/database";
import { readPersistedDocument } from "../../support/read-documents";
import { seedTextDocument } from "../../support/seed-documents";
import { seedUser } from "../../support/seed-users";

const testUserIds: string[] = [];
const { database, databasePool } = createIntegrationDatabase();
const documentRepository = createDocumentRepository(database);

async function arrangeUser(
    name: string,
): Promise<ReturnType<typeof createUserFixture>> {
    const fixture = createUserFixture({ name });

    await seedUser(database, fixture);
    testUserIds.push(fixture.id);

    return fixture;
}

describe("documentRepository", () => {
    afterEach(async () => {
        await deleteTestUsers(database, testUserIds);
        testUserIds.length = 0;
    });

    afterAll(async () => {
        await databasePool.end();
    });

    describe("findByIdForUser", () => {
        it("requires both the document ID and owning user ID", async () => {
            const owner = await arrangeUser("Document owner");
            const otherUser = await arrangeUser("Other user");
            const fixture = createTextDocumentFixture({ userId: owner.id });
            await seedTextDocument(database, fixture);

            const ownerResult = await documentRepository.findByIdForUser(
                owner.id,
                fixture.id,
            );
            const otherUserResult = await documentRepository.findByIdForUser(
                otherUser.id,
                fixture.id,
            );

            expect(ownerResult?.id).toBe(fixture.id);
            expect(otherUserResult).toBeNull();
        });
    });

    describe("listForUser", () => {
        it("excludes documents belonging to other users", async () => {
            const owner = await arrangeUser("Document owner");
            const otherUser = await arrangeUser("Other user");
            const ownedDocument = createTextDocumentFixture({ userId: owner.id });
            const otherDocument = createTextDocumentFixture({
                userId: otherUser.id,
            });
            await seedTextDocument(database, ownedDocument);
            await seedTextDocument(database, otherDocument);

            const result = await documentRepository.listForUser(owner.id);

            expect(result.map((row) => row.id)).toEqual([ownedDocument.id]);
        });
    });

    describe("insert", () => {
        it("persists the supplied document fields", async () => {
            const owner = await arrangeUser("Document owner");
            const fixture = createTextDocumentFixture({ userId: owner.id });

            const result = await documentRepository.insert(fixture);
            const persistedDocument = await readPersistedDocument(
                database,
                result.id,
            );

            expect(persistedDocument).toMatchObject({
                id: fixture.id,
                userId: fixture.userId,
                title: fixture.title,
                sourceText: fixture.sourceText,
                sourceType: fixture.sourceType,
                status: fixture.status,
            });
        });
    });
});
