import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentUploadService } from "@/server/modules/documents/document-upload-service";
import type { IngestionJobInput } from "@/server/modules/ingestion/ingestion-input";
import { IngestionPublishError } from "@/server/queue/rabbitmq-ingestion-publisher";
import { PDF_MIME_TYPE } from "@/shared/documents";

import { createPdfDocumentFixture } from "../../../../fixtures/documents";
import { createIntegrationDatabase } from "../../../support/database";
import { createFakeDocumentObjectStorage } from "../../../support/fake-document-object-storage";
import { readPersistedDocument } from "../../../support/read-documents";
import { seedDocument } from "../../../support/seeders/documents";
import { createUserSeeder } from "../../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const documentRepository = createDocumentRepository(database);
const publish = vi.fn<(job: IngestionJobInput) => Promise<void>>();
const userSeeder = createUserSeeder(database);

describe("documentUploadService", () => {
    afterEach(async () => {
        publish.mockReset();
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
                publish,
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
                publish,
            );

            await service.completePdfUpload(owner.id, fixture.id);
            const persistedDocument = await readPersistedDocument(
                database,
                fixture.id,
            );

            expect(persistedDocument?.status).toBe("queued");
            expect(publish).toHaveBeenCalledExactlyOnceWith({
                version: 1, documentId: fixture.id, revision: 1, userId: owner.id,
            });
            await service.completePdfUpload(owner.id, fixture.id);
            expect(publish).toHaveBeenCalledOnce();
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
                publish,
            );

            await expect(
                service.completePdfUpload(otherUser.id, fixture.id),
            ).rejects.toMatchObject({ code: "upload_not_found" });

            const persistedDocument = await readPersistedDocument(
                database,
                fixture.id,
            );
            expect(persistedDocument?.status).toBe("uploading");
            expect(publish).not.toHaveBeenCalled();
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
                publish,
            );

            await expect(
                service.completePdfUpload(owner.id, fixture.id),
            ).rejects.toMatchObject({ code: "metadata_mismatch" });

            const persistedDocument = await readPersistedDocument(
                database,
                fixture.id,
            );
            expect(persistedDocument?.status).toBe("uploading");
            expect(publish).not.toHaveBeenCalled();
        });

        it("preserves a queued PDF when publication confirmation fails", async () => {
            const owner = await userSeeder.seed();
            const fixture = createPdfDocumentFixture({ userId: owner.id });
            await seedDocument(database, fixture);
            const storage = createFakeDocumentObjectStorage({
                metadata: { contentType: PDF_MIME_TYPE, sizeBytes: fixture.sizeBytes },
            });
            const service = createDocumentUploadService(documentRepository, storage, publish);
            publish.mockRejectedValueOnce(new IngestionPublishError("timeout"));
            await expect(service.completePdfUpload(owner.id, fixture.id))
                .rejects.toEqual(new IngestionPublishError("timeout"));
            expect(await readPersistedDocument(database, fixture.id))
                .toMatchObject({ status: "queued", storageKey: fixture.storageKey });
        });

        it("publishes only once when upload completion requests race", async () => {
            const owner = await userSeeder.seed();
            const fixture = createPdfDocumentFixture({ userId: owner.id });
            await seedDocument(database, fixture);
            const storage = createFakeDocumentObjectStorage({
                metadata: { contentType: PDF_MIME_TYPE, sizeBytes: fixture.sizeBytes },
            });
            const service = createDocumentUploadService(documentRepository, storage, publish);
            await Promise.all([
                service.completePdfUpload(owner.id, fixture.id),
                service.completePdfUpload(owner.id, fixture.id),
            ]);
            expect(publish).toHaveBeenCalledOnce();
            expect((await readPersistedDocument(database, fixture.id))?.status).toBe("queued");
        });
    });
});
