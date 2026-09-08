import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentUploadService } from "@/server/modules/documents/document-upload-service";
import { PDF_MIME_TYPE } from "@/shared/documents";

import { createPdfDocumentFixture } from "../../../../fixtures/documents";
import { createIntegrationDatabase } from "../../../support/database";
import { createFakeDocumentObjectStorage } from "../../../support/fake-document-object-storage";
import { readPersistedDocument } from "../../../support/read-documents";
import { seedDocument } from "../../../support/seeders/documents";
import { createUserSeeder } from "../../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const documentRepository = createDocumentRepository(database);
const userSeeder = createUserSeeder(database);

describe("documentUploadService", () => {
    afterEach(async () => {
        await userSeeder.cleanup();
    });

    afterAll(async () => {
        await databasePool.end();
    });

    describe("startPdfUpload", () => {
        it("creates an uploading PDF owned by the authenticated user", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const objectStorage = createFakeDocumentObjectStorage();
            const service = createDocumentUploadService(
                documentRepository,
                objectStorage,
            );

            const result = await service.startPdfUpload(owner.id, {
                mimeType: PDF_MIME_TYPE,
                originalFilename: "reference.pdf",
                sizeBytes: 1_024,
                title: "Reference",
            });
            const persistedDocument = await readPersistedDocument(
                database,
                result.documentId,
            );

            expect(result).toMatchObject({
                requiredHeaders: {
                    "Content-Type": PDF_MIME_TYPE,
                    "If-None-Match": "*",
                },
                uploadUrl: "https://storage.test/upload",
            });
            expect(persistedDocument).toMatchObject({
                id: result.documentId,
                mimeType: PDF_MIME_TYPE,
                originalFilename: "reference.pdf",
                sizeBytes: 1_024,
                sourceText: null,
                sourceType: "pdf",
                status: "uploading",
                title: "Reference",
                userId: owner.id,
            });
            expect(objectStorage.uploadUrlRequests).toEqual([
                {
                    contentType: PDF_MIME_TYPE,
                    expiresInSeconds: 300,
                    storageKey: persistedDocument?.storageKey,
                },
            ]);
        });
    });

    describe("completePdfUpload", () => {
        it("marks an owned upload complete after storage metadata matches", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const fixture = createPdfDocumentFixture({ userId: owner.id });
            await seedDocument(database, fixture);
            const objectStorage = createFakeDocumentObjectStorage({
                metadata: {
                    contentType: PDF_MIME_TYPE,
                    sizeBytes: fixture.sizeBytes,
                },
            });
            const service = createDocumentUploadService(
                documentRepository,
                objectStorage,
            );

            await service.completePdfUpload(owner.id, fixture.id);
            const persistedDocument = await readPersistedDocument(
                database,
                fixture.id,
            );

            expect(persistedDocument?.status).toBe("uploaded");
            expect(objectStorage.metadataRequests).toEqual([fixture.storageKey]);
        });

        it("does not let another user finalize the upload", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const otherUser = await userSeeder.seed({ name: "Other user" });
            const fixture = createPdfDocumentFixture({ userId: owner.id });
            await seedDocument(database, fixture);
            const objectStorage = createFakeDocumentObjectStorage();
            const service = createDocumentUploadService(
                documentRepository,
                objectStorage,
            );

            await expect(
                service.completePdfUpload(otherUser.id, fixture.id),
            ).rejects.toMatchObject({ code: "upload_not_found" });

            const persistedDocument = await readPersistedDocument(
                database,
                fixture.id,
            );
            expect(persistedDocument?.status).toBe("uploading");
            expect(objectStorage.metadataRequests).toEqual([]);
        });

        it("keeps the upload pending when stored metadata does not match", async () => {
            const owner = await userSeeder.seed({ name: "Document owner" });
            const fixture = createPdfDocumentFixture({ userId: owner.id });
            await seedDocument(database, fixture);
            const objectStorage = createFakeDocumentObjectStorage({
                metadata: {
                    contentType: PDF_MIME_TYPE,
                    sizeBytes: fixture.sizeBytes + 1,
                },
            });
            const service = createDocumentUploadService(
                documentRepository,
                objectStorage,
            );

            await expect(
                service.completePdfUpload(owner.id, fixture.id),
            ).rejects.toMatchObject({ code: "metadata_mismatch" });

            const persistedDocument = await readPersistedDocument(
                database,
                fixture.id,
            );
            expect(persistedDocument?.status).toBe("uploading");
        });
    });
});
