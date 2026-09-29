import { afterAll, afterEach, describe, expect, it } from "vitest";

import type { NewDocumentRow } from "@/server/db/schema/documents";
import { createDocumentRepository } from "@/server/modules/documents/document-repository";

import {
    createPdfDocumentFixture,
    createTextDocumentFixture,
} from "../../../../fixtures/documents";
import { createIntegrationDatabase } from "../../../support/database";
import { readPersistedDocument } from "../../../support/read-documents";
import { seedDocument } from "../../../support/seeders/documents";
import { createUserSeeder } from "../../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const documentRepository = createDocumentRepository(database);
const userSeeder = createUserSeeder(database);

describe("documentRepository", () => {
    afterEach(async () => {
        await userSeeder.cleanup();
    });

    afterAll(async () => {
        await databasePool.end();
    });

    describe("findByIdForUser", () => {
        it("requires both the document ID and owning user ID", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const otherUser = await userSeeder.seed({ name: "Other user" });
            const fixture = createTextDocumentFixture({ userId: owner.id });
            await seedDocument(database, fixture);

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
        it("returns only the user's documents newest first", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const otherUser = await userSeeder.seed({ name: "Other user" });
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
                userId: otherUser.id,
            });
            await seedDocument(database, olderDocument);
            await seedDocument(database, newerDocument);
            await seedDocument(database, otherDocument);

            const result = await documentRepository.listForUser(owner.id);

            expect(result.map((row) => row.id)).toEqual([
                newerDocument.id,
                olderDocument.id,
            ]);
        });
    });

    describe("insert", () => {
        it("persists the supplied document fields", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const fixture = createTextDocumentFixture({ userId: owner.id });
            const input = {
                createdAt: fixture.createdAt,
                id: fixture.id,
                mimeType: "text/plain",
                originalFilename: null,
                sizeBytes: Buffer.byteLength(fixture.sourceText, "utf8"),
                sourceText: fixture.sourceText,
                sourceType: fixture.sourceType,
                status: fixture.status,
                storageKey: null,
                title: fixture.title,
                userId: fixture.userId,
            } satisfies NewDocumentRow;

            const result = await documentRepository.insert(input);
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

    describe("markUploadedForUser", () => {
        it("transitions only an uploading PDF owned by the supplied user", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const otherUser = await userSeeder.seed({ name: "Other user" });
            const fixture = createPdfDocumentFixture({ userId: owner.id });
            await seedDocument(database, fixture);

            const unauthorizedResult =
                await documentRepository.markUploadedForUser(
                    otherUser.id,
                    fixture.id,
                );
            const authorizedResult = await documentRepository.markUploadedForUser(
                owner.id,
                fixture.id,
            );

            expect(unauthorizedResult).toBeNull();
            expect(authorizedResult?.status).toBe("uploaded");
        });
    });
});
